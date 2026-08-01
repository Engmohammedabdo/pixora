-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 026: Pre-launch waitlist
--
-- Collects interested emails while the product is being finished, so launch day
-- starts with an audience instead of silence.
--
-- Design decisions worth stating:
--   * Anyone may INSERT (that is the whole point) but nobody may SELECT with the
--     public key. Without that split, a competitor could read your entire list —
--     and a leaked email list is a real breach, not an embarrassment.
--   * The email is stored lowercased and uniquely indexed, so a second signup
--     updates the row instead of creating a duplicate.
--   * `source` records where the signup came from, so paid traffic can later be
--     told apart from organic.
--
-- ⚠ Apply AFTER 025. Run as `postgres` via the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.waitlist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  name        TEXT,
  -- What the person says they do: agency / store / freelancer / other.
  -- Shapes who to call first when the product is ready.
  segment     TEXT,
  source      TEXT,
  locale      TEXT NOT NULL DEFAULT 'ar',
  -- Set when the invite is actually sent, so a resend never double-counts.
  invited_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT waitlist_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT waitlist_segment_valid CHECK (
    segment IS NULL OR segment IN ('agency', 'store', 'freelancer', 'other')
  )
);

-- Case-insensitive uniqueness: Ahmed@x.com and ahmed@x.com are one person.
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_email_lower
  ON public.waitlist (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_waitlist_created ON public.waitlist (created_at DESC);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Read access is server-only. service_role bypasses RLS, so the admin dashboard
-- keeps working while the public key can never enumerate the list.
REVOKE ALL ON public.waitlist FROM anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Signup goes through a function, not a table grant
--
-- Granting INSERT directly would also let anyone write `invited_at`, or spam rows
-- with arbitrary columns. A SECURITY DEFINER function accepts exactly the four
-- fields we want and nothing else.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.join_waitlist(
  p_email   TEXT,
  p_name    TEXT DEFAULT NULL,
  p_segment TEXT DEFAULT NULL,
  p_source  TEXT DEFAULT NULL,
  p_locale  TEXT DEFAULT 'ar'
)
RETURNS TEXT AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(p_email));
BEGIN
  IF v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.waitlist (email, name, segment, source, locale)
  VALUES (
    v_email,
    NULLIF(TRIM(COALESCE(p_name, '')), ''),
    NULLIF(TRIM(COALESCE(p_segment, '')), ''),
    NULLIF(TRIM(COALESCE(p_source, '')), ''),
    COALESCE(NULLIF(TRIM(p_locale), ''), 'ar')
  )
  ON CONFLICT (LOWER(email)) DO UPDATE
    SET name    = COALESCE(EXCLUDED.name, public.waitlist.name),
        segment = COALESCE(EXCLUDED.segment, public.waitlist.segment);

  -- Deliberately returns the same value for a new signup and a repeat one.
  -- Telling the caller "this email is already registered" would turn the form
  -- into an oracle for checking whether a given address is on the list.
  RETURN 'ok';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Called from a server route that rate-limits by IP, so service_role is enough.
REVOKE ALL ON FUNCTION public.join_waitlist(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_waitlist(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Record this migration as applied.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     TEXT PRIMARY KEY,
  description TEXT,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version, description)
VALUES ('026', 'Pre-launch waitlist table + join_waitlist RPC')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION
--
-- -- (a) the public key must NOT be able to read the list:
-- --     GET /rest/v1/waitlist?select=*   with the anon key  -> 0 rows or 401
--
-- -- (b) users must not be able to call the function directly:
-- SELECT has_function_privilege('anon',
--   'public.join_waitlist(text,text,text,text,text)', 'EXECUTE');  -- expect false
--
-- -- (c) count signups (run as postgres in the SQL Editor):
-- SELECT COUNT(*) AS total,
--        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS this_week
-- FROM waitlist;
--
-- -- (d) who to call first:
-- SELECT segment, COUNT(*) FROM waitlist GROUP BY segment ORDER BY 2 DESC;
-- ═══════════════════════════════════════════════════════════════════════════
