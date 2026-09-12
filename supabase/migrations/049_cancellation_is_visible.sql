-- ════════════════════════════════════════════════════════════════════════════
-- 049 — A CANCELLATION THE CUSTOMER CAN SEE, AND A PLAN CHANGE THE LEDGER NAMES
-- ════════════════════════════════════════════════════════════════════════════
--
-- Both of these exist because 2026-09-12 created the first billing-portal
-- configuration on the live Stripe account. Until that moment `GET
-- /v1/billing_portal/configurations` returned an empty list, so cancelling and
-- switching plan were UNREACHABLE — and every screen downstream of them was
-- written against paths nobody could take.
--
-- ── §1  profiles.subscription_cancel_at ─────────────────────────────────────
--
-- The portal cancels at period end: the customer keeps the month they paid for,
-- and `customer.subscription.deleted` arrives when it actually ends. Stripe
-- records that as `cancel_at` on the subscription. NOTHING in this codebase
-- stored it — `cancel_at_period_end` occurs zero times across app/, lib/,
-- components/, hooks/ and supabase/migrations. So the moment cancelling became
-- reachable, the screen Stripe returns the customer to
-- (`default_return_url` -> /ar/billing) read `plan_id` (still 'pro') and
-- `credits_reset_date` (untouched) and told them, in their own language, that
-- their plan RENEWS on that date. They had just cancelled it.
--
-- `cancel_at` and not `cancel_at_period_end` + a date, deliberately: one nullable
-- timestamp is non-null exactly when a cancellation is scheduled, so the two
-- halves cannot disagree. A boolean beside a date can.
--
-- It is SERVER-AUTHORITATIVE. Migration 022 revoked table-level UPDATE on
-- `profiles` from `authenticated` and granted seven columns back by name; a
-- column added afterwards inherits no grant, so writing is already refused. This
-- migration grants SELECT only, and PROVES both halves as `authenticated` below
-- rather than assuming the 022 lockdown still holds.
--
-- ── §2  credit_transactions.type gains 'plan_change' ────────────────────────
--
-- The webhook chose the ledger type from the SIGN of the grant: positive wrote
-- 'subscription', anything else wrote 'reset'. With the switch grant now prorated
-- by time (lib/credits/plan-switch.ts, fourth attempt), an upgrade made late in
-- the period grants a small number and one made in the last hour grants ZERO — so
-- a customer who had just PAID to upgrade got a row that TransactionTable.tsx
-- renders as a red `destructive` badge reading "تجديد شهري" / "Monthly reset".
-- A plan change is a plan change at any amount. The type now comes from the
-- event, and needs its own value in the CHECK.
--
-- REHEARSAL: send this file with the trailing COMMIT swapped for ROLLBACK.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE probe_results (name text, verdict text) ON COMMIT DROP;

-- ── §1 the column ───────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_cancel_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.subscription_cancel_at IS
  'When Stripe will cancel this subscription, from Subscription.cancel_at. Non-null ONLY while a cancellation is scheduled; the webhook clears it when the customer resumes. Written by the Stripe webhook with the service role; readable by the owner, never writable by them.';

-- The owner must READ it — the billing card is the whole point. They must never
-- WRITE it: a customer who could set it would show themselves a cancellation
-- date the payment processor knows nothing about.
GRANT SELECT (subscription_cancel_at) ON public.profiles TO authenticated;

-- ── §2 the ledger type ──────────────────────────────────────────────────────

ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check CHECK (
    type = ANY (ARRAY[
      'subscription'::text,
      'topup'::text,
      'usage'::text,
      'refund'::text,
      'reset'::text,
      'referral'::text,
      'admin_adjustment'::text,
      'onboarding'::text,
      'plan_change'::text
    ])
  );

-- ── §3 PROBES ───────────────────────────────────────────────────────────────
-- Every one reports through probe_results and a final SELECT: apply.js discards
-- NOTICE, so a RAISE NOTICE certifies nothing.

DO $probe$
DECLARE
  v_exists   boolean;
  v_nullable text;
  v_any_id   uuid;
  v_sel      text;
  v_upd      text;
  v_new      text;
  v_old      text;
  v_bad      text;
BEGIN
  -- A. the column exists and is nullable (a NOT NULL would break every profile
  --    that is not cancelling, which is all of them)
  SELECT true, is_nullable INTO v_exists, v_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name = 'subscription_cancel_at';
  INSERT INTO probe_results VALUES ('A subscription_cancel_at exists and is nullable',
    CASE WHEN COALESCE(v_exists, false) AND v_nullable = 'YES' THEN 'PASS'
         ELSE 'FAIL exists=' || COALESCE(v_exists::text, 'false') || ' nullable=' || COALESCE(v_nullable, '?') END);

  -- B. the widened CHECK accepts the new type
  BEGIN
    SELECT id INTO v_any_id FROM public.profiles ORDER BY created_at LIMIT 1;
    IF v_any_id IS NULL THEN
      v_new := 'INCONCLUSIVE no profile to attach a row to';
      v_old := 'INCONCLUSIVE no profile to attach a row to';
      v_bad := 'INCONCLUSIVE no profile to attach a row to';
    ELSE
      BEGIN
        INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
        VALUES (v_any_id, 0, 'plan_change', '049 probe', 0);
        v_new := 'PASS';
      EXCEPTION WHEN OTHERS THEN v_new := 'FAIL ' || SQLSTATE;
      END;

      -- C. and still accepts every type that was already in use
      BEGIN
        INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
        VALUES (v_any_id, 0, 'subscription', '049 probe', 0),
               (v_any_id, 0, 'reset', '049 probe', 0),
               (v_any_id, 0, 'usage', '049 probe', 0),
               (v_any_id, 0, 'refund', '049 probe', 0),
               (v_any_id, 0, 'topup', '049 probe', 0),
               (v_any_id, 0, 'referral', '049 probe', 0),
               (v_any_id, 0, 'admin_adjustment', '049 probe', 0),
               (v_any_id, 0, 'onboarding', '049 probe', 0);
        v_old := 'PASS';
      EXCEPTION WHEN OTHERS THEN v_old := 'FAIL ' || SQLSTATE;
      END;

      -- D. and still refuses a type nobody registered. A CHECK that was dropped
      --    and not re-added would pass B and C and fail only here.
      BEGIN
        INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
        VALUES (v_any_id, 0, 'not_a_real_type', '049 probe', 0);
        v_bad := 'FAIL an unregistered type was accepted';
      EXCEPTION
        WHEN check_violation THEN v_bad := 'PASS';
        WHEN OTHERS THEN v_bad := 'INCONCLUSIVE ' || SQLSTATE;
      END;

      DELETE FROM public.credit_transactions WHERE description = '049 probe';
    END IF;
  END;
  INSERT INTO probe_results VALUES ('B ledger accepts plan_change', COALESCE(v_new, 'INCONCLUSIVE no verdict'));
  INSERT INTO probe_results VALUES ('C ledger still accepts every prior type', COALESCE(v_old, 'INCONCLUSIVE no verdict'));
  INSERT INTO probe_results VALUES ('D ledger still refuses an unregistered type', COALESCE(v_bad, 'INCONCLUSIVE no verdict'));
END
$probe$;

-- E/F. AS THE CUSTOMER'S OWN ROLE. A probe blocked by RLS certifies nothing, so
-- these run as `authenticated` with a real user's JWT claims and each one must
-- reach a verdict.
DO $asuser$
DECLARE
  v_uid  uuid;
  v_sel  text;
  v_upd  text;
BEGIN
  SELECT id INTO v_uid FROM public.profiles ORDER BY created_at LIMIT 1;
  IF v_uid IS NULL THEN
    INSERT INTO probe_results VALUES ('E owner can READ the cancellation date', 'INCONCLUSIVE no profiles');
    INSERT INTO probe_results VALUES ('F owner can NOT write the cancellation date', 'INCONCLUSIVE no profiles');
    RETURN;
  END IF;

  EXECUTE format('SET LOCAL ROLE authenticated');
  EXECUTE format('SET LOCAL request.jwt.claims = %L', json_build_object('sub', v_uid, 'role', 'authenticated')::text);

  BEGIN
    EXECUTE format('SELECT subscription_cancel_at FROM public.profiles WHERE id = %L', v_uid);
    v_sel := 'PASS';
  EXCEPTION
    WHEN insufficient_privilege THEN v_sel := 'FAIL the owner cannot read it — the billing card would be blank';
    WHEN OTHERS THEN v_sel := 'INCONCLUSIVE ' || SQLSTATE;
  END;

  BEGIN
    EXECUTE format('UPDATE public.profiles SET subscription_cancel_at = NOW() WHERE id = %L', v_uid);
    v_upd := 'FAIL the owner can forge a cancellation date';
  EXCEPTION
    WHEN insufficient_privilege THEN v_upd := 'PASS';
    WHEN OTHERS THEN v_upd := 'INCONCLUSIVE ' || SQLSTATE;
  END;

  EXECUTE 'RESET ROLE';

  INSERT INTO probe_results VALUES ('E owner can READ the cancellation date', COALESCE(v_sel, 'INCONCLUSIVE no verdict'));
  INSERT INTO probe_results VALUES ('F owner can NOT write the cancellation date', COALESCE(v_upd, 'INCONCLUSIVE no verdict'));
END
$asuser$;

-- ── §4 THE GATE ─────────────────────────────────────────────────────────────
DO $gate$
DECLARE
  n_bad int;
  detail text;
BEGIN
  SELECT count(*), string_agg(name || ' -> ' || verdict, '; ')
    INTO n_bad, detail
  FROM probe_results WHERE verdict <> 'PASS';

  IF n_bad > 0 THEN
    RAISE EXCEPTION '049 refusing to commit: % probe(s) not PASS: %', n_bad, detail;
  END IF;
END
$gate$;

SELECT name, verdict FROM probe_results ORDER BY name;

INSERT INTO public.schema_migrations (version, description)
VALUES ('049', 'cancellation date the customer can see; plan_change ledger type')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
