-- 048_free_account_holds_no_monthly_credits.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- The free account stops receiving a free month. Deploy B of the $2 plan.
--
-- 047 let `plan_id` be 'entry' and the code has sold it since 2026-09-10. This
-- migration takes the 25 credits away from the $0 account, in the database,
-- because two of the three places that granted them were never in the code:
--
--   1. `profiles.credits_balance DEFAULT 25` (001_profiles.sql:11). This is the
--      ONLY signup grant — `handle_new_user()` (001:34-47) inserts id, email,
--      name and avatar and no credit column. Measured on the live database
--      2026-09-11: column_default = '25'.
--   2. `reset_monthly_credits()` (032:72-77) refilled every free account to a
--      hard-coded 25 on its reset date, on a live cron (jobid 1, 0 0 1 * *).
--      Left alone it would have kept giving the $2 plan away, once a month, to
--      every account that never paid.
--   3. `PLANS.free.credits` in lib/stripe/plans.ts — the code half, shipped
--      BEFORE this file, so for the minutes between the deploy and this apply a
--      new signup received more than the copy promised. Never the reverse.
--
-- And one faucet that the price change turned on:
--
--   4. `claim_referral()` (026) paid 25 credits to BOTH sides at signup. At $0 a
--      month that was a thank-you; at $2 it made a shared link the cheapest way
--      in — sign up through it and receive the whole Entry plan for nothing,
--      repeatable with throwaway addresses up to the referrer's lifetime cap of
--      50. The claim now only RECORDS who referred whom. The reward moves to
--      `reward_referral_on_payment()`, which the Stripe webhook calls after the
--      friend's first successful SUBSCRIPTION payment, and which pays exactly
--      once. `revoke_referral_reward()` takes it back from both sides when that
--      payment is disputed — otherwise "pay $2, collect 50, charge back" is a tap.
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────
-- It does not touch any balance. `SET DEFAULT` affects new rows only, and the
-- free branch of the reset is removed rather than rewritten to 0 — an account
-- that already holds credits from the old free month keeps what it holds. The
-- 5-credit trial (027) and every referral grant live in `purchased_credits`,
-- which the reset has never touched.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── §1 New accounts start at zero ───────────────────────────────────────────
ALTER TABLE public.profiles ALTER COLUMN credits_balance SET DEFAULT 0;

-- ── §2 The monthly reset ────────────────────────────────────────────────────
-- Reproduced verbatim from 032 so the live body stays reviewable against one
-- file, with three changes, each marked:
--   (a) 'entry' named explicitly. It landed on `ELSE 25` by coincidence, and
--       nothing tied that arm to PLANS.entry.credits.
--   (b) ELSE is 0. The CHECK constraint makes an unknown plan unreachable; if one
--       ever arrives, the safe answer to "how much do we mint" is none.
--   (c) the free-account refill is GONE — see the header.
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
      AND COALESCE(payment_failed, false) = false
  LOOP
    v_new_sub_balance := CASE r.plan_id
      WHEN 'entry' THEN 25          -- (a)
      WHEN 'starter' THEN 200
      WHEN 'pro' THEN 600
      WHEN 'business' THEN 1500
      WHEN 'agency' THEN 5000
      ELSE 0                        -- (b)
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

  -- (c) No free-account refill. A free account holds no monthly allowance; its
  -- trial and any top-ups live in purchased_credits, untouched here.
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.reset_monthly_credits() FROM PUBLIC, anon, authenticated;

-- ── §3 Referral reward moves from signup to first payment ──────────────────
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS rewarded_at TIMESTAMPTZ;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Every row that exists today was paid at claim time by 026. Mark it so, or the
-- friend's next payment would pay the pair a second time.
UPDATE public.referrals SET rewarded_at = created_at WHERE rewarded_at IS NULL;

-- Same guards, same locks, same caps as 026 — reproduced verbatim — and the two
-- grants and their ledger rows removed. `credits_each` still records the reward
-- the pair is owed, so the admin view of a referral reads the same.
CREATE OR REPLACE FUNCTION public.claim_referral(
  p_referee_id UUID,
  p_code       TEXT,
  p_credits    INTEGER DEFAULT 25
) RETURNS JSONB AS $$
DECLARE
  c_max_per_day      CONSTANT INTEGER := 5;
  c_max_lifetime     CONSTANT INTEGER := 50;

  v_referrer_id      UUID;
  v_referee_created  TIMESTAMPTZ;
  v_today_count      INTEGER;
  v_lifetime_count   INTEGER;
BEGIN
  IF p_credits <= 0 OR p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_referrer_id
  FROM public.profiles WHERE referral_code = upper(btrim(p_code));

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'code_not_found');
  END IF;

  IF v_referrer_id = p_referee_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'self_referral');
  END IF;

  PERFORM 1 FROM public.profiles
  WHERE id IN (v_referrer_id, p_referee_id)
  ORDER BY id
  FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = p_referee_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_referred');
  END IF;

  SELECT created_at INTO v_referee_created FROM public.profiles WHERE id = p_referee_id;
  IF v_referee_created IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'referee_not_found');
  END IF;
  IF v_referee_created < NOW() - INTERVAL '7 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'account_too_old');
  END IF;

  SELECT
    count(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours'),
    count(*)
  INTO v_today_count, v_lifetime_count
  FROM public.referrals
  WHERE referrer_id = v_referrer_id;

  IF v_today_count >= c_max_per_day THEN
    RETURN jsonb_build_object('success', false, 'error', 'referrer_daily_limit');
  END IF;

  IF v_lifetime_count >= c_max_lifetime THEN
    RETURN jsonb_build_object('success', false, 'error', 'referrer_lifetime_limit');
  END IF;

  BEGIN
    INSERT INTO public.referrals (referrer_id, referee_id, code_used, credits_each)
    VALUES (v_referrer_id, p_referee_id, upper(btrim(p_code)), p_credits);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_referred');
  END;

  UPDATE public.profiles SET referred_by = v_referrer_id WHERE id = p_referee_id;

  -- Nothing is granted here any more. See the header, item 4.
  RETURN jsonb_build_object(
    'success', true,
    'referrer_id', v_referrer_id,
    'credits_awarded', 0,
    'reward_pending', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.claim_referral(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_referral(UUID, TEXT, INTEGER) TO service_role;

-- Pays the pair once, on the referee's first payment. The row lock plus
-- `rewarded_at IS NULL` makes a replayed webhook, a second top-up and a renewal
-- all pay nothing. The amount comes from the caller (REFERRAL_CREDITS in
-- lib/credits/offer.ts) so the price stays in code, where the page that
-- advertises it reads it too.
CREATE OR REPLACE FUNCTION public.reward_referral_on_payment(
  p_referee_id UUID,
  p_credits    INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_ref              RECORD;
  v_referee_balance  INTEGER;
  v_referrer_balance INTEGER;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  SELECT id, referrer_id, code_used INTO v_ref
  FROM public.referrals
  WHERE referee_id = p_referee_id AND rewarded_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'rewarded', false);
  END IF;

  UPDATE public.profiles
  SET purchased_credits = COALESCE(purchased_credits, 0) + p_credits,
      purchased_credits_expires_at = NOW() + INTERVAL '365 days'
  WHERE id = p_referee_id
  RETURNING COALESCE(credits_balance, 0) + COALESCE(purchased_credits, 0) INTO v_referee_balance;

  UPDATE public.profiles
  SET purchased_credits = COALESCE(purchased_credits, 0) + p_credits,
      purchased_credits_expires_at = NOW() + INTERVAL '365 days'
  WHERE id = v_ref.referrer_id
  RETURNING COALESCE(credits_balance, 0) + COALESCE(purchased_credits, 0) INTO v_referrer_balance;

  INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
  VALUES
    (p_referee_id,       p_credits, 'referral', 'Referral bonus — first payment, joined via ' || v_ref.code_used, v_referee_balance),
    (v_ref.referrer_id,  p_credits, 'referral', 'Referral bonus — a friend you invited subscribed',              v_referrer_balance);

  UPDATE public.referrals SET rewarded_at = NOW(), credits_each = p_credits WHERE id = v_ref.id;

  RETURN jsonb_build_object('success', true, 'rewarded', true, 'credits_each', p_credits);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.reward_referral_on_payment(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reward_referral_on_payment(UUID, INTEGER) TO service_role;

-- Takes a paid reward back from BOTH sides when the referee's qualifying payment
-- is disputed. Floored at zero: credits the pair already spent cannot be
-- recovered, and a negative balance would block the account for a debt the
-- product never tells it about. `revoked_at` makes a replayed dispute a no-op,
-- and a revoked row is never paid again because `rewarded_at` stays set.
CREATE OR REPLACE FUNCTION public.revoke_referral_reward(
  p_referee_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_ref RECORD;
BEGIN
  SELECT id, referrer_id, credits_each INTO v_ref
  FROM public.referrals
  WHERE referee_id = p_referee_id AND rewarded_at IS NOT NULL AND revoked_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'revoked', false);
  END IF;

  UPDATE public.profiles
  SET purchased_credits = GREATEST(COALESCE(purchased_credits, 0) - v_ref.credits_each, 0)
  WHERE id IN (p_referee_id, v_ref.referrer_id);

  INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
  SELECT id, -v_ref.credits_each, 'referral',
         'Referral bonus reversed — the qualifying payment was disputed',
         COALESCE(credits_balance, 0) + COALESCE(purchased_credits, 0)
  FROM public.profiles WHERE id IN (p_referee_id, v_ref.referrer_id);

  UPDATE public.referrals SET revoked_at = NOW() WHERE id = v_ref.id;

  RETURN jsonb_build_object('success', true, 'revoked', true, 'credits_each', v_ref.credits_each);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.revoke_referral_reward(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_referral_reward(UUID) TO service_role;

-- ── §4 PROBES ───────────────────────────────────────────────────────────────
-- Reported as a final SELECT: scripts/db/apply.js discards NOTICE and WARNING.
--
-- The functional probes run a real reset and a real reward against real rows,
-- inside a block that raises PR001 at the end — a plpgsql EXCEPTION block is a
-- savepoint, so everything the probe wrote is undone, while the local variables
-- it captured survive to be judged.

CREATE TEMP TABLE probe_results (name text, verdict text);

DO $probe$
DECLARE
  v_default   text;
  v_free_id   uuid;
  v_entry_id  uuid;
  v_free_after  int;
  v_entry_after int;
  v_referee   uuid;
  v_referrer  uuid;
  v_ee0 int; v_er0 int; v_ee1 int; v_er1 int;
  v_r1 jsonb; v_r2 jsonb;
  v_claim_def text;
  v_h text; v_i text;
  v_ee2 int; v_er2 int; v_rv1 jsonb; v_rv2 jsonb;
BEGIN
  -- A. new accounts start at zero
  SELECT column_default INTO v_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'credits_balance';
  INSERT INTO probe_results VALUES ('A credits_balance default is 0',
    CASE WHEN v_default = '0' THEN 'PASS' ELSE 'FAIL ' || COALESCE(v_default, 'null') END);

  -- B/C. the reset: a due free account is NOT refilled; a due entry account gets 25
  SELECT id INTO v_free_id  FROM public.profiles ORDER BY created_at LIMIT 1;
  SELECT id INTO v_entry_id FROM public.profiles WHERE id <> v_free_id ORDER BY created_at LIMIT 1;
  IF v_free_id IS NULL OR v_entry_id IS NULL THEN
    INSERT INTO probe_results VALUES ('B free not refilled', 'INCONCLUSIVE fewer than two profiles');
    INSERT INTO probe_results VALUES ('C entry reset to 25', 'INCONCLUSIVE fewer than two profiles');
  ELSE
    BEGIN
      UPDATE public.profiles SET plan_id = 'free',  credits_balance = 3, credits_reset_date = NOW() - INTERVAL '1 day', payment_failed = false WHERE id = v_free_id;
      UPDATE public.profiles SET plan_id = 'entry', credits_balance = 3, credits_reset_date = NOW() - INTERVAL '1 day', payment_failed = false WHERE id = v_entry_id;
      PERFORM public.reset_monthly_credits();
      SELECT credits_balance INTO v_free_after  FROM public.profiles WHERE id = v_free_id;
      SELECT credits_balance INTO v_entry_after FROM public.profiles WHERE id = v_entry_id;
      RAISE EXCEPTION 'probe rollback' USING ERRCODE = 'PR001';
    EXCEPTION WHEN SQLSTATE 'PR001' THEN NULL;
    END;
    INSERT INTO probe_results VALUES ('B free not refilled',
      CASE WHEN v_free_after = 3 THEN 'PASS' ELSE 'FAIL got ' || COALESCE(v_free_after::text, 'null') END);
    INSERT INTO probe_results VALUES ('C entry reset to 25',
      CASE WHEN v_entry_after = 25 THEN 'PASS' ELSE 'FAIL got ' || COALESCE(v_entry_after::text, 'null') END);
  END IF;

  -- D. claim_referral no longer grants anything
  v_claim_def := pg_get_functiondef('public.claim_referral(uuid,text,integer)'::regprocedure);
  INSERT INTO probe_results VALUES ('D claim_referral grants nothing',
    CASE WHEN v_claim_def NOT LIKE '%purchased_credits%' AND v_claim_def NOT LIKE '%credit_transactions%' THEN 'PASS' ELSE 'FAIL still grants' END);

  -- E/F. the reward pays both sides once, and a second payment pays nothing
  SELECT p.id INTO v_referee FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.referrals r WHERE r.referee_id = p.id)
  ORDER BY p.created_at LIMIT 1;
  SELECT id INTO v_referrer FROM public.profiles WHERE id <> v_referee ORDER BY created_at LIMIT 1;
  IF v_referee IS NULL OR v_referrer IS NULL THEN
    INSERT INTO probe_results VALUES ('E reward pays both once', 'INCONCLUSIVE no unreferred pair');
    INSERT INTO probe_results VALUES ('F second payment pays nothing', 'INCONCLUSIVE no unreferred pair');
    INSERT INTO probe_results VALUES ('J dispute takes the reward back from both', 'INCONCLUSIVE no unreferred pair');
    INSERT INTO probe_results VALUES ('K a replayed dispute takes nothing more', 'INCONCLUSIVE no unreferred pair');
  ELSE
    BEGIN
      SELECT COALESCE(purchased_credits, 0) INTO v_ee0 FROM public.profiles WHERE id = v_referee;
      SELECT COALESCE(purchased_credits, 0) INTO v_er0 FROM public.profiles WHERE id = v_referrer;
      INSERT INTO public.referrals (referrer_id, referee_id, code_used, credits_each)
      VALUES (v_referrer, v_referee, 'PROBE048', 25);
      v_r1 := public.reward_referral_on_payment(v_referee, 25);
      v_r2 := public.reward_referral_on_payment(v_referee, 25);
      SELECT COALESCE(purchased_credits, 0) INTO v_ee1 FROM public.profiles WHERE id = v_referee;
      SELECT COALESCE(purchased_credits, 0) INTO v_er1 FROM public.profiles WHERE id = v_referrer;
      -- and the dispute: taken back from both, once
      v_rv1 := public.revoke_referral_reward(v_referee);
      v_rv2 := public.revoke_referral_reward(v_referee);
      SELECT COALESCE(purchased_credits, 0) INTO v_ee2 FROM public.profiles WHERE id = v_referee;
      SELECT COALESCE(purchased_credits, 0) INTO v_er2 FROM public.profiles WHERE id = v_referrer;
      RAISE EXCEPTION 'probe rollback' USING ERRCODE = 'PR001';
    EXCEPTION WHEN SQLSTATE 'PR001' THEN NULL;
    END;
    INSERT INTO probe_results VALUES ('E reward pays both once',
      CASE WHEN (v_r1->>'rewarded') = 'true' AND v_ee1 = v_ee0 + 25 AND v_er1 = v_er0 + 25
           THEN 'PASS' ELSE 'FAIL r1=' || COALESCE(v_r1::text, 'null') || ' referee ' || v_ee0 || '->' || v_ee1 || ' referrer ' || v_er0 || '->' || v_er1 END);
    INSERT INTO probe_results VALUES ('F second payment pays nothing',
      CASE WHEN (v_r2->>'rewarded') = 'false' THEN 'PASS' ELSE 'FAIL r2=' || COALESCE(v_r2::text, 'null') END);
    INSERT INTO probe_results VALUES ('J dispute takes the reward back from both',
      CASE WHEN (v_rv1->>'revoked') = 'true' AND v_ee2 = v_ee0 AND v_er2 = v_er0
           THEN 'PASS' ELSE 'FAIL rv1=' || COALESCE(v_rv1::text, 'null') || ' referee ' || v_ee0 || '->' || v_ee2 || ' referrer ' || v_er0 || '->' || v_er2 END);
    INSERT INTO probe_results VALUES ('K a replayed dispute takes nothing more',
      CASE WHEN (v_rv2->>'revoked') = 'false' THEN 'PASS' ELSE 'FAIL rv2=' || COALESCE(v_rv2::text, 'null') END);
  END IF;

  -- G. nobody but the service role can call the new function
  INSERT INTO probe_results VALUES ('G reward not executable by anon/authenticated',
    CASE WHEN NOT has_function_privilege('anon', 'public.reward_referral_on_payment(uuid,integer)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.reward_referral_on_payment(uuid,integer)', 'EXECUTE')
         THEN 'PASS' ELSE 'FAIL executable' END);
  INSERT INTO probe_results VALUES ('L revoke not executable by anon/authenticated',
    CASE WHEN NOT has_function_privilege('anon', 'public.revoke_referral_reward(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.revoke_referral_reward(uuid)', 'EXECUTE')
         THEN 'PASS' ELSE 'FAIL executable' END);

  -- H/I. AS `authenticated`: a customer cannot reopen a paid reward, or forge a
  -- referral row, over PostgREST. Either would turn the reward into a tap.
  --
  -- The verdicts are held in variables and written AFTER `RESET ROLE`. The first
  -- rehearsal wrote them in place and died with 42501 on `probe_results` itself —
  -- the temp table belongs to the migration role, so the probe's own bookkeeping
  -- was refused as `authenticated`, which says nothing about `referrals`.
  PERFORM set_config('request.jwt.claim.sub', v_referee::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_referee, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    UPDATE public.referrals SET rewarded_at = NULL;
    v_h := 'FAIL update allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN v_h := 'PASS';
    WHEN OTHERS THEN v_h := 'INCONCLUSIVE ' || SQLSTATE;
  END;

  BEGIN
    INSERT INTO public.referrals (referrer_id, referee_id, code_used, credits_each)
    VALUES (v_referrer, v_referee, 'FORGED', 100000);
    v_i := 'FAIL insert allowed';
  EXCEPTION
    WHEN insufficient_privilege THEN v_i := 'PASS';
    WHEN OTHERS THEN v_i := 'INCONCLUSIVE ' || SQLSTATE;
  END;

  EXECUTE 'RESET ROLE';

  INSERT INTO probe_results VALUES ('H authenticated cannot reopen a reward', COALESCE(v_h, 'INCONCLUSIVE no verdict'));
  INSERT INTO probe_results VALUES ('I authenticated cannot forge a referral', COALESCE(v_i, 'INCONCLUSIVE no verdict'));
END
$probe$;

-- ── §5 THE GATE ─────────────────────────────────────────────────────────────
DO $gate$
DECLARE
  n_bad int;
  detail text;
BEGIN
  SELECT count(*), string_agg(name || ' -> ' || verdict, '; ')
    INTO n_bad, detail
  FROM probe_results WHERE verdict <> 'PASS';

  IF n_bad > 0 THEN
    RAISE EXCEPTION '048 refusing to commit: % probe(s) not PASS: %', n_bad, detail;
  END IF;
END
$gate$;

SELECT name, verdict FROM probe_results ORDER BY name;

INSERT INTO public.schema_migrations (version, description)
VALUES ('048', 'free account holds no monthly credits; entry named in the reset; referral reward paid on first payment')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
