-- Migration 007: Split credits — subscription vs purchased
-- Purchased credits never expire, subscription credits reset monthly

-- Add purchased_credits column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS purchased_credits INTEGER DEFAULT 0;

-- Updated deduct_credits: uses subscription credits first, then purchased
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_studio TEXT,
  p_description TEXT,
  p_generation_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_sub_credits INTEGER;
  v_purchased INTEGER;
  v_total INTEGER;
  v_deduct_from_sub INTEGER;
  v_deduct_from_purchased INTEGER;
BEGIN
  SELECT credits_balance, purchased_credits
  INTO v_sub_credits, v_purchased
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_sub_credits IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  v_total := v_sub_credits + v_purchased;

  IF v_total < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'current_balance', v_total,
      'required', p_amount
    );
  END IF;

  -- Use subscription credits first (they expire), then purchased (permanent)
  v_deduct_from_sub := LEAST(p_amount, v_sub_credits);
  v_deduct_from_purchased := p_amount - v_deduct_from_sub;

  UPDATE profiles
  SET credits_balance = v_sub_credits - v_deduct_from_sub,
      purchased_credits = v_purchased - v_deduct_from_purchased,
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO credit_transactions (user_id, amount, type, description, generation_id, balance_after)
  VALUES (p_user_id, -p_amount, 'usage', p_description, p_generation_id,
          (v_sub_credits - v_deduct_from_sub) + (v_purchased - v_deduct_from_purchased));

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', (v_sub_credits - v_deduct_from_sub) + (v_purchased - v_deduct_from_purchased),
    'subscription_credits', v_sub_credits - v_deduct_from_sub,
    'purchased_credits', v_purchased - v_deduct_from_purchased
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Updated monthly reset: only resets subscription credits, purchased stay untouched
CREATE OR REPLACE FUNCTION reset_monthly_credits()
RETURNS void AS $$
DECLARE
  r RECORD;
  v_new_sub_balance INTEGER;
BEGIN
  FOR r IN
    SELECT id, plan_id, credits_balance, purchased_credits
    FROM profiles
    WHERE credits_reset_date <= NOW()
      AND plan_id != 'free'
  LOOP
    v_new_sub_balance := CASE r.plan_id
      WHEN 'starter' THEN 200
      WHEN 'pro' THEN 600
      WHEN 'business' THEN 1500
      WHEN 'agency' THEN 5000
      ELSE 25
    END;

    -- Pro+ plans: carry over 20% of unused subscription credits (max 200)
    IF r.plan_id IN ('pro', 'business', 'agency') THEN
      v_new_sub_balance := v_new_sub_balance + LEAST(GREATEST(FLOOR(r.credits_balance * 0.2), 0), 200);
    END IF;

    -- Only reset subscription credits, purchased_credits untouched
    UPDATE profiles
    SET credits_balance = v_new_sub_balance,
        credits_reset_date = NOW() + INTERVAL '1 month',
        updated_at = NOW()
    WHERE id = r.id;

    INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
    VALUES (r.id, v_new_sub_balance, 'reset',
            'Monthly reset — ' || r.plan_id || ' plan (purchased: ' || r.purchased_credits || ' kept)',
            v_new_sub_balance + r.purchased_credits);
  END LOOP;

  -- Free users reset
  UPDATE profiles
  SET credits_balance = 25,
      credits_reset_date = NOW() + INTERVAL '1 month',
      updated_at = NOW()
  WHERE plan_id = 'free'
    AND credits_reset_date <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- pg_cron schedule (already enabled)
-- SELECT cron.schedule('monthly-credits-reset', '0 0 1 * *', $$SELECT reset_monthly_credits();$$);
