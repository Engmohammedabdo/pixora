-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 028: Reconcile orphaned (stranded) generations
--
-- ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
-- Every studio route reserves credits BEFORE calling the AI provider
-- (reserve_credits, 017/018/022) and refunds them from the route's own catch
-- block if the call fails (refund_credits, 019/021). That refund is
-- APPLICATION CODE, not a database guarantee. If the Node process dies
-- between "reservation committed" and "refund issued" — a deploy, an OOM
-- kill, a container restart, a serverless timeout, a Vercel function that
-- gets recycled mid-request — the catch block never runs. The reservation
-- (a real, committed 'usage' row in credit_transactions and a real deduction
-- from profiles.credits_balance / purchased_credits) is permanent. The
-- generation is left sitting in status 'pending' or 'processing' forever,
-- and the user has paid real credits for a generation that will never
-- complete and will never be refunded. There is no reconciliation of any
-- kind today — this migration adds the only one.
--
-- ── WHY THE LEDGER, NOT credits_used, IS THE SOURCE OF TRUTH ────────────────
-- generations.credits_used records what the route INTENDED to charge, but
-- several studios (creator: per-variation, photoshoot: per-shot) issue
-- PARTIAL refunds mid-flight — e.g. reserve 10, three of five variations
-- fail, refund 6, two succeed. If a crash then strands the generation, the
-- correct remaining debt is 4, not credits_used (10) and not 0. The only
-- place that partial history is recorded is credit_transactions, which is
-- INSERT-only from SECURITY DEFINER RPCs and service_role (022, section 4 —
-- "Service insert transactions" policy is TO service_role, WITH CHECK
-- (true); no user-writable path exists). That makes it the one trustworthy
-- ledger to recompute the true balance from:
--
--   owed = sum(-amount) over its 'usage' rows  -  sum(amount) over its 'refund' rows
--
-- keyed by credit_transactions.generation_id. This is why the fix lives here
-- and recomputes from transactions, instead of naively refunding
-- credits_used.
--
-- ── REUSING refund_credits (021) — SOUNDNESS OF THE NESTED CALL ─────────────
-- refund_credits(p_user_id, p_amount, p_description, p_generation_id) is
-- reused rather than re-implementing the balance/pool math, per the
-- instruction to avoid duplicating money logic. Calling one SECURITY
-- DEFINER function from inside another is sound here specifically because:
--   1. Both functions are created by the same admin role (the migrations are
--      applied, per 022's and 026's own instructions, via the Supabase SQL
--      Editor / psql AS the `postgres` role) — so this function's owner
--      already owns refund_credits and holds implicit EXECUTE on it via
--      ownership, independent of the PUBLIC/anon/authenticated REVOKEs 022
--      put in place. No additional GRANT is required for the nested call to
--      work; it would be required only if a *different* role owned the two
--      functions.
--   2. refund_credits takes its own `FOR UPDATE` lock on the SAME profiles
--      row this function's caller does not otherwise touch, so there is no
--      redundant locking or self-deadlock: this function locks a
--      `generations` row, then refund_credits locks the corresponding
--      `profiles` row — a fixed lock order (generations -> profiles) that
--      every concurrent invocation follows identically, which rules out a
--      deadlock even when two stranded generations belong to the same user
--      (see the idempotency note below for the SKIP LOCKED behaviour that
--      makes concurrent invocations safe in the first place).
--   3. refund_credits already writes the mirror 'refund' ledger row with the
--      correct balance_after and pool handling (021) — re-deriving that here
--      would risk drifting from the canonical implementation.
-- If a future refactor moves these functions to different owners, re-check
-- this assumption before relying on it again.
--
-- ── IDEMPOTENCY / CONCURRENCY-SAFETY (why a double-run cannot double-pay) ───
-- Three independent layers, any one of which is already sufficient on its
-- own:
--   (a) `FOR UPDATE SKIP LOCKED` on the generations scan means two
--       invocations running AT THE SAME TIME never process the same row:
--       whichever one locks it first proceeds, the other silently skips it
--       (SKIP LOCKED, not blocked) and moves to the next candidate. There is
--       no window where both read the same "pending" row and both refund it.
--   (b) A successful reconciliation transitions the row to status='failed'.
--       The scan's WHERE clause is `status IN ('pending','processing')`, so
--       a SEQUENTIAL second run (the common real-world case: a cron tick a
--       few minutes after the first) never even selects a row this function
--       already closed out — it is invisible to the query, not merely
--       skipped.
--   (c) Even if neither (a) nor (b) held — e.g. a hypothetical bug left the
--       status untouched — `owed` is recomputed from credit_transactions
--       INSIDE THE SAME TRANSACTION on every call. refund_credits's first
--       call inserted a 'refund' row that exactly cancels the 'usage' row it
--       repaid, so recomputing owed on any later call yields 0 (or less),
--       which fails the `owed > 0` guard and the row is skipped without a
--       second refund_credits call. This is what makes the fix correct for
--       partial refunds too: it is not "has this been reconciled before"
--       bookkeeping, it is "how much is actually still owed right now",
--       which is self-correcting no matter how many times it is asked.
-- Net effect: running this function twice back-to-back, or two scheduler
-- instances firing at once, cannot pay out more than the true outstanding
-- balance once.
--
-- ── THE TIME THRESHOLD (p_older_than) ────────────────────────────────────────
-- generations has no updated_at / heartbeat column (see 003) — created_at is
-- the only timestamp available, so staleness is measured from creation, not
-- from "last known alive". The default of 30 minutes is deliberately
-- generous: several studios call slow external providers (Replicate/Flux,
-- ElevenLabs, video generation) where a legitimately in-flight request can
-- take minutes, and the one failure mode explicitly worse than a missed
-- refund is clawing back credits from a generation that is still honestly
-- running and about to succeed. 30 minutes is comfortably past the P99 for
-- every current studio's provider calls while still bounding exposure to a
-- single business day of runs. Callers with slower studios (e.g. long video
-- generation) should pass a larger p_older_than explicitly for those runs.
-- NOTE (residual risk, not fixed here): because there is no heartbeat/lease,
-- ANY fixed threshold is a heuristic — a generation that is still genuinely
-- processing past the threshold could be refunded and marked 'failed' the
-- moment before it actually completes. That is a pre-existing limitation of
-- time-based reconciliation without a liveness signal, not something this
-- migration can fully close; tune p_older_than per the slowest studio's
-- expected completion time and treat this function as "eventually correct
-- money", not "instantly correct status".
--
-- ── DOES NOT DEPEND ON 027 ───────────────────────────────────────────────────
-- 027_onboarding_bonus.sql is written but NOT applied. This migration only
-- reads/writes credit_transactions.type values 'usage' and 'refund', both of
-- which have existed since 004_credit_transactions.sql — it does not touch
-- the 'onboarding' type or anything 027 adds, and applies cleanly whether or
-- not 027 has run.
--
-- ── SCHEDULING (documented here, NOT created by this migration) ─────────────
-- This migration creates only the function. Wire up ONE of:
--   (a) pg_cron, if the extension is enabled on this Supabase project:
--       -- SELECT cron.schedule(
--       --   'reconcile-orphaned-generations',
--       --   '*/15 * * * *',
--       --   $$SELECT public.reconcile_orphaned_generations();$$
--       -- );
--       (kept commented out, matching the convention in
--       020_rate_limit_cleanup.sql — enable only after confirming pg_cron is
--       available: SELECT * FROM pg_extension WHERE extname = 'pg_cron';)
--   (b) an external scheduler (e.g. a Vercel Cron / GitHub Actions cron)
--       hitting a NEW admin endpoint such as app/api/admin/reconcile/route.ts
--       that authenticates the caller and calls this RPC with the
--       service-role client, following the same pattern as the other
--       app/api/admin/* routes already in this repo.
-- Neither the cron schedule nor the endpoint is created by this migration —
-- that is a deliberate scope boundary per the task, not an oversight.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.reconcile_orphaned_generations(
  p_older_than INTERVAL DEFAULT '30 minutes',
  p_limit      INT      DEFAULT 500
) RETURNS JSONB AS $$
DECLARE
  v_gen              RECORD;
  v_owed             INTEGER;
  v_refund_result    JSONB;
  v_reconciled_count INTEGER := 0;
  v_total_refunded   INTEGER := 0;
  v_ids              UUID[]  := '{}';
  v_warnings         JSONB   := '[]'::jsonb;
BEGIN
  -- FOR UPDATE SKIP LOCKED: see header note (a). Rows already locked by a
  -- concurrently-running invocation of this same function are silently
  -- skipped rather than waited on, so two overlapping runs partition the
  -- work instead of racing over it.
  FOR v_gen IN
    SELECT g.id, g.user_id, g.studio, g.status, g.created_at
    FROM public.generations g
    WHERE g.status IN ('pending', 'processing')
      AND g.created_at < now() - p_older_than
    ORDER BY g.created_at
    LIMIT p_limit
    FOR UPDATE OF g SKIP LOCKED
  LOOP
    -- The only source of truth for what is actually still owed: the ledger,
    -- not generations.credits_used. See header note on partial refunds.
    SELECT
      COALESCE(SUM(CASE WHEN ct.type = 'usage'  THEN -ct.amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN ct.type = 'refund' THEN ct.amount ELSE 0 END), 0)
    INTO v_owed
    FROM public.credit_transactions ct
    WHERE ct.generation_id = v_gen.id;

    IF v_owed > 0 THEN
      v_refund_result := public.refund_credits(
        v_gen.user_id,
        v_owed,
        'Auto-reconciled: stranded ' || v_gen.status || ' generation (' || v_gen.studio || ') refunded by reconcile_orphaned_generations',
        v_gen.id
      );

      IF COALESCE((v_refund_result->>'success')::boolean, false) THEN
        UPDATE public.generations
        SET status = 'failed',
            error  = left(
              coalesce(error || ' | ', '') ||
              'Auto-reconciled: orphaned reservation refunded (' || v_owed || ' credits) at ' || now()::text,
              1000
            )
        WHERE id = v_gen.id;

        v_reconciled_count := v_reconciled_count + 1;
        v_total_refunded   := v_total_refunded + v_owed;
        v_ids              := v_ids || v_gen.id;
      ELSE
        -- refund_credits reported failure (e.g. profile row missing). Do NOT
        -- flip status here — leave the generation exactly as found so the
        -- next run retries it, and surface the failure instead of silently
        -- swallowing an unresolved money problem.
        v_warnings := v_warnings || jsonb_build_object(
          'generation_id', v_gen.id,
          'user_id', v_gen.user_id,
          'owed', v_owed,
          'error', COALESCE(v_refund_result->>'error', 'unknown_error')
        );
      END IF;
    END IF;
    -- ELSE (owed <= 0): per spec, skip entirely — no refund, no status
    -- change. This generation is either genuinely free (no 'usage' row was
    -- ever recorded for it) or has already been fully repaid by a previous
    -- run/partial-refund sequence. Its 'pending'/'processing' status, if
    -- still set, is a display/UX artifact only, not a money problem, and is
    -- intentionally left untouched — fixing it is out of scope for a
    -- money-correctness migration and is not assumed here.
  END LOOP;

  RETURN jsonb_build_object(
    'reconciled_count', v_reconciled_count,
    'total_credits_refunded', v_total_refunded,
    'generation_ids', to_jsonb(v_ids),
    'warnings', v_warnings
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Lock down execution — same policy as 022/026/027. This function mints
-- refunds (i.e. mints spendable credits back), so it follows the exact same
-- REVOKE-then-GRANT convention as the other money RPCs. Explicit REVOKE +
-- GRANT rather than relying on CREATE OR REPLACE to preserve any prior ACL,
-- because an accidental DROP + CREATE elsewhere would hand EXECUTE back to
-- PUBLIC — precisely the hole 022 closed.
REVOKE ALL ON FUNCTION public.reconcile_orphaned_generations(INTERVAL, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_orphaned_generations(INTERVAL, INT) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Record this migration as applied (matches the schema_migrations bookkeeping
-- introduced in 026/027). IF NOT EXISTS + ON CONFLICT DO UPDATE makes this
-- file safe to re-run in full.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     TEXT PRIMARY KEY,
  description TEXT,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version, description)
VALUES ('028', 'reconcile_orphaned_generations(): refund stranded pending/processing generations from the credit_transactions ledger')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — copy-pasteable, run AFTER applying this migration.
-- Every block is wrapped so you can run the whole thing inside one
-- transaction and ROLLBACK at the end — nothing here costs a real credit or
-- leaves fixture data behind.
--
-- Run as a role that can call SECURITY DEFINER money RPCs directly, i.e. via
-- the Supabase SQL Editor (which runs as `postgres` and bypasses the
-- service_role-only EXECUTE grant, same as every other verification block in
-- this migration set — see 022/026/027's own verification sections).
-- ═══════════════════════════════════════════════════════════════════════════

/*
BEGIN;

-- Fixture: profiles.id is FOREIGN KEY'd to auth.users(id) (001_profiles.sql),
-- so a fabricated UUID cannot be INSERTed as a new profile — it would fail
-- the FK. Borrow a REAL existing user instead, exactly like 027's own
-- verification block does with its <TEST_UID> placeholder. Since this whole
-- script runs inside a transaction you ROLLBACK at the end, overwriting a
-- real user's balance here is harmless: nothing persists.
--
-- Replace every <TEST_UID> below with a real id, e.g.:
--   SELECT id FROM public.profiles ORDER BY created_at LIMIT 1;

UPDATE public.profiles
SET credits_balance = 100, purchased_credits = 0, purchased_credits_expires_at = NULL
WHERE id = '<TEST_UID>'::uuid;

-- ── (a) full reservation, no refund at all → gets exactly its credits back ──
INSERT INTO public.generations (id, user_id, studio, model, input, credits_used, status, created_at)
VALUES (
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  '<TEST_UID>'::uuid,
  'creator', 'test-model', '{}'::jsonb, 10, 'processing',
  now() - INTERVAL '1 hour'
);
SELECT public.reserve_credits(
  '<TEST_UID>'::uuid, 10, 'creator', 'test reservation A',
  '00000000-0000-0000-0000-0000000000a1'::uuid
);

-- ── (b) partial refund already happened → only the remainder comes back ────
INSERT INTO public.generations (id, user_id, studio, model, input, credits_used, status, created_at)
VALUES (
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  '<TEST_UID>'::uuid,
  'photoshoot', 'test-model', '{}'::jsonb, 10, 'processing',
  now() - INTERVAL '1 hour'
);
SELECT public.reserve_credits(
  '<TEST_UID>'::uuid, 10, 'photoshoot', 'test reservation B',
  '00000000-0000-0000-0000-0000000000b1'::uuid
);
-- App-level partial refund for 2 of 5 failed shots, 3 credits each = 6.
SELECT public.refund_credits(
  '<TEST_UID>'::uuid, 6, 'partial refund: 2 failed shots',
  '00000000-0000-0000-0000-0000000000b1'::uuid
);
-- Remaining owed for generation b1 should be 10 - 6 = 4.

-- ── (d) too young — must be left completely alone ──────────────────────────
INSERT INTO public.generations (id, user_id, studio, model, input, credits_used, status, created_at)
VALUES (
  '00000000-0000-0000-0000-0000000000d1'::uuid,
  '<TEST_UID>'::uuid,
  'creator', 'test-model', '{}'::jsonb, 5, 'processing',
  now() - INTERVAL '2 minutes'
);
SELECT public.reserve_credits(
  '<TEST_UID>'::uuid, 5, 'creator', 'test reservation D (too young)',
  '00000000-0000-0000-0000-0000000000d1'::uuid
);

-- ── (e) completed generation with an outstanding-looking ledger row must
--        never be touched (status filter alone must exclude it) ───────────
INSERT INTO public.generations (id, user_id, studio, model, input, credits_used, status, created_at)
VALUES (
  '00000000-0000-0000-0000-0000000000e1'::uuid,
  '<TEST_UID>'::uuid,
  'creator', 'test-model', '{}'::jsonb, 7, 'completed',
  now() - INTERVAL '1 hour'
);
SELECT public.reserve_credits(
  '<TEST_UID>'::uuid, 7, 'creator', 'test reservation E (completed, never refunded — normal for success)',
  '00000000-0000-0000-0000-0000000000e1'::uuid
);

-- Balance before reconciliation: 100 - 10 (A) - 10 (B) + 6 (partial refund B)
--                                 - 5 (D) - 7 (E) = 74
SELECT credits_balance + purchased_credits AS balance_before
FROM public.profiles WHERE id = '<TEST_UID>'::uuid;
-- expect: 74

-- ═══ First run ═══
SELECT public.reconcile_orphaned_generations('30 minutes'::interval, 500) AS first_run;
-- expect reconciled_count = 2 (A and B only — D is too young, E is completed)
-- expect total_credits_refunded = 10 (A) + 4 (B remainder) = 14
-- expect generation_ids to contain a1 and b1, NOT d1 or e1

SELECT id, status, error FROM public.generations
WHERE id IN (
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  '00000000-0000-0000-0000-0000000000d1'::uuid,
  '00000000-0000-0000-0000-0000000000e1'::uuid
)
ORDER BY id;
-- expect: a1 -> failed (with auto-reconciled error note)
--         b1 -> failed (with auto-reconciled error note)
--         d1 -> processing, error NULL (untouched — (d))
--         e1 -> completed, error NULL (untouched — (e))

-- balance after first run: 74 + 10 (A) + 4 (B) = 88
SELECT credits_balance + purchased_credits AS balance_after_first_run
FROM public.profiles WHERE id = '<TEST_UID>'::uuid;
-- expect: 88

-- ═══ (c) Second run, immediately — must be a complete no-op ═══
SELECT public.reconcile_orphaned_generations('30 minutes'::interval, 500) AS second_run;
-- expect reconciled_count = 0, total_credits_refunded = 0, generation_ids = []
-- (a1/b1 are no longer 'pending'/'processing' so the WHERE clause excludes
--  them outright; this is layer (b) from the header note)

SELECT credits_balance + purchased_credits AS balance_after_second_run
FROM public.profiles WHERE id = '<TEST_UID>'::uuid;
-- expect: 88 (unchanged from balance_after_first_run — no double payment)

-- Nothing here is persisted:
ROLLBACK;
*/
-- ═══════════════════════════════════════════════════════════════════════════
