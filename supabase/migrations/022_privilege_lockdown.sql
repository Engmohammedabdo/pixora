-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 022: Privilege lockdown
--
-- Closes the two independent paths that let any authenticated user grant
-- themselves unlimited credits and any plan straight from the browser, using
-- only the public anon key.
--
-- Root cause: this project had ZERO GRANT/REVOKE statements. Postgres RLS is
-- ROW-level, not COLUMN-level, so "users can update own profile" allowed
-- writing credits_balance / plan_id / banned. Separately, the money RPCs are
-- SECURITY DEFINER with no auth.uid() check and, by Supabase default, were
-- EXECUTE-able by PUBLIC.
--
-- ⚠ PAIRED CODE CHANGE — this migration REQUIRES the matching commit that
--   routes lib/credits/deduct.ts and the two Stripe customer-id writes through
--   the service-role client. Applying this migration alone WILL break every
--   studio and checkout.
--
-- ⚠ HOW TO APPLY — run as the `postgres` role via the Supabase SQL Editor, or
--   psql with `-v ON_ERROR_STOP=1`. Do NOT apply through
--   scripts/apply-migrations-rest.sh: that helper sends statements individually,
--   so the BEGIN/COMMIT below would not form one transaction and a mid-way
--   failure would leave privileges half-applied.
--
-- ⚠ UNKNOWN PRODUCTION SCHEMA — the historical migration runner had no
--   ON_ERROR_STOP, so earlier migrations may have failed silently and the real
--   production schema is not known to match this repo. Every object touched
--   below is therefore guarded by an existence check, and anything missing is
--   reported as a WARNING instead of aborting the whole migration. Read the
--   NOTICE/WARNING output — it tells you what your database actually contains.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. profiles — column-level UPDATE privileges
--    RLS gates WHICH ROW; only GRANT gates WHICH COLUMN.
-- ───────────────────────────────────────────────────────────────────────────

REVOKE UPDATE ON public.profiles FROM anon, authenticated;

-- Also revoke INSERT/DELETE. Not reachable today (handle_new_user creates the
-- row inside the signup transaction and there is no DELETE policy), but the
-- "server-authoritative columns" invariant should not depend on that.
REVOKE INSERT, DELETE ON public.profiles FROM anon, authenticated;

-- Grant UPDATE only on genuinely user-owned preference columns, built from the
-- columns that ACTUALLY exist. A single missing column in a plain GRANT would
-- abort the transaction and roll the REVOKE above back out, silently leaving the
-- vulnerability open. Columns arrive from different migrations (persona and
-- sound_enabled from 014, onboarding_* from 006), any of which may not have
-- applied.
DO $$
DECLARE
  wanted TEXT[] := ARRAY[
    'name', 'avatar_url', 'locale', 'persona',
    'sound_enabled', 'onboarding_completed', 'onboarding_step'
  ];
  cols    TEXT;
  missing TEXT;
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'public.profiles does not exist — aborting';
  END IF;

  SELECT string_agg(quote_ident(c), ', ' ORDER BY c)
    INTO cols
  FROM unnest(wanted) AS c
  WHERE EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = c
  );

  SELECT string_agg(c, ', ' ORDER BY c)
    INTO missing
  FROM unnest(wanted) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = c
  );

  IF cols IS NULL THEN
    RAISE EXCEPTION 'None of the expected profile preference columns exist — schema is not what this migration expects';
  END IF;

  EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', cols);
  RAISE NOTICE 'profiles: granted UPDATE on %', cols;

  IF missing IS NOT NULL THEN
    RAISE WARNING 'profiles: these expected columns are ABSENT from your database: % — the matching feature is already broken, independently of this migration', missing;
  END IF;
END
$$;

-- Add the missing WITH CHECK so a user cannot re-key a row onto another user.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Money + maintenance RPCs — revoke EXECUTE from every caller but service_role
--
--    Iterates pg_proc so EVERY overload is covered. deduct_credits was redefined
--    across migrations 004/005/007/008/021; if an older signature is still
--    resident in production, naming one signature explicitly would leave the
--    others wide open.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  fn        RECORD;
  n         INTEGER := 0;
  locked    TEXT[]  := '{}';
  core      TEXT[]  := ARRAY['deduct_credits', 'reserve_credits', 'refund_credits'];
  still_open TEXT;
BEGIN
  FOR fn IN
    SELECT p.oid, p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname IN (
        'deduct_credits', 'reserve_credits', 'refund_credits',
        'reset_monthly_credits', 'cleanup_stale_records',
        'cleanup_webhook_events', 'cleanup_rate_limit_entries',
        'exec_sql'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    n := n + 1;
    locked := locked || fn.proname;
  END LOOP;

  RAISE NOTICE 'Locked down % function overload(s): %', n, array_to_string(locked, ', ');

  -- Assert each CORE money function was actually found. A bare `n = 0` check
  -- would report false success if only one of the three existed.
  SELECT string_agg(c, ', ') INTO still_open
  FROM unnest(core) AS c
  WHERE NOT (c = ANY (locked));

  IF still_open IS NOT NULL THEN
    RAISE EXCEPTION 'Core credit function(s) not found in schema public: % — refusing to report success. Your production schema differs from this repo.', still_open;
  END IF;

  -- Verify the revoke actually took effect. REVOKE is a no-op (not an error)
  -- when run by a role that did not grant the privilege, so confirm the outcome
  -- rather than trusting the statement.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO still_open
  FROM pg_proc p
  JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.proname = ANY (core)
    AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
      OR has_function_privilege('anon', p.oid, 'EXECUTE'));

  IF still_open IS NOT NULL THEN
    RAISE EXCEPTION 'REVOKE did not take effect on: % — you are probably not running as the function owner. Re-run as the postgres role.', still_open;
  END IF;
END
$$;

-- Make the lock durable: without this, any function created later defaults to
-- EXECUTE for PUBLIC again and silently reopens the hole.
-- (Applies to objects created by the role running this migration — use the
--  postgres role, which is what the Supabase SQL Editor uses.)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Enable RLS on the five tables that never had it
--
--    015_admin_dashboard.sql:41 assumed these were "accessed only via the
--    service_role key". They are reachable with the public anon key. Impact of
--    system_settings alone: overwrite the AI prompt for every user on the
--    platform (which also bypasses the safety filter, since sanitizePrompt runs
--    inside the builder that an override replaces), or flip maintenance_mode and
--    take the product offline.
--
--    No permissive policy is added on purpose: service_role bypasses RLS, and
--    lib/admin/settings.ts + lib/admin/db.ts already use service_role only.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t     TEXT;
  found INTEGER := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'system_settings', 'admin_logs', 'daily_metrics',
    'user_events', 'subscription_events'
  ]
  LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
      found := found + 1;
    ELSE
      RAISE WARNING 'Table public.% not found — skipped. Your production schema is missing it; investigate before assuming this migration secured everything.', t;
    END IF;
  END LOOP;

  RAISE NOTICE 'RLS enabled + privileges revoked on % of 5 admin/analytics tables', found;
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Close the write-open policies
--
--    Three policies were created as WITH CHECK (true) with no role restriction,
--    which in Postgres means TO PUBLIC — i.e. including `authenticated`.
-- ───────────────────────────────────────────────────────────────────────────

-- 009:13 — any user could forge entries in the credit ledger, corrupting the
-- audit trail and every revenue figure derived from it. The SECURITY DEFINER
-- RPCs run as the table owner and bypass RLS, so scoping this to service_role
-- does not affect them.
DROP POLICY IF EXISTS "Service insert transactions" ON public.credit_transactions;
CREATE POLICY "Service insert transactions"
  ON public.credit_transactions FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 021:213 — created as FOR ALL USING (true) despite the comment saying "only
-- service role". A user could read every webhook payload, or pre-insert a Stripe
-- event id so the real webhook no-ops as a duplicate, suppressing their own
-- credit grant or hiding a payment from the admin dashboard.
DROP POLICY IF EXISTS "Service role only" ON public.webhook_events;
CREATE POLICY "Service role only"
  ON public.webhook_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 014:18 — same defect class. Inert today (nothing reads or writes this table
-- yet), but it becomes a direct credit-minting path the moment the daily-bonus
-- feature flag in lib/admin/settings.ts is switched on. Close it now.
DO $$
BEGIN
  IF to_regclass('public.achievements') IS NOT NULL THEN
    DROP POLICY IF EXISTS "System insert achievements" ON public.achievements;
    -- The policy is RENAMED here, so the DROP above does not cover a re-run.
    -- Without this second DROP a second run raises 42710 and, because the whole
    -- file is wrapped in BEGIN/COMMIT, rolls back the entire security migration.
    DROP POLICY IF EXISTS "Service insert achievements" ON public.achievements;
    CREATE POLICY "Service insert achievements"
      ON public.achievements FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END
$$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying. Every check must return the expected value.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- -- (a) authenticated must hold UPDATE on ONLY the safe preference columns:
-- SELECT column_name FROM information_schema.column_privileges
-- WHERE table_name = 'profiles' AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
-- ORDER BY column_name;
-- -- expect: avatar_url, locale, name, onboarding_completed, onboarding_step,
-- --         persona, sound_enabled   — credits_balance / plan_id / banned MUST be absent
--
-- -- (b) no money RPC may be executable by anon or authenticated:
-- SELECT p.oid::regprocedure AS fn,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed,
--        has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon
-- FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
-- WHERE ns.nspname = 'public'
--   AND p.proname IN ('deduct_credits','reserve_credits','refund_credits','reset_monthly_credits');
-- -- expect: authed = false AND anon = false on EVERY row
--
-- -- (c) every public table must have RLS enabled:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = false;
-- -- expect: 0 rows
--
-- -- (d) RLS alone is not enough — no policy may be open to PUBLIC/authenticated.
-- --     (c) passes even for a table whose policy is WITH CHECK (true), so check both:
-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND (qual = 'true' OR with_check = 'true')
--   AND NOT (roles @> ARRAY['service_role']::name[])
-- ORDER BY tablename;
-- -- expect: 0 rows
--
-- -- (e) from the BROWSER, logged in as a normal free account, all three must fail:
-- --     PATCH /rest/v1/profiles?id=eq.<you>  {"credits_balance": 999999}   -> 403 / 0 rows
-- --     POST  /rest/v1/rpc/refund_credits    {"p_user_id":"<you>","p_amount":9999,...} -> 403
-- --     GET   /rest/v1/system_settings                                     -> 0 rows
-- ═══════════════════════════════════════════════════════════════════════════
