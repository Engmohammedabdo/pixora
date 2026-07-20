-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 023: Referral program
--
-- Migration 014 added `profiles.referral_code` but nothing ever populated it, and
-- there was no ledger, no link from referee to referrer, and no way to award
-- credits. The referrals page therefore built an invite link containing a code
-- that did not exist, and /signup never read the ?ref= parameter — so every
-- referral was lost.
--
-- ⚠ Apply AFTER 022_privilege_lockdown.sql. Run as the `postgres` role via the
--   Supabase SQL Editor (see the notes at the top of 022).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Migration ledger (created once, by whichever migration runs first)
--
-- This project had 26 migration files and NO record of which had actually been
-- applied. Combined with the old runner that had no ON_ERROR_STOP and reported
-- success after a failed statement, that is why the real production schema is
-- unknown — migration 010's team policy failed silently and nobody could tell.
--
-- From here on every migration records itself, so `SELECT * FROM schema_migrations`
-- is an authoritative answer to "what is actually applied?".
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     TEXT PRIMARY KEY,
  description TEXT,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schema_migrations FROM anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 1. Allow the new ledger entry types
--
-- credit_transactions.type is constrained to
-- ('subscription','topup','usage','refund','reset') by 004. Inserting 'referral'
-- would be rejected, and the award would fail *after* the credits were added —
-- leaving a silent accounting hole. 'admin_adjustment' is added for the same
-- reason: the admin credit-adjustment endpoint currently writes no ledger row at
-- all because its insert violates this same constraint.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('subscription', 'topup', 'usage', 'refund', 'reset', 'referral', 'admin_adjustment'));

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Referral columns + backfill
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Short, human-readable, unambiguous code. Excludes I/O/0/1 so a code read aloud
-- over WhatsApp — the realistic sharing channel here — cannot be mistyped.
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code     TEXT;
  i        INTEGER;
BEGIN
  LOOP
    code := 'PYRA-';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Backfill everyone who predates this migration.
UPDATE public.profiles SET referral_code = generate_referral_code() WHERE referral_code IS NULL;

-- Issue a code to every new signup. handle_new_user() (001) already runs on
-- INSERT INTO auth.users; this covers the profile row itself so the two stay
-- independent.
CREATE OR REPLACE FUNCTION set_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_referral_code ON public.profiles;
CREATE TRIGGER trg_set_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION set_referral_code();

CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Referral ledger
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referrals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- UNIQUE: a person can only ever be referred once, which is what stops the same
  -- account being farmed for repeat awards.
  referee_id     UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_used      TEXT NOT NULL,
  credits_each   INTEGER NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referrals_no_self CHECK (referrer_id <> referee_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Read-only for the people involved; all writes go through claim_referral().
DROP POLICY IF EXISTS "Users view own referrals" ON public.referrals;
CREATE POLICY "Users view own referrals"
  ON public.referrals FOR SELECT
  TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

REVOKE INSERT, UPDATE, DELETE ON public.referrals FROM anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. claim_referral() — the only way credits are awarded
--
-- SECURITY DEFINER, and EXECUTE is granted to service_role ONLY (see section 5),
-- matching the lockdown established in 022. Every guard is enforced here rather
-- than in the API route, so the rules hold no matter which caller invokes it.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION claim_referral(
  p_referee_id UUID,
  p_code       TEXT,
  p_credits    INTEGER DEFAULT 25
) RETURNS JSONB AS $$
DECLARE
  v_referrer_id      UUID;
  v_referee_created  TIMESTAMPTZ;
  v_referee_balance  INTEGER;
  v_referrer_balance INTEGER;
BEGIN
  IF p_credits <= 0 OR p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_referrer_id
  FROM public.profiles WHERE referral_code = upper(btrim(p_code));

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'code_not_found');
  END IF;

  IF v_referrer_id = p_referee_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_referral');
  END IF;

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = p_referee_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_referred');
  END IF;

  -- Only a genuinely new account can be referred. Without this an established
  -- user could attach themselves to a friend's code at any time to mint credits.
  SELECT created_at INTO v_referee_created FROM public.profiles WHERE id = p_referee_id;
  IF v_referee_created IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'referee_not_found');
  END IF;
  IF v_referee_created < NOW() - INTERVAL '7 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'account_too_old');
  END IF;

  -- Lock both rows in a stable order so two concurrent claims cannot interleave.
  PERFORM 1 FROM public.profiles
  WHERE id IN (v_referrer_id, p_referee_id)
  ORDER BY id
  FOR UPDATE;

  INSERT INTO public.referrals (referrer_id, referee_id, code_used, credits_each)
  VALUES (v_referrer_id, p_referee_id, upper(btrim(p_code)), p_credits);

  UPDATE public.profiles SET referred_by = v_referrer_id WHERE id = p_referee_id;

  -- Award into purchased_credits, NOT credits_balance.
  --
  -- credits_balance is the monthly subscription bucket and is OVERWRITTEN (not
  -- incremented) on every plan change, renewal and downgrade — see
  -- app/api/stripe/webhook/route.ts and reset_monthly_credits in 007. Crediting
  -- it here would destroy the referral bonus on the user's very next renewal,
  -- and the referral-to-paid-upgrade path is the feature's intended happy path,
  -- so the loss would fire for exactly the users it is meant to reward. The
  -- referrals row and the credit_transactions rows are permanent, so the UI
  -- would keep reporting credits the user no longer has.
  --
  -- purchased_credits is the bucket real money buys; the 12-month expiry matches
  -- the top-up convention in 012 and the webhook's Stripe top-up branch.
  UPDATE public.profiles
  SET purchased_credits = COALESCE(purchased_credits, 0) + p_credits,
      purchased_credits_expires_at = NOW() + INTERVAL '365 days'
  WHERE id = p_referee_id
  RETURNING COALESCE(credits_balance, 0) + COALESCE(purchased_credits, 0) INTO v_referee_balance;

  UPDATE public.profiles
  SET purchased_credits = COALESCE(purchased_credits, 0) + p_credits,
      purchased_credits_expires_at = NOW() + INTERVAL '365 days'
  WHERE id = v_referrer_id
  RETURNING COALESCE(credits_balance, 0) + COALESCE(purchased_credits, 0) INTO v_referrer_balance;

  INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
  VALUES
    (p_referee_id,  p_credits, 'referral', 'Referral bonus — joined via ' || upper(btrim(p_code)), v_referee_balance),
    (v_referrer_id, p_credits, 'referral', 'Referral bonus — invited a new user',                  v_referrer_balance);

  RETURN jsonb_build_object(
    'success', true,
    'referrer_id', v_referrer_id,
    'credits_awarded', p_credits,
    'new_balance', v_referee_balance
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Lock down execution (same policy as 022)
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname IN ('claim_referral', 'generate_referral_code')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Record this migration as applied.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (version, description)
VALUES ('023', 'Referral program: ledger, claim_referral RPC, code generation')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION
--
-- -- (a) every profile now has a code:
-- SELECT count(*) FILTER (WHERE referral_code IS NULL) AS missing FROM profiles;  -- expect 0
--
-- -- (b) claim_referral is not callable by users:
-- SELECT has_function_privilege('authenticated', 'claim_referral(uuid,text,integer)', 'EXECUTE');  -- expect false
--
-- -- (c) referrals is RLS-protected and write-locked:
-- SELECT rowsecurity FROM pg_tables WHERE tablename = 'referrals';  -- expect true
-- ═══════════════════════════════════════════════════════════════════════════
