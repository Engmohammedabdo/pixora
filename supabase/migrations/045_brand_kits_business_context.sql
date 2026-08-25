-- 045_brand_kits_business_context.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- A brand kit held colours, fonts, a logo and a voice — and nothing about the
-- BUSINESS. Measured on the live database 2026-08-25:
--
--   id, user_id, name, logo_url, primary_color, secondary_color, accent_color,
--   font_primary, font_secondary, brand_voice, is_default, created_at
--
-- So a customer had nowhere to record what their business IS. Meanwhile the plan
-- and analysis studios each asked for businessName / industry / targetMarket from
-- scratch, every session, and stored the answers nowhere. `grep -rn "project"
-- lib/ai/prompts/*.ts` returned ZERO — not one prompt builder ever saw any of it.
--
-- These five columns are where those answers live once. They are also the target
-- of the URL -> brand-DNA extraction: the n8n + Apify workflow returns exactly
-- this shape plus the colours and fonts that already have columns.
--
-- Pre-flight, measured against the live table before writing this file:
--   rows=1  max_name=19
-- so the existing row already satisfies every constraint below and no ALTER can
-- fail on legacy data.
--
-- ⚠ WHY THE CHECKS MATTER HERE, unlike on `projects`.
-- Migration 024:136 revoked INSERT/UPDATE/DELETE on `projects` from customers.
-- `brand_kits` is the opposite case — measured 2026-08-25:
--
--   anon           DELETE,INSERT,SELECT,UPDATE
--   authenticated  DELETE,INSERT,SELECT,UPDATE
--
-- (044 removed only TRUNCATE, TRIGGER and REFERENCES.) RLS gates WHICH ROW; only
-- a GRANT gates WHICH COLUMN. So a customer can PATCH these columns straight over
-- PostgREST, bypassing the route's Zod caps entirely — and every one of them is
-- read back and interpolated into a prompt sent to a paid model. The CHECK below
-- is the ONLY thing bounding them on that path. This is precisely the threat 044
-- was written for; it just never covered columns that did not yet exist.
--
-- Bounds are deliberately IDENTICAL to the Zod caps in app/api/brand-kits/route.ts.
-- Stricter would reject rows the product itself creates; looser leaves the gap
-- open. When the two layers disagree about the same bytes the customer gets a 500
-- carrying raw Postgres text instead of a clean 400 — the lesson recorded for
-- isOwnUploadUrl(), and the reason scripts/tests/logo-parity.ts exists.
--
-- `industry` is deliberately NOT constrained to the enum in lib/industries.ts.
-- That list is allowed to grow, and a database that refuses a slug the code has
-- already shipped is an outage. The length bound is what stops it carrying a
-- payload; industryName() returns '' for anything unrecognised, so an unknown
-- slug degrades to "no industry stated" rather than reaching a model.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── §1. The columns ────────────────────────────────────────────────────────
ALTER TABLE public.brand_kits ADD COLUMN IF NOT EXISTS website_url     TEXT;
ALTER TABLE public.brand_kits ADD COLUMN IF NOT EXISTS industry        TEXT;
ALTER TABLE public.brand_kits ADD COLUMN IF NOT EXISTS description     TEXT;
ALTER TABLE public.brand_kits ADD COLUMN IF NOT EXISTS target_audience TEXT;
ALTER TABLE public.brand_kits ADD COLUMN IF NOT EXISTS city            TEXT;

-- ── §2. Constrain the shape ────────────────────────────────────────────────

ALTER TABLE public.brand_kits
  DROP CONSTRAINT IF EXISTS brand_kits_industry_len,
  ADD  CONSTRAINT brand_kits_industry_len
       CHECK (industry IS NULL OR char_length(industry) BETWEEN 1 AND 40);

ALTER TABLE public.brand_kits
  DROP CONSTRAINT IF EXISTS brand_kits_description_len,
  ADD  CONSTRAINT brand_kits_description_len
       CHECK (description IS NULL OR char_length(description) <= 2000);

ALTER TABLE public.brand_kits
  DROP CONSTRAINT IF EXISTS brand_kits_target_audience_len,
  ADD  CONSTRAINT brand_kits_target_audience_len
       CHECK (target_audience IS NULL OR char_length(target_audience) <= 500);

ALTER TABLE public.brand_kits
  DROP CONSTRAINT IF EXISTS brand_kits_city_len,
  ADD  CONSTRAINT brand_kits_city_len
       CHECK (city IS NULL OR char_length(city) <= 100);

-- `website_url` is bounded on SCHEME as well as length. It is customer-writable
-- over PostgREST and is displayed back in the UI; `javascript:` and `data:` are
-- refused here rather than trusted to a renderer. Stated on the raw bytes the
-- column stores, matching what the route stores — the isOwnUploadUrl() rule:
-- both layers must decide on the SAME bytes, or they disagree and the customer
-- gets a 500 instead of a 400.
ALTER TABLE public.brand_kits
  DROP CONSTRAINT IF EXISTS brand_kits_website_url_shape,
  ADD  CONSTRAINT brand_kits_website_url_shape
       CHECK (
         website_url IS NULL
         OR (char_length(website_url) <= 500 AND website_url ~ '^https?://[^[:space:]]+$')
       );

-- ── §3. Prove it, as the role that actually attacks ────────────────────────
-- Every probe runs as `authenticated` with a real user id, because that role
-- genuinely holds INSERT and UPDATE here (unlike on `projects`) — so a CHECK
-- violation is the verdict we expect, not a permission denial. A probe that
-- cannot reach a verdict is a FAILURE, not a pass. Results come back as a final
-- SELECT: apply.js discards NOTICE and WARNING, so RAISE NOTICE is invisible.

CREATE TEMP TABLE probe_results (probe text, verdict text) ON COMMIT DROP;
-- The probes run as `authenticated`, which is the whole point — so that role has to
-- be able to record its own verdicts. Without this the first probe dies on 42501
-- and the migration reports nothing about the constraints it exists to prove.
-- (Caught by the rehearsal; 044:81 already carried it.)
GRANT INSERT, SELECT ON probe_results TO authenticated;

DO $probe$
DECLARE
  v_user UUID;
  v_kit  UUID;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    INSERT INTO probe_results VALUES ('precondition', 'FAIL: no user to probe with');
    RETURN;
  END IF;

  -- BOTH claim shapes, and `role` inside the claims JSON. RLS policies read
  -- auth.uid() which resolves through these; omitting `role` leaves the policy
  -- unable to authorise the insert, so probe A fails for the wrong reason and
  -- certifies nothing. 044:94-96 is the working pattern — follow it exactly.
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- A: a legitimate insert must succeed, or the constraints broke the product.
  BEGIN
    INSERT INTO public.brand_kits (user_id, name, industry, description, target_audience, city, website_url)
    VALUES (v_user, 'probe-045', 'restaurant', 'Chicken and beef shawarma',
            'Office workers in Al Karama', 'Dubai', 'https://example.com')
    RETURNING id INTO v_kit;
    INSERT INTO probe_results VALUES ('A legitimate insert', 'PASS');
  EXCEPTION
    WHEN OTHERS THEN INSERT INTO probe_results VALUES ('A legitimate insert', 'FAIL: ' || SQLSTATE);
  END;

  IF v_kit IS NULL THEN
    INSERT INTO probe_results VALUES ('precondition', 'FAIL: probe row not created; B-G certify nothing');
    RESET ROLE;
    RETURN;
  END IF;

  -- B: over-long description refused (23514)
  BEGIN
    UPDATE public.brand_kits SET description = repeat('x', 2001) WHERE id = v_kit;
    INSERT INTO probe_results VALUES ('B description>2000 refused', 'FAIL: accepted');
  EXCEPTION
    WHEN check_violation THEN INSERT INTO probe_results VALUES ('B description>2000 refused', 'PASS');
    WHEN OTHERS THEN INSERT INTO probe_results VALUES ('B description>2000 refused', 'FAIL: ' || SQLSTATE);
  END;

  -- C: over-long industry refused
  BEGIN
    UPDATE public.brand_kits SET industry = repeat('y', 41) WHERE id = v_kit;
    INSERT INTO probe_results VALUES ('C industry>40 refused', 'FAIL: accepted');
  EXCEPTION
    WHEN check_violation THEN INSERT INTO probe_results VALUES ('C industry>40 refused', 'PASS');
    WHEN OTHERS THEN INSERT INTO probe_results VALUES ('C industry>40 refused', 'FAIL: ' || SQLSTATE);
  END;

  -- D: over-long target_audience refused
  BEGIN
    UPDATE public.brand_kits SET target_audience = repeat('z', 501) WHERE id = v_kit;
    INSERT INTO probe_results VALUES ('D target_audience>500 refused', 'FAIL: accepted');
  EXCEPTION
    WHEN check_violation THEN INSERT INTO probe_results VALUES ('D target_audience>500 refused', 'PASS');
    WHEN OTHERS THEN INSERT INTO probe_results VALUES ('D target_audience>500 refused', 'FAIL: ' || SQLSTATE);
  END;

  -- E: over-long city refused
  BEGIN
    UPDATE public.brand_kits SET city = repeat('w', 101) WHERE id = v_kit;
    INSERT INTO probe_results VALUES ('E city>100 refused', 'FAIL: accepted');
  EXCEPTION
    WHEN check_violation THEN INSERT INTO probe_results VALUES ('E city>100 refused', 'PASS');
    WHEN OTHERS THEN INSERT INTO probe_results VALUES ('E city>100 refused', 'FAIL: ' || SQLSTATE);
  END;

  -- F: a javascript: website_url refused — the scheme guard, not just the length
  BEGIN
    UPDATE public.brand_kits SET website_url = 'javascript:alert(1)' WHERE id = v_kit;
    INSERT INTO probe_results VALUES ('F javascript: url refused', 'FAIL: accepted');
  EXCEPTION
    WHEN check_violation THEN INSERT INTO probe_results VALUES ('F javascript: url refused', 'PASS');
    WHEN OTHERS THEN INSERT INTO probe_results VALUES ('F javascript: url refused', 'FAIL: ' || SQLSTATE);
  END;

  -- G: a whitespace-carrying url refused. `~ '^https?://'` alone would accept
  --    'https://ok.com evil', which a downstream splitter could re-read.
  BEGIN
    UPDATE public.brand_kits SET website_url = 'https://ok.com evil' WHERE id = v_kit;
    INSERT INTO probe_results VALUES ('G url with whitespace refused', 'FAIL: accepted');
  EXCEPTION
    WHEN check_violation THEN INSERT INTO probe_results VALUES ('G url with whitespace refused', 'PASS');
    WHEN OTHERS THEN INSERT INTO probe_results VALUES ('G url with whitespace refused', 'FAIL: ' || SQLSTATE);
  END;

  -- H: the honest edit path still works after all of the above.
  BEGIN
    UPDATE public.brand_kits
       SET industry = 'clinic', city = 'Abu Dhabi', website_url = 'https://example.ae/menu'
     WHERE id = v_kit;
    INSERT INTO probe_results VALUES ('H legitimate update', 'PASS');
  EXCEPTION
    WHEN OTHERS THEN INSERT INTO probe_results VALUES ('H legitimate update', 'FAIL: ' || SQLSTATE);
  END;

  RESET ROLE;
  DELETE FROM public.brand_kits WHERE id = v_kit;
END
$probe$;

-- Refuse to commit if any probe did not reach its expected verdict. A probe that
-- could not decide is treated as a failure, not a pass — it certifies nothing.
-- Verbatim the gate 044:153-162 carries on this same table.
--
-- This file reported `N FAILED of M` and committed regardless. Nothing downstream
-- caught it either: scripts/db/apply.js truncates its output at 300 characters,
-- which lands inside the aggregated result string below. The live database is not
-- at risk — 045 is already applied and recorded — but every future replay is: a
-- fresh staging database, a restored replica, a rebuilt dev database. There, a
-- probe that FAILS would commit anyway and report success.
--
-- Placed BEFORE the schema_migrations insert deliberately: a version recorded as
-- applied for a schema whose own probes failed is worse than an unrecorded one,
-- because the next runner skips it.
DO $gate$
DECLARE
  v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM probe_results WHERE verdict <> 'PASS';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'brand_kits business-context probes failed: % probe(s) did not reach the expected verdict (%)',
      v_bad,
      (SELECT string_agg(probe || '=' || verdict, ' | ' ORDER BY probe)
         FROM probe_results WHERE verdict <> 'PASS');
  END IF;
END
$gate$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('045', 'brand_kits business context columns, bounded on the same bytes the route stores')
ON CONFLICT (version) DO NOTHING;

-- One compact row. Reported as a single aggregated string on purpose: apply.js
-- truncates its output, and a per-probe result set hides the LAST probes — which
-- is exactly where a failure would be least likely to be noticed.
SELECT
  count(*) FILTER (WHERE verdict <> 'PASS')::text || ' FAILED of ' || count(*)::text
    || ' :: ' || string_agg(probe || '=' || verdict, ' | ' ORDER BY probe) AS result
FROM probe_results;

COMMIT;
