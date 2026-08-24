# Financial and Generation Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make credits, generations, assets, Stripe effects, Admin adjustments, and reconciliation server-owned, transaction-safe, and retry-safe through production.

**Architecture:** Add lifecycle and Stripe RPCs in additive migration 039, move every application writer to those boundaries, then apply enforcement migration 040 and replace the status-based reconciler in place.

**Tech Stack:** Next.js 15, TypeScript strict, Supabase/Postgres PL/pgSQL, Stripe SDK/Webhooks, Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-18-financial-generation-integrity-design.md`

## Global Constraints

- Complete the Security Containment plan first; consume its test harness and migration 038.
- Consume the isolated Staging/Stripe-Test environment and core fixtures created
  by Program Integration Task 3; do not postpone that bootstrap to this plan.
- Do not edit migrations 001–038; this plan creates only 039 and 040.
- A route never returns model output before `completeGeneration()` succeeds.
- Free watermark failure, persistence failure, or completion failure terminates the request and refunds the remaining reservation.
- Preserve `credit_transactions` and the subscription/purchased pool split from migration 033.
- Historical repair remains read-only until Muhammad separately approves exact rows and amounts.
- Stripe Live receives no fabricated event or replay. All replay and duplicate testing uses Test Mode.
- Stage only named files; never use `git add -A`.

---

### Task 1: Live baseline and legacy financial audit

**Files:**
- Create: `scripts/audits/production-financial-preflight.sql`
- Create: `scripts/audits/production-financial-legacy.sql`
- Modify: `scripts/db-audit-production.ts`

**Interfaces:**
- Consumes: the Test-only/fixed-name Production runners from Security plus the
  environment guard and isolated Staging resources from Program Task 3.
- Produces closed read-only financial baselines before any financial write.

- [ ] **Step 1: Reverify the inherited environment boundary**

Run `npm run verify:test-env` and `npm run verify:staging-fixtures`. Fail if a
Stripe key is Live, Staging shares a Production origin, or protected fixtures are
missing. Output contains key names/status only, never values.

- [ ] **Step 2: Write read-only Production SQL**

Add the closed audit names `financial-preflight` and `financial-legacy` to
`scripts/db-audit-production.ts`. Each mapped file contains exactly one
top-level `SELECT jsonb_build_object(...)` statement, has no transaction control,
and is executed inside the runner's PostgreSQL read-only transaction.

`production-financial-preflight.sql` verifies:

- schema migrations 022–038 or equivalent object fingerprints for pre-ledger migrations;
- RLS and table grants on profiles, ledgers, webhooks, projects, generations, and assets;
- service-only execute on credit and limiter RPCs;
- current cron jobs and last run details;
- migration 033 pool columns and top-up uniqueness;
- no open non-service policy.

`production-financial-legacy.sql` reports, without updating:

- stale processing rows and net ledger amount;
- usage rows without generations;
- candidate profile/ledger differences ordered by `(created_at,id)` and
  cross-checked against reservations/grants; `balance_after` is diagnostic, not
  proof of a bad balance;
- duplicate Stripe event, invoice, payment-intent, or subscription identifiers;
- duplicate non-null `profiles.stripe_customer_id`, and active Stripe-linked
  profiles/intents with missing or conflicting customer ownership;
- assets without canonical storage fields.

- [ ] **Step 3: Run baseline commands**

```powershell
npm run verify:test-env
npm run db:audit:production -- --name=financial-preflight
npm run db:audit:production -- --name=financial-legacy
```

Expected: Production commands are accepted by the read-only guard and print
results without mutations. Store raw output only under ignored release inputs.

- [ ] **Step 4: Commit**

```powershell
git add scripts/audits/production-financial-preflight.sql scripts/audits/production-financial-legacy.sql scripts/db-audit-production.ts
git commit -m "test(finance): add live financial audit guards"
```

---

### Task 2: Migration 039 durable lifecycle and atomic financial RPCs

**Files:**
- Create: `supabase/migrations/039_financial_generation_workflow.sql`
- Create: `tests/db/039_generation_workflow.sql`
- Create: `tests/db/039_stripe_atomicity.sql`
- Create: `tests/financial/generation-idempotency.integration.test.ts`
- Create: `tests/financial/subscription-grant-concurrency.integration.test.ts`
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces request-idempotent lifecycle RPCs, type-scoped Stripe effect markers,
  one subscription-period grant identity, and Admin adjustment exactly as
  defined by the spec.
- Later tasks consume those functions through server-only TypeScript modules.

- [ ] **Step 1: Write failing lifecycle SQL tests**

In one `BEGIN`/`ROLLBACK` test transaction, create isolated users and assert:

- insufficient balance leaves no generation or reservation;
- two calls with one `(user_id,request_id)` return one generation/reservation,
  with the second marked duplicate;
- positive cost creates one generation, one reservation, and one usage row;
- zero cost creates no reservation or ledger row;
- completion inserts all assets and settles once;
- a second completion is rejected without another asset;
- partial refund plus settlement reports net `credits_used`;
- total refunds cannot exceed the reservation;
- `fail_generation` refunds remaining credits once and prevents completion;
- cross-user project and storage paths are rejected;
- subscription/purchased pool splits round-trip exactly.
- after the account-deletion lifecycle terminalizes work, final profile deletion
  cascades generations/reservations instead of being blocked by a restrictive FK;
- a pending-deletion profile cannot start, lease, partially refund, or complete
  work; idempotent terminal failure refunds once but cannot clear an outstanding
  persistence token without its matching terminal receipt.
- persistence begins with a unique token and only a matching terminal receipt
  closes it; advancing the clock past the deadline is not a receipt.
- terminal receipt paths are durable, bounded, unique, and order-independent;
  begin durably stores the complete owner/generation-scoped expected manifest
  with SHA-256 and byte size before any upload;
  exact receipt/asset bucket-path equality succeeds, while missing, extra,
  duplicate, wrong-bucket, or mismatched paths reject completion without an
  asset row, settlement, or another ledger effect;
- `failed`, `aborted`, and `discarded_pending_deletion` receipts cannot authorize
  completion, an unknown remote Storage outcome leaves the receipt open, and a
  zero-asset completion remains valid only when server-derived
  `generations.requires_assets=false`: the four text studios plus Campaign with
  its saved default/explicit `generateImages=false`. The same Campaign request
  with `generateImages=true`, and Creator/Photoshoot/Edit/Voiceover, require at
  least one stored asset. A retry cannot change the saved branch.
- one upload-attempt ID can start at most one remote PUT. After an unknown
  response, an absent probe or elapsed lease cannot close the receipt or permit a
  retry; an `absent -> delayed commit` fixture remains pending, is detected on a
  later pass, and is removed before account deletion can finish.
- begin returns one database-created attempt ID for each canonical expected path;
  only its first prepared-to-in-flight claim succeeds, wrong token/path/user and
  every duplicate claim fail before an uploader is authorized.
- a token-matched timeout/abort marks only that in-flight attempt `unknown`; a
  crash after claim cannot strand it because the reconciliation claim atomically
  promotes lease-expired in-flight rows to unknown without allowing another PUT.
  Test crashes both before network admission and after admission/delayed commit.

- [ ] **Step 2: Write failing Stripe and Admin SQL tests**

Assert:

- two calls with one event ID produce one business effect and one ledger row;
- a pre-cutover `webhook_events.processed=false` marker is retried and completed;
- two different event IDs with one derived `invoice:<id>` or
  `payment_intent:<id>` key produce one effect;
- distinct legitimate state events for one subscription do not collide;
- a rejected effect rolls back the event marker;
- `apply_stripe_event` accepts the authoritative Stripe customer, not a user ID,
  resolves exactly one profile through the unique customer mapping, and rejects
  missing/deleted/duplicate/cross-customer ownership before marker, grant,
  profile, or ledger mutation. Checkout-intent Session/PaymentIntent/
  Subscription IDs must belong to that same user/customer;
- subscription state never comes from an embedded event snapshot;
- two conflicting subscription events with the same `event.created` delivered in
  reverse order both normalize from the current Stripe Subscription and cannot
  regress profile status/plan or add a second ledger/grant effect;
- invoice then monthly cron, monthly cron then invoice, concurrent invoice/cron,
  and retries produce one `(subscription_id,period_start,period_end)` grant/reset;
- a changed Stripe billing anchor uses its persisted observed period; a missing
  authoritative period makes recovery cron grant nothing;
- `checkout.session.completed` links subscription/state but grants no recurring
  credits; only the exact retrieved paid invoice persists an eligible period;
- `subscription_create` and `subscription_cycle` each grant once only when the
  retrieved invoice has exactly one quantity-1, non-proration, allowlisted paid
  recurring line with a full period and positive `amount_paid`;
- `subscription_update`, threshold/manual/legacy/zero-paid invoices, unknown
  prices, prorations, quantity changes, missing periods, and multi-line invoices
  persist an explicit ineligible reason and grant nothing;
- invoice-line pagination includes a hidden second-page extra/proration line;
  `has_more`, page failure, or the fixed total cap can never be treated as one
  eligible line;
- `invoice.paid` and `invoice.payment_succeeded` for the same invoice converge on
  one invoice decision, one `source_invoice_line_id`, and one grant;
- a late paid invoice for period A after B is applied records A once as
  `historical_report_only` but cannot refill/overwrite B's partially spent
  balance; same-start/different-period ambiguity also mutates nothing, and
  checkout+invoice cannot double-grant;
- final profile deletion nulls the marker user reference but retains paid-invoice
  period/grant identities for audit/idempotency;
- `begin_stripe_checkout` inserts one idempotent `creating` fence before external
  work and rejects pending deletion; attachment is one-time, while a local
  creating/nonterminal row blocks account finalization without a clock shortcut;
- an eight-day webhook marker survives both cleanup functions while a marker
  older than 400 days is removed;
- `adjust_credits` changes profile and ledger together and rejects a result below zero.

- [ ] **Step 3: Confirm both tests fail before migration**

```powershell
npm run db:test -- tests/db/039_generation_workflow.sql
npm run db:test -- tests/db/039_stripe_atomicity.sql
```

Expected: missing table/function failure.

- [ ] **Step 4: Implement schema and lifecycle RPCs**

Create every table/column/index from the spec in one `BEGIN/COMMIT`, including
nullable legacy `generations.request_id`, server-derived
`generations.requires_assets`, durable per-path upload-attempt identity/state, the partial unique
`(user_id,request_id)` index, `stripe_business_effects`,
`subscription_billing_periods`, and `subscription_credit_grants`. Reservation
foreign keys use `ON DELETE CASCADE`
to preserve the repository's existing account-deletion contract; billing/grant
audit markers use nullable `user_id ... ON DELETE SET NULL` so final account
deletion does not erase Stripe idempotency evidence. Add a unique
partial index that permits at most one `usage` ledger entry per paid generation.
Create the partial unique `profiles.stripe_customer_id` index only after the
read-only baseline proves no duplicate; a duplicate/missing active mapping blocks
the migration and is reported, never auto-reassigned. Persist customer ID on
business-effect/period/grant audit rows.
Implement lifecycle RPCs with row locks and pool-aware calls to migration 033.

Create `stripe_checkout_intents` from the spec plus service-only
`begin_stripe_checkout`/`attach_stripe_checkout_session`. The begin RPC locks the
profile, rejects deletion pending, and returns one row per user/request UUID.
Attach cannot overwrite a different Session and reports the pending flag so the
server expires/reconciles rather than returning an untracked URL. Stripe webhook
effects update this same row transactionally.

`start_generation` requires `p_request_id`. On conflict it locks and returns the
existing lifecycle state/output; only the transaction that inserted the row may
reserve credits. It derives `requires_assets` from the studio and saved validated
input inside the RPC: Campaign uses boolean `input.generateImages` with false as
the default, while callers cannot select the branch. A duplicate processing/
failed/completed result is explicit so the route never calls the provider twice
or change the original Campaign mode.

Add `profiles.deletion_pending_at`,
`generations.persistence_lease_expires_at`, token/terminal-receipt fields, and
service-only `begin_generation_persistence`/`finish_generation_persistence`.
Start/lease/refund/complete lock and reject a pending profile. A short bounded
persistence lease and unique token are required before Storage upload; the
uploader records a token-matched terminal receipt only after its request settles.
Only the token-matched finish RPC after every Storage call settles clears the
lease. Financial completion/failure alone never fabricates that receipt. Expiry
is never a receipt and never lets the later account-deletion worker finalize an
identity.

Create one `generation_persistence_attempts` row per expected path and the
service-only token-matched `claim_generation_persistence_attempt` plus
`mark_generation_persistence_attempt_unknown` RPCs. Mark accepts only
`in_flight -> unknown`, database time, and the fixed timeout/disconnect/abort/
Storage-5xx/worker-exit reason enum; it accepts no path or clock and never
authorizes Storage. SQL/wrapper tests cover each value and reject arbitrary text.

Add `persistence_expected_paths` and `persistence_receipt_paths`. Begin
canonicalizes the complete unique bucket/path/SHA-256/size manifest before any
upload; finish canonicalizes and stores the resolved bounded bucket/path set in
the same transaction as receipt status. Under the
generation lock, `complete_generation` compares exact order-independent sets
before inserting assets or settling credits; URLs are irrelevant and duplicate,
missing, or extra pairs fail the transaction. A terminal status/path set cannot
be overwritten by another token or payload. A local timeout with unknown remote
outcome stays receipt-pending until deterministic-path reconciliation proves the
Storage result.

The null-token/zero-asset branch checks stored, server-derived
`generations.requires_assets=false`. It covers Analysis, Plan, Storyboard,
Prompt Builder, and Campaign whose saved `input.generateImages=false`. Creator,
Photoshoot, Edit, Voiceover, and Campaign with `generateImages=true` require a
nonempty manifest, stored receipt, and exact asset set.

Validate `p_output` as non-delivery metadata and derive all durable/returned
asset references inside the transaction from the inserted asset IDs plus the
exact `p_assets` bucket/path set.
Reject raw provider/data/arbitrary delivery URLs in caller output. Return the
canonical saved output from `complete_generation`; routes never return their
pre-save provider object.

The expected-manifest validator permits only `assets` or the reserved future
`generated-assets` bucket plus the owned generation prefix. Migration 039 still
rejects private completion through its descriptor predicate. `stored` requires
the exact expected set with verified size/checksum; failed/discarded partial sets
exist only for cleanup and cannot authorize completion.

Add service-only `claim_generation_persistence_reconciliation(p_batch_size)`.
It accepts only batch 1–25 and no path/timestamp/cursor/sort/backoff, selects at
most that total from the union of due unknown and lease-expired in-flight rows by
durable `next_check_at,id` with `SKIP LOCKED`, and changes only selected expired
rows to `unknown` with database time/reason. This recovers process crashes without
issuing another PUT or an unbounded outage update. It atomically increments
attempts/advances the fixed exponential backoff to at most 15 minutes before
returning the stored expected manifest/token plus lifecycle state. An unresolved
row therefore leaves the eligible head and cannot starve later due work. The worker
can finish the matching token after Storage verification but cannot complete a
generation or refund/settle credits.

Persist one generated upload-attempt UUID/state per expected path before sending
the only allowed `upsert:false` PUT. Unknown transport outcomes forbid another
PUT and remain receipt-pending. An observed timeout/abort must call the exact
unknown transition; an unreported crash reaches it only through expired-lease
promotion. Stale in-flight and unknown states both block deletion and feed worker
health. An absent metadata probe is not terminal; only a
confirmed response, a documented pre-commit non-admission, or later observation
of the exact committed object can resolve the attempt. Once that sole unknown PUT
is observed committed, validate it and either store it or delete/verify absence
for failed/deletion-pending work. If it never appears, keep the receipt/account
tombstone pending and alert rather than guessing.

For `complete_generation`, validate each JSON asset with the private internal
`public.is_valid_generation_asset_descriptor(p_user_id UUID,
p_generation_id UUID, p_asset JSONB) RETURNS BOOLEAN` before inserting.
Migration 039's predicate accepts only the public shape below; revoke execute
from `PUBLIC/anon/authenticated`. Migration 041 may replace only that exact
predicate signature, not re-author the lifecycle function:

```sql
(asset->>'storage_bucket') = 'assets'
AND (asset->>'storage_path') LIKE p_user_id::text || '/generations/' || p_generation_id::text || '%'
AND (asset->>'type') IN ('image', 'audio', 'video')
```

In 039 the public compatibility descriptor additionally requires a non-empty
canonical public `url`; private `generated-assets` descriptors are deliberately
not accepted until 041 widens the database contract. Reject arrays over 20 items
and output JSON over 1 MiB. Update generation, insert assets, and settle the
reservation inside one transaction.

- [ ] **Step 5: Implement Stripe and adjustment RPCs**

Add `event_created_at` to `webhook_events`; do not trust a caller-provided
`business_key`. Store derived keys in `stripe_business_effects`. Retain events
for at least 400 days by replacing both `cleanup_webhook_events()` and the
webhook branch of `cleanup_stale_records()`; preserve migration-038 limiter
cleanup and verify every live cron caller.

`apply_stripe_event` must:

1. validate `p_effect.kind` and required fields;
2. lock/reuse an existing event row and retry `processed=false` markers;
3. derive the exact type-scoped key from validated effect fields;
4. insert `stripe_business_effects` with `ON CONFLICT DO NOTHING` and return
   duplicate only when an applied effect exists;
5. lock the profile and apply only a current Stripe-normalized subscription
   state; `event_created_at` is audit data, not ordering authority;
6. change profile, append ledger rows, and set `processed=true`;
7. return only after the transaction commits.

Treat the exact retrieved paid invoice as the sole authority for its subscription
period. `checkout.session.completed` links identity/current state but grants no
recurring credits. Normalize `invoice.paid` and `invoice.payment_succeeded` to
one invoice-scoped effect, retrieve that invoice ID, and persist its decision,
`source_invoice_id`, and `source_invoice_line_id` inside the same business-effect
transaction. Mark eligible only `subscription_create` or `subscription_cycle`
with `paid=true`, `status='paid'`, positive `amount_paid`, and exactly one
quantity-1, non-proration recurring line whose price maps to a paid `PLANS`
entry and whose period is valid. Derive plan/credits from that line, never the
profile/current Subscription. Retrieve invoice lines through Stripe's paginated
line-list endpoint to exhaustion with a fixed total cap; never infer exactly one
line from the embedded first page or `has_more`. Persist every other billing reason, zero-paid,
unknown, proration, quantity, missing-period, or multi-line case as ineligible
with a reason, grant nothing, and alert. This is the fail-closed policy for
free trials and 100%-discount invoices until Muhammad separately approves one.
Replace `reset_monthly_credits()` as recovery-only using the existing
reset/payment guards: it may consume only a stored `eligible` period and attempt
the same `subscription_credit_grants` insert as invoice handling. It never
derives a period from `now()` or `credits_reset_date`; a missing authoritative
period grants nothing and is left for Stripe-side recovery. Only the marker
insert winner updates credits/ledger. Changed-anchor, late-A-after-current-B,
checkout+invoice, cron-first, retry, and concurrent integration tests must prove
one balance/ledger change per paid invoice period. Under the profile lock, an
eligible period may reset/advance balance only when its `period_start` is
strictly newer than `subscription_period_cursor_start`; older or ambiguous
periods still consume the durable marker as `historical_report_only` with zero
applied credits and require a separately approved make-good instead of mutating
the current balance.

`adjust_credits` locks the profile, calculates the new combined balance, rejects negative results, updates the correct pool defined by the existing Admin behavior, and inserts an `admin_adjustment` ledger row.

- [ ] **Step 6: Lock all new functions**

Explicitly:

```sql
REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ... TO service_role;
```

Enable RLS and revoke direct client privileges on `generation_reservations`,
`stripe_business_effects`, `subscription_billing_periods`, and
`subscription_credit_grants`. Record schema migration `039`.

- [ ] **Step 7: Re-run database suites and update generated types**

```powershell
npm run db:test -- tests/db/039_generation_workflow.sql
npm run db:test -- tests/db/039_stripe_atomicity.sql
npm run test:integration -- tests/financial/generation-idempotency.integration.test.ts tests/financial/subscription-grant-concurrency.integration.test.ts
npm run typecheck
```

Expected: both SQL files reach `ROLLBACK` with no retained fixtures; generated TypeScript declarations match the new columns/RPCs.

- [ ] **Step 8: Commit**

```powershell
git add supabase/migrations/039_financial_generation_workflow.sql tests/db/039_generation_workflow.sql tests/db/039_stripe_atomicity.sql tests/financial/generation-idempotency.integration.test.ts tests/financial/subscription-grant-concurrency.integration.test.ts lib/supabase/types.ts
git commit -m "feat(finance): add durable generation and Stripe transactions"
```

---

### Task 3: Server workflow and fail-closed asset persistence

**Files:**
- Create: `lib/generations/workflow.ts`
- Create: `lib/api/generation-request.ts`
- Create: `lib/storage/persist-audio.ts`
- Create: `lib/storage/persistence-reconciler.ts`
- Modify: `lib/storage/persist-image.ts`
- Modify: `lib/image/watermark.ts`
- Modify: `lib/credits/deduct.ts`
- Test: `tests/financial/generation-workflow.test.ts`
- Test: `tests/financial/generation-request.test.ts`
- Test: `tests/financial/persist-image.test.ts`
- Test: `tests/financial/persist-audio.test.ts`
- Test: `tests/financial/persistence-reconciliation.test.ts`

**Interfaces:**
- Consumes: Task 2 RPCs.
- Produces the request-key validator/client UUID helper plus
  `StartedGeneration`, `PersistedGenerationAsset`, and workflow functions from
  the spec.

- [ ] **Step 1: Write workflow mapping tests**

Mock the service-role client and assert each wrapper maps snake_case RPC output,
passes the validated request UUID, exposes duplicate lifecycle state/saved
output, returns only completion's canonical saved output, throws
`GenerationWorkflowError` on PostgREST error or
`{success:false}`, never accepts a caller-supplied Supabase client, and never
reads a user ID from request data. Test that missing/malformed
`Idempotency-Key` is rejected and client UUID creation is one UUID per requested
operation. Assert `beginGenerationPersistence` returns a bounded lease plus its
token, `account_deletion_pending` prevents provider/upload work, a batch passes
one token to every parallel upload, and terminal financial failure cannot clear
or harmlessly duplicate a missing persistence receipt.

- [ ] **Step 2: Write persistence policy tests**

Cover:

- Free + watermark success + upload success returns descriptor with `applied:true`.
- Free + watermark failure throws `WatermarkProcessingError` and exposes no source URL.
- Free + upload failure throws and exposes no clean/data fallback.
- Paid + upload failure throws rather than returning provider URL.
- Stored path begins `<user>/generations/<generation>` and reported format matches magic bytes.
- Audio upload failure throws and returns no empty URL.
- No image/audio Storage upload occurs until the workflow has acquired a current
  generation-wide persistence token and passes it to every asset helper.
- After all parallel Storage requests settle, the workflow presents that one
  token plus the complete bounded path set to the terminal-receipt RPC; an
  expired clock without that receipt never counts as drained.
- A pending account turns a late successful upload into
  `discarded_pending_deletion`; it is not returned and its path is swept later.
- Preparation computes the exact bounded path/SHA-256/size manifest before begin;
  helpers cannot upload a path absent from that stored manifest. An unknown
  timeout is claimed later, checks only those deterministic paths, removes any
  object for failed/deleting work, and leaves Storage outage pending without a
  second refund or completion.

- [ ] **Step 3: Verify current behavior fails**

```powershell
npm run test -- tests/financial/generation-workflow.test.ts tests/financial/generation-request.test.ts tests/financial/persist-image.test.ts tests/financial/persist-audio.test.ts tests/financial/persistence-reconciliation.test.ts
```

Expected: FAIL because persistence returns strings/fallback URLs and no lifecycle wrapper exists.

- [ ] **Step 4: Implement server workflow wrappers**

Create one memoized service-role client that clears a rejected initialization
promise. Implement exact interfaces from the spec, including `requestId` and
duplicate state plus `beginGenerationPersistence` and the token-matched
`finishGenerationPersistence`, and add the exact
`claimGenerationPersistenceAttempt` and
`markGenerationPersistenceAttemptUnknown` wrappers. Begin returns the database-created
attempt ID mapped to every canonical bucket/path; claim changes that one prepared
row to in-flight once. `lib/api/generation-request.ts`
validates the request header as a UUID and exports a browser-safe
`createGenerationRequestId()` helper. Validate RPC data with small local Zod
schemas before returning typed results.

- [ ] **Step 5: Make image persistence fail closed**

Change `persistGeneratedImage` to return `PersistedGenerationAsset`. Remove unused `maybeWatermark`, `watermarkAndReupload`, and `hasWatermarkFlag` fail-open exports after confirming zero call sites. Keep `urlToBuffer` and `applyWatermark`.

The workflow prepares final bounded bytes/watermark first, computes the complete
deterministic bucket/path/SHA-256/size manifest, and acquires one durable
generation-wide token immediately before the batch. Begin creates/returns one
attempt ID for each exact bucket/path. The workflow passes the mapped token and
attempt ID into every `persistGeneratedImage` call; immediately before its only
PUT the helper must win `claimGenerationPersistenceAttempt`. A failed/duplicate/
in-flight claim sends no Storage request. Helpers cannot begin or finish leases independently.
Upload with `upsert:false` to deterministic
unique paths; after `Promise.allSettled`, call the finish RPC once with every
created path and the aggregate terminal status only when every remote outcome is
authoritatively known. A local timeout/rejection with unknown remote outcome
must first mark every affected in-flight attempt unknown through the original
token, then fails/refunds the customer operation but leaves the receipt open for a bounded
deterministic-path reconciliation worker; `Promise.allSettled` alone is not drain
proof. Return bucket, path, URL, byte
size, format, and watermark metadata. Any conversion, watermark, lease, or upload
error throws a typed error. Use a bounded transport deadline shorter than the
lease and record `stored`, `failed`, or `aborted` only after all Storage outcomes
are known. If the token-matched receipt reports account deletion pending, record
the uploaded path as `discarded_pending_deletion`, expose no URL, and let the
deletion worker sweep it after that receipt. Never return an incoming
provider/data URL.

Implement `persistence-reconciler.ts` with a fixed batch claim. In the same
transaction, its service RPC selects/promotes/claims no more than the requested
1–25 rows across expired in-flight and due unknown work; this is
the crash-recovery path and can never authorize another PUT. For each unknown
manifest it uses service Storage metadata/download as needed to prove size and
SHA-256, never fetches a remote/provider URL, and never accepts a caller path. A
negative probe leaves the sole attempt unknown and starts no retry. If its exact
object later appears, that observation closes the one possible in-flight PUT;
for failed/refunded/deletion-pending work remove it, verify absence, and only then
finish the original token as failed/discarded. If the object never appears, keep
the durable receipt and account tombstone pending with a bounded alert. The
worker never completes, settles, calls a provider, or refunds.
Use more than 25 permanent-absent fixtures plus delayed commits outside the first
batch; repeated/concurrent claims must make fair progress to every due row
without duplicate work, while future-backoff rows are not immediately reclaimed.
Also seed more than 25 lease-expired in-flight attempts and assert each claim
transaction promotes/returns at most 25 while later batches drain them fairly.
Add crash fixtures immediately after claim both before Storage admission and
after admission. After lease expiry each becomes unknown/claimable, emits no
second PUT, keeps the receipt/deletion fence open on absence, and detects/removes
the one delayed commit when it appears.

- [ ] **Step 6: Add audio persistence**

`persistGeneratedAudio` accepts
`{userId,generationId,leaseToken,attemptId,buffer,format:'mp3'}`, requires the
workflow's generation-wide token and one successful attempt claim before
Storage, and returns the descriptor shape
with `type:'audio'`, `watermark.required=false`, and deterministic path.
The batch owner, not the helper, writes the same terminal-receipt/discard result
as images. Zero-length,
pending-account, expired-lease, or failed upload throws; clock expiry without a
receipt never authorizes deletion finalization.

- [ ] **Step 7: Deprecate direct credit wrappers for studio use**

Keep existing wrappers only for untouched compatibility call sites, mark them server-only, and add comments that studios must use lifecycle workflow. Do not remove database functions still used by migration 039 internals.

- [ ] **Step 8: Run and commit**

```powershell
npm run test -- tests/financial/generation-workflow.test.ts tests/financial/generation-request.test.ts tests/financial/persist-image.test.ts tests/financial/persist-audio.test.ts tests/financial/persistence-reconciliation.test.ts
npm run typecheck
npm run check:invariants
git add lib/generations/workflow.ts lib/api/generation-request.ts lib/storage/persist-audio.ts lib/storage/persist-image.ts lib/storage/persistence-reconciler.ts lib/image/watermark.ts lib/credits/deduct.ts tests/financial/generation-workflow.test.ts tests/financial/generation-request.test.ts tests/financial/persist-image.test.ts tests/financial/persist-audio.test.ts tests/financial/persistence-reconciliation.test.ts
git commit -m "feat(generations): centralize durable completion and persistence"
```

---

### Task 4: Cut over the four text studios

**Files:**
- Modify: `app/api/studios/analysis/route.ts`
- Modify: `app/api/studios/plan/route.ts`
- Modify: `app/api/studios/storyboard/route.ts`
- Modify: `app/api/studios/prompt-builder/route.ts`
- Modify: `app/[locale]/(dashboard)/analysis/page.tsx`
- Modify: `app/[locale]/(dashboard)/plan/page.tsx`
- Modify: `app/[locale]/(dashboard)/storyboard/page.tsx`
- Modify: `app/[locale]/(dashboard)/prompt-builder/page.tsx`
- Modify: `components/shared/PromptEnhancer.tsx`
- Test: `tests/financial/text-studio-workflow.test.ts`
- Test: `tests/financial/text-studio-client-idempotency.test.tsx`

**Interfaces:**
- Consumes: Task 3 workflow functions.
- Produces four routes with one start/complete/fail lifecycle and unchanged success payload fields.

- [ ] **Step 1: Write one parameterized contract suite**

For every route assert:

- start happens after auth/input/project validation and before provider call;
- AI success followed by completion failure returns non-2xx and no output;
- provider or parse failure calls `failGeneration` once;
- successful response happens after completion;
- response generation ID is the workflow ID;
- a missing/malformed request key returns 400 before lifecycle/provider calls;
- duplicate processing/failed results return their existing state without a
  provider call, while duplicate completed work replays only saved output;
- Prompt Builder starts `processing` with cost 0 and creates no reservation.

- [ ] **Step 2: Confirm failures against current routes**

```powershell
npm run test -- tests/financial/text-studio-workflow.test.ts tests/financial/text-studio-client-idempotency.test.tsx
```

Expected: FAIL because routes write generation state directly and ignore some completion errors.

- [ ] **Step 3: Convert routes in this order**

For Analysis, Plan, Storyboard, then Prompt Builder:

1. preserve auth, Zod input, settings, plan, project, and prompt checks;
2. require a UUID `Idempotency-Key` and call `startGeneration` with it;
3. return saved output for a completed duplicate, or the existing
   in-progress/failed state, without calling the provider;
4. call the provider and existing JSON extraction only for a new generation;
5. call `completeGeneration` with no assets;
6. return only after completion;
7. route every post-start error through `failGeneration` and then the existing public error mapping.

Delete direct `.from('generations').insert/update` and direct reserve/refund calls from these files.

Each four studio page and `PromptEnhancer` creates one request UUID when the user
submits and sends it as `Idempotency-Key`. A new manual submit creates a new UUID;
the code contains no automatic generation retry.

- [ ] **Step 4: Run focused, DB, and build gates**

```powershell
npm run test -- tests/financial/text-studio-workflow.test.ts tests/financial/text-studio-client-idempotency.test.tsx
npm run db:test -- tests/db/039_generation_workflow.sql
npm run typecheck
npm run build
```

- [ ] **Step 5: Commit**

```powershell
git --literal-pathspecs add app/api/studios/analysis/route.ts app/api/studios/plan/route.ts app/api/studios/storyboard/route.ts app/api/studios/prompt-builder/route.ts "app/[locale]/(dashboard)/analysis/page.tsx" "app/[locale]/(dashboard)/plan/page.tsx" "app/[locale]/(dashboard)/storyboard/page.tsx" "app/[locale]/(dashboard)/prompt-builder/page.tsx" components/shared/PromptEnhancer.tsx tests/financial/text-studio-workflow.test.ts tests/financial/text-studio-client-idempotency.test.tsx
git commit -m "refactor(studios): use durable workflow for text results"
```

---

### Task 5: Cut over image and voice studios

**Files:**
- Modify: `app/api/studios/creator/route.ts`
- Modify: `app/api/studios/photoshoot/route.ts`
- Modify: `app/api/studios/campaign/route.ts`
- Modify: `app/api/studios/edit/route.ts`
- Modify: `app/api/studios/voiceover/route.ts`
- Modify: `app/[locale]/(dashboard)/creator/page.tsx`
- Modify: `app/[locale]/(dashboard)/photoshoot/page.tsx`
- Modify: `app/[locale]/(dashboard)/campaign/page.tsx`
- Modify: `app/[locale]/(dashboard)/edit/page.tsx`
- Modify: `app/[locale]/(dashboard)/voiceover/page.tsx`
- Modify: `components/shared/ModelComparison.tsx`
- Test: `tests/financial/media-studio-workflow.test.ts`
- Test: `tests/financial/media-studio-client-idempotency.test.tsx`
- Modify: `tests/db/039_generation_workflow.sql`

**Interfaces:**
- Consumes: workflow and persistence descriptors from Task 3.
- Produces five routes that persist all deliverables before one atomic completion.

- [ ] **Step 1: Write media route contract tests**

Assert:

- no route inserts generation/assets or updates status directly;
- one provider failure in a product that permits partial delivery produces a bounded partial refund;
- any required watermark/persistence failure terminates the entire request, returns no successful URL, and refunds the full remaining reservation;
- partial refund plus completion sets net credits exactly once;
- Voiceover does not return success with empty audio;
- completion failure after upload returns failure and calls terminal refund;
- all route responses contain only descriptors that were persisted before completion.
- a provider/data URL injected only through caller output is rejected and never
  stored/returned; success uses the canonical output returned by the completion
  RPC;
- inject a different/missing/extra/duplicate bucket-path set between
  `finishGenerationPersistence` and `completeGeneration` and prove the route
  returns no output while SQL creates no asset/settlement/second ledger effect;
- request-key and duplicate behavior matches the four text routes; Model
  Comparison intentionally creates three different keys for its three jobs.
- Campaign default/explicit `generateImages=false` completes as saved text with
  no lease or asset, while `generateImages=true` requires the exact persisted
  image set; replaying either key cannot switch branches.

- [ ] **Step 2: Add mixed-pool partial SQL coverage**

Extend the 039 test with subscription/purchased mixed reservation, partial refund, settlement, and a repeated partial call. Assert returned pool totals and refund cap.

- [ ] **Step 3: Verify current routes fail**

```powershell
npm run test -- tests/financial/media-studio-workflow.test.ts tests/financial/media-studio-client-idempotency.test.tsx
```

Expected: FAIL because routes persist/update independently and some errors are ignored.

- [ ] **Step 4: Convert image routes**

Use the same request-key and duplicate ordering as Task 4. Provider-level partial
failures may reduce delivered count and call `refundGenerationReservation`.
Acquire one generation-wide token, persist every remaining image in parallel
with that token, wait for all attempts, then write one terminal receipt/path set.
If any required persistence/watermark step throws, finish the token with the
aggregate failure, call `failGeneration`, and do not deliver the other images.
If an upload transport ends with unknown remote outcome, fail/refund the
generation but keep the receipt open and schedule deterministic-path
reconciliation; neither `aborted` nor local timeout may pretend the remote write
is drained.

Pass all successful descriptors and non-delivery output metadata to one
`completeGeneration` call. Use its canonical saved output, generation ID, and net
balance in the existing response shape; never return the pre-save provider
object.

- [ ] **Step 5: Convert Voiceover**

Generate TTS, acquire the generation-wide token, call `persistGeneratedAudio`
with it, write the terminal receipt, then complete with one audio descriptor and
return afterward. Provider fallback model is passed to completion so stored
model matches the provider that ran.

All five pages create one request UUID per submit. `ModelComparison` creates one
separate UUID for each of its three intentional generation requests. Send the
header unchanged and add no automatic mutation retry.

- [ ] **Step 6: Run full media gate and commit**

```powershell
npm run test -- tests/financial/media-studio-workflow.test.ts tests/financial/media-studio-client-idempotency.test.tsx tests/financial/persist-image.test.ts tests/financial/persist-audio.test.ts
npm run db:test -- tests/db/039_generation_workflow.sql
npm run typecheck
npm run build
git --literal-pathspecs add app/api/studios/creator/route.ts app/api/studios/photoshoot/route.ts app/api/studios/campaign/route.ts app/api/studios/edit/route.ts app/api/studios/voiceover/route.ts "app/[locale]/(dashboard)/creator/page.tsx" "app/[locale]/(dashboard)/photoshoot/page.tsx" "app/[locale]/(dashboard)/campaign/page.tsx" "app/[locale]/(dashboard)/edit/page.tsx" "app/[locale]/(dashboard)/voiceover/page.tsx" components/shared/ModelComparison.tsx tests/financial/media-studio-workflow.test.ts tests/financial/media-studio-client-idempotency.test.tsx tests/db/039_generation_workflow.sql
git commit -m "refactor(studios): settle media results atomically"
```

---

### Task 6: Cut Stripe and Admin adjustments over to atomic RPCs

**Files:**
- Create: `lib/stripe/webhook-effects.ts`
- Create: `lib/stripe/checkout-intents.ts`
- Modify: `app/api/stripe/webhook/route.ts`
- Modify: `app/api/stripe/create-checkout/route.ts`
- Modify: `app/api/stripe/create-topup/route.ts`
- Modify: `app/api/admin/users/[id]/credits/route.ts`
- Test: `tests/financial/stripe-webhook.test.ts`
- Test: `tests/financial/checkout-intents.test.ts`
- Test: `tests/financial/admin-credit-adjustment.test.ts`

**Interfaces:**
- Consumes: `apply_stripe_event`, checkout-intent RPCs, and `adjust_credits` from Task 2.
- Produces a signature-verifying route that performs exactly one database RPC per business event.

- [ ] **Step 1: Write normalized effect schemas**

In tests, require every supported Stripe event to map to one of the exact effect
kinds/fields in the spec, including checkout session, invoice/payment intent,
dispute, and subscription-period boundaries. Reject a missing or malformed field
before RPC invocation. Assert the application does not supply an arbitrary
business key or user ID; SQL derives the key and resolves ownership from the
authoritatively retrieved Stripe customer.

For every kind, retrieve the authoritative Session/Invoice/Subscription/
PaymentIntent customer (following Dispute to Charge/PaymentIntent when needed),
require a non-deleted customer string, and pass `customerId` to SQL. Reject
metadata-user/customer mismatch, customer/profile mismatch, and local checkout-
intent Session/PaymentIntent/Subscription mismatch before mutation. SQL tests
repeat the checks under the unique profile-customer lock so mapper mistakes also
fail closed.

For both Checkout routes, validate one operation UUID, call
`begin_stripe_checkout` before Stripe, create the Session with the local intent
ID in metadata and a stable POST idempotency key, then attach the Session before
returning its URL. Test a deletion race between Stripe creation and attachment:
the route expires the open Session, returns failure, and the durable `creating`
row remains reconcilable. New Checkout begin is rejected for a pending profile;
no route can return an untracked Session URL.

For subscription-state effects, mock a Stripe Subscription retrieval after
signature verification and require the normalized effect to use that current
status/plan rather than the embedded event snapshot. Separately, require
`invoice.paid` to retrieve that exact invoice ID, verify paid status, fully
paginate its line-list endpoint, and map the only eligible line's
period/price/plan. A hidden next-page line makes it ineligible. Never substitute
the current Subscription period.
When either required lookup fails, the route returns a retryable non-2xx response
and performs no RPC.

- [ ] **Step 2: Write webhook failure/idempotency tests**

Use `stripe.webhooks.generateTestHeaderString` with a Test secret. Assert invalid
signatures return 400; duplicate RPC result returns 200 with no second mutation;
a legacy `processed=false` marker is allowed to retry; RPC failure returns
non-2xx so Stripe retries; and the route never directly inserts
`webhook_events`, updates profiles, or inserts credit rows.
For each effect family, inject a valid signature with conflicting metadata user,
retrieved customer, local checkout-intent customer, Session, Subscription, or
PaymentIntent; require no RPC/mutation. A customer mapped to another profile or
no profile also fails retryably rather than crediting metadata's user.

Assert checkout completion produces no recurring credit grant, late invoice A
after applied period B records report-only with zero balance effect,
checkout+invoice is not double, and a pending-deletion account cannot receive a grant. Its cancellation webhook
may advance the matching account-deletion job/audit state only.
Checkout Session events must also transition the matching local intent from
retrieved Stripe truth. A complete-but-processing payment remains nonterminal;
a payment that succeeds after deletion pending records
`requires_financial_resolution` and grants nothing.

- [ ] **Step 3: Write Admin adjustment tests**

Assert verified Admin auth and validated amount/reason call one `adjust_credits` RPC. RPC error returns failure and no success response; no split profile/ledger calls remain.

- [ ] **Step 4: Implement mapper and route cutover**

`webhook-effects.ts` validates Stripe object fields and returns:

```ts
export interface NormalizedStripeEffect {
  eventId: string;
  eventType: string;
  eventCreatedAt: string;
  customerId: string;
  effect: Record<string, unknown> & {
    kind: 'subscription_checkout' | 'subscription_renewal' |
      'subscription_change' | 'subscription_terminal' | 'payment_failure' |
      'topup' | 'dispute';
  };
}
```

Keep signature verification, current-Subscription state lookups, exact paid-
Invoice lookups, and dunning email outside SQL. Remove manual event check/insert/
processed update and direct financial writes. Call the RPC once and treat a
customer/ownership lookup or database failure as a retryable webhook failure.
Metadata never selects a profile. Grantable effects on
`deletion_pending_at` perform no credit/profile grant mutation.

Implement `checkout-intents.ts` as the only Session-creation boundary for both
routes. It creates/attaches the local fence through typed RPCs, uses the intent
ID for Stripe idempotency/metadata, and expires a returned open Session if attach
cannot commit. It never treats a timeout as proof that Stripe did not create a
Session.

- [ ] **Step 5: Run Test Mode duplicate and out-of-order fixtures**

```powershell
npm run test -- tests/financial/stripe-webhook.test.ts tests/financial/checkout-intents.test.ts tests/financial/admin-credit-adjustment.test.ts
npm run db:test -- tests/db/039_stripe_atomicity.sql
npm run test:integration -- tests/financial/subscription-grant-concurrency.integration.test.ts
npm run typecheck
npm run build
```

Expected: duplicate event/business key produces one ledger effect; conflicting
equal-timestamp/out-of-order events converge to the current Stripe Subscription
without a second grant or ledger mutation.

- [ ] **Step 6: Commit**

```powershell
git add lib/stripe/webhook-effects.ts lib/stripe/checkout-intents.ts app/api/stripe/webhook/route.ts app/api/stripe/create-checkout/route.ts app/api/stripe/create-topup/route.ts app/api/admin/users/[id]/credits/route.ts tests/financial/stripe-webhook.test.ts tests/financial/checkout-intents.test.ts tests/financial/admin-credit-adjustment.test.ts
git commit -m "fix(finance): apply Stripe and Admin effects atomically"
```

---

### Task 7: Migration 040 privilege enforcement and reconciler v2

**Files:**
- Create: `supabase/migrations/040_financial_generation_enforcement.sql`
- Create: `tests/db/040_financial_enforcement.sql`
- Create: `lib/assets/server-repository.ts`
- Create: `lib/assets/deletion-worker.ts`
- Create: `lib/accounts/deletion-worker.ts`
- Create: `app/api/cron/asset-deletions/route.ts`
- Create: `app/api/cron/generation-persistence/route.ts`
- Create: `lib/storage/persistence-worker-health.ts`
- Modify: `middleware.ts`
- Modify: `app/api/assets/[id]/route.ts`
- Modify: `app/api/assets/batch-delete/route.ts`
- Modify: `app/api/admin/users/[id]/route.ts`
- Modify: `.env.test.example`
- Modify: `scripts/check-invariants.ts`
- Modify: `docs/INVARIANTS.md`
- Modify: `lib/supabase/types.ts`
- Test: `tests/financial/asset-delete-authority.test.ts`
- Test: `tests/financial/asset-deletion-worker.test.ts`
- Test: `tests/financial/account-deletion-worker.test.ts`
- Test: `tests/financial/persistence-reconciliation-route.test.ts`
- Test: `tests/financial/persistence-worker-health.test.ts`

**Interfaces:**
- Consumes: complete studio/application cutover.
- Produces read-only customer generation/asset tables, reservation-based
  reconciliation, and retryable asset/account-deletion outboxes.

- [ ] **Step 1: Add a static invariant before enforcement**

Add `server-owned-generation-state` to `scripts/check-invariants.ts`. It fails on direct generation insert/update/delete, asset insert, or direct reserve/refund calls inside `app/api/studios/**`. It allows reads and calls inside approved server workflow modules.

Run:

```powershell
npm run check:invariants -- --only=server-owned-generation-state
```

Expected after Tasks 4–6: PASS.

- [ ] **Step 2: Move customer asset deletion behind server authority**

Write tests proving the route authenticates the user and queues only owned rows
through a service-only RPC. Queueing marks the row pending and creates one job;
repeated delete is idempotent. Customer reads no longer return pending rows.

The worker claims jobs with `SKIP LOCKED`, deletes a canonical object, then
finalizes the row/job. Storage or finalization failure records a bounded attempt
and retry time; it never leaves a visible row whose object was already removed.
No deletion job may fetch, delete, hide, or finalize a legacy URL row. An
explicit request returns `legacy_migration_required`, leaves
the row/pointer visible, and creates no deletion job until a verified canonical
copy exists. Route tests cover immediate processing while the
cron endpoint covers durable retries.

Add the cron path to the middleware's unauthenticated API allowlist, but require
a constant-time `Authorization: Bearer <ASSET_DELETION_CRON_SECRET>` check inside
the route before any job claim. Missing/wrong secrets return 401 and tests prove
the public middleware exception does not make the worker publicly executable.

Expose the Task 3 persistence reconciler through a separate fixed cron route with
the same middleware exception pattern and constant-time
`PERSISTENCE_RECONCILIATION_CRON_SECRET`. It accepts no query/body/path selector,
claims only the RPC's bounded batch, and returns aggregate counts. Missing/wrong
secret performs no claim or Storage call. This worker resolves remote persistence
outcomes only; it never refunds, settles, completes, or invokes a provider.

Register exactly one Coolify schedule named
`pyrasuite-generation-persistence-reconciliation` at `* * * * *`, forbid
overlap, hard-cap each claim at 25 and the run at 45 seconds, and persist fixed
start/finish/count metrics without secrets. Its service-only health read is true
only when that exact job is active, no overlap exists, the latest successful
finish is at most three minutes old, claimable backlog is at most 25 with no row
older than five minutes, and no unresolved unknown upload attempt is older than
ten minutes. Any lease-expired in-flight attempt is independently unhealthy until
the next claim promotes it to unknown. Acknowledging an alert does not make the worker healthy.
Route/health tests freeze database time and prove wrong cadence/name, duplicate
or overlapping runs, a four-minute last success, 26 queued rows, a six-minute
old claimable row, an eleven-minute unknown attempt, and one lease-expired
in-flight attempt each fail independently;
the exact empty/within-threshold fixture alone passes.

Account deletion uses the same authenticated worker boundary but a distinct
durable lifecycle. The Admin route calls service-only
`queue_account_deletion`, which locks/marks the profile pending, blocks
application access, terminalizes/refunds every nonterminal generation, snapshots
the Stripe customer/cached subscription plus canonical assets and every active
persistence token, and creates one account job. It
must not call `auth.admin.deleteUser()` or delete the profile at request time.
Queueing preserves any already active persistence lease as a drain marker;
idempotent `fail_generation` may refund once after pending but cannot clear that
token without its terminal receipt, while start/lease/partial-refund/complete
remain rejected.

Before subscription discovery, the worker fences Checkout creation. It waits for
every local `creating` intent to attach/reconcile, then fully paginates Stripe
Checkout Sessions for the customer. Expire every `open` Session. Retrieve every
`complete` Session's Subscription/PaymentIntent; complete-but-processing stays
pending, `requires_capture` is canceled/retrieved, and a payment that succeeds
after the deletion fence becomes `requires_financial_resolution` with no grant
or automatic refund. Missing pages/network state keep the account pending. Run a
second complete Session scan; a local creating row, open/processing Session, or
unresolved money can never pass by timeout.

The job requires an unambiguous `stripe_customer_id`, paginates
`subscriptions.list({customer,status:'all'})` through every page, and upserts one
`account_deletion_subscription_jobs` child row per subscription. Treat only
`canceled` and `incomplete_expired` as terminal; cancel `trialing`, `incomplete`,
`active`, `past_due`, `unpaid`, and `paused` immediately with no automatic
proration/refund. Store the internal operation key
`account-delete:<job-id>:<subscription-id>:cancel`, attempts, Stripe request IDs,
and retrieved state. Stripe v1 DELETE is safe to retry by its method semantics;
do not rely on an idempotency header that Stripe ignores for DELETE. Repeat the
full paginated discovery after cancellation and proceed only when every result
is terminal. Missing customer identity, page/cancellation/retrieval failure, or
any nonterminal result leaves the account pending and alerts. A cancellation
webhook may update the same child row but cannot grant credits to a pending
profile. The profile's single cached subscription ID is diagnostic only and can
never prove there is only one subscription.

Immediately before Storage, reach a fixed point by repeating the complete
Session scan and then the complete Subscription scan. Any new/nonterminal result
restarts reconciliation; only no local creating intent, terminal Sessions, no
money-resolution hold, and terminal Subscriptions can advance.

Next the worker deletes canonical objects not covered by an unknown attempt,
then waits for every durable persistence token snapshotted at queue time to
receive a matching terminal receipt. While a receipt is missing it performs only
non-destructive inventories; an object discovered at that attempt's path is
handed under the attempt lock to the persistence reconciler, which records the
commit, deletes/verifies it, and writes the receipt. The account worker cannot
blindly delete it. After all receipts it proves no active reservation/generation
remains and performs a bounded paginated `<user-id>/` prefix sweep in both
`assets` and `generated-assets` under the per-user lock. Lease expiry alone never acknowledges a drain. A late stored
or discarded receipt forces a new sweep after its receipt timestamp. Missing
receipts keep a durable tombstone/job pending, inaccessible, alerting, and
sweeping; only all receipts plus a clean post-receipt check permit Auth/profile
deletion. Storage/Stripe failure keeps the account pending and inaccessible. Job
rows have user/bucket/path/subscription/token snapshots without a cascading
profile FK. Legacy URLs are never fetched/remotely deleted.
An unmigrated legacy row also keeps account deletion pending with
`legacy_migration_required`; it is not hidden, deleted, or reduced to a lost
pointer. Only Storage/AI's separately verified safe-copy path can canonicalize it
and unblock deletion.

- [ ] **Step 3: Write failing SQL enforcement tests**

The SQL harness creates fixtures as service role, then uses
`SET LOCAL ROLE authenticated` plus
`set_config('request.jwt.claims', '{"sub":"<user>"}', true)` and asserts
`auth.uid()` before every policy check. Prove owner SELECT succeeds while
INSERT/UPDATE/DELETE on generations/assets fails, another owner cannot read,
pending assets are hidden, and service-role lifecycle/queue paths succeed.
Assert status forgery cannot make a reservation refundable and concurrent
reconciler calls refund one stale reservation once.

Also prove account queueing immediately blocks the pending user; canonical job
snapshots survive final profile deletion; a Storage failure keeps Auth/profile
pending; retry removes the private object then the identity; and a legacy remote
URL is never fetched/deleted/hidden, returns `legacy_migration_required`, and
keeps both the row and account finalization pending until verified copy.

Add deterministic interleavings where a generation is already at provider/
persistence time: new leases/uploads are rejected after pending, an existing
lease without a receipt delays finalization even after expiry, an upload that
completes after expiry and the first sweep is caught by a later post-receipt
sweep, refunds remain once, and Auth/profile survive until the clean fenced
check. Add the stricter order `unknown PUT -> absent reconciliation probe ->
delayed commit`: the negative probe leaves the sole attempt/receipt pending, no
second PUT starts, the later object is detected and removed, and only its
post-delete proof can unblock identity finalization. Stripe Test fixtures prove pagination past page one; multiple parallel
subscriptions; `trialing`, `incomplete`, `active`, `past_due`, `unpaid`, and
`paused` cancellation; `canceled`/`incomplete_expired` terminal handling;
missing customer identity; network retry; terminal rediscovery before
Storage/Auth deletion; and no automatic monetary refund.

Persistence-route tests cover wrong/missing secret, bounded claim, checksum/
size match, absent-object-stays-pending, delayed commit cleanup, mismatched object
cleanup, Storage outage retry, and idempotent repeated runs. Prove an unknown transport outcome cannot produce a
terminal receipt until every expected path is resolved and cannot create another
refund/settlement.

Stripe Test Checkout fixtures add a Session-creation/attachment race, more than
one page of open Sessions, expiry, a complete Session with processing payment,
`requires_capture`, a post-fence succeeded top-up requiring an explicit money
decision, and a subscription created between initial scans. Prove the final
Session→Subscription fixed-point loop catches each case before Auth/profile
deletion and never grants a pending profile.

- [ ] **Step 4: Confirm pre-migration failure**

```powershell
npm run db:test -- tests/db/040_financial_enforcement.sql
```

Expected: FAIL because authenticated users still have direct generation/asset policies.

- [ ] **Step 5: Implement migration 040**

Add `assets.deletion_pending_at`, `asset_deletion_jobs`,
`account_deletion_jobs`, `account_deletion_subscription_jobs`,
`account_deletion_checkout_jobs`, and `account_deletion_persistence_fences` with
Stripe customer/Session/PaymentIntent/subscription/request,
phase, token, expected/receipt path manifests, receipt, and internal-operation snapshots,
service-only queue/claim/retry/finalize RPCs, and owner policies that require the
identity/asset pending fields to be null. The profile pending column and
persistence lease/token/receipt fields already exist from 039. Queueing
terminalizes/refunds under the profile lock. Job rows retain
user/bucket/path/subscription audit state after
asset/profile deletion. Revoke all browser access to jobs/RPCs.

Drop broad policies; create owner-only SELECT policies; revoke
INSERT/UPDATE/DELETE from `anon` and `authenticated`. Replace
`reconcile_orphaned_generations(interval,int)` in place to lock stale
`generation_reservations.state='reserved'` rows with `SKIP LOCKED` and call the
same terminal refund rules as `fail_generation`.

Do not create or schedule a second generation-refund cron job. Assert the
existing job still calls the same function signature. The separate Storage
deletion worker is an authenticated Coolify schedule using
`ASSET_DELETION_CRON_SECRET`; database refunds happen only inside the guarded
account-queue transaction, while the worker is limited to idempotent Stripe
cancellation, deletion phases, and finalization. It is registered/verified in
Task 8. Record schema version `040`.

Add service-only, database-timed persistence-worker run metrics and a bounded
health reader consumed by `persistence-worker-health.ts`; browser roles receive
no access. The code combines those rows/backlog ages with the fixed read-only
Coolify schedule identity and applies exactly the 3/5/10-minute thresholds above,
never a caller health flag.

- [ ] **Step 6: Run enforcement gates**

```powershell
npm run db:test -- tests/db/039_generation_workflow.sql
npm run db:test -- tests/db/039_stripe_atomicity.sql
npm run db:test -- tests/db/040_financial_enforcement.sql
npm run test -- tests/financial/asset-delete-authority.test.ts tests/financial/asset-deletion-worker.test.ts tests/financial/account-deletion-worker.test.ts tests/financial/persistence-reconciliation-route.test.ts tests/financial/persistence-worker-health.test.ts tests/financial/persistence-reconciliation.test.ts
npm run check:invariants
npm run typecheck
npm run build
```

- [ ] **Step 7: Commit**

```powershell
git --literal-pathspecs add supabase/migrations/040_financial_generation_enforcement.sql tests/db/040_financial_enforcement.sql lib/assets/server-repository.ts lib/assets/deletion-worker.ts lib/accounts/deletion-worker.ts lib/storage/persistence-worker-health.ts app/api/cron/asset-deletions/route.ts app/api/cron/generation-persistence/route.ts middleware.ts "app/api/assets/[id]/route.ts" app/api/assets/batch-delete/route.ts "app/api/admin/users/[id]/route.ts" .env.test.example scripts/check-invariants.ts docs/INVARIANTS.md lib/supabase/types.ts tests/financial/asset-delete-authority.test.ts tests/financial/asset-deletion-worker.test.ts tests/financial/account-deletion-worker.test.ts tests/financial/persistence-reconciliation-route.test.ts tests/financial/persistence-worker-health.test.ts
git commit -m "fix(finance): enforce server-owned generation state"
```

---

### Task 8: Staging and Production financial rollout

**Files:**
- Create: `scripts/reconciler-cutover.ts`
- Create: `tests/financial/reconciler-cutover.test.ts`
- Modify: `package.json`
- Modify: `SETUP.md`
- Modify: `CHANGELOG.md`
- Create: `docs/operations/financial-remediation-runbook.md`
- Create: `docs/operations/release-evidence/staging/financial/release-<financial-git-sha>.json`
- Create: `docs/operations/release-evidence/production/financial/release-<financial-main-git-sha>.json`

**Interfaces:**
- Consumes: Tasks 1–7.
- Consumes: Program Integration Task 3's isolated Staging/Stripe-Test resources,
  stable core fixture manifest, and protected credential environment.
- Produces verified migrations 039/040, application cutover, one safely paused/
  resumed reconciler, deletion workers, and a read-only legacy report.

- [ ] **Step 1: Verify the automatically provisioned rehearsal environment**

Run the Program-owned guard/provisioner and fail closed unless Stripe is Test
Mode, Supabase/app origins differ from Production, eight Test prices plus the
webhook exist, protected Admin/customer credential names resolve, and the stable
core fixture manifest validates. Do not ask Muhammad for routine dashboard/data
entry; stop only at a genuine external permission boundary.

Create a fixed-purpose reconciler controller with scripts:

```json
"reconciler:preflight": "tsx scripts/reconciler-cutover.ts preflight",
"reconciler:pause": "tsx scripts/reconciler-cutover.ts pause",
"reconciler:resume": "tsx scripts/reconciler-cutover.ts resume"
```

It cannot accept SQL, a file path, or a job name. It resolves only the recorded
`reconcile_orphaned_generations` scheduler entry, proves there is exactly one,
and supports only preflight/pause/resume. Production pause/resume requires the
explicit target plus the one-use token from the immediately preceding read-only
preflight. Output contains job ID/function/active state, never credentials.

Run `npm run provision:staging-fixtures`, `npm run verify:test-env`, and
`npm run verify:staging-fixtures`; none prints credentials/keys.

- [ ] **Step 2: Rehearse the exact order in Staging**

1. Record and pause the one existing generation reconciler; verify it is
   inactive before applying 039.
2. Apply 039 and run both 039 SQL suites while refunds may be delayed.
3. Deploy the complete application cutover and run all nine studio flows plus
   signed Stripe duplicate/equal-timestamp/out-of-order fixtures.
4. Apply 040 while the old reconciler remains inactive.
5. Run RLS/reconciler/account-and-asset-deletion tests; verify the existing job
   still targets the replacement function, then resume that one job.
6. Register the authenticated deletion schedules and the one-minute, non-overlap
   `pyrasuite-generation-persistence-reconciliation` schedule; prove its 25-row/
   45-second caps and 3/5/10-minute health thresholds, then run retry/finalization
   tests, including a receipt arriving after lease expiry/first sweep, missing-
   receipt tombstone behavior, Checkout creation/session/payment fixed-point,
   fully paginated multi-subscription discovery, all nonterminal Stripe Test
   statuses, legacy-migration hold, and cancellation-before-Auth behavior.
7. Run request/period-grant concurrency, changed-anchor, cron-first, missing-
   period, create/cycle, update/proration, zero-paid, unknown-price, multi-line,
   hidden-second-page line, late-period monotonic-cursor, and duplicate invoice-
   event suites.
8. Run the legacy audit and compare balance totals before/after.

Expected: no unexplained balance delta; all delivered results are completed; all failed results are fully or deliberately partially refunded.

Record the reviewed Staging result:

```powershell
$financialGitSha = (git rev-parse HEAD).Trim()
npm run verify:deployment -- --environment=staging --expected=$financialGitSha
npm run release:evidence -- --track=financial --phase=release --environment=staging --from=.artifacts/releases/input/financial-staging.json --proof=.artifacts/releases/proofs/staging.json
```

- [ ] **Step 3: Prepare rollback and monitoring**

Document the exact Coolify deployment ID, prior image, current cron job
definition/active state, migration fingerprints, Test results, and fixed-purpose
pause/resume commands. Tests prove inactive before 039/040, exactly one active
job after 040, and no old/new overlap. Do not include secret values.

- [ ] **Step 4: Run pre-Production gate**

```powershell
npm run check:invariants
npm run typecheck
npm run lint -- --no-cache
npm run test
npm run test:integration -- tests/financial/generation-idempotency.integration.test.ts tests/financial/subscription-grant-concurrency.integration.test.ts
npm run build
npm run db:audit:production -- --name=financial-preflight
npm run db:audit:production -- --name=financial-legacy
```

- [ ] **Step 5: Deploy Production in the rehearsed order**

During a low-traffic window run preflight and pause the reconciler first. Prove
it inactive and apply 039 from the reviewed candidate. Merge that exact candidate
through the repository's real review path into `main`, push `main`, wait for the
Coolify deployment/health result, then require the served revision to equal
remote main before any smoke:

```powershell
$financialMainGitSha = (git rev-parse origin/main).Trim()
npm run verify:deployment -- --environment=production --expected=$financialMainGitSha
```

Run non-mutating/read smokes, then apply 040 while still paused; confirm all nine studios and asset/account deletes use
server authority, run the RLS/reconciler gate, then resume exactly the same job
against the replacement function and register the authenticated deletion-worker
schedules plus exactly one active one-minute, non-overlap
`pyrasuite-generation-persistence-reconciliation` job with the rehearsed fixed
limits. Never leave the status-based function active during this window.

- [ ] **Step 6: Verify Production without replaying Live Stripe**

Confirm owner reads, denied client writes, current generation success/failure
using owned test accounts, same-key replay without a second provider job/charge,
one canonical asset, generation and deletion worker last runs, recent real
webhook event state, persistence-reconciler exact job/cadence/no-overlap plus its
3/5/10-minute last-run/backlog/unknown thresholds, subscription-period markers, and ledger/reservation
agreement. Do not fabricate a Live event or charge a card as an unattended
smoke test.

Record the reviewed Production result before the historical report:

```powershell
$financialMainGitSha = (git rev-parse origin/main).Trim()
npm run verify:deployment -- --environment=production --expected=$financialMainGitSha
npm run release:evidence -- --track=financial --phase=release --environment=production --from=.artifacts/releases/input/financial-production.json --proof=.artifacts/releases/proofs/production.json
```

- [ ] **Step 7: Produce the historical repair report**

Run the fixed `financial-legacy` Production audit, label every mismatch as a
candidate discrepancy, summarize exact test-account IDs and amounts, and stop.
No balance write occurs until Muhammad approves the report.

- [ ] **Step 8: Document and commit**

Update setup/runbook/changelog only with observed facts and timestamps.

```powershell
$stagingFinancialSha = (Get-Content -LiteralPath .artifacts/releases/proofs/staging.json -Raw | ConvertFrom-Json).revision
$productionFinancialSha = (Get-Content -LiteralPath .artifacts/releases/proofs/production.json -Raw | ConvertFrom-Json).revision
git add scripts/reconciler-cutover.ts tests/financial/reconciler-cutover.test.ts package.json SETUP.md CHANGELOG.md docs/operations/financial-remediation-runbook.md "docs/operations/release-evidence/staging/financial/release-$stagingFinancialSha.json" "docs/operations/release-evidence/production/financial/release-$productionFinancialSha.json"
git commit -m "docs: record financial integrity production rollout"
```
