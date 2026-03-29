-- Migration 012: Top-up credits 12-month expiry

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS purchased_credits_expires_at TIMESTAMPTZ;

-- Update deduct_credits to check expiry
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

  -- Check if purchased credits have expired
  v_effective_purchased := COALESCE(v_purchased, 0);
  IF v_purchased_expires IS NOT NULL AND v_purchased_expires < NOW() THEN
    v_effective_purchased := 0;
    -- Zero out expired credits
    UPDATE profiles SET purchased_credits = 0, purchased_credits_expires_at = NULL WHERE id = p_user_id;
  END IF;

  v_total := v_plan_balance + v_effective_purchased;

  IF v_total < p_amount THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'insufficient_credits',
      'current_balance', v_total, 'required', p_amount
    );
  END IF;

  -- Deduct from plan credits first, then purchased
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
