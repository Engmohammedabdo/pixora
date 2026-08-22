-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 039: an admin login throttle that actually throttles
--
-- ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
-- lib/admin/auth.ts:31-80 guarded the ONLY password-authenticated entrance to
-- this system (ADMIN_USERNAME / ADMIN_PASSWORD, verified at :91). It failed in
-- three independent ways, any one of which removes the limit entirely:
--
--   1. FAIL-OPEN. `catch { return true }` at :76-79, commented "If DB fails,
--      allow the attempt (don't lock out admin)". Any error — a network blip, a
--      permission change, a malformed row — reopened unlimited password guessing.
--
--   2. NOT ATOMIC. SELECT at :36, then UPSERT at :69, as two round trips. N
--      requests in flight together all read the same `count` and all write
--      `count + 1`, so the 5-attempt cap cost an attacker one extra concurrent
--      connection to step past. The check and the increment have to be one
--      statement.
--
--   3. THE KEY WAS ATTACKER-CHOSEN. lib/admin/logger.ts:24-30 read the LEFTMOST
--      `x-forwarded-for` entry, which is whatever the client sent. Every request
--      could name its own bucket, so "5 attempts per IP" meant 5 attempts per
--      *header value* — no limit at all.
--
-- It also kept counters in `system_settings`, a config table read on every
-- studio request through getCachedFeatureFlags(), one row per distinct IP,
-- deleted only on a SUCCESSFUL login (:82-89). Failed attempts accumulated
-- there forever.
--
-- ── WHAT THIS DOES ─────────────────────────────────────────────────────────
-- One table, and one function that decides in a single statement.
-- `consume_login_attempt()` is INSERT ... ON CONFLICT DO UPDATE ... RETURNING:
-- the upsert takes the row lock itself, so concurrent callers serialise and each
-- sees a distinct count. There is no read-then-write window left to race.
--
-- The caller pairs a per-IP key with a global key, because a per-IP limit is
-- only ever as good as the IP. Even against a spoofed header, the global bucket
-- still caps total failed admin logins per window.
--
-- Fail-closed is safe here specifically because this database IS the admin
-- panel: every page behind the login reads from it. If it is unreachable there
-- is nothing to log in to, so denying costs no working functionality — while
-- allowing costs the entire limit.
--
-- ⚠ PAIRED CODE CHANGE REQUIRED. lib/admin/auth.ts must call this RPC and stop
--   returning true on error; lib/admin/logger.ts must stop trusting the leftmost
--   XFF entry. Applying this migration alone changes nothing.
--
-- ⚠ APPLY WITH:  node scripts/db/apply.js supabase/migrations/039_admin_login_throttle.sql
--   apply.js surfaces result ROWS but discards NOTICE/WARNING, so every check
--   below either RAISEs or reports through the final SELECT.
--
-- ⚠ ROLLBACK — roll the APPLICATION back first. With the new code deployed and
--   the function gone, the RPC errors and the throttle fails closed, locking
--   admin login:
--     node scripts/db/apply.js --check "DROP FUNCTION IF EXISTS public.consume_login_attempt(text,integer,interval);"
--     node scripts/db/apply.js --check "DROP TABLE IF EXISTS public.admin_login_attempts;"
--     node scripts/db/apply.js --check "DELETE FROM public.schema_migrations WHERE version='039';"
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ───────────────────────────────────────────────────────────────────────────
-- 1. The counter table
--
--    Deliberately NOT system_settings. That table is configuration, read on
--    every studio request; rate-limit counters are high-churn operational state
--    and do not belong in it.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
  key          TEXT PRIMARY KEY,
  count        INTEGER     NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.admin_login_attempts IS
  'Failed admin login counters. Written only by consume_login_attempt(); no user-facing reads.';

ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;

-- No policies on purpose: RLS on with zero policies denies every role that is
-- not BYPASSRLS, and the only legitimate caller is the service-role admin client
-- (lib/admin/db.ts:5). Belt and braces alongside the revokes.
REVOKE ALL ON public.admin_login_attempts FROM PUBLIC;

DO $guard$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON public.admin_login_attempts FROM %I', r);
    END IF;
  END LOOP;
END
$guard$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Decide and record in ONE statement
--
--    Returns TRUE when the attempt is allowed. The whole decision is the single
--    INSERT ... ON CONFLICT DO UPDATE ... RETURNING below: PostgreSQL takes the
--    row lock as part of the upsert, so two concurrent callers cannot both read
--    the same count. That is exactly the property the old SELECT-then-UPSERT
--    lacked.
--
--    Window handling lives inside the same statement rather than a preceding
--    read: if the stored window has expired, the counter resets to 1 and the
--    window restarts atomically in the same tuple update.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.consume_login_attempt(
  p_key    TEXT,
  p_max    INTEGER,
  p_window INTERVAL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_key IS NULL OR p_key = '' OR p_max IS NULL OR p_max < 1 THEN
    RAISE EXCEPTION 'consume_login_attempt: bad arguments';
  END IF;

  INSERT INTO public.admin_login_attempts AS a (key, count, window_start)
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
                  WHEN a.window_start < NOW() - p_window THEN 1
                  ELSE a.count + 1
                END,
        window_start = CASE
                  WHEN a.window_start < NOW() - p_window THEN NOW()
                  ELSE a.window_start
                END
  RETURNING a.count INTO v_count;

  RETURN v_count <= p_max;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.reset_login_attempts(p_key TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  DELETE FROM public.admin_login_attempts WHERE key = p_key;
$fn$;

-- Housekeeping: rows outlive their window and nothing else deletes them.
CREATE OR REPLACE FUNCTION public.cleanup_login_attempts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.admin_login_attempts WHERE window_start < NOW() - INTERVAL '1 day';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

-- These decide who may log in. SECURITY DEFINER means EXECUTE is the whole gate,
-- so it goes to service_role only — never PUBLIC, which is the default.
DO $grants$
DECLARE
  fn TEXT;
  r  TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.consume_login_attempt(text,integer,interval)',
    'public.reset_login_attempts(text)',
    'public.cleanup_login_attempts()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', fn, r);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END
$grants$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Prove it — before COMMIT
--
--    The property that matters is the one the old code lacked: the attempt past
--    the cap must be refused, and an expired window must reset. Both are
--    exercised against the real function.
-- ───────────────────────────────────────────────────────────────────────────

DO $selftest$
DECLARE
  v_key TEXT := '039-selftest-' || gen_random_uuid()::text;
  i     INTEGER;
BEGIN
  FOR i IN 1..3 LOOP
    IF NOT public.consume_login_attempt(v_key, 3, INTERVAL '15 minutes') THEN
      RAISE EXCEPTION '039: attempt % of 3 was refused but should have been allowed. Refusing to commit.', i;
    END IF;
  END LOOP;

  IF public.consume_login_attempt(v_key, 3, INTERVAL '15 minutes') THEN
    RAISE EXCEPTION '039: the 4th attempt past a max of 3 was ALLOWED — the throttle does not throttle. Refusing to commit.';
  END IF;

  -- an expired window restarts the count, or a locked-out admin stays locked out
  UPDATE public.admin_login_attempts SET window_start = NOW() - INTERVAL '1 hour' WHERE key = v_key;
  IF NOT public.consume_login_attempt(v_key, 3, INTERVAL '15 minutes') THEN
    RAISE EXCEPTION '039: an expired window did not reset. Refusing to commit.';
  END IF;
  IF (SELECT count FROM public.admin_login_attempts WHERE key = v_key) <> 1 THEN
    RAISE EXCEPTION '039: expired-window reset did not restore the count to 1. Refusing to commit.';
  END IF;

  PERFORM public.reset_login_attempts(v_key);
  IF EXISTS (SELECT 1 FROM public.admin_login_attempts WHERE key = v_key) THEN
    RAISE EXCEPTION '039: reset_login_attempts did not delete the row. Refusing to commit.';
  END IF;
END
$selftest$;

-- The limiter must not be reachable from a browser session. anon/authenticated
-- speak to PostgREST directly, so EXECUTE there would let anyone burn the
-- admin's budget — or clear it.
DO $lockout$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      IF has_function_privilege(r, 'public.consume_login_attempt(text,integer,interval)', 'EXECUTE') THEN
        RAISE EXCEPTION '039: role % can EXECUTE consume_login_attempt — a browser session could exhaust or reset the admin login budget. Refusing to commit.', r;
      END IF;
      IF has_table_privilege(r, 'public.admin_login_attempts', 'SELECT') THEN
        RAISE EXCEPTION '039: role % can read admin_login_attempts. Refusing to commit.', r;
      END IF;
    END IF;
  END LOOP;
END
$lockout$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Record and report as a ROW (apply.js discards NOTICE)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     TEXT PRIMARY KEY,
  description TEXT,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version, description)
VALUES ('039', 'admin login throttle: atomic consume_login_attempt(), dedicated table, service_role only')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

SELECT
  '039 OK — cap enforced, window resets, browser roles locked out' AS result,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'consume_login_attempt')                      AS fn_present,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.admin_login_attempts'::regclass)  AS rls_on,
  (SELECT has_function_privilege('service_role', 'public.consume_login_attempt(text,integer,interval)', 'EXECUTE')
     FROM pg_roles WHERE rolname = 'service_role')                                           AS service_role_can_execute;

COMMIT;
