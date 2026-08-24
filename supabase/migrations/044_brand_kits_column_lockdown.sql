-- 044_brand_kits_column_lockdown.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS gates WHICH ROW; only a GRANT gates WHICH COLUMN.
--
-- Migration 022 applied column-level lockdown to `profiles` and to no other
-- table. Migration 042 constrained `brand_kits.logo_url` alone. Every other
-- column of `brand_kits` still carried Supabase's bootstrap
-- `GRANT ALL TO anon, authenticated` — measured 2026-08-24:
--
--     anon           DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--     authenticated  DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
--
-- So a customer could PATCH `brand_kits.name` and `brand_kits.brand_voice` to an
-- arbitrary, unbounded string straight over PostgREST, bypassing
-- app/api/brand-kits/route.ts:16 (`max(100)`) and :23 (`max(500)`) entirely —
-- those run only on the path that goes through the route.
--
-- That matters because those columns are read back and interpolated into the
-- prompt sent to a paid image model (lib/ai/prompts/creator.ts,
-- app/api/studios/storyboard/route.ts). The application layer now sanitises and
-- truncates them at every read site, which is correct and sufficient for the
-- prompts that exist today. This migration closes the SOURCE, so the next feature
-- that reads a brand kit does not inherit the hole.
--
-- Shape follows 040 (assets.url) and 042 (brand_kits.logo_url): constrain what
-- the column may hold, revoke what nothing legitimately does, and prove it as the
-- `authenticated` role inside the transaction before committing.
--
-- Pre-flight, run against the live table before writing this file:
--   rows=1  max_name=19  max_voice=16  bad_primary=0  bad_secondary=0  bad_accent=0
-- so every existing row already satisfies the constraints below and the ALTERs
-- cannot fail on legacy data.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── §1. Constrain the shape, mirroring CreateBrandKitSchema exactly ─────────
-- Deliberately identical to the Zod caps. A constraint STRICTER than the route
-- would reject rows the product itself creates; one LOOSER leaves the gap open.
-- This is the lesson recorded for isOwnUploadUrl(): when the route and the
-- database disagree about the same bytes, the customer gets a 500 carrying raw
-- Postgres text instead of a clean 400.

ALTER TABLE public.brand_kits
  DROP CONSTRAINT IF EXISTS brand_kits_name_len,
  ADD  CONSTRAINT brand_kits_name_len
       CHECK (char_length(name) BETWEEN 1 AND 100);

ALTER TABLE public.brand_kits
  DROP CONSTRAINT IF EXISTS brand_kits_brand_voice_len,
  ADD  CONSTRAINT brand_kits_brand_voice_len
       CHECK (brand_voice IS NULL OR char_length(brand_voice) <= 500);

ALTER TABLE public.brand_kits
  DROP CONSTRAINT IF EXISTS brand_kits_colors_hex,
  ADD  CONSTRAINT brand_kits_colors_hex
       CHECK (
         (primary_color   IS NULL OR primary_color   ~ '^#[0-9A-Fa-f]{6}$') AND
         (secondary_color IS NULL OR secondary_color ~ '^#[0-9A-Fa-f]{6}$') AND
         (accent_color    IS NULL OR accent_color    ~ '^#[0-9A-Fa-f]{6}$')
       );

-- ── §2. Revoke what nothing legitimately does ──────────────────────────────
-- TRUNCATE, TRIGGER and REFERENCES are bootstrap grants no application path uses.
-- SELECT/INSERT/UPDATE/DELETE stay: the brand-kit CRUD route runs as the user's
-- own `authenticated` session, so removing them would break the feature. The
-- shape constraints above are what bound UPDATE, exactly as 040 bounds assets.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.brand_kits FROM anon, authenticated;

-- ── §3. Prove it, as the role that actually attacks ────────────────────────
-- A probe blocked by RLS certifies nothing, so every probe runs as
-- `authenticated` with a real user id and reports a verdict this transaction can
-- refuse to commit on. Results are returned as a final SELECT: apply.js discards
-- NOTICE and WARNING, so RAISE NOTICE would be invisible.

CREATE TEMP TABLE probe_results (probe text, verdict text) ON COMMIT DROP;
-- The probes run as `authenticated`, which is the whole point — so that role has to
-- be able to record its own verdicts. A temp table dropped at COMMIT, so nothing
-- outside this transaction can see or reach it.
GRANT INSERT, SELECT ON probe_results TO authenticated;

DO $probe$
DECLARE
  v_user uuid;
  v_kit  uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    INSERT INTO probe_results VALUES ('setup', 'FAIL: no user to probe as');
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- A legitimate kit must still be creatable. If this fails, the constraints are
  -- stricter than the product and the migration must not commit.
  BEGIN
    INSERT INTO public.brand_kits (user_id, name, primary_color, secondary_color, accent_color, brand_voice)
    VALUES (v_user, 'Probe Kit', '#112233', '#445566', '#778899', 'warm and direct')
    RETURNING id INTO v_kit;
    INSERT INTO probe_results VALUES ('A legitimate insert', 'OK');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES ('A legitimate insert', 'FAIL: ' || SQLSTATE || ' ' || SQLERRM);
  END;

  -- The attack: an unbounded name straight over the table.
  BEGIN
    UPDATE public.brand_kits SET name = repeat('A', 5000) WHERE id = v_kit;
    INSERT INTO probe_results VALUES ('B over-long name refused', 'FAIL: accepted');
  EXCEPTION
    WHEN check_violation THEN INSERT INTO probe_results VALUES ('B over-long name refused', 'OK 23514');
    WHEN insufficient_privilege THEN INSERT INTO probe_results VALUES ('B over-long name refused', 'OK 42501');
    WHEN OTHERS THEN INSERT INTO probe_results VALUES ('B over-long name refused', 'FAIL: ' || SQLSTATE);
  END;

  BEGIN
    UPDATE public.brand_kits SET brand_voice = repeat('B', 5000) WHERE id = v_kit;
    INSERT INTO probe_results VALUES ('C over-long brand_voice refused', 'FAIL: accepted');
  EXCEPTION
    WHEN check_violation THEN INSERT INTO probe_results VALUES ('C over-long brand_voice refused', 'OK 23514');
    WHEN insufficient_privilege THEN INSERT INTO probe_results VALUES ('C over-long brand_voice refused', 'OK 42501');
    WHEN OTHERS THEN INSERT INTO probe_results VALUES ('C over-long brand_voice refused', 'FAIL: ' || SQLSTATE);
  END;

  BEGIN
    UPDATE public.brand_kits SET primary_color = 'javascript:alert(1)' WHERE id = v_kit;
    INSERT INTO probe_results VALUES ('D non-hex colour refused', 'FAIL: accepted');
  EXCEPTION
    WHEN check_violation THEN INSERT INTO probe_results VALUES ('D non-hex colour refused', 'OK 23514');
    WHEN insufficient_privilege THEN INSERT INTO probe_results VALUES ('D non-hex colour refused', 'OK 42501');
    WHEN OTHERS THEN INSERT INTO probe_results VALUES ('D non-hex colour refused', 'FAIL: ' || SQLSTATE);
  END;

  -- An ordinary rename must still work — the constraint bounds the value, it does
  -- not freeze the column.
  BEGIN
    UPDATE public.brand_kits SET name = 'Probe Kit Renamed' WHERE id = v_kit;
    INSERT INTO probe_results VALUES ('E a legitimate rename', 'OK');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO probe_results VALUES ('E a legitimate rename', 'FAIL: ' || SQLSTATE || ' ' || SQLERRM);
  END;

  DELETE FROM public.brand_kits WHERE id = v_kit;
  EXECUTE 'RESET ROLE';
END
$probe$;

-- Refuse to commit if any probe did not reach its expected verdict. A probe that
-- could not decide is treated as a failure, not a pass — it certifies nothing.
DO $gate$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM probe_results WHERE verdict NOT LIKE 'OK%';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'brand_kits lockdown probes failed: % probe(s) did not reach the expected verdict', v_bad;
  END IF;
END
$gate$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('044', 'brand_kits column lockdown: bound name/brand_voice/colours, revoke unused bootstrap grants')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

SELECT probe, verdict FROM probe_results ORDER BY probe;

COMMIT;
