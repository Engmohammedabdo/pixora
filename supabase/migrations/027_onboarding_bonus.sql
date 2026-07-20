-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 027: Onboarding welcome bonus
--
-- Onboarding step 5 already tells every user "أضفنا 5 كريدت مجانية لحسابك"
-- (we added 5 free credits to your account). No code path ever granted
-- anything — app/api/user/onboarding/route.ts only flipped
-- profiles.onboarding_completed. This migration adds the RPC that makes that
-- promise true, plus the guard that stops it being claimed more than once.
--
-- ⚠ SECURITY CONSTRAINT — read before touching the guard.
--   022_privilege_lockdown.sql:57 GRANTS authenticated users UPDATE on
--   profiles.onboarding_completed (it is a legitimate user-owned onboarding
--   flag otherwise). That means idempotency CANNOT be keyed on that flag:
--   PATCH onboarding_completed=false, re-POST, repeat — an unlimited
--   credit-minting path using nothing but the anon key.
--
--   INSERT on credit_transactions is service_role-only (022, section 4 /
--   the "Service insert transactions" policy). A row there cannot be forged,
--   edited or deleted by its owner, so the guard lives there instead: a
--   partial UNIQUE index allows at most one type='onboarding' row per user.
--
-- ⚠ Apply AFTER 026_referral_abuse_controls.sql. Run as the `postgres` role
--   via the Supabase SQL Editor (see 022's header for why the REST-based
--   migration runner is unsafe for multi-statement transactional files).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Allow the new ledger entry type
--
-- credit_transactions.type is constrained by 004 and widened by 023 to
-- ('subscription','topup','usage','refund','reset','referral',
-- 'admin_adjustment'). Inserting 'onboarding' would violate that constraint,
-- which would fail the INSERT inside the RPC below and roll the whole grant
-- back (see the transaction-semantics note in section 3) — so this must ship
-- in the same migration as the function, not as a follow-up.
--
-- DROP + ADD (rather than IF NOT EXISTS on the ADD, which Postgres does not
-- support for constraints) makes this safe to re-run: a second execution
-- drops the just-added constraint and re-adds the identical one.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('subscription', 'topup', 'usage', 'refund', 'reset', 'referral',
                  'admin_adjustment', 'onboarding'));

-- ───────────────────────────────────────────────────────────────────────────
-- 2. THE IDEMPOTENCY GUARD
--
-- Users hold UPDATE on profiles.onboarding_completed (022:57), so guarding on
-- that flag alone would let anyone reset it and re-claim the bonus
-- indefinitely. INSERT on credit_transactions is service_role-only, so this
-- row cannot be forged or deleted by its owner — at most one row with
-- type='onboarding' can ever exist per user_id, forever, regardless of what
-- the profile row says.
-- ───────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS credit_tx_one_onboarding_per_user
  ON public.credit_transactions (user_id) WHERE type = 'onboarding';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. grant_onboarding_bonus() — the only way the bonus is awarded
--
-- SECURITY DEFINER, EXECUTE granted to service_role only (section 4). The
-- route calls this with the service-role client; the user-facing route
-- itself only ever supplies auth.uid() as p_user_id, never a client-chosen id.
--
-- Award into purchased_credits, NOT credits_balance (per 026:108 / 023:191 —
-- credits_balance is the monthly subscription bucket and is OVERWRITTEN, not
-- incremented, on every plan change, renewal and downgrade in
-- reset_monthly_credits() (007) and the Stripe webhook. A bonus written there
-- would evaporate at the user's very next billing cycle.
--
-- Transaction semantics of the EXCEPTION block (this is the crux of the
-- guard, see the report for the full argument): entering a BEGIN...EXCEPTION
-- END block in PL/pgSQL implicitly establishes a savepoint before the block's
-- first statement runs. If a later statement in that SAME block raises an
-- error matched by WHEN, Postgres rolls back to that savepoint — undoing
-- EVERY statement the block executed, not only the one that failed — before
-- control passes to the handler. The UPDATE on profiles and the INSERT on
-- credit_transactions below are both inside this one block, so when the
-- INSERT hits the unique index and raises unique_violation, the preceding
-- UPDATE (the credit grant, the expiry timestamp, onboarding_completed) is
-- unwound along with it. The handler then returns a normal JSONB value, and
-- that empty-of-effect subtransaction commits as part of the outer call —
-- so a re-claim attempt grants nothing and leaves the profile row exactly as
-- it was, rather than 500ing or double-crediting.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_onboarding_bonus(p_user_id UUID, p_credits INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  IF p_credits <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  UPDATE public.profiles
  SET purchased_credits = COALESCE(purchased_credits, 0) + p_credits,
      purchased_credits_expires_at = NOW() + INTERVAL '365 days',
      onboarding_completed = TRUE
  WHERE id = p_user_id
  RETURNING COALESCE(credits_balance, 0) + COALESCE(purchased_credits, 0) INTO v_balance;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
  VALUES (p_user_id, p_credits, 'onboarding', 'Onboarding welcome bonus', v_balance);

  RETURN jsonb_build_object('success', true, 'credits_awarded', p_credits, 'new_balance', v_balance);
EXCEPTION WHEN unique_violation THEN
  -- Already granted. A repeat POST — including one that follows a manual
  -- reset of onboarding_completed back to false — is a normal outcome, not
  -- a 500. See the transaction-semantics note above for why the profile
  -- update above is guaranteed to have been rolled back by this point.
  RETURN jsonb_build_object('success', false, 'error', 'already_granted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Lock down execution (same policy as 022/023/026)
--
-- REVOKE then GRANT, not relying on CREATE OR REPLACE preserving the ACL —
-- an accidental DROP + CREATE elsewhere would hand EXECUTE back to PUBLIC,
-- which is exactly the hole 022 closed.
-- ───────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.grant_onboarding_bonus(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_onboarding_bonus(UUID, INTEGER) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Record this migration as applied.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     TEXT PRIMARY KEY,
  description TEXT,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version, description)
VALUES ('027', 'Onboarding welcome bonus: grant_onboarding_bonus RPC + ledger-based idempotency guard')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying. Every check must return the expected
-- value. See the full step-by-step procedure in the task report; summary:
--
-- -- (a) users cannot execute it:
-- SELECT has_function_privilege('authenticated', 'public.grant_onboarding_bonus(uuid,integer)', 'EXECUTE');
-- -- expect: false
--
-- -- (b) the guard index exists and is partial:
-- SELECT indexdef FROM pg_indexes WHERE indexname = 'credit_tx_one_onboarding_per_user';
-- -- expect: ... WHERE (type = 'onboarding'::text)
--
-- -- (c) with a real test user id <TEST_UID>, as service_role (SQL Editor):
-- SELECT grant_onboarding_bonus('<TEST_UID>'::uuid, 5);
-- -- first call  -> {"success": true,  "credits_awarded": 5, "new_balance": ...}
-- SELECT grant_onboarding_bonus('<TEST_UID>'::uuid, 5);
-- -- second call -> {"success": false, "error": "already_granted"}
-- UPDATE profiles SET onboarding_completed = false WHERE id = '<TEST_UID>'::uuid;
-- SELECT grant_onboarding_bonus('<TEST_UID>'::uuid, 5);
-- -- THIS IS THE SECURITY TEST -> still {"success": false, "error": "already_granted"}
-- SELECT count(*) FROM credit_transactions WHERE user_id = '<TEST_UID>'::uuid AND type = 'onboarding';
-- -- expect: 1, no matter how many of the calls above ran
-- ═══════════════════════════════════════════════════════════════════════════
