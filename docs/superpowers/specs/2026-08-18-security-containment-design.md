# Security Containment — Design

**Date:** 2026-08-18
**Status:** Approved for planning
**Program:** `docs/superpowers/specs/2026-08-18-production-remediation-program-design.md`

---

## 1. Scope

This release closes four immediate exposures without changing the customer credit
model or rebuilding storage:

1. Stored XSS in the Admin generation viewer.
2. Server-side request forgery and memory exhaustion in asset bulk export.
3. Concurrent and spoofable Admin login rate limiting.
4. A script policy that currently permits arbitrary inline script execution.

AI quotas, private-bucket migration, Stripe, and generation lifecycle changes are
separate releases.

---

## 2. Admin JSON rendering

`components/admin/ExpandableRow.tsx` currently converts `JSON.stringify(data)`
into an HTML string and injects it with `dangerouslySetInnerHTML`. The `data`
contains customer-controlled generation input and output.

The containment release removes HTML-string rendering completely:

```tsx
<pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-300">
  {jsonString}
</pre>
```

React escapes the text. Syntax coloring is deliberately sacrificed in the first
security release; rich HTML is not a product requirement. Copy-to-clipboard is
preserved.

Image previews are restricted to an exact Supabase storage origin and the
generation owner's storage prefix. `ExpandableRow` receives that owner ID from
the Admin generation row; callers without an owner ID, such as generic log
details, render JSON only and never infer a preview. Arbitrary HTTPS strings
found in customer JSON are rendered as text, not loaded in the Admin browser.

**Acceptance:** payloads containing closing tags, event handlers, SVG, Unicode
escapes, or script text appear literally; no executable element is created.

---

## 3. Asset export boundary

The export route may read only an object already stored in the configured
Supabase `assets` bucket under the authenticated user's prefix. It may not perform
`fetch(asset.url)`.

```ts
export interface OwnedAssetReference {
  bucket: 'assets';
  path: string;
}

export function parseOwnedAssetReference(input: {
  rawUrl: string;
  userId: string;
  supabaseUrl: string;
}): OwnedAssetReference | null;
```

The parser accepts only this decoded shape:

```text
<exact SUPABASE origin>/storage/v1/object/public/assets/<user-id>/<remaining path>
```

It rejects a different origin, bucket, owner prefix, encoded slash, dot segment,
NUL byte, credentials, query-based redirect, non-HTTPS protocol, `data:`, `blob:`,
and external provider URL.

After authenticating and proving database-row ownership, the route uses a
service-role Storage client so the containment fix does not depend on an
unversioned browser Storage policy. It calls `info(path)` for every object before
download, rejects an object above 25 MiB or a selection above 100 MiB, then reads
each object as a bounded stream and aborts if the bytes exceed the trusted
Storage metadata or configured limit. Database `assets.size_bytes` is advisory
only and never authorizes a download.

The requested IDs must be unique and every requested ID must resolve to one
owned row. Missing, cross-user, legacy, invalid, metadata-failed, or
download-failed selections fail the entire request before ZIP delivery. Invalid
references return `422 asset_not_exportable`; size violations return `413`; a
Storage availability failure returns a structured non-2xx response. The route
never creates a silently incomplete ZIP and never calls `fetch(asset.url)`.

This preserves the approved legacy behavior: the item remains visible but cannot
be bulk-exported until the storage migration handles it.

---

## 4. Atomic server rate limiter

Migration `038_security_containment.sql` adds one service-only fixed-window
counter:

```sql
CREATE TABLE public.rate_limit_counters (
  key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL CHECK (count > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

public.consume_rate_limit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
) RETURNS JSONB;
-- { allowed: boolean, retry_after_seconds: integer }

public.clear_rate_limit(p_key TEXT) RETURNS BOOLEAN;
public.cleanup_rate_limit_counters(p_batch_size INTEGER) RETURNS INTEGER;

CREATE TABLE public.csp_observation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision TEXT NOT NULL CHECK (revision ~ '^[0-9a-f]{40}$'),
  csp_mode TEXT NOT NULL CHECK (csp_mode = 'report-only'),
  coolify_application_uuid TEXT NOT NULL,
  coolify_deployment_uuid TEXT NOT NULL,
  coolify_config_hash TEXT NOT NULL,
  runtime_fingerprint TEXT NOT NULL CHECK (runtime_fingerprint ~ '^[0-9a-f]{64}$'),
  edge_fingerprint TEXT NOT NULL CHECK (edge_fingerprint ~ '^[0-9a-f]{64}$'),
  gateway_boot_id UUID NOT NULL,
  gateway_fingerprint TEXT NOT NULL CHECK (gateway_fingerprint ~ '^[0-9a-f]{64}$'),
  activated_at TIMESTAMPTZ NOT NULL,
  first_eligible_slot_started_at TIMESTAMPTZ NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'active', 'sealed_pending', 'enforcement_started', 'enforced',
    'deactivated', 'invalidated', 'revoked'
  )),
  enforcement_attempt_id UUID NOT NULL,
  enforcement_token_hash TEXT NOT NULL
    CHECK (enforcement_token_hash ~ '^[0-9a-f]{64}$'),
  intended_enforce_config_hash TEXT
    CHECK (intended_enforce_config_hash IS NULL OR intended_enforce_config_hash ~ '^[0-9a-f]{64}$'),
  intended_enforce_runtime_fingerprint TEXT
    CHECK (intended_enforce_runtime_fingerprint IS NULL OR intended_enforce_runtime_fingerprint ~ '^[0-9a-f]{64}$'),
  seal_barrier_sequence BIGINT,
  sealed_at TIMESTAMPTZ,
  seal_hash TEXT CHECK (seal_hash IS NULL OR seal_hash ~ '^[0-9a-f]{64}$'),
  enforcement_deployment_uuid TEXT,
  enforcement_confirmation_deadline_at TIMESTAMPTZ,
  enforcement_confirmation_barrier_sequence BIGINT,
  current_enforced_revision TEXT
    CHECK (current_enforced_revision IS NULL OR current_enforced_revision ~ '^[0-9a-f]{40}$'),
  current_enforcement_deployment_uuid TEXT,
  enforcement_started_at TIMESTAMPTZ,
  enforced_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  deactivated_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  CHECK (first_eligible_slot_started_at >= activated_at),
  CHECK ((current_enforced_revision IS NULL) =
         (current_enforcement_deployment_uuid IS NULL)),
  CHECK (state <> 'enforced' OR current_enforced_revision IS NOT NULL)
);

CREATE UNIQUE INDEX csp_observation_one_live_run
  ON public.csp_observation_runs ((true))
  WHERE state IN ('active', 'sealed_pending', 'enforcement_started', 'enforced');

CREATE TABLE public.csp_observation_intervals (
  run_id UUID NOT NULL REFERENCES public.csp_observation_runs(id),
  slot_started_at TIMESTAMPTZ NOT NULL,
  slot_ended_at TIMESTAMPTZ NOT NULL,
  revision TEXT NOT NULL CHECK (revision ~ '^[0-9a-f]{40}$'),
  csp_mode TEXT NOT NULL CHECK (csp_mode = 'report-only'),
  state TEXT NOT NULL CHECK (state IN ('collecting', 'completed')),
  collection_token_hash TEXT NOT NULL,
  deployment_evidence_hash TEXT CHECK (
    deployment_evidence_hash IS NULL
    OR deployment_evidence_hash ~ '^[0-9a-f]{64}$'
  ),
  deployment_ok BOOLEAN,
  intake_edge_ok BOOLEAN,
  csp_violations_ok BOOLEAN,
  application_errors_ok BOOLEAN,
  quota_and_credits_ok BOOLEAN,
  deletion_workers_ok BOOLEAN,
  stripe_webhooks_ok BOOLEAN,
  healthy BOOLEAN GENERATED ALWAYS AS (
    state = 'completed'
    AND deployment_ok IS TRUE
    AND intake_edge_ok IS TRUE
    AND csp_violations_ok IS TRUE
    AND application_errors_ok IS TRUE
    AND quota_and_credits_ok IS TRUE
    AND deletion_workers_ok IS TRUE
    AND stripe_webhooks_ok IS TRUE
  ) STORED,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, slot_started_at)
);

CREATE TABLE public.csp_deployment_heartbeats (
  run_id UUID NOT NULL REFERENCES public.csp_observation_runs(id),
  minute_started_at TIMESTAMPTZ NOT NULL,
  revision TEXT NOT NULL CHECK (revision ~ '^[0-9a-f]{40}$'),
  csp_mode TEXT NOT NULL CHECK (csp_mode = 'report-only'),
  coolify_deployment_uuid TEXT NOT NULL,
  coolify_config_hash TEXT NOT NULL,
  runtime_fingerprint TEXT NOT NULL CHECK (runtime_fingerprint ~ '^[0-9a-f]{64}$'),
  edge_fingerprint TEXT NOT NULL CHECK (edge_fingerprint ~ '^[0-9a-f]{64}$'),
  gateway_boot_id UUID NOT NULL,
  gateway_fingerprint TEXT NOT NULL CHECK (gateway_fingerprint ~ '^[0-9a-f]{64}$'),
  live_header_ok BOOLEAN NOT NULL,
  provider_status_ok BOOLEAN NOT NULL,
  event_gateway_ok BOOLEAN NOT NULL,
  event_cursor_hash TEXT NOT NULL CHECK (event_cursor_hash ~ '^[0-9a-f]{64}$'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, minute_started_at)
);

CREATE TABLE public.csp_runtime_starts (
  boot_id UUID PRIMARY KEY,
  run_id UUID REFERENCES public.csp_observation_runs(id),
  coolify_application_uuid TEXT NOT NULL,
  coolify_deployment_uuid TEXT NOT NULL,
  revision TEXT NOT NULL CHECK (revision ~ '^[0-9a-f]{40}$'),
  csp_mode TEXT NOT NULL CHECK (csp_mode IN ('report-only', 'enforce')),
  coolify_config_hash TEXT NOT NULL CHECK (coolify_config_hash ~ '^[0-9a-f]{64}$'),
  runtime_fingerprint TEXT NOT NULL CHECK (runtime_fingerprint ~ '^[0-9a-f]{64}$'),
  edge_fingerprint TEXT NOT NULL CHECK (edge_fingerprint ~ '^[0-9a-f]{64}$'),
  enforcement_attempt_id UUID,
  authorization_state TEXT NOT NULL CHECK (authorization_state IN (
    'report_only', 'pending', 'authorized', 'rejected'
  )),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.csp_gateway_starts (
  boot_id UUID PRIMARY KEY,
  registration_sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  gateway_application_uuid TEXT NOT NULL,
  gateway_deployment_uuid TEXT NOT NULL,
  gateway_config_hash TEXT NOT NULL CHECK (gateway_config_hash ~ '^[0-9a-f]{64}$'),
  gateway_fingerprint TEXT NOT NULL CHECK (gateway_fingerprint ~ '^[0-9a-f]{64}$'),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.csp_deployment_events (
  run_id UUID NOT NULL REFERENCES public.csp_observation_runs(id),
  event_key TEXT NOT NULL CHECK (event_key ~ '^[0-9a-f]{64}$'),
  queue_sequence BIGINT NOT NULL UNIQUE,
  gateway_boot_id UUID NOT NULL REFERENCES public.csp_gateway_starts(boot_id),
  event_kind TEXT NOT NULL CHECK (event_kind IN (
    'deployment_success', 'deployment_failed', 'status_changed',
    'container_stopped', 'container_restarted'
  )),
  normalized_status TEXT NOT NULL CHECK (normalized_status IN (
    'progressing', 'healthy', 'failed', 'stopped', 'restarted'
  )),
  coolify_application_uuid TEXT NOT NULL,
  coolify_deployment_uuid TEXT NOT NULL,
  revision TEXT NOT NULL CHECK (revision ~ '^[0-9a-f]{40}$'),
  coolify_config_hash TEXT NOT NULL CHECK (coolify_config_hash ~ '^[0-9a-f]{64}$'),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, event_key)
);

CREATE SEQUENCE public.csp_gateway_queue_sequence;

CREATE TABLE public.csp_gateway_markers (
  marker_id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.csp_observation_runs(id),
  gateway_boot_id UUID NOT NULL REFERENCES public.csp_gateway_starts(boot_id),
  purpose TEXT NOT NULL CHECK (purpose IN (
    'minute_heartbeat', 'pre_seal_barrier', 'enforcement_start_barrier',
    'enforcement_confirm_barrier', 'docs_descendant_confirm_barrier',
    'enforced_rollback_barrier', 'enforced_rollback_confirm_barrier'
  )),
  marker_token_hash TEXT NOT NULL CHECK (marker_token_hash ~ '^[0-9a-f]{64}$'),
  queue_sequence BIGINT UNIQUE,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.csp_enforced_descendant_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.csp_observation_runs(id),
  base_revision TEXT NOT NULL CHECK (base_revision ~ '^[0-9a-f]{40}$'),
  target_revision TEXT NOT NULL CHECK (target_revision ~ '^[0-9a-f]{40}$'),
  retry_of UUID REFERENCES public.csp_enforced_descendant_authorizations(id),
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  docs_diff_proof_hash TEXT NOT NULL CHECK (docs_diff_proof_hash ~ '^[0-9a-f]{64}$'),
  normalized_config_hash TEXT NOT NULL CHECK (normalized_config_hash ~ '^[0-9a-f]{64}$'),
  runtime_fingerprint TEXT NOT NULL CHECK (runtime_fingerprint ~ '^[0-9a-f]{64}$'),
  edge_fingerprint TEXT NOT NULL CHECK (edge_fingerprint ~ '^[0-9a-f]{64}$'),
  gateway_boot_id UUID NOT NULL REFERENCES public.csp_gateway_starts(boot_id),
  gateway_fingerprint TEXT NOT NULL CHECK (gateway_fingerprint ~ '^[0-9a-f]{64}$'),
  authorized_after_sequence BIGINT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'consumed', 'confirmed', 'revoked')),
  deployment_uuid TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  confirmation_deadline_at TIMESTAMPTZ,
  confirmation_barrier_sequence BIGINT,
  confirmed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX csp_descendant_target_attempt
  ON public.csp_enforced_descendant_authorizations
    (run_id, target_revision, attempt_number);

CREATE UNIQUE INDEX csp_one_live_enforced_descendant
  ON public.csp_enforced_descendant_authorizations ((true))
  WHERE state IN ('pending', 'consumed');

CREATE TABLE public.csp_enforced_rollback_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.csp_observation_runs(id),
  from_revision TEXT NOT NULL CHECK (from_revision ~ '^[0-9a-f]{40}$'),
  from_deployment_uuid TEXT NOT NULL,
  target_revision TEXT NOT NULL CHECK (target_revision ~ '^[0-9a-f]{40}$'),
  normalized_config_hash TEXT NOT NULL CHECK (normalized_config_hash ~ '^[0-9a-f]{64}$'),
  runtime_fingerprint TEXT NOT NULL CHECK (runtime_fingerprint ~ '^[0-9a-f]{64}$'),
  edge_fingerprint TEXT NOT NULL CHECK (edge_fingerprint ~ '^[0-9a-f]{64}$'),
  gateway_boot_id UUID NOT NULL REFERENCES public.csp_gateway_starts(boot_id),
  gateway_fingerprint TEXT NOT NULL CHECK (gateway_fingerprint ~ '^[0-9a-f]{64}$'),
  authorized_after_sequence BIGINT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'consumed', 'confirmed', 'revoked')),
  deployment_uuid TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  confirmation_deadline_at TIMESTAMPTZ,
  confirmation_barrier_sequence BIGINT,
  confirmed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX csp_one_live_enforced_rollback
  ON public.csp_enforced_rollback_authorizations ((true))
  WHERE state IN ('pending', 'consumed');

public.activate_csp_observation(
  p_revision TEXT,
  p_csp_mode TEXT,
  p_coolify_application_uuid TEXT,
  p_coolify_deployment_uuid TEXT,
  p_coolify_config_hash TEXT,
  p_runtime_fingerprint TEXT,
  p_edge_fingerprint TEXT,
  p_gateway_boot_id UUID,
  p_gateway_fingerprint TEXT,
  p_enforcement_attempt_id UUID,
  p_enforcement_token_hash TEXT
) RETURNS JSONB;
-- { success, run_id, activated_at, first_eligible_slot_started_at }

public.get_csp_activation_state(
  p_expected_revision TEXT
) RETURNS JSONB;
-- redacted active state/attempt ID/pinned identity only; never token/hash

public.deactivate_csp_observation(
  p_expected_revision TEXT
) RETURNS JSONB;

public.seal_csp_observation(
  p_expected_revision TEXT,
  p_pre_seal_barrier_id UUID,
  p_normalized_current_config JSONB,
  p_normalized_intended_enforce_config JSONB
) RETURNS JSONB;
-- atomically requires the latest acknowledged FIFO barrier, an exact
-- CSP_MODE-only normalized config delta, and 672 healthy consecutive slots;
-- { success, run_id, seal_hash, sealed_at }

public.begin_csp_gateway_marker(
  p_expected_revision TEXT,
  p_purpose TEXT
) RETURNS JSONB;
-- one opaque marker token; receiver acknowledgement assigns DB queue sequence

public.acknowledge_csp_gateway_marker(
  p_marker_token TEXT,
  p_gateway_boot_id UUID
) RETURNS JSONB;
-- the single FIFO receiver assigns the next database sequence; caller supplies none

public.consume_csp_enforcement(
  p_boot_id UUID,
  p_expected_revision TEXT,
  p_enforcement_attempt_id UUID,
  p_enforcement_token TEXT,
  p_seal_hash TEXT,
  p_start_barrier_id UUID,
  p_fixed_enforce_identity JSONB
) RETURNS JSONB;
-- sealed_pending -> enforcement_started once for the exact deployment/config

public.confirm_csp_enforcement(
  p_expected_revision TEXT,
  p_enforcement_attempt_id UUID,
  p_seal_hash TEXT,
  p_confirmation_barrier_id UUID
) RETURNS JSONB;

public.revoke_csp_enforcement(
  p_expected_revision TEXT,
  p_enforcement_attempt_id UUID,
  p_reason TEXT
) RETURNS JSONB;

public.authorize_csp_enforced_docs_descendant(
  p_base_revision TEXT,
  p_target_revision TEXT,
  p_docs_diff_proof_hash TEXT,
  p_normalized_config_hash TEXT,
  p_runtime_fingerprint TEXT,
  p_edge_fingerprint TEXT
) RETURNS JSONB;
-- creates one 30-minute pending target only while the base run is confirmed enforced

public.consume_csp_enforced_docs_descendant(
  p_boot_id UUID,
  p_target_revision TEXT,
  p_enforcement_token TEXT,
  p_start_barrier_id UUID,
  p_fixed_identity JSONB
) RETURNS JSONB;

public.confirm_csp_enforced_docs_descendant(
  p_target_revision TEXT,
  p_docs_diff_proof_hash TEXT,
  p_confirmation_barrier_id UUID
) RETURNS JSONB;

public.revoke_csp_enforced_docs_descendant(
  p_target_revision TEXT,
  p_reason TEXT
) RETURNS JSONB;

public.authorize_csp_enforced_rollback(
  p_expected_current_revision TEXT,
  p_target_revision TEXT,
  p_normalized_config_hash TEXT,
  p_runtime_fingerprint TEXT,
  p_edge_fingerprint TEXT
) RETURNS JSONB;
-- creates one 15-minute pending transition to an already-confirmed enforced revision

public.consume_csp_enforced_rollback(
  p_boot_id UUID,
  p_target_revision TEXT,
  p_enforcement_token TEXT,
  p_rollback_barrier_id UUID,
  p_fixed_identity JSONB
) RETURNS JSONB;

public.confirm_csp_enforced_rollback(
  p_target_revision TEXT,
  p_confirmation_barrier_id UUID
) RETURNS JSONB;

public.revoke_csp_enforced_rollback(
  p_target_revision TEXT,
  p_reason TEXT
) RETURNS JSONB;

public.get_csp_runtime_authorization_health(
  p_boot_id UUID
) RETURNS JSONB;
-- expires a stale enforcement_started parent and stale child transitions under
-- the run lock, then returns only
-- { healthy, current_revision }; it exposes no token/config/provider identity

public.begin_csp_observation_interval(
  p_revision TEXT,
  p_csp_mode TEXT
) RETURNS JSONB;
-- { success, collection_token, slot_started_at, slot_ended_at }

public.finish_csp_observation_interval(
  p_collection_token TEXT,
  p_fixed_checks JSONB
) RETURNS JSONB;

public.record_csp_deployment_heartbeat(
  p_fixed_identity JSONB
) RETURNS JSONB;

public.register_csp_runtime_start(
  p_boot_id UUID,
  p_fixed_identity JSONB
) RETURNS JSONB;

public.register_csp_gateway_start(
  p_boot_id UUID,
  p_fixed_gateway_identity JSONB
) RETURNS JSONB;

public.record_csp_deployment_event(
  p_event_key TEXT,
  p_event_kind TEXT,
  p_authoritative_identity JSONB
) RETURNS JSONB;
-- exact fixed-app provider lookup result; RPC assigns the shared next DB queue sequence

public.get_csp_observation_window(
  p_expected_revision TEXT,
  p_limit INTEGER DEFAULT 700
) RETURNS SETOF public.csp_observation_intervals;

public.get_csp_enforcement_authorization(
  p_expected_revision TEXT,
  p_enforcement_attempt_id UUID,
  p_seal_hash TEXT
) RETURNS JSONB;
-- only consumed/confirmed exact identity plus immutable 672-slot summary
```

All functions are `SECURITY DEFINER SET search_path = public`. `PUBLIC`, `anon`,
and `authenticated` receive no execute privilege; only `service_role` may call
them. `consume_rate_limit` performs one atomic upsert and returns the decision
from the updated row, so parallel requests cannot all observe the same old count.
Before any mutation, the fixed configure tool reads the service-only redacted
activation state and the current protected deployment configuration. If the same
revision is already active, it performs no provider/config rollout and creates no
new attempt/token; it calls the idempotent activation RPC only with the existing
protected attempt/token so SQL can verify their hash and every pinned identity,
then returns the original boundary. A missing/mismatched protected value fails
unchanged rather than replacing it. Only when no active run exists may the tool
create one random enforcement attempt ID/token, store the raw token only in
protected deployment configuration, complete that report-only rollout, prove it,
and activate. Activation stores only its token hash together with database time, fixed Coolify application/deployment/config
identity, allowlisted non-secret runtime/edge fingerprints, the independently
registered gateway boot UUID/fingerprint, and the first aligned
15-minute slot whose start is not earlier than activation. Repeating activation
for the same already-active revision, attempt and identities is idempotent and
cannot reset that boundary or cause a boot. A different active revision/identity
fails until explicit deactivation/invalidation; a new run is created only after
a fresh report-only rollout/proof. The observation begin RPC loads
that one active run, derives only the previous fully ended 15-minute `[start,end)`
interval from database time, and returns `not_yet_eligible` without inserting if
the slot starts before `first_eligible_slot_started_at`. Otherwise it inserts the
slot once as `collecting` for that run and returns an opaque one-use token plus
those bounds. The collector queries every health source over exactly those
returned bounds. Its fixed finish payload contains the six non-deployment health
booleans plus a SHA-256 digest of the fully paginated Coolify deployment-history
proof for those bounds. The RPC derives `deployment_ok`: it requires all 15
database-timed minute heartbeats with the run's exact identities, successful live
header/provider/gateway checks plus a fresh acknowledgement cursor, no relevant event or invalidation, and the bounded
provider-history result. It can transition that token to `completed` once.
`healthy` is database-derived, never caller-supplied. A crash leaves an unhealthy
collecting row; a duplicate/manual run cannot overwrite it or select an older/
current slot. Rows remain 400 days. Missing rows and failed first attempts remain
visible; no caller may supply a timestamp or rewrite history. The service-only
reader returns only the current run, so an older activation—even for the same
revision—cannot contribute slots to the final mechanical 672-completed-slot gate.

`register_csp_runtime_start` is called by `instrumentation.ts` before readiness
on every process boot. It records a database-timed boot ID. In report-only mode,
if an active run's activation already exists, any new boot atomically marks that
run `invalidated` even when application/revision/mode/fingerprint are identical.
A valid report-only process may then become ready, but the seven-day run cannot
survive; an intrinsically invalid startup stays unready. This makes a lost
provider restart notification fail closed without using an active observation as
an availability lock. The current deployment's already-running replicas must all
be registered and match before activation.

In deployed enforce mode, syntactically valid `CSP_MODE` is insufficient.
Instrumentation registers the boot as pending, sends an
`enforcement_start_barrier` marker through the same FIFO gateway/queue, waits for
its durable acknowledgement, then calls `consume_csp_enforcement` before
readiness. The first matching boot atomically requires `sealed_pending`, the
pre-provisioned attempt/token hash, seal hash, exact revision/application, the
stored intended normalized config/runtime/edge plus gateway boot fingerprints,
and an event stream
through that barrier containing only the expected enforcement deployment. It
binds the actual deployment UUID and changes the state to
`enforcement_started`; later replicas/restarts become ready only for that same
attempt and bound identity until a database-timed 60-minute
`enforcement_confirmation_deadline_at`. The runtime-health reader accepts that
exact consumed parent deployment before the deadline. Confirmation sets the run's
`current_enforced_revision`/`current_enforcement_deployment_uuid` pointer to that
exact live pair. Enforce startup without this consumed authorization,
or with a revoked/spent/mismatched seal, stays unready.
`record_csp_deployment_event` is fed only by the protected internal Coolify event
gateway, implemented as a separately deployed/pinned one-replica service rather
than a target Next.js route. It remains healthy/reachable when every target
replica is stopped or unready. On every process start it creates a random boot
UUID and calls `register_csp_gateway_start` before its healthcheck passes.
Activation requires the single highest database-generated registration sequence
and pins that boot. Any later gateway boot
atomically invalidates an active run even when application/deployment/config are
unchanged; during a sealed/enforcement handoff, a different boot makes the
barrier/consume fail and revokes the attempt. The receiver treats payload identity as a hint only and enriches each
allowlisted event from the fixed Coolify application API before storing the
authoritative deployment UUID, revision and normalized config hash. Any target-app deployment success/failure, status change, container
stop, or restart while active invalidates the run, even when a later probe
returns to the expected SHA. Events received after sealing are retained for the
enforcement-start barrier; the consume RPC permits only the one exact intended
config-only deployment and revokes every other event sequence. Late queued event
delivery therefore cannot disappear behind the state change.
The receiver also maps the provider/API result to the fixed stored
`normalized_status`; it never trusts payload wording. Transition streams may
contain progressing then healthy events only for the exact bound deployment and
must end with a fresh healthy provider read. `failed`, `stopped`, `restarted`, a
different identity, or a later non-healthy status is disallowed at both consume
and confirmation barriers.

`record_csp_deployment_heartbeat` derives the current minute from database time;
it accepts no timestamp/backfill selector and inserts one immutable row per run/
minute. A protected non-overlapping Coolify task runs it every minute after
probing the exact Production origin and current Coolify application/deployment/
config status. Any mismatch invalidates the run; a missed minute stays missing.
The task also sends one nonce-bearing synthetic health marker through the same
authenticated gateway, durable queue, and receiver used by Coolify events, waits
for its database acknowledgement, and hashes that database-derived monotonically
increasing acknowledgement into `event_cursor_hash`. Health markers are a fixed
internal event kind and never count as deployment events. A row is accepted only
for the same database minute and only after that exact round trip; a replayed,
missing, stale, or ambiguous acknowledgement makes it unhealthy and cannot be
backfilled. The marker and heartbeat boot UUID/fingerprint must equal the
activation values, so a same-config gateway restart cannot pass between minutes.
Real target-app events retain their separate idempotent provider key
and invalidate the active run.
The gateway uses one serialized durable FIFO stream and the shared monotonically
increasing database sequence for events and markers; it returns success only
after commit, and acknowledgements cannot overtake earlier accepted real events
or be caller-backfilled. Event, marker, docs-authorization, and rollback-
authorization RPCs lock the same run row before reading/assigning that sequence,
so each authorization stores one unambiguous latest committed
`authorized_after_sequence`; a racing event is wholly before or after it, never
lost between clocks. Every stored event/marker carries the process boot UUID;
the pinned application/deployment/config plus boot fingerprint make gateway
restart/change/outage invalidate the run.
Fingerprint inputs are a fixed allowlist and store hashes only—never secrets or
raw environment values. Runs, authorizations, runtime/gateway starts, markers,
events, heartbeats, and intervals remain
400 days under bounded cleanup.

After the read-only verifier accepts 672 slots while report-only is still live,
the configure tool reads the fixed normalized non-secret Coolify configuration,
constructs an intended copy whose only difference is
`CSP_MODE: report-only -> enforce`, and rejects any other delta. It then sends a
unique `pre_seal_barrier` through the same FIFO gateway/queue and waits for its
database acknowledgement. `seal_csp_observation` locks that latest acknowledged
barrier and the active run in one transaction, requires no preceding unprocessed
event, rechecks the exact 672 rows, independently compares the two normalized
JSON objects/key sets, hashes them in PostgreSQL, and requires the current hash
to equal the activation hash. It stores the intended enforce config/runtime
fingerprint, barrier sequence and immutable audit seal hash, then changes
`active` to `sealed_pending`. Caller JSON cannot claim a drain or a hash.

The only permitted next rollout uses an optimistic provider revision and applies
that exact normalized snapshot, so the effective Coolify delta is only
`CSP_MODE`; the already-provisioned attempt/token do not change. The first enforce
boot's later FIFO barrier and `consume_csp_enforcement` are the one-use
authorization. Only after the cumulative smoke and fresh probe does the tool
send an `enforcement_confirm_barrier`. `confirm_csp_enforcement` locks the run
against the recorder, requires that acknowledged marker to be the latest
committed sequence with no disallowed event after the start barrier, and in the
same transaction changes `enforcement_started` to `enforced` plus the current
pointer. A missing/stale/overtaken barrier or elapsed 60-minute deadline revokes
and stays unhealthy; the evidence
reader returns only that consumed/confirmed attempt and its immutable summary.
Any mismatch or explicit rollback calls `revoke_csp_enforcement`; a report-only
boot locks the run and atomically revokes the parent plus every pending/consumed
docs-descendant or enforced-rollback child before readiness.
`revoked` can never return to an enforcement state, so the old token/seal cannot
authorize a retry. The fixed configure command disables both observation
schedulers after sealing. An aborted pre-gate run uses `deactivate`; rollback to
report-only requires a new activation and full clock.

The final observed-facts documentation commit is not allowed to reuse the seal
as a general deployment credential. While the run is already `enforced`, the
fixed release tool may create one 30-minute descendant authorization only after
its Git guard proves ancestry from the currently served authorized revision and
an exact allowlist of documentation/evidence paths, with no application,
dependency/lock, script, workflow, migration, environment, or configuration
change. Both transition-authorize RPCs lock the same run row and reject a pending/
consumed row in either authorization table. The docs row also snapshots the
latest committed FIFO sequence before any push, and its later start barrier must
be greater; only exact target-deployment events may appear between those two
sequences. The database row pins base/target full SHAs, the diff-proof hash, and the
unchanged normalized config/runtime/edge fingerprints plus the exact registered
gateway boot UUID/fingerprint. Before the known target commit is pushed, the
authorization must already exist; an unexpected merge SHA or a gateway restart
therefore stays unready.
The first attempt for a target must predate its initial push. If that exact
attempt is later revoked, the target is not globally burned: before a new
provider deployment, the tool may create a new numbered row linked by `retry_of`
only when the original pre-push proof, target bytes/ancestry, current-enforced
base pointer, config/runtime/edge, and gateway boot all still match. A revoked or
consumed row is never reset/reused. SQL also requires the link to the same run/
target, the immediately preceding revoked attempt number, and a single immutable
root proof. The partial live-transition index and run
lock still allow only one attempt; history remains append-only.

Instrumentation for that exact target sends the same enforcement-start FIFO
barrier, uses the still-protected run token only as authentication, and consumes
the target row once for its actual deployment UUID. It does not change or reopen
the 672-slot seal. Consume must occur before pending `expires_at`; it sets a
separate database-timed 15-minute `confirmation_deadline_at`. Fresh Production
probes then send a `docs_descendant_confirm_barrier`. Confirmation locks the run,
requires that marker to be the latest committed FIFO sequence with no disallowed
event since the start barrier, and before the deadline atomically moves the run's
current-enforced pointer to that revision/deployment;
an expired/mismatched proof or rollback revokes the transition row.

A previously confirmed enforce revision is a rollback target only through a
separate one-use 15-minute authorization; its old deployment UUID is never
assumed to survive a Coolify rollback/redeploy. Before changing provider state,
the fixed tool locks the enforced run, requires the target to be either its
original confirmed revision or a confirmed docs descendant, snapshots the
current-enforced pointer, and pins unchanged normalized config/runtime/edge plus
the exact gateway boot stored by the run plus the latest committed FIFO sequence;
a later registered gateway boot cannot authorize recovery. In the same lock
it rejects any live descendant or rollback authorization, so two transition
types cannot race. The rollback boot
sends an `enforced_rollback_barrier`, consumes that exact target once, and binds
the newly created deployment UUID before readiness. Between the stored boundary
and that barrier, the stream may contain only events for that exact rollback
deployment; an event racing authorization is serialized wholly to one side.
Consume sets its own 15-minute confirmation deadline. A fresh Production probe
then sends an `enforced_rollback_confirm_barrier`; the confirmation RPC locks the
recorder boundary, requires that marker to remain latest with only exact-target
events since the start barrier, and atomically advances the current-enforced
pointer. An absent
authorization, different UUID/SHA/fingerprint, expired row, gateway restart,
out-of-order event, or replay stays unready and revokes the transition. If the
platform merely routes back to the already-running exact current confirmed
deployment, no new boot/UUID is accepted or invented. A failed docs transition
is revoked before rollback authorization is created. A report-only rollback
instead revokes the whole run. Any non-docs forward delta has no authorization
path and requires a new Quality release plus report-only observation.

Under the same run lock, both authorize RPCs first revoke every pending row whose
`expires_at` passed and every consumed row whose confirmation deadline passed,
then enforce the cross-table single-live-transition rule. An exact still-live
pending retry is idempotent; a consumed retry may only finish probe/confirmation
or explicitly revoke. A later same-target attempt uses the numbered `retry_of`
chain above rather than violating history or rearming a spent row. Thus a crash after authorize or consume cannot wedge a
future transition until 400-day retention. In enforce mode, the public health
route calls the service-only authorization-health reader on each probe. It
returns 503 without details if the boot is neither the exact unexpired consumed
initial `enforcement_started` deployment, the exact current confirmed deployment,
nor bound to an unexpired consumed child; the reader atomically revokes an
expired parent attempt and stale children. Database failure fails health closed. Confirmation moves
the pointer before the child becomes historical, after which ordinary matching
replica/restart health no longer depends on that child row.

Application interface:

```ts
export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function consumeServerRateLimit(input: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitDecision>;

export async function clearServerRateLimit(key: string): Promise<void>;
```

An index on `expires_at` and one idempotently named hourly `pg_cron` job delete
expired rows in bounded batches. The migration and rollout verify that the job
exists; retention is not delegated to the old `system_settings` cleanup.

Database failure is configurable per caller. Admin authentication fails closed
with `503 login_temporarily_unavailable`; a broken limiter never becomes unlimited
password guessing.

---

## 5. Trusted client identity

The application does not trust raw `X-Forwarded-For`. In Staging and Production,
Admin login is enabled only after the proxy trust boundary is verified and a
single valid overwritten `X-Real-IP` is available; a missing/malformed trusted
address returns `503 login_temporarily_unavailable` without consuming a shared
counter. A dedicated higher-priority Traefik router for the exact
`/api/admin/auth/login` path applies a source-IP rate of 20 per 15 minutes with a
burst of 5, then a host-grouped global 300/minute ceiling, then
`maxRequestBodyBytes=4096`, with observable 413/429 metrics. The rate middlewares
run before buffering so an already denied source does not make Traefik read its
body. Multiple replicas use shared edge limiters or explicit per-replica budgets
whose sums remain within those ceilings. Rejected edge traffic never reaches
Next.js.

Inside Next.js, cheap method/content-type/content-length checks may run without
reading the body. The route then resolves the trusted address and passes a
hard-capped local LRU with fixed per-IP and per-instance 300/minute global
admission before constructing Supabase or reading/parsing the body. Ingress
verification separately proves the shared/per-replica edge-global sum is at most
300. Local
denial returns 429 and causes no durable increment. Only an admitted request consumes its durable IP
key; only an allowed IP request reads a body bounded again to 4096 bytes. After
successful bounded validation, login consumes the remaining keys in this order:

```text
admin-login:ip:<validated address>              -> 20 attempts / 15 minutes
admin-login:global-admitted                     -> 300 attempts / minute
admin-login:user:<sha256(normalized username)>  -> 5 attempts / 15 minutes
```

`getTrustedClientIp(request)` reads `X-Real-IP` only when
`TRUSTED_PROXY_HEADERS=true` and accepts only a single valid IPv4 or IPv6 address.
Local/Test may return `null` and use an explicit test-only path; deployed Admin
auth never skips the IP gate. The IP decision happens before the shared counter,
so 300 requests from one address consume at most 20 admitted-global increments
and cannot lock out every Admin. The admitted-global counter then bounds
distributed high-cardinality username creation, and only admitted requests can
create a username row. Because the local/edge gates close before the twenty-first
durable consume, one source cannot force an unlimited stream of denied-counter
writes or oversized JSON parses. Production may enable proxy trust only after the
Coolify/Traefik origin is closed to direct public traffic and the proxy overwrites
the header.

A successful login clears the username counter. The IP counter remains until its
window expires, preventing one known password from erasing network abuse history.

---

## 6. CSP rollout

The current static CSP in `next.config.ts` permits both `'unsafe-inline'` and
`'unsafe-eval'` in `script-src`. The release moves request-specific script policy
to `middleware.ts` and generates a fresh nonce for every rendered request.

```ts
export type CspMode = 'report-only' | 'enforce';

export function createCspNonce(): string;
export function readCspMode(env: NodeJS.ProcessEnv): CspMode;
export function buildContentSecurityPolicy(input: {
  nonce: string;
  production: boolean;
  reportUri: string;
}): string;
```

Production `script-src` contains `'self'`, the nonce, `'strict-dynamic'`, and the
required Stripe/Vercel hosts. It contains neither `'unsafe-inline'` nor
`'unsafe-eval'`. Development may keep `'unsafe-eval'`. `style-src` remains
unchanged in this release because inline styles are a separate compatibility
surface and do not reopen inline script execution.

Nonce CSP requires dynamic rendering in Next.js 15. The root, locale, and Admin
layouts explicitly opt into request-time rendering before nonce rollout; the
Staging gate measures the public-page cache/latency impact instead of assuming
static output can carry a per-request nonce. A built-server smoke test verifies
that every rendered script nonce matches the response policy.

The middleware sets `x-nonce` and the CSP on the forwarded request, then sets the
matching response header. `CSP_MODE=report-only` uses
`Content-Security-Policy-Report-Only`; `CSP_MODE=enforce` uses
`Content-Security-Policy`.

Staging/Production require an explicit exact `CSP_MODE`; missing, empty, or any
other value fails environment validation/startup rather than silently choosing a
header or enforcing early. Local development may default to `report-only` only.
The root Next.js instrumentation `register()` executes a server-only startup
validator before readiness; a request-time middleware error alone does not meet
this contract. Deployed startup also requires exact release identity and the
verified trusted-proxy flag. Production enforce additionally requires the
pre-provisioned attempt/token to consume or match the exact non-revoked database
authorization described above; a valid string value alone never makes readiness
healthy. Secrets and raw tokens never appear in health output or release evidence.

The new policy preserves and tests every existing defensive directive, including
`object-src`, `base-uri`, `form-action`, `frame-ancestors`, `connect-src`,
`img-src`, `media-src`, and `upgrade-insecure-requests`; only the script policy
and report destination change.

`/api/security/csp-report` is an explicit unauthenticated middleware exception
because browser reports may not carry a session, but public traffic does not go
straight to Supabase. A dedicated higher-priority Traefik router first applies
an 8192-byte buffering limit and a source-IP token bucket of 120/minute with a
burst of 20. Multi-replica deployments use a shared Redis-backed limiter when
available or per-replica budgets whose declared sum is bounded; the rollout gate
proves the effective configuration and edge metrics before enabling the route.
Rejected edge traffic never reaches Next.js or the database.

Inside Next.js, a bounded-memory/LRU admission guard enforces a second fixed
per-IP bucket plus a per-instance global ceiling before creating a Supabase
client or reading the full body. It evicts expired entries and has a hard key
cap. Only admitted requests may consume the independent durable
`csp-report:global` limit at 1000 reports/minute and
`csp-report:ip:<trusted-ip>` at 120/minute. Thus traffic above the limit does not
keep upserting the durable counter. The route rejects an admitted body above
8 KiB with `413`; accepted bodies are allowlisted, stripped of newlines, and
return `204`. It never consumes or clears an `admin-login:*` counter. Local or
durable denial/unavailability drops the log; application-level denial still
returns 204. It never echoes the body, renders reported text, or writes it to
Admin HTML.

Migration 038 also owns bounded minute-bucket intake counters for outcomes
`accepted`, `admission_limited`, `global_limited`, `ip_limited`, `invalid`,
`oversized`, and `limiter_unavailable`, retained for 14 days by the same cleanup
job. The route increments only process-local fixed counters per request; one
bounded batch flush per minute upserts those aggregate outcomes, so a flood does
not create one metric write per rejected request. Edge 413/429 counts come from
Traefik metrics and are reconciled by the health check. If the database/limiter
or aggregate flush is unavailable, the deployment log metric records that
outage. A protected monitor sends a synthetic allowlisted report on schedule;
public callers still receive only the endpoint's normal empty response.
The final observation window is not “clean” if a canary interval is missing,
intake/edge health is unavailable, aggregate flush is missing, or
saturation/unavailability occurs without a reviewed explanation. Each fully
ended interval separately queries bounded sanitized report summaries;
unreviewed/actionable CSP violations make `csp_violations_ok=false`. Telemetry
loss pauses/resets the clock instead of hiding violations.
`deletion_workers_ok` covers account/asset deletion plus generation-persistence
reconciliation last-run age, backlog, lease-expired in-flight attempts, and
receipt-pending alerts; an unresolved
unknown Storage outcome cannot hide behind a generically healthy cron.

Deployment continuity is not inferred from the post-slot probe. Activation pins
the Coolify application UUID, deployment UUID, provider config hash, and hashed
runtime/edge allowlists. Each slot requires all 15 immutable minute heartbeats,
then fully paginates Coolify's application-deployment history with fixed
`skip`/`take` until the exact `[start,end)` range is exhausted. A hidden second
page, API outage, ambiguous timestamp, config/status mismatch, missing
heartbeat, or relevant event makes `deployment_ok=false`. The internal Coolify
notification receiver is an independently pinned service, reachable only through
a private/source-restricted gateway because provider payloads are unsigned; the
marker path is secret-authenticated. Its delivery/queue health and immutable
identity are themselves part of the heartbeat, and a zero-target-replica cold-
start test proves it cannot depend on app readiness. Every process boot also registers before
readiness. These independent paths make a temporary redeploy or mode/config
change invalidate the whole run rather than disappear between 15-minute probes.

Production remains report-only throughout the Financial, Storage/AI, and Quality
releases. The final Program Integration gate starts a new seven-complete-day
observation window only after the exact fully assembled Quality commit is live.
Enforcement is then one config change after reports and cumulative smoke show
that Admin, authentication, Stripe Checkout, and all nine studios work. Rollback
is enforce to report-only, never restoration of the HTML sink or remote asset
fetch.

---

## 7. Test strategy

- Component tests render hostile JSON and prove it remains a text node.
- Route tests assert invalid asset URLs never call global `fetch` or Storage
  download.
- SQL tests issue concurrent calls and prove the sixth username attempt is
  denied.
- Observation tests reject missing minute heartbeats, changed runtime/edge/
  Coolify identity, a transient redeploy or mode change that later returns to the
  expected value, a hidden deployment-history event on page two, event-gateway/
  queue outage or stale cursor, any same-identity boot after activation, API
  outage, a standalone-gateway restart with unchanged deployment/config,
  current-minute/backfill attempts, and late event invalidation of a
  previously completed slot. A stable exact-identity interval is the only green
  deployment fixture.
- Sealing tests reject 671/gapped/unhealthy slots, a missing/replayed/non-latest
  FIFO barrier, an earlier queued event, and any normalized config delta beyond
  `CSP_MODE`. They seal exactly 672 for the active SHA and disable collection.
  Enforce-start tests prove a syntactically valid mode without seal/token stays
  unready, the acknowledged start barrier binds one exact deployment/config and
  consumes the attempt once, later matching replicas can become ready, an
  unexpected post-seal event/config fails, and rollback permanently revokes the
  old token/seal. The exact consumed parent stays healthy only through its
  60-minute database deadline. Its final confirm barrier must remain the latest
  sequence under the recorder lock; expiry or an intervening event revokes it.
- Enforced-descendant tests authorize only a known full-SHA descendant whose
  guard proof contains exact allowed documentation/evidence paths and unchanged
  config/runtime/edge/gateway-boot hashes. They prove preauthorization precedes push, one
  FIFO-bound deployment consumes it, a different/expired SHA or any code/config/
  workflow/migration path stays unready, confirmation succeeds once, and the
  prior confirmed revision remains eligible for the separate rollback flow.
  Their distinct final confirm barrier rejects an event accepted after start/
  smoke but before the pointer update.
- Enforced-rollback tests prove a direct boot of an old confirmed SHA under a
  new deployment UUID stays unready. They revoke any failed descendant first,
  authorize one exact previously confirmed revision before provider mutation,
  require the later FIFO rollback barrier, bind the new UUID once, confirm it
  with a fresh probe, and update the current-enforced pointer. Concurrent docs/
  rollback authorizations, unconfirmed targets, changed fingerprints, expired
  rows, gateway restarts, event overtakes, duplicate consume, and replay all fail.
  A simultaneous event/authorization test proves the event is either included
  before the stored boundary or evaluated in the bounded transition stream.
  Its distinct final confirm barrier likewise must remain latest before the
  current-enforced pointer moves.
  Crash-after-authorize and crash-after-consume fixtures advance database time,
  require health to fail/revoke after the proper pending/confirmation deadline,
  and prove the next authorize is not blocked by the historical row. A
  report-only boot racing either child transition atomically revokes the parent
  and all pending/consumed children; no global partial index remains wedged.
  Revoke a first pre-push docs attempt, then prove a new linked attempt for the
  same target can be created only before a new provider deploy and only with the
  identical immutable proof/current pointer; resetting the old row or changing
  proof/base/fingerprint is rejected.
- Login route tests rotate untrusted `X-Forwarded-For`, require a trusted
  deployed IP, and prove 300 attempts from one address add at most 20
  admitted-global increments rather than locking out another address. An
  over-limit/oversized flood performs no body parse or Supabase call after local
  admission closes; ingress tests prove the exact Admin router's 4096-byte and
  source-IP limits.
- CSP unit tests snapshot report-only and enforce headers in development and
  production, and prove missing/invalid Production mode fails startup validation.
- Middleware/ingress tests prove public CSP reports reach the endpoint, an
  over-limit flood produces zero extra Supabase calls after local admission,
  edge body/rate limits are attached to the exact router, the bounded LRU and
  batch metric flush cannot grow/write per rejected request, CSP traffic cannot
  affect Admin-login counters, and Supabase rotated cookies survive response
  finalization.
- A built-server integration smoke proves dynamic HTML and CSP nonces agree.
- Staging browser tests expand a malicious Admin row, exercise login throttling,
  and export one canonical and one legacy asset.

No test uses Production Stripe or changes Production balances.

---

## 8. Release and rollback

1. Establish the deterministic test harness.
2. Ship the XSS and export fixes as soon as their focused tests pass.
3. Apply migration `038` to Staging and deploy the Admin limiter.
4. Confirm proxy behavior before enabling trusted IP headers.
5. Deploy CSP in report-only mode.
6. Deploy Production and run the same smoke set with owned test accounts.
7. Keep CSP report-only across the remaining subsystem releases.
8. Let the Program Integration gate observe the final assembled release for
   seven complete days, enforce CSP, and repeat cumulative smoke.

The database migration is additive. An application rollback does not require
dropping the counter table. Security controls are fixed forward rather than
reopening the original exposure.
After CSP is confirmed enforced, a redeploy rollback that receives a new
deployment UUID must use the short-lived FIFO-bound enforced-rollback
authorization above; merely naming a previously confirmed SHA never bypasses
startup readiness. Returning to report-only follows the separate revoke path and
requires a fresh seven-day observation before enforcing again.
