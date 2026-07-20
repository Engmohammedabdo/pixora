-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 026: referral abuse controls + claim race fix
--
-- 023 shipped claim_referral with two gaps that only matter now that the
-- Referrals nav entry is live:
--
-- ── Gap 1: no per-referrer limit ───────────────────────────────────────────
--   UNIQUE(referee_id) constrains the REFEREE side only — it stops one account
--   being referred twice, and nothing else. There is no cap, cooldown or rate
--   limit on the REFERRER, so a script that registers throwaway accounts mints
--   p_credits to the attacker on every signup, indefinitely. Two caps below.
--
-- ── Gap 2: the locks were taken after the guards ───────────────────────────
--   023:180-184 took FOR UPDATE *after* the already-referred check at :166, so
--   under READ COMMITTED two concurrent claims both passed the check and the
--   UNIQUE(referee_id) constraint was what actually blocked the second one —
--   as an untrapped unique_violation, which PostgREST surfaces as a 500
--   'claim_failed' instead of the intended 200 already_referred. The locks are
--   hoisted above every guard here, and unique_violation is trapped as well.
--
-- Idempotent: CREATE OR REPLACE FUNCTION only. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION claim_referral(
  p_referee_id UUID,
  p_code       TEXT,
  p_credits    INTEGER DEFAULT 25
) RETURNS JSONB AS $$
DECLARE
  -- Tune these two together. They bound the worst case at
  -- (daily cap x p_credits) per referrer per day.
  c_max_per_day      CONSTANT INTEGER := 5;
  c_max_lifetime     CONSTANT INTEGER := 50;

  v_referrer_id      UUID;
  v_referee_created  TIMESTAMPTZ;
  v_referee_balance  INTEGER;
  v_referrer_balance INTEGER;
  v_today_count      INTEGER;
  v_lifetime_count   INTEGER;
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

  -- Locks FIRST, before any guard reads the tables those guards depend on.
  -- Stable id order so two concurrent claims cannot deadlock each other.
  PERFORM 1 FROM public.profiles
  WHERE id IN (v_referrer_id, p_referee_id)
  ORDER BY id
  FOR UPDATE;

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

  -- Per-referrer caps. Counted under the lock taken above, so concurrent claims
  -- cannot both observe the same pre-increment count and slip past the cap.
  SELECT
    count(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours'),
    count(*)
  INTO v_today_count, v_lifetime_count
  FROM public.referrals
  WHERE referrer_id = v_referrer_id;

  IF v_today_count >= c_max_per_day THEN
    RETURN jsonb_build_object('success', false, 'error', 'referrer_daily_limit');
  END IF;

  IF v_lifetime_count >= c_max_lifetime THEN
    RETURN jsonb_build_object('success', false, 'error', 'referrer_lifetime_limit');
  END IF;

  BEGIN
    INSERT INTO public.referrals (referrer_id, referee_id, code_used, credits_each)
    VALUES (v_referrer_id, p_referee_id, upper(btrim(p_code)), p_credits);
  EXCEPTION WHEN unique_violation THEN
    -- Belt and braces: a claim that raced past the guard above must read as a
    -- normal rejection, not a 500. The signup flow treats this as "carry on".
    RETURN jsonb_build_object('success', false, 'error', 'already_referred');
  END;

  UPDATE public.profiles SET referred_by = v_referrer_id WHERE id = p_referee_id;

  -- Award into purchased_credits, NOT credits_balance — see 023 for the full
  -- reasoning. credits_balance is overwritten on every renewal and plan change.
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

-- Re-assert the 022 lockdown: CREATE OR REPLACE keeps the existing ACL, but do
-- not rely on that — an accidental DROP + CREATE elsewhere would hand EXECUTE
-- back to PUBLIC, which is exactly the hole 022 closed.
REVOKE ALL ON FUNCTION public.claim_referral(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_referral(UUID, TEXT, INTEGER) TO service_role;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     TEXT PRIMARY KEY,
  description TEXT,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version, description)
VALUES ('026', 'Referral per-referrer caps; hoist locks and trap the claim race')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verify after applying:
--
-- -- (a) users still cannot execute it:
-- SELECT has_function_privilege('authenticated',
--   'public.claim_referral(uuid,text,integer)', 'EXECUTE');  -- expect false
--
-- -- (b) the caps are present:
-- SELECT prosrc LIKE '%referrer_daily_limit%' AS has_daily_cap,
--        prosrc LIKE '%unique_violation%'     AS traps_race
-- FROM pg_proc WHERE proname = 'claim_referral';   -- expect true, true
--
-- -- (c) a sixth claim by the same referrer within 24h must return
-- --     {"success": false, "error": "referrer_daily_limit"}.
-- ═══════════════════════════════════════════════════════════════════════════
