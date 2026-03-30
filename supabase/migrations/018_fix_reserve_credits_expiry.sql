-- Migration 018: Fix reserve_credits — add purchased credits expiry check
-- Bug: reserve_credits (017) doesn't check purchased_credits_expires_at
-- but deduct_credits (012) does. Expired credits could be spent via reserve path.

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
  -- Skip zero-cost operations
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'new_balance', 0, 'transaction_recorded', false);
  END IF;

  -- Lock the row to prevent race conditions
  SELECT credits_balance, purchased_credits, purchased_credits_expires_at
  INTO v_sub_balance, v_purchased, v_purchased_expires
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_sub_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- Zero out expired purchased credits BEFORE checking balance
  v_effective_purchased := COALESCE(v_purchased, 0);
  IF v_effective_purchased > 0
     AND v_purchased_expires IS NOT NULL
     AND v_purchased_expires < NOW() THEN

    -- Log the expiry
    INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
    VALUES (p_user_id, -v_effective_purchased, 'reset',
            'Purchased credits expired (12-month limit)',
            COALESCE(v_sub_balance, 0));

    -- Zero out
    UPDATE profiles
    SET purchased_credits = 0, purchased_credits_expires_at = NULL
    WHERE id = p_user_id;

    v_effective_purchased := 0;
  END IF;

  -- Check total available
  v_total := COALESCE(v_sub_balance, 0) + v_effective_purchased;

  IF v_total < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'balance', v_total,
      'required', p_amount
    );
  END IF;

  -- Deduct from subscription credits first, then purchased
  IF COALESCE(v_sub_balance, 0) >= p_amount THEN
    v_new_sub := v_sub_balance - p_amount;
    v_new_purchased := v_effective_purchased;
  ELSE
    v_new_sub := 0;
    v_new_purchased := v_effective_purchased - (p_amount - COALESCE(v_sub_balance, 0));
  END IF;

  v_new_balance := v_new_sub + GREATEST(v_new_purchased, 0);

  -- Update profile
  UPDATE profiles
  SET credits_balance = v_new_sub,
      purchased_credits = GREATEST(v_new_purchased, 0)
  WHERE id = p_user_id;

  -- Log the reservation
  INSERT INTO credit_transactions (user_id, amount, type, description, generation_id, balance_after)
  VALUES (p_user_id, -p_amount, 'usage', p_description, p_generation_id, v_new_balance);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'transaction_recorded', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
