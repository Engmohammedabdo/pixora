-- Migration 032: stop the monthly reset from refilling accounts that are not paying.
--
-- `reset_monthly_credits()` is the only place in the system that grants credits
-- without any reference to a settled payment. Its WHERE clause (007:74-77) is:
--
--     WHERE credits_reset_date <= NOW() AND plan_id != 'free'
--
-- plan_id and a date. Nothing else. Not subscription status, not payment_failed.
--
-- This is not theoretical — the job is live:
--
--     SELECT jobid, schedule, active FROM cron.job
--     -> 1 | 0 0 1 * * | t | SELECT reset_monthly_credits();
--
-- So an account in Stripe's ~3-week dunning window, or one that has disputed its
-- charge, has `plan_id = 'agency'` sitting in the table and gets written back up to
-- 5000 credits — plus the 20% carry-over — on the 1st of every month, on a timer,
-- for as long as the row says 'agency'. Nothing downgrades it (see 033 and the
-- webhook status branch), so "as long as" means indefinitely.
--
-- Guarding the reset is the correct money boundary: credits already granted for a
-- month that WAS paid for stay spendable, but no NEW month is issued until payment
-- recovers. The webhook clears payment_failed on every successful charge
-- (route.ts:105, 214, 258, 303), so recovery is automatic and needs no extra step.

BEGIN;

CREATE OR REPLACE FUNCTION public.reset_monthly_credits()
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
      -- The whole point of this migration. Everything else below is unchanged
      -- from 007 and is reproduced verbatim so the live body stays reviewable
      -- against a single file.
      AND COALESCE(payment_failed, false) = false
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

  -- Free users reset. Deliberately NOT guarded by payment_failed: a free account
  -- has no payment to fail, and a downgraded ex-subscriber whose flag was never
  -- cleared must still receive the free allowance like anyone else.
  UPDATE profiles
  SET credits_balance = 25,
      credits_reset_date = NOW() + INTERVAL '1 month',
      updated_at = NOW()
  WHERE plan_id = 'free'
    AND credits_reset_date <= NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 022 locked this function down by name; CREATE OR REPLACE preserves the existing
-- ACL, so no re-grant is needed. Assert it rather than assume it.
DO $$
DECLARE v_acl TEXT;
BEGIN
  SELECT array_to_string(proacl, ',') INTO v_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reset_monthly_credits';

  IF v_acl IS NOT NULL AND (v_acl LIKE '%anon=%' OR v_acl LIKE '%authenticated=%') THEN
    RAISE EXCEPTION 'reset_monthly_credits is executable by anon/authenticated: %', v_acl;
  END IF;
  RAISE NOTICE 'reset_monthly_credits ACL after replace: %', COALESCE(v_acl, '(owner only)');
END $$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('032', 'reset_monthly_credits skips accounts flagged payment_failed')
ON CONFLICT (version) DO UPDATE SET description = EXCLUDED.description, applied_at = NOW();

COMMIT;
