-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 041: actually run cleanup_login_attempts()
--
-- Migration 039 shipped `cleanup_login_attempts()` and scheduled nothing, so it
-- was dead code — while 039's own header names "accumulated there forever" as a
-- defect of the design it replaced. Caught in review before it mattered.
--
-- It matters because `consume_login_attempt()` INSERTs the row BEFORE the cap is
-- evaluated: a refused attempt from a previously unseen key still writes a
-- permanent row. Row creation is therefore bounded by the number of distinct
-- source addresses that ever probe /api/admin/auth/login — i.e. by the internet,
-- on the same Postgres the whole product runs on.
--
-- pg_cron is already installed and in use (029 schedules the reconciler), so
-- this is the one line 039 should have carried.
--
-- Hourly, not daily: the function only deletes rows whose window closed over a
-- day ago, so the cadence costs nothing and bounds the table between runs.
--
-- ⚠ ROLLBACK:
--     node scripts/db/apply.js --check "SELECT cron.unschedule('pyrasuite-cleanup-login-attempts');"
--     node scripts/db/apply.js --check "DELETE FROM public.schema_migrations WHERE version='041';"
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $pre$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION '041: pg_cron is not installed, so the cleanup cannot be scheduled. Aborting.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cleanup_login_attempts'
  ) THEN
    RAISE EXCEPTION '041: public.cleanup_login_attempts() does not exist — apply 039 first. Aborting.';
  END IF;
END
$pre$;

-- Idempotent: unschedule any previous incarnation before creating this one, so
-- re-running can never leave two jobs deleting the same rows.
DO $sched$
BEGIN
  PERFORM cron.unschedule('pyrasuite-cleanup-login-attempts');
EXCEPTION
  WHEN OTHERS THEN
    NULL;  -- not scheduled yet, which is the normal first-apply case
END
$sched$;

SELECT cron.schedule(
  'pyrasuite-cleanup-login-attempts',
  '0 * * * *',
  $job$ SELECT public.cleanup_login_attempts(); $job$
);

-- Exactly one job must own this name, or two schedules race on the same rows.
DO $verify$
DECLARE
  v_jobs INTEGER;
BEGIN
  SELECT count(*) INTO v_jobs FROM cron.job WHERE jobname = 'pyrasuite-cleanup-login-attempts';
  IF v_jobs <> 1 THEN
    RAISE EXCEPTION '041: expected exactly 1 cleanup job, found %. Refusing to commit.', v_jobs;
  END IF;
END
$verify$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('041', 'schedule cleanup_login_attempts() hourly — 039 defined it but never ran it')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

SELECT
  '041 OK — cleanup scheduled' AS result,
  (SELECT schedule FROM cron.job WHERE jobname = 'pyrasuite-cleanup-login-attempts') AS schedule,
  (SELECT active   FROM cron.job WHERE jobname = 'pyrasuite-cleanup-login-attempts') AS active;

COMMIT;
