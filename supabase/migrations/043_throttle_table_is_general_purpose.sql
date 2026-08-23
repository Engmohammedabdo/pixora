-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 043: the throttle table is no longer admin-login-only
--
-- Comment-only. No DDL, no data change, nothing to roll back beyond the text.
--
-- ── WHY BOTHER ─────────────────────────────────────────────────────────────
-- `admin_login_attempts` now also carries the counters for
-- `POST /api/auth/recover`, which is the unauthenticated password-reset
-- endpoint. Its COMMENT still said the table held failed admin logins, which is
-- the kind of small untruth that costs someone an hour later: the next person
-- reading `recover:addr:…` rows in a table named after admin login will assume
-- a bug, or worse, "clean up" rows that are actively rate-limiting an endpoint.
--
-- The NAME is deliberately left alone. Renaming would break
-- `cleanup_login_attempts()`, `consume_login_attempt()`,
-- `reset_login_attempts()`, the pg_cron job `pyrasuite-cleanup-login-attempts`
-- scheduled by 041, and `lib/admin/auth.ts` — a rename with four moving parts,
-- to fix a word. The comment is where the truth belongs.
--
-- ── KEY NAMESPACES IN USE ──────────────────────────────────────────────────
--   login_attempts:ip:<addr>     admin login, per source        (lib/admin/auth.ts)
--   login_attempts:global        admin login, advisory only — never denies
--   recover:ip:<addr>            password reset, per source     (app/api/auth/recover)
--   recover:addr:<sha256[:32]>   password reset, per address; the address itself
--                                is never stored
--
-- `cleanup_login_attempts()` (039) deletes on `window_start` alone and is
-- key-agnostic, so the new namespace is already covered by the hourly job.
--
-- ⚠ APPLY WITH:  node scripts/db/apply.js supabase/migrations/043_throttle_table_is_general_purpose.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  IF to_regclass('public.admin_login_attempts') IS NULL THEN
    RAISE EXCEPTION '043: public.admin_login_attempts does not exist — migration 039 has not been applied. Aborting.';
  END IF;
  IF to_regprocedure('public.consume_login_attempt(text,integer,interval)') IS NULL THEN
    RAISE EXCEPTION '043: consume_login_attempt() is missing, so nothing writes this table. Aborting.';
  END IF;
END
$pre$;

COMMENT ON TABLE public.admin_login_attempts IS
  'General-purpose keyed rate-limit counters, despite the name (kept for compatibility '
  'with consume_login_attempt/reset_login_attempts/cleanup_login_attempts and the '
  'pyrasuite-cleanup-login-attempts cron job). Namespaces: login_attempts:* = admin '
  'login (lib/admin/auth.ts); recover:* = password reset (app/api/auth/recover), where '
  'the per-address key holds a SHA-256 prefix, never the address. Written only through '
  'consume_login_attempt(); no user-facing reads. Rows are deleted after one day by '
  'cleanup_login_attempts().';

COMMENT ON FUNCTION public.consume_login_attempt(TEXT, INTEGER, INTERVAL) IS
  'Atomic keyed rate limiter: one INSERT ... ON CONFLICT DO UPDATE ... RETURNING, so '
  'concurrent callers serialise on the row lock instead of all reading the same count. '
  'Returns TRUE when the attempt is allowed. SECURITY DEFINER, EXECUTE to service_role '
  'only. Callers: admin login and POST /api/auth/recover.';

INSERT INTO public.schema_migrations (version, description)
VALUES ('043', 'admin_login_attempts: comment says what the table actually holds now that password reset shares it')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

SELECT
  '043 OK — comments updated, no schema change' AS result,
  obj_description('public.admin_login_attempts'::regclass, 'pg_class') IS NOT NULL AS table_commented,
  (SELECT count(*) FROM public.admin_login_attempts)                                AS rows_now;

COMMIT;
