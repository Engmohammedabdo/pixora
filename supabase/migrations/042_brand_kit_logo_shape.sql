-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 042: brand-kit logos must point at an object this product uploaded
--
-- ── WHAT WAS BROKEN, MEASURED ──────────────────────────────────────────────
-- `components/brand-kit/LogoUpload.tsx` did `URL.createObjectURL(file)` and
-- handed the result to `onChange`, so the string persisted into
-- `brand_kits.logo_url` was a `blob:` URL — a handle scoped to the document
-- that created it, dead the moment that page unloads. It was never uploaded
-- anywhere. Against the live database that is 1 of 1 rows: every brand-kit logo
-- this product has ever stored points at nothing.
--
-- The API let it through because `z.string().url()` is a SYNTAX check. All four
-- values that actually reach this column pass it:
--
--     blob:http://localhost:3000/…    PASS      data:image/png;base64,…   PASS
--     javascript:alert(1)             PASS      http://evil.example/x.png PASS
--
-- ── WHY A TRIGGER AND NOT ONLY THE ROUTE ───────────────────────────────────
-- Same reason as 038 and 040, one table further along. Verified on the live
-- database: `authenticated` holds INSERT/UPDATE on every column of
-- `brand_kits`, and the table's single policy —
--     "Users manage own brand kits" FOR ALL USING (uid() = user_id)
-- — has polwithcheck = NULL, so a write is gated on owning the ROW and nothing
-- gates the COLUMN. The route's new `isOwnUploadUrl()` check is real, but it
-- guards one door in a building whose PostgREST wall is open: a customer can
-- PATCH /rest/v1/brand_kits directly and never touch the route at all.
--
-- RLS gates WHICH ROW. Only a GRANT gates WHICH COLUMN. And UPDATE cannot be
-- revoked here the way it was on `assets` — editing a brand kit is a feature,
-- and it runs through createServerClient(), i.e. as `authenticated`, the same
-- role over the same endpoint as the attacker. Privilege cannot separate them.
-- The shape of the write can.
--
-- ── THE RULE ───────────────────────────────────────────────────────────────
-- NULL, or an object in our own `uploads` bucket under the owner's own folder.
-- That is exactly and only what POST /api/upload can produce. It mirrors
-- lib/storage/uploaded-url.ts character for character, including the segment
-- ALLOWLIST rather than a `..` blacklist — `%` cannot appear at all, so the
-- `%252E%252E` double-encoding that broke the first export fix has nothing to
-- decode into.
--
-- Stated on NEW, never on OLD. That is the 038 lesson: a rule written as
-- "reject a transition from X" is walked around by hopping through a third
-- value, while a rule written as "NEW must look like this" is total.
--
-- ── THE DATA FIX ───────────────────────────────────────────────────────────
-- Section 1 sets the dead `blob:` rows to NULL. Nothing is lost that was not
-- already lost: the bytes were never uploaded, so the string is a pointer to an
-- object that has not existed since the tab closed. Left in place it renders as
-- a permanently broken image with no way for the user to learn why; set to NULL
-- the upload control comes back and the logo can actually be uploaded.
--
-- ⚠ APPLY WITH:  node scripts/db/apply.js supabase/migrations/042_brand_kit_logo_shape.sql
--
-- ⚠ ROLLBACK (the nulled rows are NOT recoverable, and were worthless):
--     node scripts/db/apply.js --check "DROP TRIGGER IF EXISTS brand_kits_logo_shape_guard ON public.brand_kits;"
--     node scripts/db/apply.js --check "DROP FUNCTION IF EXISTS public.brand_kit_logo_is_own(TEXT, UUID);"
--     node scripts/db/apply.js --check "DELETE FROM public.schema_migrations WHERE version='042';"
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Preconditions
-- ───────────────────────────────────────────────────────────────────────────

DO $pre$
BEGIN
  IF to_regclass('public.brand_kits') IS NULL THEN
    RAISE EXCEPTION '042: public.brand_kits does not exist. Aborting.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brand_kits'
      AND column_name IN ('logo_url', 'user_id')
    GROUP BY table_name HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION '042: public.brand_kits is missing logo_url or user_id. Aborting.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION '042: role `authenticated` does not exist, so section 3 cannot probe as a real customer. Aborting.';
  END IF;
END
$pre$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Clear the dead pointers, BEFORE the guard exists
--
--    Order matters: the guard would refuse to let these rows be rewritten by
--    anything except a superuser, and this transaction runs as supabase_admin,
--    so it would pass either way. Doing it first keeps the intent legible —
--    the data is cleaned, then the rule is imposed on a table that satisfies it.
-- ───────────────────────────────────────────────────────────────────────────

DO $clean$
DECLARE v_cleared INTEGER;
BEGIN
  UPDATE public.brand_kits
  SET logo_url = NULL
  WHERE logo_url IS NOT NULL
    AND NOT starts_with(logo_url, 'https://pixoradb.pyramedia.cloud/storage/v1/object/public/uploads/');
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  IF v_cleared > 0 THEN
    RAISE WARNING '042: cleared % brand-kit logo(s) that pointed outside our upload bucket', v_cleared;
  END IF;
END
$clean$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2a. The predicate, as a plain function
--
--     Separated from the trigger on purpose: a trigger function can only be
--     exercised by writing a row, so its rule can only be tested indirectly and
--     approximately. As a boolean function the SAME rule the trigger enforces
--     can be fed a corpus and compared, string by string, against the
--     TypeScript that the API route uses (`lib/storage/uploaded-url.ts`) — see
--     scripts/tests/logo-parity.ts. The two agreeing is the property that
--     matters here, and the first version of this pair did NOT agree: the route
--     parsed with `new URL()` while the database matched raw bytes, so a query
--     string, a stray tab, an uppercase host or a `./` segment was blessed by
--     one and refused by the other.
--
--     No dynamic SQL, no LIKE. The origin is a literal, reviewable in this diff,
--     and the only pattern is a character class applied to the filename.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.brand_kit_logo_is_own(p_url TEXT, p_owner UUID)
RETURNS BOOLEAN AS $body$
DECLARE
  c_prefix CONSTANT TEXT := 'https://pixoradb.pyramedia.cloud/storage/v1/object/public/uploads/';
  v_rest   TEXT;
BEGIN
  IF p_url IS NULL OR p_owner IS NULL THEN
    RETURN FALSE;
  END IF;
  IF NOT starts_with(p_url, c_prefix) THEN
    RETURN FALSE;
  END IF;

  v_rest := substr(p_url, length(c_prefix) + 1);

  -- `<owner uuid>/<filename>` and nothing else. Owning the ROW says nothing
  -- about where the STRING points, so the folder is checked against this row's
  -- own user_id rather than assumed from the fact that the write was allowed.
  IF NOT starts_with(v_rest, p_owner::text || '/') THEN
    RETURN FALSE;
  END IF;

  v_rest := substr(v_rest, length(p_owner::text) + 2);

  -- Allowlist, not a blacklist. `%` is excluded, so no amount of re-encoding
  -- survives and `..` cannot be reconstructed downstream; `/` is excluded, so
  -- there is exactly one segment left and it cannot be a directory hop. `^`/`$`
  -- in a Postgres ARE anchor to the whole string unless the `n` flag is given,
  -- so an embedded or trailing newline does not create a hole — verified
  -- against the live server, not assumed.
  IF v_rest !~ '^[A-Za-z0-9._-]+$' OR v_rest IN ('.', '..') THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$body$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- ───────────────────────────────────────────────────────────────────────────
-- 2b. The guard
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_brand_kit_logo_shape()
RETURNS TRIGGER AS $body$
BEGIN
  -- Break-glass for server-side maintenance. A catalog lookup, never a bare
  -- pg_has_role(): that raises if the role is absent, which would take the
  -- whole trigger down on a deployment without it.
  IF EXISTS (
    SELECT 1 FROM pg_roles r
    WHERE r.rolname = 'service_role' AND pg_has_role(current_user, r.oid, 'USAGE')
  ) THEN
    RETURN NEW;
  END IF;

  -- No logo is the normal state and the only way to clear one.
  IF NEW.logo_url IS NULL OR NEW.logo_url = '' THEN
    RETURN NEW;
  END IF;

  IF NOT public.brand_kit_logo_is_own(NEW.logo_url, NEW.user_id) THEN
    RAISE EXCEPTION
      'brand kit logo % is not an object this product uploaded for this user — upload it through the app rather than writing a url',
      left(NEW.logo_url, 120)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SET search_path = public;

REVOKE ALL ON FUNCTION public.assert_brand_kit_logo_shape() FROM PUBLIC;
-- The predicate is read-only and takes its inputs as arguments, so it leaks
-- nothing and is safe to leave callable — which is what lets the parity test
-- run as an ordinary client.
GRANT EXECUTE ON FUNCTION public.brand_kit_logo_is_own(TEXT, UUID) TO PUBLIC;

DROP TRIGGER IF EXISTS brand_kits_logo_shape_guard ON public.brand_kits;
CREATE TRIGGER brand_kits_logo_shape_guard
  BEFORE INSERT OR UPDATE ON public.brand_kits
  FOR EACH ROW EXECUTE FUNCTION public.assert_brand_kit_logo_shape();

ALTER TABLE public.brand_kits ENABLE ALWAYS TRIGGER brand_kits_logo_shape_guard;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Prove it — as `authenticated`, against the live table
--
--    A probe run as supabase_admin proves nothing: it is a superuser and the
--    break-glass above would wave it through. Each probe assumes the
--    `authenticated` role with request.jwt.claims set to a real owner, so RLS,
--    the grants and the trigger all evaluate exactly as they do for a customer
--    holding the public anon key. Every write is undone by its own
--    subtransaction. A probe that reaches no verdict is a FAILURE, not a pass:
--    a write blocked by RLS certifies nothing about the guard.
-- ───────────────────────────────────────────────────────────────────────────

DO $probe$
DECLARE
  v_owner UUID;
  v_kit   UUID;
  v_rows  INTEGER;
  v_ok    BOOLEAN;
BEGIN
  SELECT user_id, id INTO v_owner, v_kit FROM public.brand_kits LIMIT 1;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION '042: no brand_kits row to probe against. Aborting.';
  END IF;

  -- ═══ PROBE A — a foreign host must be refused ═══
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    UPDATE public.brand_kits SET logo_url = 'http://169.254.169.254/latest/meta-data/' WHERE id = v_kit;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    IF v_rows = 0 THEN
      RAISE EXCEPTION '042: probe A updated 0 rows — RLS blocked it before the trigger ran, so this certifies nothing. Aborting.';
    END IF;
    RAISE EXCEPTION '042: probe A FAILED — a customer can still write a foreign url. Refusing to commit.';
  EXCEPTION
    WHEN check_violation THEN v_ok := true;
  END;
  RESET ROLE;
  IF NOT v_ok THEN RAISE EXCEPTION '042: probe A reached no verdict. Refusing to commit.'; END IF;

  -- ═══ PROBE B — the blob: url this migration exists because of ═══
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    UPDATE public.brand_kits SET logo_url = 'blob:http://localhost:3000/8f2c-0d1e' WHERE id = v_kit;
    RESET ROLE;
    RAISE EXCEPTION '042: probe B FAILED — a blob: url was accepted. Refusing to commit.';
  EXCEPTION
    WHEN check_violation THEN v_ok := true;
  END;
  RESET ROLE;
  IF NOT v_ok THEN RAISE EXCEPTION '042: probe B reached no verdict. Refusing to commit.'; END IF;

  -- ═══ PROBE C — our own origin, but ANOTHER user's folder ═══
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    UPDATE public.brand_kits
    SET logo_url = 'https://pixoradb.pyramedia.cloud/storage/v1/object/public/uploads/00000000-0000-4000-8000-000000000000/a.png'
    WHERE id = v_kit;
    RESET ROLE;
    RAISE EXCEPTION '042: probe C FAILED — another user''s folder was accepted. Refusing to commit.';
  EXCEPTION
    WHEN check_violation THEN v_ok := true;
  END;
  RESET ROLE;
  IF NOT v_ok THEN RAISE EXCEPTION '042: probe C reached no verdict. Refusing to commit.'; END IF;

  -- ═══ PROBE D — traversal, plain and double-encoded ═══
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    UPDATE public.brand_kits
    SET logo_url = 'https://pixoradb.pyramedia.cloud/storage/v1/object/public/uploads/' || v_owner || '/%252E%252E/a.png'
    WHERE id = v_kit;
    RESET ROLE;
    RAISE EXCEPTION '042: probe D FAILED — a double-encoded traversal was accepted. Refusing to commit.';
  EXCEPTION
    WHEN check_violation THEN v_ok := true;
  END;
  RESET ROLE;
  IF NOT v_ok THEN RAISE EXCEPTION '042: probe D reached no verdict. Refusing to commit.'; END IF;

  -- ═══ PROBE E — everything the product legitimately writes must still work ═══
  --     A guard that also blocks the app is not a fix, it is a different
  --     outage. Both real shapes: a genuine upload URL, and NULL to clear it.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    UPDATE public.brand_kits
    SET logo_url = 'https://pixoradb.pyramedia.cloud/storage/v1/object/public/uploads/'
                   || v_owner || '/8f2c0d1e-0000-4000-8000-000000000000.png'
    WHERE id = v_kit;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RESET ROLE;
      RAISE EXCEPTION '042: probe E updated % rows for a legitimate upload url. Refusing to commit.', v_rows;
    END IF;

    UPDATE public.brand_kits SET logo_url = NULL WHERE id = v_kit;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION '042: probe E could not clear a logo. Refusing to commit.';
    END IF;

    RAISE EXCEPTION 'PROBE_E_ROLLBACK' USING ERRCODE = 'PE042';
  EXCEPTION
    WHEN check_violation THEN
      RESET ROLE;
      RAISE EXCEPTION '042: probe E FAILED — the guard BLOCKED a url the product legitimately writes. Refusing to commit.';
    WHEN SQLSTATE 'PE042' THEN
      NULL;  -- expected: the subtransaction rollback undoes both probe writes
  END;
  RESET ROLE;

  -- ═══ PROBE F — the INSERT path, which A–E never exercise ═══
  --     The trigger fires BEFORE INSERT OR UPDATE, but every probe above is an
  --     UPDATE. A customer creates brand kits too, and POST /api/brand-kits is
  --     not the only way to do it — PostgREST accepts a direct insert.
  v_ok := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    INSERT INTO public.brand_kits (user_id, name, logo_url)
    VALUES (v_owner, '042 probe F', 'http://169.254.169.254/latest/meta-data/');
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    IF v_rows = 0 THEN
      RAISE EXCEPTION '042: probe F inserted 0 rows — RLS blocked it before the trigger ran, so this certifies nothing. Aborting.';
    END IF;
    RAISE EXCEPTION '042: probe F FAILED — a customer can INSERT a brand kit with a foreign logo url. Refusing to commit.';
  EXCEPTION
    WHEN check_violation THEN v_ok := true;
  END;
  RESET ROLE;
  IF NOT v_ok THEN RAISE EXCEPTION '042: probe F reached no verdict. Refusing to commit.'; END IF;

  -- ═══ PROBE G — a legitimate INSERT must still work ═══
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

    INSERT INTO public.brand_kits (user_id, name, logo_url) VALUES
      (v_owner, '042 probe G with logo',
       'https://pixoradb.pyramedia.cloud/storage/v1/object/public/uploads/' || v_owner || '/probe.webp'),
      (v_owner, '042 probe G no logo', NULL);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;
    IF v_rows <> 2 THEN
      RAISE EXCEPTION '042: probe G inserted % of 2 legitimate rows. Refusing to commit.', v_rows;
    END IF;
    RAISE EXCEPTION 'PROBE_G_ROLLBACK' USING ERRCODE = 'PE042';
  EXCEPTION
    WHEN check_violation THEN
      RESET ROLE;
      RAISE EXCEPTION '042: probe G FAILED — the guard BLOCKED a brand kit the product legitimately creates. Refusing to commit.';
    WHEN SQLSTATE 'PE042' THEN
      NULL;  -- expected: the subtransaction rollback removes both probe rows
  END;
  RESET ROLE;
END
$probe$;

RESET ROLE;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Record and report as a ROW (apply.js discards NOTICE and WARNING)
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO public.schema_migrations (version, description)
VALUES ('042', 'brand_kits: dead blob: logos cleared; logo_url must be an object in our uploads bucket under the owner''s folder')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

SELECT
  '042 OK — foreign, blob:, cross-user and traversal logos refused on both INSERT and UPDATE; real upload urls and NULL accepted' AS result,
  (SELECT tgenabled FROM pg_trigger
    WHERE tgrelid = 'public.brand_kits'::regclass AND tgname = 'brand_kits_logo_shape_guard')  AS guard,
  (SELECT count(*) FROM public.brand_kits WHERE logo_url IS NOT NULL)                          AS logos_remaining,
  (SELECT count(*) FROM public.brand_kits)                                                     AS kits;

COMMIT;
