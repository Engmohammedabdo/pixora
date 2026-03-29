-- Migration 005: Monthly Credits Reset
-- Requires pg_cron extension (enable in Supabase Dashboard → Database → Extensions)

-- Function to reset credits and log transactions
CREATE OR REPLACE FUNCTION reset_monthly_credits()
RETURNS void AS $$
DECLARE
  r RECORD;
  v_new_balance INTEGER;
BEGIN
  FOR r IN
    SELECT id, plan_id, credits_balance
    FROM profiles
    WHERE credits_reset_date <= NOW()
      AND plan_id != 'free'
  LOOP
    -- Calculate new balance
    v_new_balance := CASE r.plan_id
      WHEN 'starter' THEN 200
      WHEN 'pro' THEN 600
      WHEN 'business' THEN 1500
      WHEN 'agency' THEN 5000
      ELSE 25
    END;

    -- Pro+ plans: carry over 20% unused credits (max 200)
    IF r.plan_id IN ('pro', 'business', 'agency') THEN
      v_new_balance := v_new_balance + LEAST(GREATEST(FLOOR(r.credits_balance * 0.2), 0), 200);
    END IF;

    -- Update profile
    UPDATE profiles
    SET credits_balance = v_new_balance,
        credits_reset_date = NOW() + INTERVAL '1 month',
        updated_at = NOW()
    WHERE id = r.id;

    -- Log transaction
    INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
    VALUES (r.id, v_new_balance, 'reset',
            'Monthly credits reset — ' || r.plan_id || ' plan',
            v_new_balance);
  END LOOP;

  -- Also reset free users who have passed their reset date
  UPDATE profiles
  SET credits_balance = 25,
      credits_reset_date = NOW() + INTERVAL '1 month',
      updated_at = NOW()
  WHERE plan_id = 'free'
    AND credits_reset_date <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule: Run at midnight on the 1st of every month
-- NOTE: Requires pg_cron extension. Enable it in Supabase Dashboard.
-- Uncomment the following after enabling pg_cron:
--
-- SELECT cron.schedule(
--   'monthly-credits-reset',
--   '0 0 1 * *',
--   $$SELECT reset_monthly_credits();$$
-- );
