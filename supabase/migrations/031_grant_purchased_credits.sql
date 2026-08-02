-- Migration 031: make the top-up grant atomic and replay-safe.
--
-- Every other credit grant in the webhook ASSIGNS absolutely — `credits_balance =
-- <plan amount>` — so replaying the event twice is harmless. The top-up grant is the
-- one exception: app/api/stripe/webhook/route.ts:131-165 reads purchased_credits,
-- adds to it in Node, and writes the sum back, with no row lock and no idempotency
-- key on the money itself.
--
-- That read-modify-write sits directly under a retry path the route deliberately
-- leaves open (route.ts:66-73 re-runs an event whose row exists but is not yet
-- marked processed). Stripe delivers at least once. Two deliveries of one $59.99
-- purchase therefore grant 2000 credits, and two concurrent deliveries can also
-- interleave so that one grant is lost entirely.
--
-- The fix is one RPC that does the whole thing inside a single transaction with the
-- same `SELECT … FOR UPDATE` discipline as deduct_credits (021:83), keyed on the
-- Stripe payment intent so a replay is recognised as the same money.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. The idempotency key, enforced by the database
--
--    The EXISTS check below is the fast path, but two concurrent calls can both
--    pass it before either inserts. This index is what actually makes a double
--    grant impossible; the EXCEPTION handler turns the resulting error into a
--    clean "already granted" instead of a 500.
--
--    Partial (WHERE type = 'topup') so it constrains nothing else: refund and
--    chargeback rows may legitimately share a payment intent with the top-up they
--    reverse.
-- ───────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_tx_topup_payment_intent
  ON public.credit_transactions (stripe_payment_intent_id)
  WHERE type = 'topup' AND stripe_payment_intent_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. grant_purchased_credits()
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.grant_purchased_credits(
  p_user_id UUID,
  p_credits INTEGER,
  p_description TEXT,
  p_payment_intent_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_balance       INTEGER;
  v_purchased     INTEGER;
  v_new_purchased INTEGER;
  v_new_total     INTEGER;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  -- Fast path: this exact payment has already been credited.
  IF p_payment_intent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE stripe_payment_intent_id = p_payment_intent_id AND type = 'topup'
  ) THEN
    RETURN jsonb_build_object('success', true, 'already_granted', true);
  END IF;

  SELECT credits_balance, COALESCE(purchased_credits, 0)
  INTO v_balance, v_purchased
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  v_new_purchased := v_purchased + p_credits;
  v_new_total     := v_balance + v_new_purchased;

  UPDATE public.profiles
  SET purchased_credits            = v_new_purchased,
      purchased_credits_expires_at = NOW() + INTERVAL '365 days',
      updated_at                   = NOW()
  WHERE id = p_user_id;

  -- balance_after is the SPENDABLE total. The Node version wrote
  -- credits_balance + creditsToAdd (route.ts:147), silently omitting every credit
  -- the customer had already purchased — so the ledger disagreed with the balance
  -- widget for anyone who topped up twice.
  INSERT INTO public.credit_transactions
    (user_id, amount, type, description, stripe_payment_intent_id, balance_after)
  VALUES (p_user_id, p_credits, 'topup', p_description, p_payment_intent_id, v_new_total);

  RETURN jsonb_build_object(
    'success', true, 'already_granted', false, 'new_balance', v_new_total
  );

-- Loser of a concurrent race. The handler rolls the block back to entry, so the
-- profile UPDATE above is undone too — no partial grant survives.
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', true, 'already_granted', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Lock it down (migration 022's rule)
--
--    SECURITY DEFINER functions are EXECUTE-able by PUBLIC by default. This one
--    takes p_user_id as an argument and never consults auth.uid(), so left open it
--    would be a free-credits endpoint for any logged-in user.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE fn RECORD; n INTEGER := 0;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = 'grant_purchased_credits'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
    n := n + 1;
  END LOOP;
  IF n = 0 THEN
    RAISE EXCEPTION 'grant_purchased_credits was not created — refusing to report success.';
  END IF;
  RAISE NOTICE 'Locked down % grant_purchased_credits overload(s).', n;
END $$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('031', 'grant_purchased_credits RPC — atomic, idempotent top-up grant')
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description, applied_at = NOW();

COMMIT;
