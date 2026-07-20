-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK_STATE.sql — READ-ONLY report of what the production database actually is
--
-- Nothing here writes. Paste the whole file into the Supabase SQL Editor and read
-- the result of each block.
--
-- Why this exists: the project has 26 migration files and, until migration 023,
-- no record of which had been applied. The old runner (scripts/apply-migrations.sh)
-- had no `ON_ERROR_STOP`, so a failed statement was reported as success — which is
-- how migration 010's team policy failed silently and went unnoticed for months.
-- Never assume the schema matches the repo. Check.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Which migrations have recorded themselves? ──────────────────────────
-- Empty result = migration 023 has not been applied yet (the ledger is created
-- there). Migrations 001–022 predate the ledger and will never appear.
SELECT 'applied migrations' AS report, version, description, applied_at
FROM public.schema_migrations
ORDER BY version;


-- ── 2. Tables with NO row-level security ───────────────────────────────────
-- Expect ZERO rows. Anything listed is readable/writable with the public anon key.
SELECT 'table without RLS' AS report, tablename
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false
ORDER BY tablename;


-- ── 3. Policies open to everyone ───────────────────────────────────────────
-- RLS being ON is not enough: a policy of `true` that is not restricted to
-- service_role leaves the table open. Expect ZERO rows.
SELECT 'open policy' AS report, tablename, policyname, cmd, roles::text
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true')
  AND NOT (roles @> ARRAY['service_role']::name[])
ORDER BY tablename;


-- ── 4. Can users execute the money / privileged functions? ─────────────────
-- Expect `false` in BOTH columns on every row.
SELECT 'function privilege' AS report,
       p.oid::regprocedure::text AS fn,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_run,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_can_run
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'deduct_credits', 'reserve_credits', 'refund_credits',
    'reset_monthly_credits', 'claim_referral', 'create_project'
  )
ORDER BY 2;


-- ── 5. Which profile columns can a user write? ─────────────────────────────
-- Expect ONLY preference columns (name, avatar_url, locale, persona,
-- sound_enabled, onboarding_*). If credits_balance, plan_id or banned appear,
-- migration 022 has not been applied and every account can grant itself credit.
SELECT 'writable profile column' AS report, column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND privilege_type = 'UPDATE' AND grantee = 'authenticated'
ORDER BY column_name;


-- ── 6. Direct table writes granted to users ────────────────────────────────
-- `projects` must NOT appear for INSERT/UPDATE/DELETE after migration 024,
-- otherwise the per-plan quota can be bypassed entirely.
SELECT 'direct write grant' AS report, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  AND table_name IN ('projects', 'credit_transactions', 'webhook_events', 'referrals', 'achievements')
ORDER BY table_name, privilege_type;


-- ── 7. Do the expected tables exist at all? ────────────────────────────────
-- `false` means the migration that should have created it failed silently.
SELECT 'table exists' AS report, t AS table_name,
       to_regclass('public.' || t) IS NOT NULL AS present
FROM unnest(ARRAY[
  'profiles','brand_kits','generations','credit_transactions','assets',
  'teams','team_members','projects','achievements','saved_prompts',
  'system_settings','admin_logs','daily_metrics','user_events',
  'subscription_events','webhook_events','referrals','schema_migrations'
]) AS t
ORDER BY present, t;


-- ── 8. Self-referencing team policies (cause of Postgres error 42P17) ──────
-- Expect ZERO rows. Any row here means every query on `projects` fails at
-- runtime, because the policy re-enters itself during query rewrite.
SELECT 'recursive policy' AS report, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'team_members'
  AND qual LIKE '%team_members%'
ORDER BY policyname;


-- ── 9. Is generations.project_id protected by the integrity trigger? ───────
-- Expect one row after migration 025. Without it a user can attach a generation
-- to any project id via PostgREST, bypassing the API's ownership check.
SELECT 'integrity trigger' AS report, tgname AS trigger_name
FROM pg_trigger
WHERE tgrelid = 'public.generations'::regclass
  AND NOT tgisinternal;
