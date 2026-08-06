-- Migration 036: two fixes, both found by actually running the gate rather than
-- reading it.
--
-- ── FIX 1: the rejection log could never have worked ─────────────────────────
--
-- 035 inserted a row into invite_gate_rejections and then RAISEd. Postgres has no
-- autonomous transactions: the RAISE aborts the statement, and the INSERT that
-- preceded it in the same transaction is rolled back with it. The table was
-- guaranteed to stay empty forever.
--
-- That is worse than having no log at all. An empty table reads as "nobody is
-- probing the gate", which is a claim the founder would have had no way to check.
--
-- Replaced with RAISE LOG, which survives the rollback because it goes to the
-- Postgres server log rather than to a table. The table is dropped rather than
-- left in place, so nothing can query it and conclude anything false.
--
-- ── FIX 2: no user with credit history could be deleted ─────────────────────
--
-- Pre-existing, unrelated to the gate, surfaced by the gate's cleanup step.
--
--   credit_transactions.user_id  UUID NOT NULL
--   credit_transactions_user_id_fkey  FOREIGN KEY (user_id) -> profiles(id) ON DELETE SET NULL
--
-- Those two cannot both hold. Deleting a profile makes Postgres try to write NULL
-- into a NOT NULL column, so the delete fails:
--
--   23502: null value in column "user_id" of relation "credit_transactions"
--   CONTEXT: SQL statement "UPDATE ONLY credit_transactions SET user_id = NULL ..."
--
-- Migration 004:5 declared ON DELETE CASCADE; something later replaced it. The
-- consequence is that app/api/admin/users/[id]/route.ts's delete-user call fails
-- for every user who has ever spent a credit — which is every real user — and a
-- deletion request could not be honoured.
--
-- Restored to CASCADE, matching 004's declared intent. Stripe remains the system of
-- record for anything financial; an orphaned ledger row with no user attached is
-- not usable for accounting anyway.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Log rejections somewhere that survives the rollback
-- ───────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.invite_gate_rejections;

CREATE OR REPLACE FUNCTION public.enforce_invite_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
  v_email   TEXT := LOWER(TRIM(COALESCE(NEW.email, '')));
  v_token   TEXT := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'invite_token', '')), '');
  v_match   RECORD;
  v_reason  TEXT;
BEGIN
  SELECT (value->>'enabled')::boolean INTO v_enabled
  FROM public.system_settings WHERE key = 'invite_gate';

  -- Only an explicit `false` opens the door. NULL — no row, malformed JSON,
  -- unreadable table — is CLOSED. The opposite of `registration_enabled`, which
  -- fails open in three separate places.
  IF v_enabled IS FALSE THEN
    RETURN NEW;
  END IF;

  IF v_email = '' THEN
    v_reason := 'no_email';
  ELSE
    SELECT id, invite_token, redeemed_at INTO v_match
    FROM public.waitlist
    WHERE LOWER(email) = v_email
      AND invited_at IS NOT NULL
      AND invite_token IS NOT NULL
    LIMIT 1;

    IF v_match IS NULL THEN
      v_reason := 'not_invited';
    ELSIF v_token IS NULL THEN
      v_reason := 'token_missing';
    ELSIF v_token IS DISTINCT FROM v_match.invite_token THEN
      v_reason := 'token_mismatch';
    ELSIF v_match.redeemed_at IS NOT NULL THEN
      v_reason := 'already_redeemed';
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    -- RAISE LOG, not an INSERT. A table write here would be undone by the
    -- RAISE EXCEPTION two lines down — see this migration's header.
    RAISE LOG '[invite_gate] refused %: %', v_email, v_reason;
    RAISE EXCEPTION 'pyrasuite_not_invited' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Burn it. One token, one account.
  UPDATE public.waitlist SET redeemed_at = NOW() WHERE id = v_match.id;

  RETURN NEW;
END $$;

-- invite_gate_status() referenced the dropped table; rebuild without it.
CREATE OR REPLACE FUNCTION public.invite_gate_status()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_installed BOOLEAN; v_enabled BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'auth' AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_invite_gate' AND NOT t.tgisinternal
  ) INTO v_installed;

  SELECT (value->>'enabled')::boolean INTO v_enabled
  FROM public.system_settings WHERE key = 'invite_gate';

  RETURN jsonb_build_object(
    'installed', v_installed,
    'enabled',   v_enabled IS DISTINCT FROM FALSE,
    'invited',   (SELECT count(*) FROM public.waitlist WHERE invite_token IS NOT NULL),
    'redeemed',  (SELECT count(*) FROM public.waitlist WHERE redeemed_at IS NOT NULL),
    'waiting',   (SELECT count(*) FROM public.waitlist WHERE invite_token IS NULL)
  );
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Make user deletion possible again
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Assert it, because getting this wrong is silent until someone tries to delete.
DO $$
DECLARE v_del CHAR;
BEGIN
  SELECT confdeltype INTO v_del FROM pg_constraint
  WHERE conname = 'credit_transactions_user_id_fkey'
    AND conrelid = 'public.credit_transactions'::regclass;
  IF v_del <> 'c' THEN
    RAISE EXCEPTION 'credit_transactions.user_id FK is "%" not CASCADE — deletion still broken.', v_del;
  END IF;
  RAISE NOTICE 'credit_transactions.user_id now CASCADEs on profile delete.';
END $$;

-- The same shape exists on other tables that reference profiles. Report them rather
-- than silently changing tables this migration was not written to reason about.
DO $$
DECLARE r RECORD; found TEXT[] := '{}';
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, c.conname, a.attname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.profiles'::regclass
      AND c.confdeltype = 'n'          -- SET NULL
      AND a.attnotnull                 -- ...on a NOT NULL column
  LOOP
    found := found || (r.tbl || '.' || r.attname);
  END LOOP;

  IF array_length(found, 1) > 0 THEN
    RAISE WARNING 'Still un-deletable (FK SET NULL on a NOT NULL column): %',
      array_to_string(found, ', ');
  ELSE
    RAISE NOTICE 'No remaining SET-NULL-on-NOT-NULL references to profiles.';
  END IF;
END $$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('036', 'invite gate: log rejections to the server log; restore user deletion (FK CASCADE)')
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description, applied_at = NOW();

COMMIT;
