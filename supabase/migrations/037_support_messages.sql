-- Migration 037: a support channel that works without email.
--
-- Today the product tells people to contact support and gives them no way to do it:
--
--   messages/ar.json:194  "… تواصل مع الدعم"        (credit refund failed)
--   messages/en.json:194  "… contact support …"
--   privacy/page.tsx:66   "تواصل معنا عبر البريد الإلكتروني"  — no address anywhere
--   Footer                a "Support" heading over links to pricing and an FAQ
--
-- The refund_failed case is the sharp one: it fires when a generation failed AND the
-- automatic credit refund also failed. That is a customer who has lost money, being
-- told to contact a support channel that does not exist.
--
-- ── WHY THE DATABASE, NOT AN INBOX ──────────────────────────────────────────
--
-- The obvious version of this feature is a mailto: link or a form that sends email.
-- Both are dead here: there is no transactional email provider configured, and
-- Supabase Auth has no SMTP either. A contact form that silently fails to send is
-- worse than the current state, because the customer believes they have been heard.
--
-- So the message is STORED first and notification is a bonus. With no provider
-- configured the founder reads /admin/support; with one configured they also get an
-- email. Nothing about the customer's experience changes either way.
--
-- ── CONTEXT IS CAPTURED, NOT ASKED FOR ──────────────────────────────────────
--
-- A signed-in customer's plan and balance are snapshotted at submit time. Not for
-- analytics — because "I paid and got nothing" is answerable in ten seconds with
-- that context and needs a round of questions without it. Snapshotted rather than
-- joined live, since the whole point is what was true when they hit the problem.

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL for a logged-out sender. The channel has to work for someone who cannot
  -- sign in — that is one of the likeliest reasons to write in, and it is the exact
  -- case password reset cannot serve right now.
  user_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  email        TEXT NOT NULL,
  name         TEXT,
  topic        TEXT NOT NULL CHECK (topic IN ('billing', 'bug', 'account', 'other')),
  message      TEXT NOT NULL CHECK (length(message) BETWEEN 10 AND 4000),
  locale       TEXT NOT NULL DEFAULT 'ar',

  -- Snapshot at submit time. See header.
  plan_id      TEXT,
  credits      INTEGER,
  page_url     TEXT,

  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'handled')),
  admin_note   TEXT,
  handled_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_status_time
  ON public.support_messages (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_user
  ON public.support_messages (user_id) WHERE user_id IS NOT NULL;

-- Same posture as `waitlist` (030): RLS on with no permissive policy, and every
-- grant revoked. Reads are server-only. These messages contain email addresses and
-- whatever a frustrated customer chose to type, which can include an order number,
-- a phone number, or a password they should not have sent.
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_messages FROM anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Writes go through a function with a fixed argument list, not a table grant.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_support_message(
  p_email    TEXT,
  p_topic    TEXT,
  p_message  TEXT,
  p_name     TEXT DEFAULT NULL,
  p_user_id  UUID  DEFAULT NULL,
  p_locale   TEXT  DEFAULT 'ar',
  p_page_url TEXT  DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email TEXT := LOWER(TRIM(COALESCE(p_email, '')));
  v_msg   TEXT := TRIM(COALESCE(p_message, ''));
  v_plan  TEXT;
  v_cred  INTEGER;
  v_id    UUID;
BEGIN
  IF v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_email');
  END IF;

  IF length(v_msg) < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'message_too_short');
  END IF;

  IF p_topic NOT IN ('billing', 'bug', 'account', 'other') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_topic');
  END IF;

  -- Snapshot, only when the sender is actually signed in.
  IF p_user_id IS NOT NULL THEN
    SELECT plan_id, COALESCE(credits_balance, 0) + COALESCE(purchased_credits, 0)
    INTO v_plan, v_cred
    FROM public.profiles WHERE id = p_user_id;
  END IF;

  INSERT INTO public.support_messages
    (user_id, email, name, topic, message, locale, plan_id, credits, page_url)
  VALUES (
    p_user_id, v_email,
    NULLIF(TRIM(COALESCE(p_name, '')), ''),
    p_topic,
    left(v_msg, 4000),
    COALESCE(NULLIF(TRIM(p_locale), ''), 'ar'),
    v_plan, v_cred,
    left(NULLIF(TRIM(COALESCE(p_page_url, '')), ''), 500)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.resolve_support_message(
  p_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_rows INTEGER;
BEGIN
  IF p_status NOT IN ('new', 'handled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  UPDATE public.support_messages
  SET status     = p_status,
      admin_note = COALESCE(p_note, admin_note),
      handled_at = CASE WHEN p_status = 'handled' THEN NOW() ELSE NULL END
  WHERE id = p_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('success', v_rows > 0);
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- Lock down, then prove it. 022's ALTER DEFAULT PRIVILEGES only covers objects
-- created by the role that ran it, and this file runs as supabase_admin.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE fn RECORD; n INTEGER := 0; leaked TEXT[];
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname IN ('submit_support_message', 'resolve_support_message')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    n := n + 1;
  END LOOP;

  IF n <> 2 THEN
    RAISE EXCEPTION 'Expected 2 support functions, found % — refusing to report success.', n;
  END IF;

  SELECT array_agg(p.proname) INTO leaked
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public'
    AND p.proname IN ('submit_support_message', 'resolve_support_message')
    AND array_to_string(p.proacl, ',') ~ '(anon|authenticated)=';

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'Still executable by anon/authenticated: %', array_to_string(leaked, ', ');
  END IF;

  RAISE NOTICE 'Support channel installed and locked down.';
END $$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('037', 'support_messages table + submit/resolve RPCs — a contact channel that works without email')
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description, applied_at = NOW();

COMMIT;
