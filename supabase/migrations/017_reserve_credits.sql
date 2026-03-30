-- Migration 017: Reserve + Refund credits pattern (eliminates race condition)

-- Reserve credits atomically (deduct immediately, can be refunded on failure)
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
  v_total INTEGER;
  v_new_sub INTEGER;
  v_new_purchased INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'new_balance', 0, 'transaction_recorded', false);
  END IF;

  SELECT credits_balance, purchased_credits
  INTO v_sub_balance, v_purchased
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  v_total := COALESCE(v_sub_balance, 0) + COALESCE(v_purchased, 0);

  IF v_total < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits', 'balance', v_total);
  END IF;

  IF COALESCE(v_sub_balance, 0) >= p_amount THEN
    v_new_sub := v_sub_balance - p_amount;
    v_new_purchased := COALESCE(v_purchased, 0);
  ELSE
    v_new_sub := 0;
    v_new_purchased := COALESCE(v_purchased, 0) - (p_amount - COALESCE(v_sub_balance, 0));
  END IF;

  UPDATE profiles
  SET credits_balance = v_new_sub, purchased_credits = GREATEST(v_new_purchased, 0)
  WHERE id = p_user_id;

  INSERT INTO credit_transactions (user_id, amount, type, description, generation_id, balance_after)
  VALUES (p_user_id, -p_amount, 'usage', p_description, p_generation_id, v_new_sub + GREATEST(v_new_purchased, 0));

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_sub + GREATEST(v_new_purchased, 0),
    'transaction_recorded', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refund credits (on generation failure)
CREATE OR REPLACE FUNCTION refund_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT,
  p_generation_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_sub_balance INTEGER;
  v_purchased INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', true, 'new_balance', 0);
  END IF;

  SELECT credits_balance, purchased_credits
  INTO v_sub_balance, v_purchased
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  UPDATE profiles
  SET credits_balance = COALESCE(v_sub_balance, 0) + p_amount
  WHERE id = p_user_id;

  INSERT INTO credit_transactions (user_id, amount, type, description, generation_id, balance_after)
  VALUES (p_user_id, p_amount, 'refund', p_description, p_generation_id, COALESCE(v_sub_balance, 0) + p_amount + COALESCE(v_purchased, 0));

  RETURN jsonb_build_object('success', true, 'new_balance', COALESCE(v_sub_balance, 0) + p_amount + COALESCE(v_purchased, 0));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
