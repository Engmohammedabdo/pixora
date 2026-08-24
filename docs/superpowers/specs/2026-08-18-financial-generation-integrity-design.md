# Financial and Generation Integrity — Design

**Date:** 2026-08-18
**Status:** Approved for planning
**Program:** `docs/superpowers/specs/2026-08-18-production-remediation-program-design.md`

---

## 1. Scope

This subsystem makes credits, generation completion, refunds, Stripe effects,
and reconciliation server-owned and retry-safe. It covers:

- all nine studio routes;
- generated image/audio persistence;
- credit reservations, partial refunds, full refunds, and settlement;
- Stripe checkout, renewal, plan change, top-up, failure, cancellation, and
  dispute events;
- Admin credit adjustments;
- customer write privileges on `generations` and `assets`;
- the orphan-generation reconciliation cron.

It does not repair historical balances automatically and does not delete any
legacy asset.

---

## 2. Current failure boundary

Today the application performs generation insertion, credit reservation, AI
work, asset writes, completion updates, and refunds as separate calls. A process
may stop between any two. Several completion updates ignore database errors.

The reconciler later infers financial meaning from `generations.status`, but an
authenticated customer can update their own generation row. This permits a
completed result to be made to look stale and refundable.

Stripe idempotency currently checks for an event and inserts a marker in separate
steps. Two concurrent deliveries can both pass the check, and some business
effects happen outside the event transaction.

---

## 3. Durable generation model

Migration `039_financial_generation_workflow.sql` is additive. It creates an
explicit reservation record and canonical storage fields while old application
code can still run:

```sql
CREATE TABLE public.generation_reservations (
  generation_id UUID PRIMARY KEY
    REFERENCES public.generations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reserved_amount INTEGER NOT NULL CHECK (reserved_amount > 0),
  refunded_amount INTEGER NOT NULL DEFAULT 0
    CHECK (refunded_amount >= 0 AND refunded_amount <= reserved_amount),
  state TEXT NOT NULL
    CHECK (state IN ('reserved', 'settled', 'refunded')),
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.generation_persistence_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL
    REFERENCES public.generations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lease_token UUID NOT NULL,
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  expected_sha256 TEXT NOT NULL CHECK (expected_sha256 ~ '^[0-9a-f]{64}$'),
  expected_size BIGINT NOT NULL CHECK (expected_size > 0),
  state TEXT NOT NULL CHECK (state IN (
    'prepared', 'in_flight', 'confirmed', 'definitive_failed', 'unknown',
    'observed_committed', 'cleaned'
  )),
  reconciliation_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (reconciliation_attempts >= 0),
  next_check_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ,
  unknown_at TIMESTAMPTZ,
  unknown_reason TEXT CHECK (unknown_reason IS NULL OR unknown_reason IN (
    'transport_timeout', 'transport_disconnect', 'transport_abort',
    'storage_5xx', 'worker_exit', 'lease_expired'
  )),
  started_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  UNIQUE (generation_id, storage_bucket, storage_path)
);

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS request_id UUID,
  ADD COLUMN IF NOT EXISTS requires_assets BOOLEAN,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS persistence_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS persistence_lease_token UUID,
  ADD COLUMN IF NOT EXISTS persistence_expected_paths JSONB
    CHECK (
      persistence_expected_paths IS NULL
      OR jsonb_typeof(persistence_expected_paths) = 'array'
    ),
  ADD COLUMN IF NOT EXISTS persistence_receipt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS persistence_receipt_paths JSONB
    CHECK (
      persistence_receipt_paths IS NULL
      OR jsonb_typeof(persistence_receipt_paths) = 'array'
    ),
  ADD COLUMN IF NOT EXISTS persistence_receipt_status TEXT
    CHECK (persistence_receipt_status IN
      ('stored', 'failed', 'aborted', 'discarded_pending_deletion'));

ALTER TABLE public.generations
  ADD CONSTRAINT generations_workflow_requires_assets
  CHECK (request_id IS NULL OR requires_assets IS NOT NULL);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_pending_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_period_cursor_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_period_cursor_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_period_cursor_invoice_id TEXT;

CREATE UNIQUE INDEX generations_user_request_unique
  ON public.generations (user_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE UNIQUE INDEX profiles_stripe_customer_unique
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS stripe_event_id TEXT;

CREATE TABLE public.stripe_business_effects (
  effect_key TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  effect_kind TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.subscription_credit_grants (
  subscription_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('invoice', 'recovery_cron')),
  source_event_id TEXT,
  credits INTEGER NOT NULL CHECK (credits >= 0),
  applied_credits INTEGER NOT NULL DEFAULT 0
    CHECK (applied_credits >= 0 AND applied_credits <= credits),
  disposition TEXT NOT NULL
    CHECK (disposition IN ('applied_current', 'historical_report_only')),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, period_start, period_end),
  CHECK (period_end > period_start)
);

CREATE TABLE public.subscription_billing_periods (
  source_invoice_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL,
  source_invoice_line_id TEXT UNIQUE,
  subscription_id TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  price_id TEXT,
  plan_id TEXT,
  billing_reason TEXT NOT NULL,
  amount_paid BIGINT NOT NULL CHECK (amount_paid >= 0),
  status TEXT NOT NULL CHECK (status IN ('eligible', 'ineligible')),
  eligibility_reason TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    status = 'ineligible'
    OR (
      subscription_id IS NOT NULL
      AND source_invoice_line_id IS NOT NULL
      AND period_start IS NOT NULL
      AND period_end IS NOT NULL
      AND period_end > period_start
      AND price_id IS NOT NULL
      AND plan_id IS NOT NULL
      AND amount_paid > 0
    )
  )
);

CREATE UNIQUE INDEX subscription_billing_periods_eligible_period
  ON public.subscription_billing_periods
    (subscription_id, period_start, period_end)
  WHERE status = 'eligible';

CREATE TABLE public.stripe_checkout_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_id UUID NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('subscription', 'payment')),
  stripe_customer_id TEXT NOT NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_subscription_id TEXT,
  state TEXT NOT NULL CHECK (state IN (
    'creating', 'open', 'complete_processing', 'expired', 'terminal',
    'requires_financial_resolution'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);
```

Zero-credit studios create a generation but no reservation. Paid work has exactly
one reservation keyed by the generation ID.

There is exactly one generation-wide persistence token, not one token per asset.
The workflow first prepares bounded final bytes (including any watermark),
computes one canonical expected manifest of unique bucket/path/SHA-256/size
entries, then acquires the token with that manifest before any upload. It passes
the token to every parallel image/audio upload,
waits for all Storage calls to settle, then writes one terminal receipt containing
the bounded canonical path list. A second begin while that token is active is a
duplicate/rejection, so the single row cannot hide concurrent upload tokens.
`persistence_receipt_paths` is the canonical order-independent set of unique
`{storage_bucket,storage_path}` pairs observed by that token. The finish RPC
validates owner/generation prefixes, rejects duplicates/over-limit input, sorts
the set, and stores it atomically with status/time while retaining the matched
lease token for audit. A terminal receipt without its durable path set is invalid.
The expected manifest accepts only the two fixed canonical buckets and the owned
generation prefix; 039 recognizes the future private bucket for additive
compatibility, but its descriptor predicate still prevents private completion
until 041. A `stored` receipt must cover the exact expected bucket/path set and
verified size/checksum; a failed/discarded receipt may record the resolved partial
remote set only for cleanup and can never authorize completion.

---

## 4. Lifecycle RPCs

All functions are `SECURITY DEFINER SET search_path = public`, accept only
service-role calls, validate positive/size-bounded inputs, and lock affected rows
before making a decision. Start, persistence lease, partial refund, and completion
lock the profile and reject `profiles.deletion_pending_at IS NOT NULL`.
`fail_generation` may still idempotently refund/terminalize financial state, but
it cannot fabricate or clear an outstanding persistence receipt, token, or lease
expiry and cannot
create a second refund. The internal account-deletion
transaction is the only path allowed to terminalize/refund open work after
setting the flag.

`begin_generation_persistence` returns a unique lease token and a bounded
deadline. The uploader must finish through a token-matched terminal receipt only
after the Storage request has settled. A local clock expiry is never a drain
acknowledgement and never authorizes account finalization. If deletion starts
while a token is outstanding, the deletion job snapshots that token; a late
successful upload records `discarded_pending_deletion`, never becomes visible,
and is removed by a sweep that runs after the receipt. A missing receipt keeps
the deletion job pending/inaccessible with an operational alert and continuing
non-destructive prefix inventories. An object found at an `unknown` attempt path
is handed to the same attempt reconciler to record `observed_committed`, delete,
verify, and write the receipt; the account worker cannot blindly remove it first.
Missing evidence cannot be converted into permission to delete Auth/profile.

```sql
public.start_generation(
  p_user_id UUID,
  p_request_id UUID,
  p_studio TEXT,
  p_model TEXT,
  p_input JSONB,
  p_project_id UUID,
  p_credit_cost INTEGER,
  p_description TEXT
) RETURNS JSONB;
-- { success, duplicate, state, generation_id, reserved_amount,
--   new_balance, output?, error? }

public.complete_generation(
  p_user_id UUID,
  p_generation_id UUID,
  p_persistence_lease_token UUID, -- NULL only for the explicit zero-asset branch
  p_model TEXT,
  p_output JSONB,
  p_assets JSONB
) RETURNS JSONB;
-- asset item: { type, url, storage_bucket, storage_path, format,
--               width?, height?, size_bytes?, metadata? }

public.begin_generation_persistence(
  p_user_id UUID,
  p_generation_id UUID,
  p_lease_seconds INTEGER,
  p_expected_paths JSONB
) RETURNS JSONB;
-- { success, lease_token, persistence_lease_expires_at,
--   attempts: [{ attempt_id, storage_bucket, storage_path }], error? }

public.finish_generation_persistence(
  p_user_id UUID,
  p_generation_id UUID,
  p_lease_token UUID,
  p_status TEXT,
  p_storage_paths JSONB
) RETURNS JSONB;
-- { success, receipt_status, deletion_pending, receipt_at, error? }

public.claim_generation_persistence_attempt(
  p_user_id UUID,
  p_generation_id UUID,
  p_lease_token UUID,
  p_attempt_id UUID
) RETURNS JSONB;
-- one prepared -> in_flight transition; duplicate/in_flight cannot issue a PUT

public.mark_generation_persistence_attempt_unknown(
  p_user_id UUID,
  p_generation_id UUID,
  p_lease_token UUID,
  p_attempt_id UUID,
  p_reason TEXT
) RETURNS JSONB;
-- token-matched in_flight -> unknown only; no path/status/clock supplied

public.claim_generation_persistence_reconciliation(
  p_batch_size INTEGER
) RETURNS SETOF JSONB;
-- fixed fields only: user/generation/token/expected manifest/lifecycle state

public.refund_generation_reservation(
  p_user_id UUID,
  p_generation_id UUID,
  p_amount INTEGER,
  p_reason TEXT
) RETURNS JSONB;
-- { success, refunded_amount, remaining_reserved_amount, new_balance }

public.fail_generation(
  p_user_id UUID,
  p_generation_id UUID,
  p_error TEXT
) RETURNS JSONB;
-- { success, duplicate, refunded_amount, new_balance }

public.begin_stripe_checkout(
  p_user_id UUID,
  p_request_id UUID,
  p_mode TEXT,
  p_stripe_customer_id TEXT
) RETURNS JSONB;
-- { success, duplicate, checkout_intent_id, state, error? }

public.attach_stripe_checkout_session(
  p_user_id UUID,
  p_checkout_intent_id UUID,
  p_stripe_session_id TEXT
) RETURNS JSONB;
-- { success, deletion_pending, error? }
```

### `start_generation`

- Locks/claims `(user_id, request_id)` first. A concurrent or retried request
  returns the existing generation instead of inserting or reserving again.
- A duplicate completed request returns its saved output for replay; a duplicate
  processing request returns `generation_in_progress`; a failed request returns
  its terminal failure. Duplicate callers never invoke the provider.
- Saved output is durable state, not necessarily a delivery URL. After private
  Storage is introduced in migration 041, an asset-bearing duplicate must pass
  through the owner-scoped delivery materializer to create fresh signed URLs;
  routes never return stored `url=null` descriptors or retry the provider/charge.
- Verifies the project is null or belongs to the same user.
- Inserts the `processing` generation.
- Derives and stores `requires_assets` inside the RPC from the validated studio
  and saved input; the caller cannot choose the empty branch. It is false for
  the four text studios, true for Creator/Photoshoot/Edit/Voiceover, and for
  Campaign equals the saved boolean `input.generateImages` (default false).
  Invalid or non-boolean Campaign input is rejected before reservation.
- For a positive cost, calls the existing pool-aware reservation logic from
  migration `033` and inserts the reservation in the same transaction.
- If the balance is insufficient, neither generation nor reservation survives.
- For a zero cost, creates the generation with no ledger or reservation row.
- Rejects `account_deletion_pending` before creating work or calling a provider.

### `complete_generation`

- Locks the generation and reservation.
- Locks/rechecks the profile and rejects pending account deletion before any
  asset row or settlement is written.
- Rejects failed, refunded, or already completed work.
- Validates every asset owner, bucket, and path against
  `<user-id>/generations/<generation-id>...`.
- For asset-bearing work, requires the supplied token to match a `stored`
  terminal receipt and exact order-independent set equality between the unique
  `(storage_bucket,storage_path)` pairs in `p_assets` and the durable receipt
  paths. Missing, extra, duplicate, wrong-bucket, or mismatched paths reject the
  entire transaction before asset insertion or credit settlement. The explicit
  null-token/no-persistence branch is allowed only when the locked generation's
  server-derived `requires_assets=false`: the four text studios and Campaign
  when its saved `input.generateImages=false`. Creator, Photoshoot, Edit,
  Voiceover, and Campaign with `generateImages=true` require a nonempty expected
  manifest, stored receipt, and exact asset set. Completion never trusts a
  caller flag or a changed retry body.
- Inserts asset rows, writes canonical output, records the actual model, and
  marks the reservation settled in one transaction.
- Treats caller `p_output` as validated non-delivery metadata. Any durable asset
  references in `generations.output` and the returned completion output are
  derived inside the transaction from the exact inserted asset IDs plus their
  bucket/path set; a raw
  provider/data/arbitrary URL in `p_output` can neither be stored nor returned as
  a deliverable. Routes return the RPC's canonical output, not their pre-save
  provider object.
- Sets `credits_used` to `reserved_amount - refunded_amount`.
- Succeeds only once.

Migration 039 isolates only the accepted asset-descriptor shape in
`public.is_valid_generation_asset_descriptor(p_user_id UUID,
p_generation_id UUID, p_asset JSONB) RETURNS BOOLEAN`, called internally by
`complete_generation`. `PUBLIC`, `anon`, and `authenticated` have no execute
grant. Migration 041 may replace that exact predicate signature to add the
private shape, but it must not replace or duplicate the lifecycle function,
locks, receipt-set comparison, deletion fence, settlement, or privileges.

### Persistence lease

After provider success, final conversion/watermark, and before any Storage upload,
the route calls `begin_generation_persistence` with the complete expected
path/checksum/size manifest. It locks the profile/generation, rejects pending
account deletion, validates/stores that manifest, and creates one short bounded
generation-wide token. Every
parallel asset upload receives that same token; only
`finish_generation_persistence` after all requests settle writes the terminal
receipt/path set and releases the lease. Financial completion requires the
matching stored receipt. Failure can refund without forging a receipt. Account
deletion terminalizes financial work but waits for the receipt and a later sweep;
a provider that has not acquired a token can never upload after deletion starts.
An application timeout or aborted transport whose remote Storage outcome is
unknown is not a terminal receipt: deterministic-path reconciliation must prove
each final object present/absent before finish. The generation may fail/refund
while that receipt remains pending, but account deletion cannot treat local
`Promise.allSettled()` or lease expiry as remote drain proof.

A service-only persistence reconciler claims expired/pending manifests with
`SKIP LOCKED`, checks only their recorded owned paths and expected size/checksum,
and records the final remote set. For an already failed/refunded or deletion-
pending generation it never completes work: it queues/removes any matching
objects, verifies absence, then records `failed` or
`discarded_pending_deletion`. It cannot call a provider, settle credits, create a
refund, accept a caller path, or turn an unknown outcome into `stored`. Repeated
runs are idempotent; Storage unavailability leaves the receipt pending and alerts.

The claim RPC accepts only a bounded 1–25 batch, selects due rows by
`next_check_at,id` with `FOR UPDATE SKIP LOCKED`, and in the claiming transaction
increments `reconciliation_attempts` and advances `next_check_at` using a fixed
bounded backoff (maximum 15 minutes). Thus an unresolved/absent row leaves the
eligible head before Storage work and cannot occupy every later batch forever;
newer due rows make progress. Caller-supplied cursors, timestamps, paths, sort,
or retry delays are rejected. Tests use more than 25 old unknowns, more than 25
expired in-flight rows, plus new work and prove each transaction changes/returns
at most 25 while every due row is eventually claimed without concurrent duplication.

Every expected path has one durable upload-attempt ID and at most one remote
`PUT`; retries cannot start while its state is `in_flight` or `unknown`. The
attempt is recorded before network admission and becomes `confirmed` only from a
successful Storage response, or `definitive_failed` only when the request
provably never left the process or Storage returned a documented pre-commit
rejection. A timeout, disconnect, worker crash, 5xx, or an absent metadata probe
is `unknown`, never a negative receipt. The reconciler may close an unknown
attempt only after the exact object appears, which proves that sole possible PUT
has committed: it then validates and either records `stored`, or deletes it and
verifies absence before recording the failed/deletion receipt. If it never
appears, the receipt and any account-deletion tombstone remain pending and
alerting; neither elapsed time nor repeated absence authorizes Auth/profile
deletion. Tests force `absent probe -> delayed PUT commit` and require the later
object to be caught and removed rather than orphaned.

The uploader calls `mark_generation_persistence_attempt_unknown` for every
observed timeout/disconnect/abort/Storage-5xx before returning. That RPC locks generation then attempt,
requires the original lease token and `in_flight` state, stores database time and
one fixed reason, and never accepts a bucket/path or authorizes a PUT. A process
crash cannot make that call, so `claim_generation_persistence_reconciliation`
selects at most its 1–25 batch budget from the union of due unknown rows and
lease-expired `in_flight` rows ordered by `next_check_at,id` with `FOR UPDATE SKIP
LOCKED`. Inside that same bounded transaction it promotes only selected expired
rows to `unknown` with reason `lease_expired` and returns them as claimed work.
Promotion never resets the attempt ID, never permits a second network
write, and never fabricates a terminal receipt. Stale `in_flight` rows count as
unhealthy until promoted; account deletion waits on either state.

The authenticated Coolify job identity is fixed as
`pyrasuite-generation-persistence-reconciliation`, runs every minute with
overlap forbidden, claims at most 25 rows, and has a 45-second runtime ceiling.
Its database health read is fixed, not caller-supplied: healthy requires the
exact active schedule, no overlap, a successful finish within three minutes, no
claimable row older than five minutes or backlog above 25, and no unresolved
`unknown` upload attempt older than ten minutes. Any lease-expired `in_flight`
attempt is independently unhealthy until the worker promotes it. Breaching any threshold emits a
bounded alert and makes the Program observation interval unhealthy; an
acknowledgement cannot turn unresolved work green.

### Partial and terminal refunds

`refund_generation_reservation` may return no more than the remaining reservation
and leaves the reservation open for completion with fewer delivered outputs.
`fail_generation` refunds every remaining credit, marks the reservation refunded,
and marks the generation failed. Calling it again returns a duplicate success and
does not create another refund.

No function derives an amount from a client-editable status or from
`generations.credits_used`.

### Stripe Checkout creation fence

Both Checkout routes require a request UUID and call `begin_stripe_checkout`
under the profile lock before contacting Stripe. The local `creating` row is the
deletion fence. Stripe Session creation uses that intent ID as metadata and as
the stable POST idempotency identity; the route attaches the returned Session
under the same user lock before returning its URL. If attachment finds deletion
pending or fails, the route expires the open Session, returns failure, and leaves
the durable row for worker reconciliation. Account deletion cannot pass a
`creating` row by timeout alone.

Webhook effects update the matching intent from Stripe truth. A pending profile
receives no grant. A payment/subscription that becomes paid after the deletion
fence is recorded as `requires_financial_resolution`; because no monetary refund
is automatic, Auth/profile deletion pauses until Muhammad approves the separate
money decision.

---

## 5. Server workflow interface

`lib/generations/workflow.ts` owns all service-role lifecycle calls:

```ts
export interface StartedGeneration {
  generationId: string;
  duplicate: boolean;
  state: 'processing' | 'completed' | 'failed';
  reservedAmount: number;
  newBalance: number;
  savedOutput?: Record<string, unknown>;
}

export interface PersistedGenerationAsset {
  type: 'image' | 'audio' | 'video';
  url: string | null;
  storageBucket: 'assets' | 'generated-assets';
  storagePath: string;
  format: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  metadata?: Record<string, unknown>;
  watermark: {
    required: boolean;
    applied: boolean;
    policyVersion: 'v1';
  };
}

export async function startGeneration(input: {
  userId: string;
  requestId: string;
  studio: string;
  model: string;
  input: Record<string, unknown>;
  projectId: string | null;
  creditCost: number;
  description: string;
}): Promise<StartedGeneration>;

export async function beginGenerationPersistence(input: {
  userId: string;
  generationId: string;
  expectedPaths: Array<{
    bucket: 'assets' | 'generated-assets';
    path: string;
    sha256: string;
    sizeBytes: number;
  }>;
}): Promise<{
  leaseToken: string;
  leaseExpiresAt: string;
  attempts: Array<{
    attemptId: string;
    bucket: 'assets' | 'generated-assets';
    path: string;
  }>;
}>;

export async function claimGenerationPersistenceAttempt(input: {
  userId: string;
  generationId: string;
  leaseToken: string;
  attemptId: string;
}): Promise<{ claimed: true }>;

export async function markGenerationPersistenceAttemptUnknown(input: {
  userId: string;
  generationId: string;
  leaseToken: string;
  attemptId: string;
  reason: 'transport_timeout' | 'transport_disconnect' | 'transport_abort' |
    'storage_5xx' | 'worker_exit';
}): Promise<{ markedUnknown: true }>;

export async function finishGenerationPersistence(input: {
  userId: string;
  generationId: string;
  leaseToken: string;
  status: 'stored' | 'failed' | 'aborted';
  storagePaths: Array<{
    attemptId: string;
    bucket: 'assets' | 'generated-assets';
    path: string;
  }>;
}): Promise<{
  receiptStatus: 'stored' | 'failed' | 'aborted' |
    'discarded_pending_deletion';
  receiptAt: string;
  deletionPending: boolean;
}>;

export async function completeGeneration(input: {
  userId: string;
  generationId: string;
  leaseToken: string | null; // null only when assets is empty
  model: string;
  output: Record<string, unknown>;
  assets: PersistedGenerationAsset[];
}): Promise<{ savedOutput: Record<string, unknown> }>;

export async function refundGenerationReservation(input: {
  userId: string;
  generationId: string;
  amount: number;
  reason: string;
}): Promise<{ newBalance: number; remainingReservedAmount: number }>;

export async function failGeneration(input: {
  userId: string;
  generationId: string;
  error: string;
}): Promise<{ newBalance: number; refundedAmount: number }>;
```

Each method throws a typed `GenerationWorkflowError` on an RPC or rejected
business result. Routes never inspect raw PostgREST response shapes.

Every studio client creates one UUID `Idempotency-Key` per user action and sends
it unchanged with the HTTP request. The server requires/validates the header and
passes it to both the generation lifecycle and, after migration 041, the AI quota
reservation. Model Comparison uses a distinct UUID for each intentionally
separate model job. A manual new attempt gets a new key; transport replay of the
same attempt keeps the original key.

---

## 6. Persistence and watermark boundary

`persistGeneratedImage` no longer returns a raw string or silently falls back to
the provider URL. It converts the provider result, applies the plan policy,
uploads once, and returns a `PersistedGenerationAsset`.
The route acquires one generation-wide lease token before the batch, supplies it
to every image/audio helper, waits for every parallel Storage request to settle,
and calls `finishGenerationPersistence` once with the full canonical path set.
Only a matching `stored` receipt can be passed to `completeGeneration`.
That call compares the exact bucket/path set; URL fields never participate in
the match. A duplicate, missing, or additional descriptor is a financial
completion failure, not a partial success.

For a free-plan request, any watermark conversion or upload failure terminates the
whole generation and calls `failGeneration`. Even if other images succeeded, no
result from that request is delivered; this implements the approved decision
that a failed watermark stops the operation and returns the credits.

For a paid request, persistence failure also terminates and refunds because a
provider URL or data URI is not a durable customer result.

If files were uploaded but `complete_generation` failed, the API returns failure
and refunds. Those files are unlinked orphans, never customer-visible output; a
later read-only inventory identifies them for a separately approved cleanup.

Voiceover uses the same deterministic path and completion boundary. No route
inserts an `assets` row independently.

---

## 7. Studio orchestration

All nine studios follow the same order:

```text
authenticate
  -> validate request and ownership
  -> enforce feature/plan limits
  -> start generation and reserve credits
  -> call provider
  -> validate/parse result
  -> persist required deliverables
  -> apply bounded partial refund when the product permits partial delivery
  -> complete generation
  -> return response
```

Every exception after `startGeneration` reaches one terminal failure handler.
The response contains no model output unless `completeGeneration` succeeded.

Prompt Builder uses cost `0`; it still starts in `processing` and completes only
after its output is parsed and saved. It no longer writes a completed row before
calling the model.

---

## 8. Atomic Stripe application

The application verifies the Stripe signature and performs any required Stripe
API lookup. It then sends one normalized, validated effect to this service-only
RPC:

```sql
public.apply_stripe_event(
  p_event_id TEXT,
  p_event_type TEXT,
  p_event_created_at TIMESTAMPTZ,
  p_stripe_customer_id TEXT,
  p_effect JSONB
) RETURNS JSONB;
-- { success, duplicate, applied, new_balance, error? }
```

Supported `p_effect.kind` values:

| Kind | Required fields after authoritative Stripe retrieval |
|---|---|
| `subscription_checkout` | `checkout_session_id`, `subscription_id`, current `status`, current `plan_id` |
| `subscription_renewal` | `invoice_id`, `subscription_id`, paid-invoice `plan_id`, `credits`, `period_start`, `period_end`, `reset_at` |
| `subscription_change` | `subscription_id`, current `status`, current `plan_id` |
| `subscription_terminal` | `subscription_id`, current `status`, `reason` |
| `payment_failure` | `invoice_id`, `subscription_id` |
| `topup` | `payment_intent_id`, `credits`, `description` |
| `dispute` | `dispute_id`, `reason` |

Every kind also requires the same non-deleted Stripe `customer` string passed as
`p_stripe_customer_id`; metadata is never ownership authority. The route
retrieves the authoritative Session/Invoice/Subscription/PaymentIntent (and a
Dispute's Charge/PaymentIntent chain when needed), fails retryably if customer is
missing/ambiguous, and rejects any metadata user/customer that conflicts with
retrieved truth before calling SQL.

The RPC locks an existing `webhook_events` marker first. `processed=true` is a
duplicate; `processed=false` from the pre-cutover implementation is retryable and
must not be dropped. It derives (rather than trusts) a type-scoped effect key:

```text
checkout_session:<id>
invoice:<id>
payment_intent:<id>
dispute:<id>
event:<event_id>  # state transitions where repeated events are legitimate
```

It resolves and locks exactly one profile through the unique
`profiles.stripe_customer_id=p_stripe_customer_id` mapping; callers supply no
user ID. Checkout/top-up effects additionally must match the durable
`stripe_checkout_intents` user/customer and attached Session/PaymentIntent/
Subscription IDs. Subscription/invoice effects must match retrieved customer and
stored subscription/customer history. A missing/deleted/duplicate or cross-
customer mapping, or metadata/customer/session/subscription mismatch, fails
before any marker, grant, profile, or ledger mutation. It then inserts
`stripe_business_effects` with `ON CONFLICT DO NOTHING`, validates fields,
applies profile/ledger mutations, marks the event
processed, and commits everything together. Only the transaction that inserts
the effect row may mutate money. A rejected effect rolls back both markers so
Stripe may retry.

Top-ups retain payment-intent uniqueness. Renewals use invoice identity. For
subscription state/plan only, the webhook mapper first retrieves the current
Stripe Subscription and supplies that normalized status/plan to SQL. It never
uses the current Subscription period as an invoice-grant period. The embedded
webhook snapshot is not state authority, and `event_created_at` is audit data,
not a total-order version. If current-state lookup is unavailable, the event
fails retryably with no profile, grant, or ledger mutation. Therefore two
conflicting events with the same Stripe-created timestamp cannot move state
backward.

The paid invoice is the sole authority for a subscription-period credit grant.
Both `invoice.paid` and `invoice.payment_succeeded` are normalized to the same
invoice-scoped business effect, so either delivery order remains idempotent. The
mapper retrieves that exact invoice ID from Stripe and applies this fail-closed
decision table:

| Retrieved invoice | Decision |
|---|---|
| `paid=true`, `status='paid'`, `billing_reason='subscription_create'`, exactly one fully paginated non-proration recurring line with quantity 1 and a paid `PLANS` price, a valid full period, and `amount_paid > 0` | Eligible initial period; grant that plan once. |
| Same contract with `billing_reason='subscription_cycle'` | Eligible renewal period; grant that plan once. |
| `subscription_update`, `subscription_threshold`, legacy `subscription`, manual/quote/automatic invoice, upcoming, zero-paid, unknown price, proration, quantity other than 1, missing period, or multiple invoice lines | Ineligible; persist the reason, grant nothing, and alert for review. |

Price/plan/credits come from the eligible invoice line and the server allowlist,
never profile metadata or the current Subscription. The invoice decision,
`source_invoice_line_id`, and eligible period are stored in
`subscription_billing_periods` inside the same atomic business-effect
transaction. Zero-paid invoices are intentionally fail-closed until Muhammad
approves a separate free-trial or 100%-discount policy. `checkout.session.completed`
links the customer/subscription and current plan state only; it never grants
recurring subscription credits. A late invoice for period A remains A even when
the current Subscription is already in period/plan B.

The mapper never trusts the invoice object's embedded first line page. It calls
Stripe's invoice line-list endpoint to exhaustion with a fixed total-line cap;
`has_more`, a second page, and every proration/extra line participate in the
exact-one-line decision. Retrieval failure or a cap breach is retryable and
creates no decision/grant.

The recovery-only monthly cron may grant only an existing `eligible` period whose
identical `subscription_credit_grants(subscription_id,period_start,period_end)`
marker is absent. It never derives a Stripe period from `now()`,
`credits_reset_date`, or a local billing assumption; when no authoritative period
exists it grants nothing and leaves recovery to a Stripe-side worker. Both paths
re-resolve the stored period/grant `stripe_customer_id` to the same unique
profile before locking it and attempting the same grant insert, so a remapped or
missing customer grants nothing and alerts. Only the winner resets,
grants, and appends its ledger row when the period also advances the monotonic
cursor; an older winner records report-only disposition without balance/ledger
mutation. Changed billing anchors, checkout+invoice,
late-A-after-B, cron-first ordering, concurrency, and retries result in one grant
marker/disposition per paid invoice period. Balance mutation is additionally monotonic under the
profile lock: only an eligible period whose `period_start` is strictly newer than
`profiles.subscription_period_cursor_start` may reset the active subscription
balance and advance the cursor. Same-start/different-period ambiguity is
report-only. An older eligible invoice is still persisted with
`disposition='historical_report_only'` and `applied_credits=0`; it cannot refill
or overwrite a newer partially spent balance, and any additive make-good needs
Muhammad's separate approval. Payment-failed profiles remain excluded by the
migration-032 guard.

Migration 039 replaces both current seven-day deletion paths,
`cleanup_webhook_events()` and the webhook branch inside
`cleanup_stale_records()`, with the same 400-day retention rule and verifies the
live cron targets. An eight-day processed event survives; an event older than
400 days is removed.

Admin credit changes use a separate service-only `adjust_credits` RPC so balance
and ledger never diverge.

---

## 9. Enforcement and reconciliation

Migration `040_financial_generation_enforcement.sql` is applied only after the
application cutover:

- drop customer INSERT/UPDATE/DELETE policies on `generations` and `assets`;
- revoke direct DML from `anon` and `authenticated`;
- keep owner-scoped SELECT;
- replace `reconcile_orphaned_generations()` in place so the existing cron job ID
  remains the only scheduler;
- select stale `generation_reservations.state='reserved'`, lock with
  `SKIP LOCKED`, and call the terminal failure/refund logic;
- never use a display status as the refund amount or eligibility source.

Customer asset deletion also moves to a durable outbox in 040. A service-only
`queue_asset_deletion` transaction verifies ownership, sets
`assets.deletion_pending_at`, and inserts one `asset_deletion_jobs` row. Pending
assets disappear from customer reads immediately. An idempotent worker deletes
the canonical Storage object and then finalizes the database row; failures leave
the job pending for retry instead of exposing a row whose object vanished or an
untracked orphan. Legacy URL rows never fetch/delete a remote object and are not
finalized/deleted: an explicit delete request returns
`legacy_migration_required` and leaves the pointer visible until a verified
canonical copy exists.

Account deletion never relies on a profile/assets cascade to remove canonical
Storage objects or silently abandons a Stripe Live subscription. The Admin
transaction locks the profile, marks deletion pending, blocks application access,
terminalizes/refunds every nonterminal generation, snapshots subscription/asset
identities, and creates durable jobs. Every workflow and persistence path shares
the user lock and rechecks the pending flag before provider invocation, upload,
completion, or settlement.

The account job first fences Checkout creation. It waits for every local
`stripe_checkout_intents.state='creating'` row to attach/reconcile; clock expiry
does not prove Stripe Session creation failed. It then paginates all Stripe
Checkout Sessions for the customer: every `open` Session is expired, and every
`complete` Session is retrieved with its Subscription/PaymentIntent. A complete
Session whose payment is still processing keeps the job pending. A
`requires_capture` Checkout PaymentIntent is canceled/retrieved; a payment that
succeeds after the deletion fence becomes `requires_financial_resolution` and
requires Muhammad's separate refund/no-refund decision. The worker performs a
second full Session discovery and accepts only expired or fully reconciled
terminal sessions; no time filter or first page is completeness proof.

The account job then treats `stripe_customer_id`, not the profile's single cached
subscription ID, as discovery authority. Before Storage/Auth work, it paginates
Stripe `subscriptions.list({ customer, status: 'all' })` to exhaustion and
upserts one durable child row per discovered subscription. Every status except
`canceled` and `incomplete_expired` is nonterminal and is canceled immediately
with no automatic proration/refund. Each child stores the internal operation key
`account-delete:<job-id>:<subscription-id>:cancel`, attempts, Stripe request IDs,
and retrieved terminal state. Stripe API v1 DELETE is itself idempotent, so the
key is an internal retry/audit identity rather than a relied-on Stripe header.
The worker repeats full paginated discovery after cancellation and advances only
when every discovered subscription is terminal. A missing/ambiguous
`stripe_customer_id`, page failure, `trialing`, `incomplete`, `active`,
`past_due`, `unpaid`, or `paused` subscription keeps the account pending and
alerts; the cached profile ID can aid diagnosis but can never prove completeness.
Any monetary refund remains a separate approved action. The worker never deletes
profile/Auth first or lets later webhooks grant pending accounts.

Immediately before Storage/Auth phases, the worker reaches a fixed point: no
local creating/nonterminal Checkout intent, a complete paginated Session scan
with no open/processing/unresolved money, followed by a complete paginated
Subscription scan with only terminal states. Any newly observed Session or
Subscription restarts that loop.

The worker then deletes snapshotted canonical objects and, under the same per-user
lock, waits for a terminal token-matched receipt for every persistence token that
queueing preserved. The persistence child also retains the expected and terminal
receipt path manifests after profile/generation deletion. Lease expiry alone does not satisfy this fence. Each late
`stored`/`discarded_pending_deletion` receipt triggers a subsequent bounded,
paginated prefix sweep for that user in both `assets` and `generated-assets`.
Only after all receipts, no active reservation/generation, and a clean sweep that
occurred after the newest receipt may it delete the Supabase Auth
identity/profile. A missing receipt leaves a durable tombstone/job pending,
continues non-destructive inventories, and alerts instead of guessing from time.
Any discovered unknown-attempt object is resolved through the persistence
attempt lock/receipt before the later destructive sweep. Job rows retain
user/path/subscription/token snapshots and survive final profile deletion.
If any unmigrated legacy/external row exists, account deletion remains pending
with `legacy_migration_required`; it neither removes the row/pointer nor fetches
or deletes the remote target. Only the separately verified safe-copy workflow
can turn it canonical and unblock deletion. Deterministic interleaving tests cover a provider
job already running when deletion begins and an upload that completes after the
original lease deadline and first sweep.

The old and new reconcilers are never scheduled together.

---

## 10. Historical audit

Before and after rollout, read-only SQL reports:

- stale pending/processing generations and their net ledger amounts;
- usage rows without a generation;
- reservations that disagree with ledger totals;
- candidate profile/ledger discrepancies ordered deterministically by
  `(created_at,id)` and cross-checked with reservations/known grant sources;
- duplicate Stripe business identifiers;
- assets without canonical storage paths;
- unlinked storage objects where visibility is available.

`balance_after` is treated as a diagnostic snapshot, not a proof of causation;
the report labels every mismatch `candidate discrepancy`. It prints IDs and
amounts but performs no update. All existing accounts
are owned test accounts, yet Stripe Live makes historical money changes subject
to the same approval gate as customer data.

---

## 11. Rollout and rollback

1. Run live baseline read-only verification.
2. In the isolated Test/Staging target, record and disable the existing
   generation reconciler cron.
3. Apply `039` and run transaction, concurrency, failure-injection, and Stripe
   Test Mode suites while that cron remains disabled.
4. Deploy the complete application cutover to Staging while old DML still
   exists, then apply `040` without re-enabling the old reconciler.
5. Rerun RLS/reconciler tests, prove exactly one job targets the replacement
   function, and only then re-enable that job.
6. Repeat the same disable → 039 → application cutover → 040 → verify → enable
   order on Production.
7. Run Production smoke and historical audit without replaying Live events.

Before `040`, application code can roll back while additive schema remains.
After `040`, fixes roll forward; direct customer writes are never restored. If
the reconciler is suspect, disable its one cron job and preserve the audit trail.
The accepted `039` cutover tradeoff is delayed refunds, never status-based
financial authority over browser-writable generation rows.
