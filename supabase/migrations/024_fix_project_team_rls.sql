-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 024: Fix recursive team RLS + close the direct-write hole on projects
--
-- Two defects inherited from migrations 010 and 011. Neither was reachable until
-- now, because nothing in the app had ever queried these tables — the Projects
-- feature is their first consumer, which is why both surface at the same moment.
--
-- ── Defect 1: infinite recursion (Postgres error 42P17) ────────────────────
--   010_teams.sql:44-47 and :50-56 define policies ON team_members whose USING
--   clause SELECTs FROM team_members. Postgres expands policies during query
--   rewrite, so the policy re-enters itself and raises
--     "infinite recursion detected in policy for relation team_members".
--   011_projects.sql:20-23 then adds a policy on `projects` that subqueries
--   team_members — so the recursion propagates and EVERY read of `projects`
--   fails, regardless of whether the user belongs to a team at all.
--   The error is raised at rewrite time, so it fires even when the tables are
--   empty. This makes the entire Projects feature non-functional at runtime.
--
-- ── Defect 2: plan limits were decorative ──────────────────────────────────
--   011_projects.sql:16-17 is `FOR ALL USING (auth.uid() = user_id)` with NO
--   WITH CHECK. When WITH CHECK is omitted, Postgres reuses the USING expression
--   as the INSERT check — so any authenticated user could POST straight to
--   /rest/v1/projects with their own user_id and create unlimited projects,
--   bypassing the per-plan quota enforced in app/api/projects/route.ts entirely.
--   A limit that only exists in the API is not a limit while the table is
--   writable with the public anon key.
--
-- ⚠ Apply AFTER 023. Run as `postgres` via the Supabase SQL Editor.
-- ⚠ PAIRED CODE CHANGE: app/api/projects/* must use the service-role client for
--   INSERT/UPDATE/DELETE after this migration, since those grants are revoked.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Break the recursion with a SECURITY DEFINER lookup
--
-- The function runs as its owner, so the SELECT inside it does NOT re-enter the
-- team_members policies — which is exactly what stops the recursion. This is the
-- standard remedy for self-referencing RLS.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_team_ids()
RETURNS SETOF UUID AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Policies are evaluated as the CALLING role, so that role needs EXECUTE.
-- 022 set ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,
-- so new functions are created locked and this grant is required, not optional.
REVOKE ALL ON FUNCTION public.user_team_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_team_ids() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_admin_team_ids()
RETURNS SETOF UUID AS $$
  SELECT team_id FROM public.team_members
  WHERE user_id = auth.uid() AND role IN ('owner', 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.user_admin_team_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_admin_team_ids() TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Replace the recursive policies on team_members
-- ───────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.team_members') IS NULL THEN
    RAISE WARNING 'public.team_members not found — skipping. Migration 010 may not have applied.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Members view team members" ON public.team_members;
  CREATE POLICY "Members view team members"
    ON public.team_members FOR SELECT
    TO authenticated
    USING (team_id IN (SELECT public.user_team_ids()));

  DROP POLICY IF EXISTS "Admins manage members" ON public.team_members;
  CREATE POLICY "Admins manage members"
    ON public.team_members FOR ALL
    TO authenticated
    USING (team_id IN (SELECT public.user_admin_team_ids()))
    WITH CHECK (team_id IN (SELECT public.user_admin_team_ids()));
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Restore the policy 010 never managed to create
--
-- 010_teams.sql:23 defines "Team members can view" ON teams, but its subquery
-- references team_members five lines BEFORE that table is created — so the
-- statement errored. The old migration runner had no ON_ERROR_STOP and reported
-- success anyway, which is why this policy is simply absent in production.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.teams') IS NULL THEN
    RAISE WARNING 'public.teams not found — skipping.';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Team members can view" ON public.teams;
  CREATE POLICY "Team members can view"
    ON public.teams FOR SELECT
    TO authenticated
    USING (id IN (SELECT public.user_team_ids()));
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. projects — readable by owner and teammates, writable only by the server
-- ───────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.projects') IS NULL THEN
    RAISE EXCEPTION 'public.projects not found — migration 011 did not apply. Fix that before continuing.';
  END IF;

  -- Was FOR ALL without WITH CHECK; split into an explicit read policy.
  DROP POLICY IF EXISTS "Users manage own projects" ON public.projects;
  DROP POLICY IF EXISTS "Team members view projects" ON public.projects;

  CREATE POLICY "Users read own projects"
    ON public.projects FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR team_id IN (SELECT public.user_team_ids()));
END
$$;

-- Writes go through the API, which checks the session AND the plan quota before
-- inserting. service_role bypasses RLS, so no write policy is needed.
REVOKE INSERT, UPDATE, DELETE ON public.projects FROM anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Record this migration as applied.
--
-- The ledger is created in 023. Guard it so a hand-run recovery that applies
-- this file out of order fails on something legible instead of a bare 42P01.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     TEXT PRIMARY KEY,
  description TEXT,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version, description)
VALUES ('024', 'Fix 42P17 recursive team RLS; lock down direct writes on projects')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION
--
-- -- (a) the recursion is gone — as a normal signed-in user this must return rows
-- --     (or zero rows) rather than error 42P17:
-- SELECT id, name FROM projects LIMIT 5;
--
-- -- (b) direct writes are refused for users:
-- SELECT has_table_privilege('authenticated', 'public.projects', 'INSERT');  -- expect false
-- SELECT has_table_privilege('authenticated', 'public.projects', 'DELETE');  -- expect false
-- SELECT has_table_privilege('authenticated', 'public.projects', 'SELECT');  -- expect true
--
-- -- (c) no self-referencing policy remains on team_members:
-- SELECT policyname, qual FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'team_members';
-- -- expect both quals to call user_team_ids()/user_admin_team_ids(),
-- -- and NEITHER to contain the substring 'FROM team_members'
--
-- -- (d) from the BROWSER as a normal user, this must fail:
-- --     POST /rest/v1/projects  {"user_id":"<you>","name":"bypass"}  -> 403
-- ═══════════════════════════════════════════════════════════════════════════
