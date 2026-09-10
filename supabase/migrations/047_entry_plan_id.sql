-- 047_entry_plan_id.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Let `plan_id` be 'entry'.
--
-- The 25-credit tier stops being free and becomes a $2/month plan called
-- `entry`. This migration does one thing: it widens the CHECK constraint so the
-- webhook can write that value. It ships ALONE and FIRST, before any code knows
-- the plan exists, because of what happens if it does not.
--
-- ── WHY THIS IS THE FIRST STEP AND NOT A DETAIL ─────────────────────────────
--
-- MEASURED on the live database 2026-09-10, before this file was written:
--
--     conname          check_plan_id
--     definition       CHECK ((plan_id = ANY (ARRAY['free','starter','pro',
--                                                   'business','agency']))) NOT VALID
--
-- Added by 013_constraints_and_fixes.sql:10-12 and never dropped or re-added by
-- any later migration. `NOT VALID` exempts rows that already existed; it does
-- NOT exempt new INSERTs or UPDATEs, which is exactly the path that matters.
--
-- The live Stripe price for this plan already exists — price_1UE2543HV9MX1JIk0qq7wwCj,
-- $2/month, metadata plan_id=entry — created before this migration. The app
-- cannot reach it (create-checkout's InputSchema enum has no 'entry'), but a
-- payment link or a dashboard-created subscription can. So the window this
-- closes is real today, not hypothetical:
--
--   1. Customer pays $2. Stripe settles it.
--   2. The webhook runs `mustSucceed(profiles.update({ plan_id: 'entry', ... }))`
--      at app/api/stripe/webhook/route.ts.
--   3. Postgres refuses with 23514. `mustSucceed` throws by design — that
--      design is what stopped a paid customer silently getting no credits in
--      money-path round 1.
--   4. The route 500s. Stripe retries on its own schedule. Every retry fails
--      identically, because the cause is a constraint and not a transient.
--
-- Money taken, no plan written, no credits granted, and no automated path that
-- ever heals it. One ALTER prevents it, and it is additive: no existing row
-- changes, no existing value stops being legal.
--
-- ── WHAT THIS MIGRATION DOES NOT DO ─────────────────────────────────────────
-- It does not change what `free` grants, does not add a plan to any code table,
-- and does not touch an access rule — so the `authenticated`-role probe
-- requirement in CLAUDE.md does not apply here. The probes below prove the
-- constraint's SHAPE instead: that 'entry' became legal and that a junk value
-- is still refused. A migration that only widened would be indistinguishable
-- from one that dropped the constraint entirely, and dropping it is the
-- plausible wrong fix.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_plan_id;

ALTER TABLE public.profiles ADD CONSTRAINT check_plan_id
  CHECK (plan_id IN ('free', 'entry', 'starter', 'pro', 'business', 'agency'))
  NOT VALID;

-- ── §1 PROBES ───────────────────────────────────────────────────────────────
-- Reported as a final SELECT, never RAISE NOTICE: scripts/db/apply.js discards
-- NOTICE and WARNING, so a probe that announces itself that way certifies
-- nothing.

CREATE TEMP TABLE probe_results (name text, verdict text);

-- The probes UPDATE an EXISTING row inside a savepoint and roll back to it,
-- rather than INSERTing a fresh one. First attempt did insert, and every write
-- returned 23503: `profiles.id` is a foreign key to `auth.users`, so a synthetic
-- uuid cannot exist. The gate below correctly refused to commit on that
-- INCONCLUSIVE rather than reading "no check_violation" as "the value is legal" —
-- which is the whole reason an unreachable verdict counts as a failure here.
DO $probe$
DECLARE
  v_uid uuid;
  v_was text;
BEGIN
  SELECT id, plan_id INTO v_uid, v_was FROM public.profiles LIMIT 1;

  IF v_uid IS NULL THEN
    -- No row to test against. Say so; do not pass.
    INSERT INTO probe_results VALUES ('0 a profiles row exists to probe', 'INCONCLUSIVE empty table');
    RETURN;
  END IF;
  INSERT INTO probe_results VALUES ('0 a profiles row exists to probe', 'PASS');

  -- A. the constraint is still there. Dropping it would make B and D pass and
  --    only C would notice.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND conname = 'check_plan_id'
  ) THEN
    INSERT INTO probe_results VALUES ('A constraint still present', 'PASS');
  ELSE
    INSERT INTO probe_results VALUES ('A constraint still present', 'FAIL');
  END IF;

  -- B. 'entry' is accepted. The point of the migration.
  BEGIN
    UPDATE public.profiles SET plan_id = 'entry' WHERE id = v_uid;
    INSERT INTO probe_results VALUES ('B entry accepted', 'PASS');
  EXCEPTION
    WHEN check_violation THEN
      INSERT INTO probe_results VALUES ('B entry accepted', 'FAIL check_violation');
    WHEN OTHERS THEN
      INSERT INTO probe_results VALUES ('B entry accepted', 'INCONCLUSIVE ' || SQLSTATE);
  END;
  UPDATE public.profiles SET plan_id = v_was WHERE id = v_uid;

  -- C. junk is STILL refused — i.e. widened, not removed.
  BEGIN
    UPDATE public.profiles SET plan_id = 'not_a_plan' WHERE id = v_uid;
    INSERT INTO probe_results VALUES ('C junk still refused', 'FAIL accepted');
  EXCEPTION
    WHEN check_violation THEN
      INSERT INTO probe_results VALUES ('C junk still refused', 'PASS');
    WHEN OTHERS THEN
      INSERT INTO probe_results VALUES ('C junk still refused', 'INCONCLUSIVE ' || SQLSTATE);
  END;
  UPDATE public.profiles SET plan_id = v_was WHERE id = v_uid;

  -- D. every plan the product already sells is still legal. A typo in the ALTER
  --    that dropped one would lock those customers out at their next webhook.
  BEGIN
    UPDATE public.profiles SET plan_id = 'agency' WHERE id = v_uid;
    UPDATE public.profiles SET plan_id = 'starter' WHERE id = v_uid;
    UPDATE public.profiles SET plan_id = 'pro' WHERE id = v_uid;
    UPDATE public.profiles SET plan_id = 'business' WHERE id = v_uid;
    UPDATE public.profiles SET plan_id = 'free' WHERE id = v_uid;
    INSERT INTO probe_results VALUES ('D existing plans still legal', 'PASS');
  EXCEPTION
    WHEN OTHERS THEN
      INSERT INTO probe_results VALUES ('D existing plans still legal', 'FAIL ' || SQLSTATE);
  END;

  -- Put the row back exactly as it was. The transaction would undo it anyway on
  -- a rehearsal, but this file also runs for real and must leave no trace.
  UPDATE public.profiles SET plan_id = v_was WHERE id = v_uid;
END
$probe$;

-- ── §2 THE GATE ─────────────────────────────────────────────────────────────
-- Refuse to commit unless every probe reached PASS. 045 computed "N FAILED of M"
-- and committed anyway; 044:153-162 on the same table has the gate that refuses,
-- and this follows 044.
DO $gate$
DECLARE
  n_bad int;
  detail text;
BEGIN
  SELECT count(*), string_agg(name || ' -> ' || verdict, '; ')
    INTO n_bad, detail
  FROM probe_results WHERE verdict <> 'PASS';

  IF n_bad > 0 THEN
    RAISE EXCEPTION '047 refusing to commit: % probe(s) not PASS: %', n_bad, detail;
  END IF;
END
$gate$;

SELECT name, verdict FROM probe_results ORDER BY name;

INSERT INTO public.schema_migrations (version, description)
VALUES ('047', 'profiles: plan_id may be entry — the $2 tier, widened before any code or payment can reach it')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

COMMIT;
