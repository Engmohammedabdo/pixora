-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 025: Enforce project integrity in the database
--
-- Closes two holes that let the client bypass the ownership and quota checks in
-- app/api/*. Both matter because project isolation is the thing agencies pay for
-- — a check that lives only in the API is not an isolation guarantee.
--
-- ── Hole 1: generations.project_id was unvalidated ─────────────────────────
--   003_generations_assets.sql:22-24 allows users to INSERT their own
--   generations, and :26-28 allows UPDATE with `USING (auth.uid() = user_id)`
--   and NO `WITH CHECK`. Nothing constrains `project_id` to a project the user
--   owns, so a user could POST/PATCH straight to PostgREST and attach a
--   generation to any project id at all — bypassing resolveProjectId() entirely.
--   A trigger fixes this for every writer, including our own API if it regresses.
--
-- ── Hole 2: the per-plan project quota was racy ────────────────────────────
--   app/api/projects/route.ts counts, then inserts. Two concurrent requests can
--   both read the same count and both insert, so a free user (limit 1) can end up
--   with several projects. After migration 024 the API is the ONLY enforcement
--   point, which makes the race the whole quota.
--
-- ⚠ Apply AFTER 024. Run as `postgres` via the Supabase SQL Editor.
-- ⚠ PAIRED CODE CHANGE: app/api/projects/route.ts must call create_project().
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. generations.project_id must reference a project the same user owns
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_generation_project_owner()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = NEW.project_id AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'project_id % does not belong to user %', NEW.project_id, NEW.user_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.assert_generation_project_owner() FROM PUBLIC;

DROP TRIGGER IF EXISTS generations_project_owner ON public.generations;
CREATE TRIGGER generations_project_owner
  BEFORE INSERT OR UPDATE OF project_id, user_id ON public.generations
  FOR EACH ROW EXECUTE FUNCTION public.assert_generation_project_owner();

-- The UPDATE policy had USING but no WITH CHECK. Postgres reuses USING as the
-- check when WITH CHECK is omitted, so re-keying a row to another user_id was
-- already blocked — this is not a hole being closed, it is the implicit rule
-- being written down. It matters because the policy is about to sit next to a
-- trigger that validates project_id, and a reader must not have to remember
-- which half is implicit.
DROP POLICY IF EXISTS "Users update own generations" ON public.generations;
CREATE POLICY "Users update own generations"
  ON public.generations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Atomic project creation with quota enforcement
--
-- Locks the caller's profile row so two concurrent creates serialise: the second
-- waits, then re-counts and sees the first one's row. The limit is passed in by
-- the API because plan configuration lives in lib/stripe/plans.ts — duplicating
-- it into the database would create a second source of truth that silently drifts.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_project(
  p_user_id UUID,
  p_name TEXT,
  p_brand_kit_id UUID,
  p_limit INTEGER
)
RETURNS public.projects AS $$
DECLARE
  v_count INTEGER;
  v_row   public.projects;
BEGIN
  -- Serialises concurrent creates for this user.
  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  SELECT COUNT(*) INTO v_count FROM public.projects WHERE user_id = p_user_id;

  IF v_count >= p_limit THEN
    RAISE EXCEPTION 'project_limit_reached' USING ERRCODE = 'check_violation';
  END IF;

  IF p_brand_kit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.brand_kits WHERE id = p_brand_kit_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'brand_kit_not_found' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.projects (user_id, name, brand_kit_id)
  VALUES (p_user_id, p_name, p_brand_kit_id)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- service_role only: the caller passes p_user_id, so exposing this to users would
-- let them create projects for other accounts and choose their own limit.
REVOKE ALL ON FUNCTION public.create_project(UUID, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_project(UUID, TEXT, UUID, INTEGER) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Index for the per-project generation count
-- ───────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_generations_user_project
  ON public.generations (user_id, project_id);

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
VALUES ('025', 'Trigger validating generations.project_id; atomic create_project with quota')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION
--
-- -- (a) as a normal user, attaching a generation to a project you do not own
-- --     must fail with check_violation:
-- UPDATE generations SET project_id = '<someone-elses-project>' WHERE id = '<your-generation>';
--
-- -- (b) users must not be able to execute create_project:
-- SELECT has_function_privilege('authenticated',
--   'public.create_project(uuid,text,uuid,integer)', 'EXECUTE');  -- expect false
--
-- -- (c) the generations UPDATE policy now has a WITH CHECK:
-- SELECT policyname, qual, with_check FROM pg_policies
-- WHERE schemaname='public' AND tablename='generations' AND cmd='UPDATE';
-- -- expect with_check to be non-null
--
-- -- (d) quota race: fire 5 concurrent POST /api/projects as a free user (limit 1).
-- --     Exactly one must succeed; the rest must return project_limit_reached.
-- ═══════════════════════════════════════════════════════════════════════════
