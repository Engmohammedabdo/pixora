-- Migration 035: invite-only launch gate.
--
-- ── WHY IT LIVES IN POSTGRES ─────────────────────────────────────────────────
--
-- Today the door is open. Verified, not assumed — a direct call with the PUBLIC
-- anon key (it is in the browser bundle by definition) created a real account and
-- returned a live session:
--
--     POST https://<supabase>/auth/v1/signup   apikey: <anon>
--     -> HTTP 200, user id ba59171e-…, session returned
--
-- The app's `registration_enabled` check runs in the browser
-- (signup/page.tsx:51) and `supabase.auth.signUp()` goes straight to GoTrue, so no
-- Next.js code is in that path: not middleware, not a route handler. Any gate
-- written in application code is decoration.
--
-- Every way to create an account — email/password, Google OAuth from the signup
-- page, Google OAuth from the login page, magic link, and admin.createUser — ends
-- in ONE statement: an INSERT into auth.users. Migration 001 already proves it is
-- the universal chokepoint; its AFTER trigger is why every user, however they
-- arrived, has a profiles row. This gate sits on the same table, one phase earlier.
-- An attacker's HTTP client cannot decline to run a trigger.
--
-- ── FAILS CLOSED ─────────────────────────────────────────────────────────────
--
-- The opposite of `registration_enabled`, which fails OPEN in three separate
-- places (getSetting returns null on error -> spread of null -> defaults, cached
-- for 60s). A missing settings row, malformed JSON, or an unreadable table here
-- means REFUSE. A gate that fails open is not a gate.
--
-- ── AN INVITE IS A SECRET, NOT AN ADDRESS ────────────────────────────────────
--
-- Membership of `waitlist` cannot be the predicate: /api/waitlist is public and
-- self-service, so anyone can add any address. Worse, GoTrue runs with
-- ENABLE_EMAIL_AUTOCONFIRM=true — it never proves ownership of an email — so a
-- gate keyed on the address alone lets whoever registers first take the seat, and
-- the real invitee is then locked out permanently (password reset is dead too).
-- So each invite carries a token, and the token is what is checked.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. The invite itself
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS invite_token TEXT,
  ADD COLUMN IF NOT EXISTS invited_by   TEXT,
  ADD COLUMN IF NOT EXISTS redeemed_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.waitlist.invited_at IS
  'When an invite was ISSUED. Not proof anything was delivered — email may be unconfigured, in which case the founder shares the link by hand.';
COMMENT ON COLUMN public.waitlist.invite_token IS
  'The secret that admits one person. Checked by enforce_invite_gate against raw_user_meta_data. NULL = not invited.';
COMMENT ON COLUMN public.waitlist.redeemed_at IS
  'When the invite was actually used to create an account. Set by the gate itself, so it cannot drift from reality.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_invite_token
  ON public.waitlist (invite_token) WHERE invite_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_waitlist_invited
  ON public.waitlist (LOWER(email)) WHERE invited_at IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. The switch — its OWN settings key, deliberately not inside `feature_flags`
--
--    feature_flags is read through a 60-second cache that fails open. Keeping the
--    gate's state in a separate row that the trigger reads directly in SQL means
--    no cache, no application layer, and no shared blob that a stale admin tab can
--    clobber (setSetting is a whole-object upsert with no concurrency check).
--
--    beta_credits: how much to grant an invited tester on arrival. 25 (profiles
--    default) + 5 (onboarding bonus) = 30, and one pass through all nine studios
--    costs 39 at the cheapest settings — so an invited tester runs out BEFORE
--    seeing the whole product. That is not a gate problem, but it kills the cohort
--    just as dead. Tunable here rather than hardcoded, because it is a cost
--    decision the founder should be able to change without a deploy.
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.system_settings (key, value)
VALUES ('invite_gate', '{"enabled": true, "beta_credits": 100}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Rejection log
--
--    Putting the check in Postgres puts it BELOW the app's rate limiting — the
--    same property that makes it unbypassable makes each failed attempt free. This
--    does not stop enumeration on its own, but it makes it visible, and it is the
--    only place the founder can see someone trying.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invite_gate_rejections (
  id           BIGSERIAL PRIMARY KEY,
  email        TEXT NOT NULL,
  reason       TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invite_rejections_time
  ON public.invite_gate_rejections (attempted_at DESC);

ALTER TABLE public.invite_gate_rejections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invite_gate_rejections FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.invite_gate_rejections_id_seq FROM anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. THE GATE
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_invite_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
-- Explicit, unlike handle_new_user (001:47) which omits it and only works because
-- `public` happens to sit on GoTrue's connection search_path. This function reads
-- three public tables by name; leaving that to a path nobody in this repo controls
-- is how a gate silently resolves against the wrong schema.
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_email   TEXT := LOWER(TRIM(COALESCE(NEW.email, '')));
  v_token   TEXT := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'invite_token', '')), '');
  v_match   RECORD;
BEGIN
  SELECT (value->>'enabled')::boolean INTO v_enabled
  FROM public.system_settings WHERE key = 'invite_gate';

  -- Only an explicit `false` opens the door. NULL (no row, bad JSON, unreadable)
  -- is CLOSED. See the header.
  IF v_enabled IS FALSE THEN
    RETURN NEW;
  END IF;

  IF v_email = '' THEN
    INSERT INTO public.invite_gate_rejections (email, reason) VALUES ('(empty)', 'no_email');
    RAISE EXCEPTION 'pyrasuite_not_invited' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, invite_token, redeemed_at INTO v_match
  FROM public.waitlist
  WHERE LOWER(email) = v_email
    AND invited_at IS NOT NULL
    AND invite_token IS NOT NULL
  LIMIT 1;

  IF v_match IS NULL THEN
    INSERT INTO public.invite_gate_rejections (email, reason) VALUES (v_email, 'not_invited');
    RAISE EXCEPTION 'pyrasuite_not_invited' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The token is what admits, not the address. Without this, anyone who knows or
  -- guesses an invited address takes the seat — and because GoTrue autoconfirms,
  -- they keep it and the real invitee has no recovery path.
  --
  -- OAuth cannot carry raw_user_meta_data of our choosing (it is Google's), which
  -- is why the Google button is hidden on the signup page while the gate is on;
  -- OAuth stays available on the LOGIN page for accounts that already exist.
  IF v_token IS NULL OR v_token IS DISTINCT FROM v_match.invite_token THEN
    INSERT INTO public.invite_gate_rejections (email, reason)
    VALUES (v_email, CASE WHEN v_token IS NULL THEN 'token_missing' ELSE 'token_mismatch' END);
    RAISE EXCEPTION 'pyrasuite_not_invited' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_match.redeemed_at IS NOT NULL THEN
    INSERT INTO public.invite_gate_rejections (email, reason) VALUES (v_email, 'already_redeemed');
    RAISE EXCEPTION 'pyrasuite_not_invited' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Burn it. One token, one account.
  UPDATE public.waitlist SET redeemed_at = NOW() WHERE id = v_match.id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_invite_gate ON auth.users;
CREATE TRIGGER on_auth_user_invite_gate
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_gate();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Beta credits for the admitted cohort
--
--    Fires AFTER the profile exists. Trigger order within the same event is
--    alphabetical by trigger NAME, and 'on_auth_user_created' (001) sorts before
--    'on_auth_user_invite_grant' — 'c' < 'i' — so the profiles row is guaranteed to
--    be there. Named for that ordering on purpose; renaming it can break it.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_invite_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits INTEGER;
  v_email   TEXT := LOWER(TRIM(COALESCE(NEW.email, '')));
BEGIN
  SELECT COALESCE((value->>'beta_credits')::integer, 0) INTO v_credits
  FROM public.system_settings WHERE key = 'invite_gate';

  IF COALESCE(v_credits, 0) <= 0 THEN RETURN NEW; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.waitlist
    WHERE LOWER(email) = v_email AND invite_token IS NOT NULL AND redeemed_at IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- Into purchased_credits, not credits_balance. credits_balance is overwritten
  -- wholesale by the monthly reset cron and by every plan-change write in the
  -- Stripe webhook, so a grant placed there would silently vanish at the next
  -- cycle. purchased_credits survives both (see migration 033).
  UPDATE public.profiles
  SET purchased_credits = COALESCE(purchased_credits, 0) + v_credits,
      purchased_credits_expires_at = NOW() + INTERVAL '365 days'
  WHERE id = NEW.id;

  INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
  SELECT NEW.id, v_credits, 'admin_adjustment',
         'Beta invite grant — ' || v_credits || ' credits',
         COALESCE(credits_balance, 0) + COALESCE(purchased_credits, 0)
  FROM public.profiles WHERE id = NEW.id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_invite_grant ON auth.users;
CREATE TRIGGER on_auth_user_invite_grant
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_invite_credits();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Operator RPCs — service_role only
-- ───────────────────────────────────────────────────────────────────────────

-- Reuses 023's collision-checked generator: its alphabet already excludes I/O/0/1,
-- so a token survives being read aloud or retyped from a WhatsApp message.
CREATE OR REPLACE FUNCTION public.issue_invite(
  p_email TEXT,
  p_invited_by TEXT DEFAULT 'admin'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_token TEXT;
  v_existing RECORD;
BEGIN
  IF v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_email');
  END IF;

  SELECT invite_token, redeemed_at INTO v_existing
  FROM public.waitlist WHERE LOWER(email) = v_email;

  -- Already used: re-issuing would mint a second seat for one person.
  IF v_existing.redeemed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_redeemed', 'email', v_email);
  END IF;

  -- Idempotent: re-inviting someone returns the SAME token, so a founder who
  -- clicks twice does not invalidate the link already sent.
  IF v_existing.invite_token IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'email', v_email, 'token', v_existing.invite_token, 'reissued', true);
  END IF;

  v_token := public.generate_referral_code();

  INSERT INTO public.waitlist (email, source, invited_at, invite_token, invited_by)
  VALUES (v_email, 'admin-invite', NOW(), v_token, p_invited_by)
  ON CONFLICT (LOWER(email)) DO UPDATE
    SET invited_at = NOW(), invite_token = EXCLUDED.invite_token, invited_by = EXCLUDED.invited_by;

  RETURN jsonb_build_object('success', true, 'email', v_email, 'token', v_token, 'reissued', false);
END $$;

CREATE OR REPLACE FUNCTION public.revoke_invite(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_email TEXT := LOWER(TRIM(COALESCE(p_email, ''))); v_rows INTEGER;
BEGIN
  -- Only an UNREDEEMED invite can be revoked. Clearing a redeemed one would
  -- suggest the account went away; it did not.
  UPDATE public.waitlist
  SET invited_at = NULL, invite_token = NULL
  WHERE LOWER(email) = v_email AND redeemed_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('success', v_rows > 0, 'revoked', v_rows);
END $$;

-- Read by /api/health. The trigger lives on auth.users, a table the Supabase auth
-- service owns — a Coolify redeploy or an auth-schema restore can drop it, and
-- signup would silently revert to fully open with no symptom at all. A banner on a
-- page the founder opens twice a week is not a detector.
CREATE OR REPLACE FUNCTION public.invite_gate_status()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_installed BOOLEAN; v_enabled BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_invite_gate' AND NOT t.tgisinternal
  ) INTO v_installed;

  SELECT (value->>'enabled')::boolean INTO v_enabled
  FROM public.system_settings WHERE key = 'invite_gate';

  RETURN jsonb_build_object(
    'installed', v_installed,
    'enabled', v_enabled IS DISTINCT FROM FALSE,
    'invited', (SELECT count(*) FROM public.waitlist WHERE invite_token IS NOT NULL),
    'redeemed', (SELECT count(*) FROM public.waitlist WHERE redeemed_at IS NOT NULL),
    'rejections_24h', (SELECT count(*) FROM public.invite_gate_rejections WHERE attempted_at > NOW() - INTERVAL '24 hours')
  );
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Lock down, then ASSERT the lockdown
--
--    022's ALTER DEFAULT PRIVILEGES only covers objects created by the role that
--    ran it, and this file is applied as supabase_admin. Do not assume it covered
--    these — grant explicitly and verify.
--
--    enforce_invite_gate and grant_invite_credits are NOT granted to anyone: they
--    are trigger functions, invoked by the trigger, never called directly.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE fn RECORD; n INTEGER := 0; missing TEXT[] := '{}';
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname IN ('issue_invite', 'revoke_invite', 'invite_gate_status',
                        'enforce_invite_gate', 'grant_invite_credits')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn.sig);
    IF fn.proname IN ('issue_invite', 'revoke_invite', 'invite_gate_status') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    END IF;
    n := n + 1;
  END LOOP;

  IF n < 5 THEN
    RAISE EXCEPTION 'Expected 5 invite-gate functions, found % — refusing to report success.', n;
  END IF;

  -- Prove it, rather than trusting the REVOKE above.
  SELECT array_agg(p.proname) INTO missing
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.proname IN ('issue_invite', 'revoke_invite', 'invite_gate_status',
                      'enforce_invite_gate', 'grant_invite_credits')
    AND array_to_string(p.proacl, ',') ~ '(anon|authenticated)=';

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'These are still executable by anon/authenticated: %', array_to_string(missing, ', ');
  END IF;

  RAISE NOTICE 'Invite gate installed and locked down (% functions).', n;
END $$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('035', 'invite-only gate: BEFORE INSERT trigger on auth.users, per-invite token, beta credits')
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description, applied_at = NOW();

COMMIT;
