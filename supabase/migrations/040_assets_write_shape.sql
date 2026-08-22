-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 040: stop customers writing arbitrary URLs into `assets`
--
-- ── THE DEFECT CLASS ───────────────────────────────────────────────────────
-- Same shape as migration 038, one table over: RLS gates WHICH ROW, and only a
-- GRANT gates WHICH COLUMN. `assets` was created (003:44-58) with a single
-- policy —
--     "Users manage own assets" FOR ALL USING (auth.uid() = user_id)
-- — and no GRANT/REVOKE at all, so Supabase's bootstrap
-- `GRANT ALL TO anon, authenticated` is still in force on every column.
-- Verified against the live database: `authenticated` holds
-- DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE, and the policy
-- has polwithcheck = NULL, so an INSERT is gated on row ownership alone.
--
-- So any signed-up user can put any string into `assets.url`. That was not
-- theoretical: POST /api/assets/export did `await fetch(asset.url)` on exactly
-- that column, turning the export endpoint into a server-side request to an
-- address of the customer's choosing with the response returned in a ZIP. That
-- sink is fixed (lib/storage/export-source.ts), as is the admin panel's preview
-- `<img src>`. This migration goes after the SOURCE so the next piece of code
-- that reads `assets.url` does not have to rediscover the lesson.
--
-- ── TWO THINGS AN EARLIER DRAFT GOT WRONG ──────────────────────────────────
-- Both were caught by adversarial review before this was ever applied, and both
-- are worth recording because they are easy to reintroduce.
--
-- 1. IT DERIVED THE ALLOWED ORIGIN FROM `assets.url` ITSELF, by selecting an
--    existing row — i.e. it took its trust anchor from the exact
--    customer-writable column it exists to constrain. Worse, it built a LIKE
--    pattern from that value, where `%` and `_` are wildcards: a customer who
--    inserted `https://%/storage/v1/object/public/x` could have the guard
--    compiled into `https://%/storage/v1/object/public/%`, which matches EVERY
--    host — while every probe still passed and the migration committed
--    "040 OK" over a guard that permitted everything.
--
--    Hence: the origin below is a literal, reviewable in the diff, and matching
--    is done with starts_with() rather than LIKE so no character in the data is
--    ever a metacharacter. Section 0 asserts the literal agrees with the rows
--    that already exist, so a deployment mismatch aborts instead of silently
--    banning the origin the app actually writes.
--
-- 2. IT CLAIMED NO CODE PATH WOULD BE BLOCKED. False. On a plan with no
--    watermark — every paying customer — `persistGeneratedImage` deliberately
--    degrades to the PROVIDER's URL when a storage upload errors, when
--    getPublicUrl returns empty, or when urlToBuffer/applyWatermark throws
--    (lib/storage/persist-image.ts). Two providers emit a foreign host there:
--    lib/ai/replicate.ts (replicate.delivery) and lib/ai/openai.ts (Azure blob
--    storage). The four insert sites — creator, photoshoot, edit, voiceover —
--    do not check the returned error, and creator/photoshoot insert MANY rows in
--    one statement, so one rejected row would have silently discarded the whole
--    batch while the route still returned success and kept the charge.
--
--    Those two hosts are therefore allowed. They are the same closed set
--    lib/image/watermark.ts already trusts, so this neither widens nor narrows
--    what the product will fetch — 169.254.169.254, localhost and every other
--    address stay rejected.
--
-- ── WHAT THIS DOES ─────────────────────────────────────────────────────────
-- 1. Revokes UPDATE. Nothing in the product updates this table: the only
--    `.update()` against `assets` anywhere in app/, lib/ or scripts/ is
--    scripts/backfill-data-uris.ts, which runs on the service-role key and
--    holds its own grant. There is no `.upsert()` on `assets` at all. INSERT,
--    SELECT and DELETE stay — the studios insert, the assets page reads, and a
--    user really can delete their own assets.
--
-- 2. Constrains the SHAPE of a written url. Revoking INSERT is not available
--    for the same reason it was not on `generations`: all nine studios write
--    through createServerClient() — anon key plus the user's cookie JWT — so
--    the app runs as `authenticated`, the same role over the same PostgREST
--    endpoint as an attacker. Privilege cannot separate them; the shape of the
--    write can.
--
-- ⚠ APPLY WITH:  node scripts/db/apply.js supabase/migrations/040_assets_write_shape.sql
--
-- ⚠ ROLLBACK:
--     node scripts/db/apply.js --check "DROP TRIGGER IF EXISTS assets_url_shape_guard ON public.assets;"
--     node scripts/db/apply.js --check "GRANT UPDATE ON public.assets TO anon, authenticated;"
--     node scripts/db/apply.js --check "DELETE FROM public.schema_migrations WHERE version='040';"
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Preconditions
--
--    The storage origin is a literal, but it must agree with reality. Every
--    storage-backed row already in the table has to sit under it; if any does
--    not, this deployment is not the one this migration was written for and the
--    guard would ban writes the app performs.
-- ───────────────────────────────────────────────────────────────────────────

DO $pre$
DECLARE
  v_prefix  CONSTANT TEXT := 'https://pixoradb.pyramedia.cloud/storage/v1/object/public/assets/';
  v_strays  BIGINT;
  v_example TEXT;
BEGIN
  IF to_regclass('public.assets') IS NULL THEN
    RAISE EXCEPTION '040: public.assets does not exist. Aborting.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'url'
  ) THEN
    RAISE EXCEPTION '040: public.assets has no url column. Aborting.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION '040: role `authenticated` does not exist, so section 3 cannot probe as a real customer. Aborting.';
  END IF;

  SELECT count(*), min(url) INTO v_strays, v_example
  FROM public.assets
  WHERE url ~ '^https?://[^/]+/storage/v1/object/public/'
    AND NOT starts_with(url, v_prefix);

  IF v_strays > 0 THEN
    RAISE EXCEPTION '040: % storage-backed asset row(s) do not sit under %  (e.g. %). The literal in this migration disagrees with the deployment — update it rather than banning writes the app performs. Aborting.',
      v_strays, v_prefix, v_example;
  END IF;
END
$pre$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Revoke UPDATE — zero callers
-- ───────────────────────────────────────────────────────────────────────────

REVOKE UPDATE ON public.assets FROM PUBLIC;

DO $revoke$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE UPDATE ON public.assets FROM %I', r);
    END IF;
  END LOOP;
END
$revoke$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Constrain the shape of a written url
--
--    No dynamic SQL and no LIKE, on purpose. Every comparison is starts_with()
--    against a literal, so nothing in the data is ever a metacharacter and the
--    whole rule is readable in the diff.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_asset_url_shape()
RETURNS TRIGGER AS $body$
BEGIN
  -- edit/route.ts inserts '' when a generation produced no file.
  IF NEW.url IS NULL OR NEW.url = '' THEN
    RETURN NEW;
  END IF;

  -- Bytes carried inline. persist-image.ts writes these when a storage upload
  -- fails on a watermarked plan; 13 of the 25 live rows are one.
  IF starts_with(NEW.url, 'data:') THEN
    RETURN NEW;
  END IF;

  -- An object in our own bucket. The bucket is pinned, not just the origin, and
  -- a relative segment is refused: `..` normalises away in a URL parser, so a
  -- path carrying one is not necessarily the object it appears to name.
  IF starts_with(NEW.url, 'https://pixoradb.pyramedia.cloud/storage/v1/object/public/assets/')
     AND position('..' IN NEW.url) = 0 THEN
    RETURN NEW;
  END IF;

  -- The provider URLs persistGeneratedImage degrades to on an unwatermarked
  -- plan when storage is unavailable. Same closed set lib/image/watermark.ts
  -- already trusts; see the header for why refusing these would silently
  -- destroy a paying customer's batch.
  IF starts_with(NEW.url, 'https://replicate.delivery/')
     OR starts_with(NEW.url, 'https://oaidalleapiprodscus.blob.core.windows.net/') THEN
    RETURN NEW;
  END IF;

  -- Mock output. The router refuses mock results in production, so this is a
  -- development shape only.
  IF starts_with(NEW.url, 'https://placehold.co/') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'asset url % is not one this product produces — expected inline data, an object in our own storage bucket, a provider fallback, or a placeholder',
    NEW.url
    USING ERRCODE = 'check_violation';
END;
$body$ LANGUAGE plpgsql SET search_path = public;

REVOKE ALL ON FUNCTION public.assert_asset_url_shape() FROM PUBLIC;

DROP TRIGGER IF EXISTS assets_url_shape_guard ON public.assets;
CREATE TRIGGER assets_url_shape_guard
  BEFORE INSERT OR UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.assert_asset_url_shape();

ALTER TABLE public.assets ENABLE ALWAYS TRIGGER assets_url_shape_guard;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Prove it — as the `authenticated` role, against the live table
--
--    A probe run as the migration role proves nothing: supabase_admin is a
--    superuser and sails past a privilege check. Each probe assumes
--    `authenticated` with request.jwt.claims set to a real owner, so RLS and
--    the grants evaluate exactly as they do for a customer holding the public
--    anon key. Every write is undone by its own subtransaction.
-- ───────────────────────────────────────────────────────────────────────────

DO $probe$
DECLARE
  v_owner UUID;
  v_gen   UUID;
  v_rows  INTEGER;
  v_ok    BOOLEAN;
BEGIN
  SELECT user_id, generation_id INTO v_owner, v_gen
  FROM public.assets WHERE generation_id IS NOT NULL LIMIT 1;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION '040: no asset row to probe against. Aborting.';
  END IF;

  -- ═══ PROBE A — UPDATE must be denied outright ═══
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    UPDATE public.assets SET url = 'http://169.254.169.254/latest/meta-data/' WHERE user_id = v_owner;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    RAISE EXCEPTION '040: probe A FAILED — a customer can still UPDATE assets.url (% row(s)). Refusing to commit.', v_rows;
  EXCEPTION
    WHEN insufficient_privilege THEN v_ok := true;
  END;
  RESET ROLE;
  IF NOT v_ok THEN
    RAISE EXCEPTION '040: probe A reached no verdict. Refusing to commit.';
  END IF;

  -- ═══ PROBE B — INSERT of a foreign url must be refused ═══
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    INSERT INTO public.assets (user_id, generation_id, type, url)
    VALUES (v_owner, v_gen, 'image', 'http://169.254.169.254/latest/meta-data/');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    IF v_rows = 0 THEN
      RAISE EXCEPTION '040: probe B inserted 0 rows — RLS blocked it before the trigger ran, so this certifies nothing. Aborting.';
    END IF;
    RAISE EXCEPTION '040: probe B FAILED — a customer can still INSERT an arbitrary url. Refusing to commit.';
  EXCEPTION
    WHEN check_violation THEN v_ok := true;
  END;
  RESET ROLE;
  IF NOT v_ok THEN
    RAISE EXCEPTION '040: probe B reached no verdict. Refusing to commit.';
  END IF;

  -- ═══ PROBE C — the wildcard-poisoning shape must be refused ═══
  --     The earlier draft derived its allowed origin from this very column and
  --     built a LIKE pattern out of it, so a row like this one compiled a guard
  --     that matched every host. Nothing here is a metacharacter any more, and
  --     this probe is what keeps it that way.
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    INSERT INTO public.assets (user_id, generation_id, type, url)
    VALUES (v_owner, v_gen, 'image', 'https://%/storage/v1/object/public/assets/x.png');
    RESET ROLE;
    RAISE EXCEPTION '040: probe C FAILED — a LIKE-wildcard url was accepted. Refusing to commit.';
  EXCEPTION
    WHEN check_violation THEN v_ok := true;
  END;
  RESET ROLE;
  IF NOT v_ok THEN
    RAISE EXCEPTION '040: probe C reached no verdict. Refusing to commit.';
  END IF;

  -- ═══ PROBE D — a relative segment under our own origin must be refused ═══
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    INSERT INTO public.assets (user_id, generation_id, type, url)
    VALUES (v_owner, v_gen, 'image',
      'https://pixoradb.pyramedia.cloud/storage/v1/object/public/assets/../../../auth/v1/x');
    RESET ROLE;
    RAISE EXCEPTION '040: probe D FAILED — a traversal segment was accepted. Refusing to commit.';
  EXCEPTION
    WHEN check_violation THEN v_ok := true;
  END;
  RESET ROLE;
  IF NOT v_ok THEN
    RAISE EXCEPTION '040: probe D reached no verdict. Refusing to commit.';
  END IF;

  -- ═══ PROBE E — every shape the product actually writes must still work ═══
  --     storage object, inline data, and BOTH provider fallbacks. Missing the
  --     last two is what made the earlier draft dangerous: on a paid plan a
  --     storage outage produces exactly those, and the insert sites do not check
  --     their error, so a rejection would silently discard the whole batch.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    INSERT INTO public.assets (user_id, generation_id, type, url) VALUES
      (v_owner, v_gen, 'image', 'https://pixoradb.pyramedia.cloud/storage/v1/object/public/assets/' || v_owner || '/generations/probe.png'),
      (v_owner, v_gen, 'audio', 'https://pixoradb.pyramedia.cloud/storage/v1/object/public/assets/' || v_owner || '/voiceover-probe.mp3'),
      (v_owner, v_gen, 'image', 'data:image/png;base64,iVBORw0KGgo='),
      (v_owner, v_gen, 'image', 'https://replicate.delivery/pbxt/probe/out.png'),
      (v_owner, v_gen, 'image', 'https://oaidalleapiprodscus.blob.core.windows.net/private/probe.png'),
      (v_owner, v_gen, 'image', '');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;

    IF v_rows <> 6 THEN
      RAISE EXCEPTION '040: probe E inserted % of 6 legitimate shapes. Refusing to commit.', v_rows;
    END IF;
    RAISE EXCEPTION 'PROBE_E_ROLLBACK' USING ERRCODE = 'PE040';
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION '040: probe E FAILED — the guard BLOCKED a url the product legitimately writes. This would silently destroy batch inserts in creator/photoshoot. Refusing to commit.';
    WHEN SQLSTATE 'PE040' THEN
      NULL;  -- expected: subtransaction rollback removed the probe rows
  END;
  RESET ROLE;
END
$probe$;

RESET ROLE;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Record and report as a ROW (apply.js discards NOTICE)
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version, description)
VALUES ('040', 'assets: UPDATE revoked from browser roles; INSERT url must be inline data, our own bucket, a provider fallback, or a placeholder')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

SELECT
  '040 OK — UPDATE denied; foreign, wildcard and traversal urls refused; all 6 real shapes accepted' AS result,
  (SELECT tgenabled FROM pg_trigger
    WHERE tgrelid = 'public.assets'::regclass AND tgname = 'assets_url_shape_guard')     AS guard,
  (SELECT has_table_privilege(r.oid, 'public.assets', 'UPDATE')
     FROM pg_roles r WHERE r.rolname = 'authenticated')                                   AS authed_can_update,
  (SELECT has_table_privilege(r.oid, 'public.assets', 'INSERT')
     FROM pg_roles r WHERE r.rolname = 'authenticated')                                   AS authed_can_insert;

COMMIT;
