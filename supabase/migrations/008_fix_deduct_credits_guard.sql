-- Migration 008: Guard deduct_credits against zero/negative amounts
-- Fixes C5: prevent exploitation via zero or negative credit deduction

CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_studio TEXT,
  p_description TEXT,
  p_generation_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_plan_balance INTEGER;
  v_purchased INTEGER;
  v_total INTEGER;
  v_new_plan INTEGER;
  v_new_purchased INTEGER;
BEGIN
  -- Guard: reject invalid amounts
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  -- Lock the row to prevent race conditions
  SELECT credits_balance, purchased_credits
  INTO v_plan_balance, v_purchased
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_plan_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  v_total := v_plan_balance + COALESCE(v_purchased, 0);

  IF v_total < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'current_balance', v_total,
      'required', p_amount
    );
  END IF;

  -- Deduct from plan credits first, then purchased
  v_new_plan := GREATEST(v_plan_balance - p_amount, 0);
  v_new_purchased := COALESCE(v_purchased, 0) - GREATEST(p_amount - v_plan_balance, 0);

  UPDATE profiles
  SET credits_balance = v_new_plan,
      purchased_credits = GREATEST(v_new_purchased, 0),
      updated_at = NOW()
  WHERE id = p_user_id;

  -- Log transaction
  INSERT INTO credit_transactions (user_id, amount, type, description, generation_id, balance_after)
  VALUES (p_user_id, -p_amount, 'usage', p_description, p_generation_id, v_new_plan + GREATEST(v_new_purchased, 0));

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_plan + GREATEST(v_new_purchased, 0));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
