-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 038: Freeze the generation lifecycle — close the refund loop
--
-- ── THE EXPLOIT THIS CLOSES ─────────────────────────────────────────────────
-- 028's reconcile_orphaned_generations() runs every 15 minutes (029, pg_cron
-- job 'reconcile-orphaned-generations'). It refunds any generation that is
--     status IN ('pending','processing')  AND  created_at < now() - 30 minutes
-- and still owes credits in the ledger (owed = usage - refund > 0, 028:169-174).
--
-- A COMPLETED, DELIVERED generation legitimately has owed > 0 — 028's own
-- verification block calls case (e) "completed, never refunded — normal for
-- success" (028:337). The ONLY thing keeping the reconciler away from delivered
-- work is the value of the status column.
--
-- Nothing protects that column:
--   * 003_generations_assets.sql created `generations` with no GRANT/REVOKE at
--     all, so Supabase's bootstrap GRANT ALL TO anon, authenticated is still in
--     force. No migration 001-037 ever revoked it.
--   * The UPDATE policy (003:26, recreated at 025:65-69) is row-level only:
--     USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id).
--     RLS gates WHICH ROW; only GRANT gates WHICH COLUMN — the exact
--     distinction 022:37 was written about, applied there to profiles and never
--     swept across generations.
--
-- So a paying customer can, from the browser, with the public anon key and
-- their own session:
--
--     PATCH /rest/v1/generations?id=eq.<their own COMPLETED row>
--     {"status":"processing","created_at":"2020-01-01T00:00:00Z"}
--
-- ...and be refunded in full, on the next cron tick, for work already
-- delivered. Repeatable => unlimited free credits, with the provider bill
-- (Gemini / GPT / Flux / ElevenLabs) charged to us against a fixed
-- subscription price. Backdating created_at in the same PATCH also removes the
-- 30-minute wait, so the loop turns every 15 minutes instead of every 45.
--
-- ── WHY THIS IS A TRIGGER AND NOT A REVOKE ──────────────────────────────────
-- The obvious fix — REVOKE UPDATE ON public.generations FROM authenticated —
-- cannot be applied on its own, and no column-scoped version of it works
-- either.
--
-- All nine studio routes write this table through createServerClient()
-- (lib/supabase/server.ts:5), which is the anon key plus the user's cookie JWT.
-- Every INSERT and every status write in app/api/studios/*/route.ts therefore
-- executes as `authenticated` — the SAME ROLE, over the SAME PostgREST
-- endpoint, as the attacker. A revoke 500s every generation in the product.
--
-- Narrowing to columns does not help: `status` is precisely the column the
-- routes must write on the success path —
--     creator:257  photoshoot:202  campaign:254  voiceover:186
--     plan:112     storyboard:117  analysis:118  edit:114
-- — and precisely the column the exploit rewrites. There is no subset of
-- columns that closes the hole and leaves the studios working.
--
-- Privilege cannot separate the app from the attacker here, because at the
-- privilege layer they are the same principal. The one thing that DOES
-- separate them is the SHAPE OF THE WRITE. Every legitimate write moves a
-- generation FORWARD through its lifecycle:
--
--     INSERT 'processing'          — 8 studios (analysis:56, campaign:117,
--                                    creator:118, edit:53, photoshoot:82,
--                                    plan:56, storyboard:61, voiceover:106)
--     INSERT 'completed'           — prompt-builder:50 (charges 0 credits)
--     processing -> completed      — the success path in all 8
--     processing -> failed         — every catch/guard branch
--     completed  -> failed         — prompt-builder:81, when the model's output
--                                    fails to parse after the row was inserted
--                                    as 'completed'
--     pending/processing -> failed — the reconciler itself (028:185)
--
-- Not one legitimate write moves a row BACKWARD into the reconciler's scan
-- window, and not one writes created_at at all (verified: zero occurrences of
-- created_at in any write to this table anywhere in app/, lib/ or scripts/).
-- That asymmetry is the fix, and it costs no application change.
--
-- ── WHY THE RULE IS A WHITELIST ON `NEW`, NOT A BLACKLIST ON `OLD` ──────────
-- ⚠ The first draft of this migration expressed the rule as
--       IF OLD.status IN ('completed','failed')
--          AND NEW.status IN ('pending','processing') THEN reject
-- and adversarial review broke it in two HTTP calls.
--
-- `generations.status` is NULLABLE. 003:11 declares
--     status TEXT DEFAULT 'pending' CHECK (status IN (...))
-- with no NOT NULL, and no migration 001-037 adds one. A Postgres CHECK is
-- satisfied when the expression is TRUE **or NULL**, and
-- `NULL IN ('pending',...)` is NULL — so status = NULL is a legal value.
--
-- Feed NULL into either side of a blacklist and, in three-valued logic, the
-- predicate evaluates to NULL rather than TRUE, and plpgsql does not take the
-- branch:
--
--     PATCH {"status": null}        completed -> NULL   NEW side is NULL -> allowed
--     PATCH {"status":"processing"} NULL -> processing  OLD side is NULL -> allowed
--
-- Net: completed -> processing, in two hops, with the guard installed and
-- firing correctly on both. created_at never has to be touched, because any
-- row worth farming is already older than 30 minutes.
--
-- The invariant is therefore stated on NEW, where it is naturally total:
--
--     A row may only BE in the reconciler's scan window
--     if it was ALREADY in the reconciler's scan window.
--
-- NULL is rejected outright as a status value (it is not a lifecycle state, it
-- is a hole in the CHECK constraint), and OLD is read through coalesce() so a
-- pre-existing NULL row cannot be walked back in either. Section 2 then closes
-- the hole itself with SET NOT NULL, so the laundering slot cannot exist at
-- all — the trigger stops the write, the constraint stops the state.
--
-- ── WHY THIS IS SUFFICIENT ──────────────────────────────────────────────────
-- The reconciler pays out only against ledger rows keyed to a generation id
-- (028:174, `WHERE ct.generation_id = v_gen.id`). Two facts make that key
-- unforgeable:
--   1. credit_transactions cannot be written by its owner — 022 section 4 set
--      the INSERT policy TO service_role, and there is no UPDATE or DELETE
--      policy on that table at all. A user cannot re-point an existing debt at
--      a different generation, nor delete the refund row to re-inflate `owed`.
--   2. generations.id is a primary key, so a user cannot INSERT a fresh row
--      carrying an existing row's id. A brand-new row has no ledger rows, so
--      owed = 0 and 028:176 skips it — inserting backdated 'processing' rows
--      by the thousand extracts nothing.
-- Re-opening the row that already carries the debt is therefore the only path
-- to the money, and that is exactly what this migration forbids.
--
-- ── BREAK-GLASS ─────────────────────────────────────────────────────────────
-- service_role and superusers are exempt from the guard. They are already
-- fully trusted (service_role bypasses RLS entirely), the studios never touch
-- this table with the service-role key, and the exemption keeps a stranded row
-- repairable. NOTE the preferred repair is NOT a status rewind: call
--     SELECT public.refund_credits(<user_id>, <owed>, '<why>', <generation_id>);
-- directly. That pays the customer without moving the row back into an
-- automated payout window.
--
-- ⚠ NO PAIRED CODE CHANGE REQUIRED. Unlike 022/024/025, this migration is safe
--   to apply on its own: it forbids only transitions that no line of
--   application code performs. Section 4 proves that against the live table,
--   as the `authenticated` role, before COMMIT — rather than asking you to
--   take it on trust.
--
-- ⚠ FOLLOW-UP FILED, NOT INCLUDED: every terminal-status write in the studios
--   discards its error (e.g. creator/route.ts:252-259 is a bare `await
--   supabase.from('generations').update({...})` with no check). A future
--   writer that violated this guard would have its rejection silently
--   swallowed. That is a pre-existing defect this migration does not create
--   and does not fix; see section 6.
--
-- ⚠ APPLY WITH:  node scripts/db/apply.js supabase/migrations/038_generation_lifecycle_guard.sql
--   apply.js surfaces result ROWS but NOT NOTICE/WARNING messages, so every
--   check below that must be seen either RAISEs an EXCEPTION (aborting the
--   whole transaction) or reports through the final SELECT. Nothing important
--   is delivered as a NOTICE.
--
-- ⚠ APPLY OFF THE QUARTER-HOUR (:05-:10). The reconciler cron fires at */15
--   and holds row locks on this table while it refunds; overlapping it just
--   burns the 5s lock_timeout and rolls back. Do NOT disable the cron job to
--   make room — forgetting to re-enable it strands real customers' credits.
--
-- ⚠ ROLLBACK (keep in a second window before you apply):
--     node scripts/db/apply.js --check "SET lock_timeout='3s'; ALTER TABLE public.generations DISABLE TRIGGER generations_lifecycle_guard;"
--     node scripts/db/apply.js --check "DELETE FROM public.schema_migrations WHERE version='038';"
--   A corrected migration ships as 039 — apply.js:101-110 refuses to re-apply
--   a version already in the ledger.
--
-- ⚠ UNKNOWN PRODUCTION SCHEMA (022:25-30) — the historical migration runner had
--   no ON_ERROR_STOP, so production is not known to match this repo. Every
--   object touched below is existence-checked, and anything that would make a
--   check meaningless aborts rather than passing quietly.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- CREATE/DROP TRIGGER and ALTER COLUMN take an ACCESS EXCLUSIVE lock on
-- public.generations and hold it until COMMIT. That table is written by all
-- nine studios on every request, so without a bound this migration could queue
-- behind an in-flight generation and then block every studio write behind
-- itself for as long as apply.js's 120s HTTP timeout allows. Fail fast
-- instead: if the table is busy, the whole transaction rolls back cleanly in 5
-- seconds and you re-run it.
--
-- Note this bounds the WAIT, not the HOLD. While the request is queued,
-- Postgres also blocks newly arriving lock requests behind it — so each
-- attempt can stall all generations traffic for up to 5s. Bounded and
-- acceptable; do not retry in a tight loop.
SET LOCAL lock_timeout = '5s';

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Preconditions
--
--    The trigger function dereferences NEW.status and NEW.created_at on every
--    UPDATE. plpgsql resolves those at run time, so if either column were
--    absent the trigger would raise on EVERY write to this table instead of
--    only on illegal ones — it would take the product down rather than fail
--    open. Both are hard preconditions, not warnings.
--
--    `authenticated` must exist too: section 4 probes the guard by assuming
--    that role, and a probe that cannot run must not be reported as a pass.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  missing TEXT;
BEGIN
  IF to_regclass('public.generations') IS NULL THEN
    RAISE EXCEPTION '038: public.generations does not exist — your production schema is not what this repo describes. Aborting.';
  END IF;

  -- credits_used is included because section 4's probes INSERT it. Without it
  -- here, a missing column surfaces as a raw 42703 from inside a probe instead
  -- of the legible message this block exists to produce.
  SELECT string_agg(c, ', ' ORDER BY c) INTO missing
  FROM unnest(ARRAY['id', 'status', 'created_at', 'user_id', 'studio', 'model', 'input', 'credits_used']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'generations' AND column_name = c
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '038: public.generations is missing column(s): % — refusing to install a trigger that would raise on every write. Aborting.', missing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION '038: role `authenticated` does not exist — section 4 could not probe the guard as a real customer, so this migration cannot certify itself. Aborting.';
  END IF;

  -- The entire premise of this migration is that `authenticated` still holds
  -- the bootstrap GRANT UPDATE on this table. Assert it rather than assume it:
  -- if it is absent, probe A dies on a bare 42501 that reads like a schema
  -- surprise, when the real news is that the exploit is not reachable here.
  IF NOT has_table_privilege('authenticated', 'public.generations', 'UPDATE') THEN
    RAISE EXCEPTION '038: `authenticated` holds no UPDATE on public.generations — the exploit this migration closes is not reachable on this database, and section 4 cannot probe the guard. Investigate before proceeding. Aborting.';
  END IF;
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Close the NULL hole in the status column
--
--    Done BEFORE the trigger so the two controls are independent: even a
--    writer that somehow bypasses the trigger cannot create the laundering
--    slot.
--
--    A NULL status is not an expected state — no application writer produces
--    one. If production contains any, that is a schema surprise on the money
--    path and you must look at it rather than let a migration silently rewrite
--    money-path rows. So: abort and report, do not auto-repair.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_nulls BIGINT;
BEGIN
  SELECT count(*) INTO v_nulls FROM public.generations WHERE status IS NULL;

  IF v_nulls > 0 THEN
    RAISE EXCEPTION '038: % generation row(s) have status IS NULL. That state is unreachable from application code, so investigate before proceeding — inspect them with: SELECT id, user_id, studio, created_at FROM public.generations WHERE status IS NULL; then decide the correct terminal status per row and set it as service_role. Aborting.', v_nulls;
  END IF;
END
$$;

-- Idempotent: a no-op if the column is already NOT NULL.
ALTER TABLE public.generations ALTER COLUMN status SET NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. The lifecycle guard
--
--    Three rules, all derived from what the application actually does:
--
--    (a) status may not be NULL. See the header — NULL is the laundering slot
--        that defeats any OLD/NEW comparison. Section 1 makes the state
--        impossible; this makes the WRITE impossible, so the guard does not
--        depend on the constraint having applied.
--
--    (b) A row may only BE in the reconciler's scan window if it was ALREADY
--        in it. Forbidden: (anything else) -> (pending|processing).
--        Permitted, and exercised by real code: processing -> completed,
--        processing -> failed, completed -> failed (prompt-builder:81),
--        pending|processing -> failed (the reconciler, 028:185), and any write
--        that leaves status unchanged.
--
--        `failed` is on the forbidden left-hand side deliberately, not as
--        belt-and-braces: several routes mark a generation 'failed' on paths
--        that do not refund, so a failed row can legitimately still carry
--        owed > 0. Rewinding one of those pays out exactly as the completed
--        case does.
--
--    (c) created_at is immutable. It is the reconciler's only staleness signal
--        (028:93-104 — generations has no updated_at or heartbeat column), and
--        no writer anywhere in the codebase sets it on UPDATE. Leaving it
--        writable lets an attacker pull a genuinely in-flight generation into
--        the refund window, bank the refund, and still be handed the output
--        when the route completes a few seconds later.
--
--    SECURITY INVOKER (the default) on purpose — unlike 025's
--    assert_generation_project_owner(), this function reads no tables and so
--    needs no elevated rights. It must also see the REAL current_user to
--    evaluate the break-glass exemption, which SECURITY DEFINER would mask.
--    Executability is revoked from PUBLIC to match 025:51; Postgres checks
--    EXECUTE on a trigger function when the TRIGGER IS CREATED, not when it
--    fires, so this does not stop the guard running for ordinary users.
--
--    The service_role test is a catalog lookup rather than a bare
--    pg_has_role(current_user,'service_role','USAGE') so that a missing role
--    yields FALSE instead of raising undefined_object on every write.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_generation_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
  -- Break-glass. service_role and superusers are already fully trusted and the
  -- studios never reach this table with that key. See the header for why a
  -- status rewind is still the wrong repair even when you are allowed one.
  IF EXISTS (
       SELECT 1 FROM pg_roles r
       WHERE r.rolname = 'service_role'
         AND pg_has_role(current_user, r.oid, 'USAGE')
     )
  THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NULL THEN
    RAISE EXCEPTION
      'generation %: status may not be NULL', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('pending', 'processing')
     AND coalesce(OLD.status, '') NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION
      'generation % cannot move from % into % — only an already in-flight generation may be in-flight',
      OLD.id, coalesce(OLD.status, 'NULL'), NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'generation %: created_at is immutable (attempted % -> %)',
      OLD.id, OLD.created_at, NEW.created_at
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

REVOKE ALL ON FUNCTION public.assert_generation_lifecycle() FROM PUBLIC;

-- Unconditional BEFORE UPDATE (no `OF status, created_at`, no WHEN clause) on
-- purpose. The body touches no user tables, so the cost is a catalog lookup
-- and three comparisons, and an unconditional trigger cannot be side-stepped
-- by how the UPDATE is phrased — including PostgREST upsert
-- (POST + Prefer: resolution=merge-duplicates), which compiles to
-- INSERT ... ON CONFLICT DO UPDATE and does fire BEFORE UPDATE row triggers.
DROP TRIGGER IF EXISTS generations_lifecycle_guard ON public.generations;
CREATE TRIGGER generations_lifecycle_guard
  BEFORE UPDATE ON public.generations
  FOR EACH ROW EXECUTE FUNCTION public.assert_generation_lifecycle();

-- ENABLE ALWAYS, not the 'O' (origin) default: 'O' means the trigger does not
-- fire when session_replication_role = 'replica', which covers logical
-- replication apply and some restore paths. Not reachable by `authenticated`
-- (the GUC is PGC_SUSET), so this is defence in depth — but for the single
-- control standing between a customer and unlimited credits it costs one line.
ALTER TABLE public.generations ENABLE ALWAYS TRIGGER generations_lifecycle_guard;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Revoke DELETE on generations — independent of the exploit above
--
--    SEVERABLE: not required to close the refund loop. Section 2 closes that
--    on its own. This is here because it is a provably zero-caller change
--    against the same table, taken under the same lock, that closes two live
--    problems:
--
--    (a) lib/rate-limit.ts:11-16 implements the ONLY throttle in front of all
--        nine paid AI studios by COUNTING rows in generations over the last 60
--        seconds. Policy 009:28 grants users DELETE on their own rows, so
--            DELETE /rest/v1/generations?user_id=eq.<self>&created_at=gte.<t>
--        resets that counter to zero. The sole rate limiter guarding every
--        external provider bill is a table the caller can erase.
--
--    (b) credit_transactions.generation_id is ON DELETE SET NULL (004:9), so
--        deleting a generation severs the only link between a charge and what
--        it paid for — destroying the audit trail the reconciler and every
--        revenue figure are reconstructed from.
--
--    ZERO CALLERS, verified: the only DELETE against this table in the repo is
--    app/api/admin/generations/route.ts:87 on createAdminClient() (bound at
--    :12, lib/admin/db.ts:5) — the service-role key, which bypasses table
--    grants entirely. No user-scoped DELETE exists.
--
--    A FAILED REVOKE HERE IS REPORTED, NOT FATAL. apply.js runs as
--    supabase_admin while the bootstrap GRANT came from Supabase's own setup
--    role, so this REVOKE may legitimately no-op (022:151-164). The exploit fix
--    must not be held hostage to a secondary hardening step — so the outcome
--    is surfaced in the final SELECT (section 5), where it is actually
--    visible, instead of a NOTICE that apply.js discards.
--
--    PUBLIC is included: has_table_privilege() counts privileges held via
--    PUBLIC, so revoking only from anon/authenticated can leave the check
--    firing on a privilege the statement never touched. 028:234 already gets
--    this right for functions.
--
--    Wrapped in a DO block because a bare REVOKE against a role name that does
--    not exist raises 42704 and would roll back the exploit fix with it — the
--    exact hostage-taking this section is trying to avoid.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r TEXT;
BEGIN
  REVOKE DELETE ON public.generations FROM PUBLIC;

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE DELETE ON public.generations FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- The matching policy (009:28) is left standing on purpose. DROP POLICY hard-
-- errors on non-ownership and would abort this transaction, whereas REVOKE
-- silently no-ops — so the policy is dropped only if we actually own it.
-- Either control alone is sufficient; the grant is checked before the policy.
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users delete own generations" ON public.generations;
EXCEPTION
  WHEN insufficient_privilege THEN
    NULL;  -- reported via authed_can_delete in section 5
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Prove it — against the live table, AS THE `authenticated` ROLE
--
--    A trigger that exists in pg_trigger is not a trigger that fires, and a
--    probe run as supabase_admin proves nothing here because supabase_admin is
--    exempt by section 2's break-glass rule. Every probe below therefore
--    assumes the `authenticated` role and sets request.jwt.claims to the row's
--    real owner, so RLS and the guard evaluate exactly as they do for a real
--    customer holding the public anon key.
--
--    Each probe distinguishes THREE outcomes, because two of them look alike
--    from the outside and only one of them proves anything:
--      * check_violation raised  -> the GUARD blocked it. This is a pass.
--      * 0 rows updated          -> RLS blocked it first. The guard was never
--                                   exercised, so the probe certifies nothing.
--                                   Treated as a hard failure, not a pass.
--      * rows updated, no error  -> the guard let it through. Hard failure.
--
--    Probes D and E write to real rows and then deliberately abort their own
--    subtransaction to undo the write, so nothing here persists.
-- ───────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_id        UUID;
  v_owner     UUID;
  v_created   TIMESTAMPTZ;
  v_rows      INTEGER;
  v_blocked   BOOLEAN;
  v_probe_id  UUID;
BEGIN
  SELECT id, user_id, created_at
    INTO v_id, v_owner, v_created
  FROM public.generations
  WHERE status = 'completed'
  ORDER BY created_at DESC   -- hot end of the heap; status is unindexed
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION '038: no completed generation exists to probe against. This database cannot certify the guard, and a production database with paying customers certainly has one — treat this as a schema surprise and investigate. Aborting.';
  END IF;

  -- ═══ PROBE A — the original exploit: completed -> processing ═══
  v_blocked := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub',  v_owner::text,   true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    IF auth.uid() IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION '038: auth.uid() returned % but the probe identity is % — this deployment''s auth.uid() reads a GUC this migration does not set, so RLS would filter every probe and none could certify the guard. Aborting.', auth.uid(), v_owner;
    END IF;

    UPDATE public.generations SET status = 'processing' WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;

    IF v_rows = 0 THEN
      RAISE EXCEPTION '038: probe A updated 0 rows — RLS blocked it before the trigger ran, so this probe certifies nothing about the guard. Aborting.';
    END IF;
    RAISE EXCEPTION '038: probe A FAILED — a customer CAN still move a completed generation back to processing. The refund loop is OPEN. Refusing to commit.';
  EXCEPTION
    WHEN check_violation THEN
      v_blocked := true;
  END;
  RESET ROLE;
  IF NOT v_blocked THEN
    RAISE EXCEPTION '038: probe A did not reach a verdict. Refusing to commit.';
  END IF;

  -- ═══ PROBE B — the laundering bypass: completed -> NULL ═══
  --     This is the transition that defeated the first draft of this
  --     migration. If it is permitted, probe A's pass is worthless.
  v_blocked := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub',  v_owner::text,   true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    IF auth.uid() IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION '038: auth.uid() returned % but the probe identity is % — this deployment''s auth.uid() reads a GUC this migration does not set, so RLS would filter every probe and none could certify the guard. Aborting.', auth.uid(), v_owner;
    END IF;

    UPDATE public.generations SET status = NULL WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;

    IF v_rows = 0 THEN
      RAISE EXCEPTION '038: probe B updated 0 rows — RLS blocked it before the trigger ran, so this probe certifies nothing. Aborting.';
    END IF;
    RAISE EXCEPTION '038: probe B FAILED — a customer CAN null out status, which launders a terminal row past the guard in one extra PATCH. Refusing to commit.';
  EXCEPTION
    WHEN check_violation THEN
      v_blocked := true;
    WHEN not_null_violation THEN
      v_blocked := true;   -- section 1's constraint caught it first; equally fine
  END;
  RESET ROLE;
  IF NOT v_blocked THEN
    RAISE EXCEPTION '038: probe B did not reach a verdict. Refusing to commit.';
  END IF;

  -- ═══ PROBE C — backdating: created_at rewrite ═══
  v_blocked := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub',  v_owner::text,   true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    IF auth.uid() IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION '038: auth.uid() returned % but the probe identity is % — this deployment''s auth.uid() reads a GUC this migration does not set, so RLS would filter every probe and none could certify the guard. Aborting.', auth.uid(), v_owner;
    END IF;

    UPDATE public.generations
       SET created_at = v_created - INTERVAL '400 days'
     WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;

    IF v_rows = 0 THEN
      RAISE EXCEPTION '038: probe C updated 0 rows — RLS blocked it before the trigger ran, so this probe certifies nothing. Aborting.';
    END IF;
    RAISE EXCEPTION '038: probe C FAILED — a customer CAN backdate created_at and pull an in-flight generation into the refund window. Refusing to commit.';
  EXCEPTION
    WHEN check_violation THEN
      v_blocked := true;
  END;
  RESET ROLE;
  IF NOT v_blocked THEN
    RAISE EXCEPTION '038: probe C did not reach a verdict. Refusing to commit.';
  END IF;

  -- ═══ PROBE D — NON-REGRESSION: processing -> completed MUST still work ═══
  --     This is the transition all nine studios perform on every successful
  --     generation. If the guard blocks it, the product is down.
  --
  --     A synthetic row is created and the whole subtransaction is rolled back
  --     afterwards, so no real generation and no ledger row is touched.
  v_probe_id := gen_random_uuid();
  BEGIN
    INSERT INTO public.generations (id, user_id, studio, model, input, credits_used, status)
    VALUES (v_probe_id, v_owner, 'creator', '038-probe', '{}'::jsonb, 0, 'processing');

    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub',  v_owner::text,   true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    IF auth.uid() IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION '038: auth.uid() returned % but the probe identity is % — this deployment''s auth.uid() reads a GUC this migration does not set, so RLS would filter every probe and none could certify the guard. Aborting.', auth.uid(), v_owner;
    END IF;

    UPDATE public.generations SET status = 'completed' WHERE id = v_probe_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;

    IF v_rows <> 1 THEN
      RAISE EXCEPTION '038: probe D updated % row(s), expected 1 — could not verify that the studios still work. Aborting.', v_rows;
    END IF;

    -- Undo the synthetic row by aborting this subtransaction. A private
    -- SQLSTATE, not a message-text sentinel: matching on SQLERRM would also
    -- swallow any unrelated P0001 carrying the same text, and is one stray
    -- format specifier away from no longer matching itself. Note there is no
    -- WHEN OTHERS — every other error propagates and aborts the migration.
    RAISE EXCEPTION 'probe D rollback' USING ERRCODE = 'PD038';
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION '038: probe D FAILED — the guard BLOCKED a legitimate processing -> completed write. This would break all nine studios. Refusing to commit.';
    WHEN SQLSTATE 'PD038' THEN
      NULL;  -- expected: the subtransaction rollback removed the synthetic row
  END;
  RESET ROLE;

  -- ═══ PROBE E — NON-REGRESSION: completed -> failed MUST still work ═══
  --     prompt-builder/route.ts:81 performs exactly this when the model's
  --     output fails to parse after the row was inserted as 'completed'.
  v_probe_id := gen_random_uuid();
  BEGIN
    INSERT INTO public.generations (id, user_id, studio, model, input, credits_used, status)
    VALUES (v_probe_id, v_owner, 'prompt-builder', '038-probe', '{}'::jsonb, 0, 'completed');

    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub',  v_owner::text,   true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    IF auth.uid() IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION '038: auth.uid() returned % but the probe identity is % — this deployment''s auth.uid() reads a GUC this migration does not set, so RLS would filter every probe and none could certify the guard. Aborting.', auth.uid(), v_owner;
    END IF;

    UPDATE public.generations SET status = 'failed' WHERE id = v_probe_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RESET ROLE;

    IF v_rows <> 1 THEN
      RAISE EXCEPTION '038: probe E updated % row(s), expected 1. Aborting.', v_rows;
    END IF;

    RAISE EXCEPTION 'probe E rollback' USING ERRCODE = 'PE038';
  EXCEPTION
    WHEN check_violation THEN
      RAISE EXCEPTION '038: probe E FAILED — the guard BLOCKED a legitimate completed -> failed write (prompt-builder/route.ts:81). Refusing to commit.';
    WHEN SQLSTATE 'PE038' THEN
      NULL;  -- expected: the subtransaction rollback removed the synthetic row
  END;
  RESET ROLE;
END
$$;

-- Belt and braces: the probes above each RESET ROLE on every path, but a
-- COMMIT under the wrong role would be a bad way to find a gap.
RESET ROLE;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Record the migration, and report the outcome as a ROW
--
--    apply.js:113-118 prints result arrays but discards NOTICE/WARNING, so the
--    final statement before COMMIT is a SELECT. If you do not see this row,
--    the migration did not apply.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     TEXT PRIMARY KEY,
  description TEXT,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.schema_migrations (version, description)
VALUES ('038', 'generations lifecycle guard: a row may only be in the reconciler scan window if it already was; status NOT NULL; created_at immutable; DELETE revoked')
ON CONFLICT (version) DO UPDATE SET applied_at = NOW();

SELECT
  '038 OK — probes A/B/C blocked, D/E permitted' AS result,
  (SELECT tgenabled FROM pg_trigger
    WHERE tgrelid = 'public.generations'::regclass
      AND tgname  = 'generations_lifecycle_guard')                       AS guard,
  (SELECT attnotnull FROM pg_attribute
    WHERE attrelid = 'public.generations'::regclass
      AND attname  = 'status')                                           AS status_not_null,
  -- Looked up through pg_roles so a missing role yields NULL rather than
  -- raising 42704 and rolling the whole migration back at its last statement.
  (SELECT has_table_privilege(r.oid, 'public.generations', 'DELETE')
     FROM pg_roles r WHERE r.rolname = 'authenticated')                  AS authed_can_delete,
  (SELECT has_table_privilege(r.oid, 'public.generations', 'DELETE')
     FROM pg_roles r WHERE r.rolname = 'anon')                           AS anon_can_delete;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPECTED OUTPUT
--
--   result           = '038 OK — probes A/B/C blocked, D/E permitted'
--   guard            = 'A'      (ENABLE ALWAYS; 'O' means section 2's ALTER
--                                did not take — investigate)
--   status_not_null  = true
--   authed_can_delete= false    ┐ if either is TRUE the REVOKE in section 3
--   anon_can_delete  = false    ┘ no-opped because supabase_admin is not the
--                                 grantor (022:151-164). The refund loop is
--                                 STILL CLOSED — section 2 does that — but the
--                                 rate limiter remains resettable. Re-run as
--                                 the table owner:
--                                   REVOKE DELETE ON public.generations
--                                     FROM PUBLIC, anon, authenticated;
--
-- Anything else, or no row at all, means it did not apply. Check the rollback
-- block in the header.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. VERIFICATION — run AFTER applying
-- ═══════════════════════════════════════════════════════════════════════════
--
-- -- (a) The reconciler must still be scheduled and succeeding. Key on the
-- --     NAME, never the jobid: 029:9-10 says the monthly credits reset is
-- --     jobid 1 and 033:21-22 says the reconciler is jobid 2, so a jobid-based
-- --     check confirms the wrong job.
-- SELECT jobid, jobname, schedule, active FROM cron.job
-- WHERE jobname = 'reconcile-orphaned-generations';
-- -- expect: one row, '*/15 * * * *', active = true
--
-- SELECT status, return_message, start_time FROM cron.job_run_details
-- WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'reconcile-orphaned-generations')
-- ORDER BY start_time DESC LIMIT 3;
-- -- expect: 'succeeded'
--
-- -- (b) From the BROWSER, logged in as a normal account, against your own
-- --     COMPLETED generation. All four must fail; the fourth is the two-step
-- --     laundering sequence that defeated the first draft:
-- --   PATCH /rest/v1/generations?id=eq.<own completed>  {"status":"processing"}   -> 400
-- --   PATCH /rest/v1/generations?id=eq.<own completed>  {"created_at":"2020-01-01T00:00:00Z"} -> 400
-- --   DELETE /rest/v1/generations?id=eq.<own>                                     -> 401/403
-- --   PATCH {"status":null} then PATCH {"status":"processing"}                    -> 400 on the FIRST call
--
-- -- (c) The studios must still work: run one real generation in each of the
-- --     nine studios and confirm it reaches 'completed'.
--
-- -- (d) WATCH FOR THE SILENT FAILURE MODE. Every terminal-status write in the
-- --     studios discards its error (creator/route.ts:252-259 et al), so a
-- --     write the guard rejects does NOT surface as a 500 — the route returns
-- --     success while the row stays 'processing', and the reconciler then
-- --     refunds it. For the first hour after applying:
-- SELECT studio, status, count(*) FROM public.generations
-- WHERE created_at > now() - INTERVAL '1 hour'
-- GROUP BY 1, 2 ORDER BY 1, 2;
-- -- expect: no unexpected accumulation in 'processing'. Anything piling up
-- -- there is the guard rejecting a write nobody is checking -> roll back
-- -- (header) and investigate.
--
-- ── RESIDUAL RISK — what this migration does NOT fix ────────────────────────
--
-- 1. Rows already rewound BEFORE this applied are not remediated. The guard
--    blocks new rewinds; it does not undo old ones. Run the forensics in
--    docs/ before/after applying — a legitimately in-flight row has no output,
--    a rewound one does:
--      SELECT id, user_id, status, created_at, (output IS NOT NULL) AS has_output
--      FROM public.generations
--      WHERE status IN ('pending','processing') AND output IS NOT NULL;
--
-- 2. The studios swallow their own status-write errors (see (d)). Fixing that
--    is a separate code change — apply the `mustSucceed` idiom already used in
--    app/api/stripe/webhook/route.ts:56-64 to the nine studio routes.
--
-- 3. A row can still be stranded at status='failed' with owed > 0 when a route
--    marks it terminal before a refund that then fails (analysis/route.ts:93-95
--    and the same shape in creator/campaign). The reconciler never scans
--    'failed'. Repair by paying directly, NOT by rewinding:
--      SELECT public.refund_credits(<user_id>, <owed>, 'manual repair: <why>', <generation_id>);
--
-- 4. `assets` still has a FOR ALL policy (003:53) with no column or write
--    restriction. Nothing derives money or quota from assets rows, so it is
--    not a payout path — but it is the same defect class and is not closed
--    here.
-- ═══════════════════════════════════════════════════════════════════════════
