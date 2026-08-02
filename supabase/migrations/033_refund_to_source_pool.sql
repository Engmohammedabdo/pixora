-- Migration 033: a refund must return credits to the pool they were taken from.
--
-- `refund_credits` (021:35-38) always credits `credits_balance`, whatever the spend
-- actually drew on. Its own header waves this off — "the distinction matters less
-- than correctness since both pools are summed" (019:30-32). That was true when it
-- was written. It is not true now, because `credits_balance` is OVERWRITTEN
-- wholesale at four sites that assign the plan amount absolutely:
--
--   webhook/route.ts:102  subscribe        credits_balance = <plan>
--   webhook/route.ts:214  plan change      credits_balance = <plan>
--   webhook/route.ts:256  cancel           credits_balance = 25
--   webhook/route.ts:301  renewal          credits_balance = <plan>
--   032 reset_monthly_credits()            credits_balance = <plan> + carry-over
--
-- So a credit the customer BOUGHT for money, refunded into `credits_balance`
-- because their generation failed, is destroyed at the next renewal. Purchased
-- credits are supposed to live 12 months (migration 012).
--
-- The exposure is not the single interactive failure — there the customer usually
-- re-spends immediately, and reserve_credits drains `credits_balance` first anyway.
-- It is `reconcile_orphaned_generations()` (028), running every 15 minutes per
-- cron.job jobid 2, which refunds stranded generations in bulk while the customer
-- is offline and cannot re-spend before the next overwrite lands.
--
-- Fix: record which pool each spend came from, and send the refund back the same
-- way. Rows written before this migration have NULL splits and fall back to the
-- old behaviour, so no backfill is required.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Remember the split on every spend
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS sub_amount       INTEGER,
  ADD COLUMN IF NOT EXISTS purchased_amount INTEGER;

COMMENT ON COLUMN public.credit_transactions.sub_amount IS
  'For usage/refund rows: the part of `amount` that moved through profiles.credits_balance (the monthly allowance). NULL on rows written before migration 033.';
COMMENT ON COLUMN public.credit_transactions.purchased_amount IS
  'For usage/refund rows: the part of `amount` that moved through profiles.purchased_credits (bought top-ups). NULL on rows written before migration 033.';

-- Refund lookup joins usage rows by generation. Partial index: only usage/refund
-- rows carry a generation_id worth searching.
CREATE INDEX IF NOT EXISTS idx_credit_tx_generation_type
  ON public.credit_transactions (generation_id, type)
  WHERE generation_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. reserve_credits — unchanged from 021 except that it now records the split
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_studio TEXT,
  p_description TEXT,
  p_generation_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_sub_balance INTEGER;
  v_purchased INTEGER;
  v_purchased_expires TIMESTAMPTZ;
  v_effective_purchased INTEGER;
  v_total INTEGER;
  v_new_sub INTEGER;
  v_new_purchased INTEGER;
  v_new_balance INTEGER;
  v_from_sub INTEGER;
  v_from_purchased INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'new_balance', 0, 'transaction_recorded', false);
  END IF;

  SELECT credits_balance, purchased_credits, purchased_credits_expires_at
  INTO v_sub_balance, v_purchased, v_purchased_expires
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_sub_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Zero out expired purchased credits
  v_effective_purchased := COALESCE(v_purchased, 0);
  IF v_effective_purchased > 0
     AND v_purchased_expires IS NOT NULL
     AND v_purchased_expires < NOW() THEN
    INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
    VALUES (p_user_id, -v_effective_purchased, 'reset',
            'Purchased credits expired (12-month limit)',
            COALESCE(v_sub_balance, 0));
    UPDATE profiles
    SET purchased_credits = 0, purchased_credits_expires_at = NULL
    WHERE id = p_user_id;
    v_effective_purchased := 0;
  END IF;

  v_total := COALESCE(v_sub_balance, 0) + v_effective_purchased;

  IF v_total < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'balance', v_total,
      'required', p_amount
    );
  END IF;

  IF COALESCE(v_sub_balance, 0) >= p_amount THEN
    v_new_sub := v_sub_balance - p_amount;
    v_new_purchased := v_effective_purchased;
  ELSE
    v_new_sub := 0;
    v_new_purchased := v_effective_purchased - (p_amount - COALESCE(v_sub_balance, 0));
  END IF;

  -- The split, derived from the same branch above rather than recomputed, so the
  -- two can never disagree.
  v_from_sub       := COALESCE(v_sub_balance, 0) - v_new_sub;
  v_from_purchased := p_amount - v_from_sub;

  v_new_balance := v_new_sub + GREATEST(v_new_purchased, 0);

  UPDATE profiles
  SET credits_balance = v_new_sub,
      purchased_credits = GREATEST(v_new_purchased, 0)
  WHERE id = p_user_id;

  INSERT INTO credit_transactions
    (user_id, amount, type, description, generation_id, balance_after, sub_amount, purchased_amount)
  VALUES (p_user_id, -p_amount, 'usage', p_description, p_generation_id, v_new_balance,
          v_from_sub, v_from_purchased);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'transaction_recorded', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. deduct_credits — same change
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_studio TEXT,
  p_description TEXT,
  p_generation_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_plan_balance INTEGER;
  v_purchased INTEGER;
  v_purchased_expires TIMESTAMPTZ;
  v_effective_purchased INTEGER;
  v_total INTEGER;
  v_new_plan INTEGER;
  v_new_purchased INTEGER;
  v_from_sub INTEGER;
  v_from_purchased INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  SELECT credits_balance, purchased_credits, purchased_credits_expires_at
  INTO v_plan_balance, v_purchased, v_purchased_expires
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_plan_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  v_effective_purchased := COALESCE(v_purchased, 0);
  IF v_purchased_expires IS NOT NULL AND v_purchased_expires < NOW() THEN
    v_effective_purchased := 0;
    UPDATE profiles SET purchased_credits = 0, purchased_credits_expires_at = NULL WHERE id = p_user_id;
  END IF;

  v_total := v_plan_balance + v_effective_purchased;

  IF v_total < p_amount THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'insufficient_credits',
      'current_balance', v_total, 'required', p_amount
    );
  END IF;

  v_new_plan := GREATEST(v_plan_balance - p_amount, 0);
  v_new_purchased := v_effective_purchased - GREATEST(p_amount - v_plan_balance, 0);

  v_from_sub       := v_plan_balance - v_new_plan;
  v_from_purchased := p_amount - v_from_sub;

  UPDATE profiles
  SET credits_balance = v_new_plan,
      purchased_credits = GREATEST(v_new_purchased, 0),
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO credit_transactions
    (user_id, amount, type, description, generation_id, balance_after, sub_amount, purchased_amount)
  VALUES (p_user_id, -p_amount, 'usage', p_description, p_generation_id,
          v_new_plan + GREATEST(v_new_purchased, 0), v_from_sub, v_from_purchased);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_plan + GREATEST(v_new_purchased, 0));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. refund_credits — send it back where it came from
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refund_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT,
  p_generation_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_sub_balance INTEGER;
  v_purchased INTEGER;
  v_purchased_expires TIMESTAMPTZ;
  v_orig_purchased INTEGER;
  v_already_returned INTEGER;
  v_to_purchased INTEGER;
  v_to_sub INTEGER;
  v_new_balance INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'new_balance', 0);
  END IF;

  SELECT credits_balance, purchased_credits, purchased_credits_expires_at
  INTO v_sub_balance, v_purchased, v_purchased_expires
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_sub_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- How much of the original spend came out of the purchased pool.
  -- NULL when there is no matching row, or the row predates this migration —
  -- both fall through to the pre-033 behaviour of refunding to credits_balance.
  v_orig_purchased := NULL;
  IF p_generation_id IS NOT NULL THEN
    SELECT purchased_amount INTO v_orig_purchased
    FROM credit_transactions
    WHERE generation_id = p_generation_id
      AND user_id = p_user_id
      AND type = 'usage'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_orig_purchased IS NULL OR v_orig_purchased <= 0 THEN
    v_to_purchased := 0;
  ELSE
    -- A generation can be refunded more than once — campaign does partial refunds
    -- per failed image (app/api/studios/campaign/route.ts:234). Cap the total ever
    -- returned to the purchased pool at what was taken from it, or repeated
    -- partials would mint purchased credits out of monthly ones.
    SELECT COALESCE(SUM(purchased_amount), 0) INTO v_already_returned
    FROM credit_transactions
    WHERE generation_id = p_generation_id
      AND user_id = p_user_id
      AND type = 'refund';

    v_to_purchased := LEAST(p_amount, GREATEST(v_orig_purchased - v_already_returned, 0));
  END IF;

  v_to_sub := p_amount - v_to_purchased;

  UPDATE profiles
  SET credits_balance   = COALESCE(v_sub_balance, 0) + v_to_sub,
      purchased_credits = COALESCE(v_purchased, 0) + v_to_purchased,
      -- Returning purchased credits under an expiry that has already passed (or
      -- was cleared when the pool was zeroed) would hand back credits that the
      -- next reserve_credits call deletes on sight. Give them a fresh 12 months.
      -- An expiry still in the future is left alone, so a refund cannot be used
      -- to extend a pool that is about to lapse.
      purchased_credits_expires_at = CASE
        WHEN v_to_purchased > 0 AND (v_purchased_expires IS NULL OR v_purchased_expires < NOW())
          THEN NOW() + INTERVAL '365 days'
        ELSE v_purchased_expires
      END
  WHERE id = p_user_id;

  v_new_balance := COALESCE(v_sub_balance, 0) + COALESCE(v_purchased, 0) + p_amount;

  INSERT INTO credit_transactions
    (user_id, amount, type, description, generation_id, balance_after, sub_amount, purchased_amount)
  VALUES (p_user_id, p_amount, 'refund', p_description, p_generation_id, v_new_balance,
          v_to_sub, v_to_purchased);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'to_subscription', v_to_sub,
    'to_purchased', v_to_purchased
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- CREATE OR REPLACE keeps the ACLs migration 022 set. Assert, do not assume.
DO $$
DECLARE fn RECORD; v_acl TEXT;
BEGIN
  FOR fn IN
    SELECT p.proname, array_to_string(p.proacl, ',') AS acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('reserve_credits', 'deduct_credits', 'refund_credits')
  LOOP
    IF fn.acl IS NOT NULL AND (fn.acl LIKE '%anon=%' OR fn.acl LIKE '%authenticated=%') THEN
      RAISE EXCEPTION '% is executable by anon/authenticated after replace: %', fn.proname, fn.acl;
    END IF;
  END LOOP;
  RAISE NOTICE 'Credit RPC ACLs intact after replace.';
END $$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('033', 'refunds return to the pool they were spent from; usage rows record the split')
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description, applied_at = NOW();

COMMIT;
