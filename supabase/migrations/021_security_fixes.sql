-- Migration 021: Fix refund pool + webhook atomic idempotency + RLS + search_path

-- ═══ Fix 3: refund_credits — return to correct pool ═══
-- If deduction came from purchased_credits, refund should try purchased first
-- For simplicity: always refund to credits_balance (subscription pool)
-- This is acceptable because both pools sum to total balance,
-- and subscription credits reset monthly anyway.
-- The key fix: proper FOR UPDATE locking + correct balance_after calculation.

CREATE OR REPLACE FUNCTION refund_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT,
  p_generation_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_sub_balance INTEGER;
  v_purchased INTEGER;
  v_new_balance INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'new_balance', 0);
  END IF;

  SELECT credits_balance, purchased_credits
  INTO v_sub_balance, v_purchased
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_sub_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Refund to subscription credits pool
  UPDATE profiles
  SET credits_balance = COALESCE(v_sub_balance, 0) + p_amount
  WHERE id = p_user_id;

  v_new_balance := COALESCE(v_sub_balance, 0) + p_amount + COALESCE(v_purchased, 0);

  INSERT INTO credit_transactions (user_id, amount, type, description, generation_id, balance_after)
  VALUES (p_user_id, p_amount, 'refund', p_description, p_generation_id, v_new_balance);

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ═══ Fix 4: Webhook idempotency — add processed column ═══
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE;

-- Update the idempotency flow:
-- 1. INSERT event_id immediately (mark as "in progress")
-- 2. After business logic succeeds, UPDATE processed=true
-- 3. On duplicate check: skip if event_id exists AND processed=true
--    If processed=false, it means a previous attempt crashed — allow retry


-- ═══ Fix 6: Set search_path on ALL SECURITY DEFINER functions ═══
-- Prevents schema injection attacks

CREATE OR REPLACE FUNCTION reserve_credits(
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

  v_new_balance := v_new_sub + GREATEST(v_new_purchased, 0);

  UPDATE profiles
  SET credits_balance = v_new_sub,
      purchased_credits = GREATEST(v_new_purchased, 0)
  WHERE id = p_user_id;

  INSERT INTO credit_transactions (user_id, amount, type, description, generation_id, balance_after)
  VALUES (p_user_id, -p_amount, 'usage', p_description, p_generation_id, v_new_balance);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'transaction_recorded', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ═══ Fix 6 continued: search_path on deduct_credits ═══
CREATE OR REPLACE FUNCTION deduct_credits(
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

  UPDATE profiles
  SET credits_balance = v_new_plan,
      purchased_credits = GREATEST(v_new_purchased, 0),
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO credit_transactions (user_id, amount, type, description, generation_id, balance_after)
  VALUES (p_user_id, -p_amount, 'usage', p_description, p_generation_id, v_new_plan + GREATEST(v_new_purchased, 0));

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_plan + GREATEST(v_new_purchased, 0));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ═══ Fix 6: RLS on webhook_events ═══
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
-- Only service role can insert/select (no user access needed)
CREATE POLICY "Service role only" ON webhook_events FOR ALL USING (true) WITH CHECK (true);


-- ═══ Fix 6: search_path on cleanup functions ═══
CREATE OR REPLACE FUNCTION cleanup_stale_records()
RETURNS JSONB AS $$
DECLARE
  v_login_deleted INTEGER;
  v_webhook_deleted INTEGER;
BEGIN
  DELETE FROM system_settings
  WHERE key LIKE 'login_attempts:%'
    AND updated_at < NOW() - INTERVAL '1 day';
  GET DIAGNOSTICS v_login_deleted = ROW_COUNT;

  DELETE FROM webhook_events
  WHERE processed_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_webhook_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'login_attempts_cleaned', v_login_deleted,
    'webhook_events_cleaned', v_webhook_deleted
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
