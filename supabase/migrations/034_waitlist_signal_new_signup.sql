-- Migration 034: let the SERVER tell a new waitlist signup from a repeat one,
-- without letting the CALLER tell.
--
-- 030 made join_waitlist return 'ok' for both cases on purpose: a form that answers
-- "already registered" is an oracle for testing whether a given address is on the
-- list, and a leaked pre-launch email list is a real breach.
--
-- That property must survive. But a welcome email needs the opposite information:
-- send once, on the first signup only. Without it, anyone can put a stranger's
-- address in the form repeatedly and use us to mail them — the IP rate limit caps
-- that at 5/minute, which is a spam cannon, not a defence.
--
-- So the RPC now distinguishes the two, and app/api/waitlist/route.ts keeps
-- returning the identical `{ success: true }` to the browser either way. The
-- difference is visible only to the service-role caller, which is the only role that
-- can execute this function at all.

BEGIN;

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
  v_inserted BOOLEAN;
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
        segment = COALESCE(EXCLUDED.segment, public.waitlist.segment)
  -- xmax = 0 is true only for a row this statement INSERTed. On the UPDATE branch
  -- it carries the id of the transaction that touched the existing row.
  RETURNING (xmax = 0) INTO v_inserted;

  -- 'created' vs 'existing' — for the service role only. The HTTP layer collapses
  -- both to the same response body and the same status code; see the route.
  RETURN CASE WHEN v_inserted THEN 'created' ELSE 'existing' END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- CREATE OR REPLACE preserves the ACL 030 set. Assert it rather than trust it:
-- if anon could execute this, the whole waitlist would be writable from the browser.
DO $$
DECLARE v_acl TEXT;
BEGIN
  SELECT array_to_string(proacl, ',') INTO v_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'join_waitlist';

  IF v_acl IS NULL OR v_acl NOT LIKE '%service_role=%' THEN
    RAISE EXCEPTION 'join_waitlist is not executable by service_role: %', COALESCE(v_acl, '(null)');
  END IF;
  IF v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%' THEN
    RAISE EXCEPTION 'join_waitlist is executable by anon/authenticated: %', v_acl;
  END IF;
  RAISE NOTICE 'join_waitlist ACL intact: %', v_acl;
END $$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('034', 'join_waitlist distinguishes created vs existing for the server only')
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description, applied_at = NOW();

COMMIT;
