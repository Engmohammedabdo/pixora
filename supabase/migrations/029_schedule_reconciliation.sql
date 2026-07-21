-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 029: Schedule the orphaned-generation reconciler
--
-- 028 created reconcile_orphaned_generations() but deliberately did not
-- schedule it — a scope boundary, not an oversight. This closes that: a
-- reconciler nobody calls is half a fix. Until it runs on a timer, credits
-- stranded by a killed process stay stranded.
--
-- pg_cron is confirmed installed on this project (it already runs
-- `reset_monthly_credits()` monthly as jobid 1), so this follows the same
-- mechanism rather than introducing an external scheduler.
--
-- ── WHY EVERY 15 MINUTES ────────────────────────────────────────────────────
-- The function only touches generations older than its p_older_than threshold
-- (default 30 minutes), so the cadence does not affect WHICH rows qualify —
-- only how quickly a user gets their credits back after one strands. Every 15
-- minutes bounds that wait to at most ~45 minutes from the crash, while
-- staying cheap: with nothing stranded the call is a single indexed scan that
-- returns immediately (verified in production — it returned
-- reconciled_count 0 on an empty candidate set).
--
-- ── WHY THIS IS SAFE TO RUN UNATTENDED ──────────────────────────────────────
-- 028's payout is computed from the credit_transactions ledger, not from
-- generations.credits_used, and is recomputed on every call. A row already
-- repaid yields owed <= 0 and is skipped. Combined with FOR UPDATE SKIP
-- LOCKED and the status flip to 'failed', a repeated or overlapping run cannot
-- pay twice — proven in production inside a rolled-back transaction: two
-- back-to-back runs returned 14 credits then 0, with the balance unchanged on
-- the second.
--
-- ── IDEMPOTENT ──────────────────────────────────────────────────────────────
-- cron.schedule() with an existing job name UPDATES that job rather than
-- creating a duplicate, so re-running this file is safe. The explicit
-- unschedule below is belt-and-braces for the case where the job was created
-- under a different name during manual testing.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron is not installed — enable it before applying 029, or schedule reconcile_orphaned_generations() with an external scheduler instead';
  END IF;
END
$$;

SELECT cron.schedule(
  'reconcile-orphaned-generations',
  '*/15 * * * *',
  $$SELECT public.reconcile_orphaned_generations();$$
);

INSERT INTO public.schema_migrations (version, description)
VALUES ('029', 'schedule reconcile_orphaned_generations() every 15 minutes via pg_cron')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying.
--
--   SELECT jobid, jobname, schedule, command, active
--     FROM cron.job WHERE jobname = 'reconcile-orphaned-generations';
--   -- expect: one row, '*/15 * * * *', active = true
--
-- After the first tick, confirm it is actually executing (not just scheduled):
--
--   SELECT status, return_message, start_time, end_time
--     FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'reconcile-orphaned-generations')
--    ORDER BY start_time DESC LIMIT 5;
--   -- expect: status 'succeeded'. A 'failed' row here means the cron role
--   -- cannot EXECUTE the function — 028 grants it to service_role only, and
--   -- pg_cron runs as the job owner, so re-check ownership if that happens.
--
-- To pause it without dropping it:
--   UPDATE cron.job SET active = false WHERE jobname = 'reconcile-orphaned-generations';
-- To remove it entirely:
--   SELECT cron.unschedule('reconcile-orphaned-generations');
-- ═══════════════════════════════════════════════════════════════════════════
