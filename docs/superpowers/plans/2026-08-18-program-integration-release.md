# Program Integration and Final Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every worker correct PyraSuite context, provision an isolated rehearsal environment before Security needs it, bind redacted reviewable evidence to the actually served revision, and close the program only after cumulative Production verification and final CSP enforcement.

**Architecture:** After the Security test harness, install repository onboarding, release-proof tooling, and isolated Staging/Stripe-Test fixtures. Execute the four subsystem plans in release order while CSP stays report-only. Then verify the cumulative Staging candidate, release the final Quality commit through `main`, observe the fully assembled Production app for seven complete days, enforce CSP, and reconcile documentation from observed facts.

**Tech Stack:** Next.js 15, TypeScript strict, Vitest, Playwright, Supabase/Postgres, Stripe Test/Live separation, Coolify, Git/GitHub release path.

**Spec:** `docs/superpowers/specs/2026-08-18-production-remediation-program-design.md`

## Global Constraints

- Execute in this exact order: Security Task 1; Program Tasks 1–3; Security Tasks 2–8; Financial Tasks 1–8; Storage/AI Tasks 1–6; Quality Tasks 1–7; Program Tasks 4–6.
- Stripe Live receives no replayed/fabricated webhook and no unattended card charge.
- Production database reads use only the fixed-name read-only audit runner. Production writes use reviewed forward migrations, fixed-purpose guarded cutover tools, or the exact deployed application boundary.
- Historical candidate balance differences are reported only; Muhammad approves any later adjustment.
- Legacy assets are never deleted. Unmigrated rows remain visible and bulk export remains unavailable for them.
- CSP remains report-only through the final Quality deployment. Its seven-day enforcement clock starts only after that exact commit is serving Production.
- Automate provider setup, fixture creation, deployment, verification, monitoring, and evidence capture whenever available authority permits. Ask Muhammad only for a business decision, consequential external approval, or unavailable account permission, using simple manager language.
- Raw inputs/proofs stay ignored. Redacted canonical evidence is tracked for review and Git history, but is not called cryptographically immutable or treated as a substitute for a fresh live check.
- Stage only files named by the current task; never use `git add -A`.

---

### Task 1: Install correct automatic repository onboarding

**Files:**
- Create: `AGENTS.md`
- Create: `AGENT-ONBOARDING.md`
- Test: `tests/tooling/onboarding-contract.test.ts`

**Interfaces:**
- Consumes: approved program decisions and current `CLAUDE.md` technical rules.
- Produces the context automatically read by future workers without claiming unverified deployment state.

- [ ] **Step 1: Write the failing onboarding contract**

Assert both files are absent first. The final test requires:

- product identity `PyraSuite/Pixora`, Arabic-first AI marketing SaaS, nine studios;
- Next.js/Supabase/Stripe/credits/generations/assets/Admin context;
- explicit statement that this is not the separate ERP/CRM repository;
- Stripe Live warning and Test/Staging-only experimentation;
- saved-before-visible and fail/refund/retry rules;
- watermark failure means stop/refund/no clean image;
- legacy visible/no deletion/no bulk export until safe copy;
- simple Egyptian-Arabic decision explanations and automation preference;
- locked-decision, UTF-8, RTL/i18n, RLS, test, deploy, and Production-smoke rules;
- links from `AGENTS.md` to onboarding, `CLAUDE.md`, the program spec, and all five implementation plans.

Run:

```powershell
npm run test -- tests/tooling/onboarding-contract.test.ts
```

Expected: FAIL because the files do not exist.

- [ ] **Step 2: Write the short automatic entrypoint**

`AGENTS.md` is concise: identify the correct product, link the detailed
documents, require read-only discovery before recommendations, preserve locked
decisions, and require simple manager-level Arabic for choices. It must not copy
the ERP/CRM audience model into this repository.

- [ ] **Step 3: Write the detailed Egyptian-Arabic onboarding**

`AGENT-ONBOARDING.md` explains Muhammad's role/preferences, the actual product
and audiences, the critical auth → validate → idempotency/quota → reserve →
provider → persist → complete → show sequence, Live/Test separation, locked
decisions, safe database/deployment practice, and plan links. Deployment claims
remain labeled “to be verified” until Task 6.

- [ ] **Step 4: Verify and commit**

```powershell
npm run test -- tests/tooling/onboarding-contract.test.ts
git add AGENTS.md AGENT-ONBOARDING.md tests/tooling/onboarding-contract.test.ts
git commit -m "docs: add correct PyraSuite agent onboarding"
```

---

### Task 2: Add revision-bound, redacted release evidence

**Files:**
- Create: `lib/release/evidence-schema.ts`
- Create: `lib/release/deployment-revision.ts`
- Create: `lib/release/csp-observation.ts`
- Create: `lib/release/deployment-continuity.ts`
- Create: `lib/release/observation-store.ts`
- Create: `scripts/release-evidence.ts`
- Create: `scripts/verify-deployment-revision.ts`
- Create: `scripts/run-csp-observation.ts`
- Create: `scripts/run-deployment-heartbeat.ts`
- Create: `scripts/verify-csp-observation-window.ts`
- Create: `scripts/configure-csp-observation.ts`
- Create: `scripts/verify-docs-only-release.ts`
- Create: `.github/workflows/production-csp-observation.yml`
- Create: `services/coolify-observation-gateway/server.mjs`
- Create: `services/coolify-observation-gateway/Dockerfile`
- Create: `services/coolify-observation-gateway/README.md`
- Modify: `app/api/health/route.ts`
- Create: `tests/release/evidence-schema.test.ts`
- Create: `tests/release/deployment-revision.test.ts`
- Create: `tests/release/csp-observation.test.ts`
- Create: `tests/release/deployment-continuity.test.ts`
- Create: `tests/release/coolify-observation-gateway.test.ts`
- Create: `tests/release/docs-only-release.test.ts`
- Create: `docs/operations/release-evidence/README.md`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces `npm run verify:deployment`, `npm run release:evidence`,
  `npm run verify:release-evidence`, `npm run heartbeat:deployment`,
  `npm run observe:csp`, and
  `npm run verify:csp-observation` plus a docs-only descendant guard.
- Consumed by every subsystem rollout and both final gates.

```ts
export interface DeploymentRevisionProof {
  environment: 'staging' | 'production';
  baseUrl: string;
  revision: string;       // exact 40-character Git SHA served over HTTPS
  observedAt: string;
  deploymentId?: string;  // included only when Coolify API authority exists
}

export interface DeploymentContinuityIdentity {
  applicationUuid: string;
  deploymentUuid: string;
  revision: string;
  cspMode: 'report-only';
  coolifyConfigHash: string;
  runtimeFingerprint: string; // SHA-256 of fixed non-secret allowlist
  edgeFingerprint: string;    // SHA-256 of exact reviewed router/header config
}

export interface EnforcementAuthorizationIdentity {
  applicationUuid: string;
  deploymentUuid: string;
  revision: string;
  cspMode: 'enforce';
  enforcementAttemptId: string;
  normalizedConfigHash: string;
  runtimeFingerprint: string;
  edgeFingerprint: string;
  gatewayBootId: string;
  gatewayFingerprint: string;
}

export interface EnforcedRollbackIdentity {
  applicationUuid: string;
  fromRevision: string;       // current confirmed pointer
  fromDeploymentUuid: string;
  targetRevision: string;     // an already-confirmed enforced revision
  cspMode: 'enforce';
  normalizedConfigHash: string;
  runtimeFingerprint: string;
  edgeFingerprint: string;
  gatewayBootId: string;
  gatewayFingerprint: string;
}
```

`observation-store.ts` owns the exact narrow request/result interfaces and fixed
038 RPC-name constants needed by this task. Its service-only transport is injected
behind that interface, so Program Task 2 compiles/tests before migration 038 and
never casts the generated database type to `any`. Security Task 5 regenerates
`lib/supabase/types.ts` after applying 038 and adds a compile-time conformance
test in both directions; any name/argument/result drift fails that later gate.

- [ ] **Step 1: Write failing evidence and deployment-proof tests**

Require tracks `security`, `financial`, `storage-ai`, and `quality`; phases
`report-only`, `enforced`, and `release`. Each record contains environment,
source commit, observed deployment proof/hash, migration fingerprints,
command/result hashes, smoke timestamps, and track-specific observations.

Reject secret/password/token/private-key/service-role/Stripe-key/webhook-secret
key names or values. Reject Staging if Stripe is not Test Mode or its Supabase
origin equals Production. Reject Production records without Live mode. Reject a
record when its proof environment/revision does not match the reviewed input,
when the proof was stale at record-creation time, or when the exact tracked
output already exists. Immutable record age is never a failure by itself. Tests
also prove raw input is never printed and `verify` cannot pass from a manually
claimed revision without a probe artifact or from an origin different from the
protected `STAGING_APP_URL`/`PRODUCTION_APP_URL` target.

Observation tests use a mocked service-only store and a 15-minute slot clock.
Require 672 consecutive completed Production slots (seven full 24-hour days) for
one exact expected SHA, report-only header, healthy intake/edge canary, no
actionable CSP violations, and all fixed application/worker/webhook checks. The
activation RPC stores database time plus the first aligned slot starting on or
after it. The begin call may target only the previous fully ended `[start,end)`
interval from the active run; a run one second after the boundary cannot certify
the current 14m59s or the previous slot when it began before activation. Repeating
activation for the same live SHA is idempotent and cannot move the boundary; a
new SHA creates a new run whose slots cannot be combined with the old one. A
same-SHA activation retry must read/reuse the existing protected attempt/token
before any mutation and make zero provider config/deploy/boot calls; a missing or
mismatched value fails while preserving the run/boundary. A
missing/duplicate/backfilled/current/partial slot,
failed check, mode change, SHA change, unavailable store, or gap resets the
eligible start; manual dispatch can collect only the immediately previous ended
slot and cannot fill older history. The verifier must reject 671 good slots plus
one missing slot and prove 672 wholly post-activation intervals span exactly 168
elapsed hours.

Continuity tests require one immutable database-timed heartbeat for every minute
in each slot, a matching registration for every ready runtime, and a fully
paginated Coolify application-deployment history proof bound to the exact
`[start,end)` interval. Reject a missing heartbeat, caller timestamp/backfill,
changed Coolify deployment/config/runtime/edge identity, failed live header or
provider status, transient redeploy/mode change that returns before collection,
event hidden on page two, event/API/gateway outage, and a late target event after
a slot was completed. The standalone gateway service—not the target Next.js
application—accepts only the fixed target-app event allowlist over its source-
restricted private route, caps the body at 4 KiB, enriches from the fixed Coolify
API, is idempotent, and stores no payload/message/secret. Its marker endpoint
requires constant-time secret authentication. Tests stop or hold the target app
unready and still require real-event plus marker persistence through one shared
database-sequenced FIFO. A stable exact-
identity interval alone derives `deployment_ok=true`.
Restart the gateway under the same application/deployment/config and require its
new registered boot UUID to invalidate an active run; an old-boot marker cannot
acknowledge. This is independent from the zero-target-replica cold-start test.
Any process boot after activation invalidates the run even when every identity
field matches. Each minute heartbeat sends a unique internal health marker
through the authenticated gateway/queue/receiver and requires its durable,
same-minute database acknowledgement; this advances a redacted acknowledgement
cursor without pretending a real deployment occurred. Gateway/queue failure,
replay, or a stale acknowledgement makes that minute fail. Seal tests require a
latest FIFO pre-seal barrier with no queued event ahead of it, the exact active
672 rows, and normalized current/intended configs whose only delta is
`CSP_MODE`; they produce `sealed_pending` and stop both schedulers. Enforce tests
prove a valid mode without the pre-provisioned attempt/token stays unready, the
first boot's later FIFO barrier consumes the authorization for one exact
deployment/config, an unexpected event/delta fails, and rollback permanently
revokes reuse. After the smoke/probe, `confirm` sends a distinct FIFO confirmation
barrier and passes its ID to the atomic confirm RPC; an event accepted after the
start barrier or a 60-minute parent deadline prevents the current pointer update.

The docs-only guard tests accept only the Task 5/6 observed-record, onboarding,
setup, changelog, invariant, and final-checklist paths between an already served
ancestor and a descendant commit. They reject application code, package/lock,
workflow, migration, environment, deployment, script, or arbitrary new paths and
reject non-ancestor SHAs.
They hash that proof and prove the guarded release tool can preauthorize only the
exact known target SHA for 30 minutes while CSP is already confirmed enforced and
config/runtime/edge fingerprints and the registered gateway boot UUID/fingerprint
are unchanged. Startup for that target drains a FIFO barrier and consumes the row
once; a platform-created different merge SHA, gateway restart, expired row, or
forbidden path remains unready. After a fresh probe, confirmation sends a distinct
FIFO barrier and the locked RPC moves the pointer only if that marker is still the
latest committed sequence. It keeps the previous enforce revision eligible for
the guarded rollback flow and does not reopen the 672-slot seal.
Tests prove that target's SHA alone cannot start under a new deployment UUID.
After revoking a failed descendant, one 15-minute authorization must exist
before provider rollback, a distinct FIFO rollback barrier binds the new UUID
once, and a fresh confirmation advances the current-enforced pointer. Concurrent
docs/rollback rows, direct boot, expiry, fingerprint/gateway change, queued-event
overtake, and replay all fail closed. A concurrent event/authorization test
requires their shared database lock to place the event wholly before the stored
FIFO boundary or inside the later transition stream—never between them.
Crash-after-authorize/consume tests advance database time and require stale
pending or unconfirmed consumed rows to revoke, health to return 503, and an
exact retry/new authorization to remain possible. Report-only parent rollback
must revoke every live child under the same lock.
Revoke a first docs attempt and prove a new append-only numbered `retry_of` row
can reauthorize that same target before redeploy only from its original pre-push
proof and unchanged current pointer; the revoked row itself is never reset.
Every initial/docs/rollback confirm test must race an event after its start
barrier and require the final distinct confirmation barrier/latest-sequence
check to reject it.

- [ ] **Step 2: Confirm failure**

```powershell
npm run test -- tests/release/evidence-schema.test.ts tests/release/deployment-revision.test.ts tests/release/csp-observation.test.ts tests/release/deployment-continuity.test.ts tests/release/coolify-observation-gateway.test.ts
```

Expected: FAIL because the schema, collector, and revision endpoint do not exist.

- [ ] **Step 3: Expose and verify only the safe build identity**

Extend the existing public `/api/health` response with `revision` from
`APP_GIT_SHA` and `environment` from `APP_RELEASE_ENV`; expose no other env or
deployment detail. In Production enforce, preserve that safe response shape but
return 503 unless the service-only reader finds this boot is the exact unexpired
consumed initial `enforcement_started` deployment, the current confirmed
deployment, or an unexpired consumed docs/rollback transition; its database-time
check revokes an expired parent attempt and stale children. A database error
fails health closed.
The deploy path injects the exact full Git SHA at build time.
`verify-deployment-revision.ts` selects the protected `STAGING_APP_URL` or
`PRODUCTION_APP_URL` from `--environment` and accepts no caller-supplied origin.
It compares the served SHA/environment with `--expected`/`--environment`,
optionally confirms the Coolify deployment ID through its read-only API, and
writes a proof only to `.artifacts/releases/proofs/`. Missing, short, unapproved,
or mismatched revisions fail.

- [ ] **Step 4: Implement append-only record and verify commands**

The CLI supports:

```text
record --track=<name> --phase=<name> --environment=<env> \
  --from=.artifacts/releases/input/<file>.json \
  --proof=.artifacts/releases/proofs/<env>.json
verify --environment=<env> --require=<track:phase,...>
```

`record` accepts only the ignored directories shown above, parses/redacts/
validates the input, binds it to the probe, and derives the tracked path
`docs/operations/release-evidence/<env>/<track>/<phase>-<served-sha>.json`.
It creates—never overwrites—that revision record; a later repaired deployment
gets a new SHA/path and preserves the earlier history. `verify` selects the
newest compatible record and checks required phases, migration order
038→039→040→041, deployed commit ancestry/order, and successful gates. Every
verify invocation performs a new protected-origin deployment/provider probe;
“freshness” applies to that live proof and to a proof used when a record was
created, not to the age of an immutable release record. The Quality record can
therefore remain valid across the seven-day observation when the fresh probe
still serves its exact revision or a confirmed, guard-proved enforced docs-only
descendant authorization, and the separate 672-slot gate passes.
The README states clearly that these Git-reviewed records are a useful audit aid,
not a cryptographic trust anchor; the fresh endpoint/provider probe is the
authority for the currently served revision.

Implement `run-csp-observation.ts` as a fixed Production-only collector. It
resolves the protected Production origin, reads the expected full SHA from the
protected deployment environment, probes that served revision/report-only
header, and begins the previous fully ended database-timed slot. It queries
intake/edge, bounded sanitized CSP-violation summaries, application errors,
quota/owed-credit, account/asset-deletion plus generation-persistence worker
health, and Stripe-webhook sources over exactly that returned `[start,end)`
interval. It also fully paginates the fixed Coolify application's deployment
history with `skip`/`take` until the interval is exhausted and hashes the bounded
redacted proof. A failed/ambiguous page, target event, or identity mismatch fails
closed. It then finishes with the opaque one-use token, six non-deployment
booleans, and that proof hash; migration 038 requires all 15 matching minute
heartbeats and derives `deployment_ok`. `csp_violations_ok` is false for any unreviewed/actionable
accepted violation; healthy is database-derived. The collector accepts no
arbitrary URL, timestamp, result JSON, health flag, or backfill selector. A crash
leaves `collecting` unhealthy; a missing row is itself a failed gap. Before the
active run's first wholly post-activation slot ends, begin returns
`not_yet_eligible` and the collector exits cleanly without querying historical
health or inserting an interval.

`deployment-continuity.ts` exposes only fixed Production identity readers,
runtime-start registration, FIFO marker begin/ack, minute heartbeat, target-event
ingestion, enforcement consume/confirm/revoke transitions, and the bounded
enforced-docs-descendant plus enforced-rollback authorization lifecycles.
`instrumentation.ts` calls registration before readiness and sends markers to a
fixed protected `COOLIFY_OBSERVATION_GATEWAY_URL`; it cannot accept a caller URL.
Build the gateway as a separate one-replica Node service with its own healthcheck,
immutable image digest, manual/pinned deployment, disabled repository auto-deploy,
and a private network/Traefik route that remains reachable while the target app
is stopped or unready. On every process boot it generates a UUID, registers the
fixed gateway application/deployment/config fingerprint through 038, and stays
unhealthy until that succeeds and returns its database identity sequence. The
highest sequence is the sole current boot. Every event/marker carries the in-memory boot ID;
activation and every heartbeat pin it, and a later boot invalidates the run even
when the container/config identity is unchanged. The Coolify-event path is source-restricted/private because
provider payloads are unsigned; the marker path additionally requires constant-
time `COOLIFY_OBSERVATION_GATEWAY_SECRET` authentication before body/database
work. Neither route is part of target Next.js middleware/readiness. Every
allowlisted target-app deploy/
status/container event is enriched from the fixed Coolify API and passes its
exact deployment UUID/revision/config hash to the typed 038 recorder; payload
identity/status is never authority. It also stores the fixed provider-derived
normalized status; only exact-target progressing→healthy sequences may pass a
transition, while failed/stopped/restarted/different identity cannot. The Program code calls it through the exact local
`ObservationStore` wire contract and does not import not-yet-generated 038
Supabase types; Security Task 5 later proves that contract equals the generated
RPC declarations. It invalidates the active run. `run-deployment-heartbeat.ts`
accepts no timestamp or URL, probes the protected Production origin and Coolify
application/config/status, sends a unique internal health marker through the
authenticated event gateway/queue/receiver, waits for its durable same-minute
database acknowledgement, and inserts only the current database-derived minute
with the acknowledgement-cursor hash.
The exact non-overlap Coolify schedule is
`pyrasuite-production-deployment-heartbeat` at `* * * * *`; it is provisioned
disabled and enabled only by activation. Missing minutes cannot be repaired.
The gateway uses one durable FIFO stream/sequence for the fixed application;
one process serializes accepted events/markers and returns success only after the
shared database sequence/row commits, so marker acknowledgement cannot overtake
an earlier accepted target event. Gateway application/deployment/config identity
plus boot UUID/fingerprint is pinned explicitly; its restart/change/outage fails
the run.

`verify-csp-observation-window.ts` queries the service-only interval reader and
mechanically requires the latest 672 consecutive completed slots for exactly the
expected served SHA and one activation run, all in report-only mode and all
healthy. It emits a redacted
summary into ignored release input only after a fresh deployment probe; it
cannot alter intervals. The workflow uses a fixed concurrency group, a protected
`production` environment, `schedule: 2,17,32,47 * * * *` so the target interval
has ended, and manual dispatch for the immediately previous ended slot only. It
is inert until the protected expected SHA/enabled flag is
set after final Quality deployment; routine activation and monitoring are
automated through available GitHub/deployment authority.
`configure-csp-observation.ts` has only `activate`, `seal`, `enforce`, `confirm`,
`rollback`, `deactivate`, `authorize-docs-descendant`,
`confirm-docs-descendant`, `revoke-docs-descendant`, and
`rollback-enforced`, each deriving protected
targets and accepting no caller origin/environment/config payload. The core
modes require `--expected=<full-sha>`. Activation first reads the redacted active
state and current protected provider config without mutation. If that same SHA is
active, it must reuse and hash-verify the existing protected attempt/token plus
every pinned identity, perform zero config write/redeploy/boot, and return the
original boundary; missing/mismatched values fail unchanged. Only the no-active-
run path creates one random enforcement attempt/token, places the raw token only in protected Coolify configuration,
waits for that report-only config rollout, then proves the exact SHA is served in
Production/report-only and reads/pins the Coolify application/deployment/config
identity plus hashed runtime/edge allowlists, proves all ready runtimes are
registered, proves exactly one healthy standalone gateway boot and pins its UUID/
fingerprint, verifies the event test round-trip, and confirms the exact disabled
one-minute heartbeat schedule exists. It then calls the service-only activation
RPC to store those identities, attempt/token hash, plus database `activated_at`/
`first_eligible_slot_started_at`, enables that fixed schedule and the 15-minute
workflow, and verifies the first current-minute heartbeat. A same-SHA/identity
rerun therefore cannot reset or invalidate the clock; another active SHA or
identity requires explicit deactivation plus a separately proved run. Seal performs a fresh report-only
deployment proof, reads a fixed normalized non-secret Coolify config, derives a
copy differing only at `CSP_MODE`, sends/waits for the FIFO pre-seal barrier, and
passes both JSON objects plus the database marker ID to the atomic 672-row seal
RPC. Only after `sealed_pending` succeeds does it disable both schedulers; it
cannot change CSP itself. Enforce re-fetches the provider revision/config,
requires the stored current hash, applies exactly the intended snapshot with
optimistic concurrency, and waits until instrumentation's post-deploy FIFO
barrier consumes the pre-provisioned attempt for the actual deployment identity.
That consumed parent receives a 60-minute database confirmation deadline and is
accepted by enforce health until it passes. Confirm requires the cumulative-smoke
artifact plus a fresh exact config/deployment proof, then sends a distinct FIFO
confirmation barrier; the RPC locks the event recorder, requires that marker to
remain the latest committed sequence, and marks it `enforced` plus the current
pointer in one transaction. Rollback revokes first, then
returns to report-only; both the command and report-only startup lock the run and
revoke the parent plus every pending/consumed child as a fail-safe.
Deactivation aborts an active unsealed run and disables both schedulers. Every
mode matches the expected revision. The script accepts no repository/
environment/origin override. Only guarded `enforce`/`rollback` may change CSP,
and only to the exact stored snapshot/mode; no mode accepts arbitrary config.
It writes redacted seal/attempt state only under ignored release input and never
prints the token. The enforced evidence recorder re-reads the exact consumed and
confirmed revision+attempt+seal/config authorization through the service-only
reader; a caller JSON summary or an unconsumed seal cannot authorize the record.
The descendant modes consume only a fresh `verify-docs-only-release` proof for
the locally materialized exact future `main` SHA, create a 30-minute database
authorization before push, and confirm/revoke only that SHA after a fresh probe.
Each confirm mode itself sends and durably acknowledges its distinct FIFO
confirmation marker, then passes that marker ID to the locked RPC; callers cannot
supply or skip it.
They reuse neither an observation interval nor the seal authorization.
`rollback-enforced` accepts only an exact target already confirmed by the run.
It locks out live docs/rollback transitions, creates the 15-minute database
authorization with the latest committed FIFO boundary before changing Coolify,
requires the gateway boot to remain the run's pinned boot, then uses optimistic provider state to
redeploy that exact revision with unchanged enforce config. The new boot drains
the distinct FIFO rollback barrier, consumes and binds its actual deployment
UUID, starts a 15-minute confirmation deadline, and the tool requires a fresh protected-origin/provider proof before
it sends the rollback-confirm marker; confirmation updates the current-enforced
pointer only if that marker is still the latest committed sequence. Failure revokes the row and
never treats the old SHA or old deployment UUID as readiness authority.
Before creating either transition, the store revokes expired pending rows and
consumed rows past their confirmation deadline under the same run lock; exact
still-live retries resume instead of inserting a competing row. Report-only
rollback revokes the parent plus all live child rows atomically.
For a revoked docs target already pushed by its valid first attempt, retry creates
a new numbered row linked to the immutable original pre-push proof before any
redeploy; it never rewrites/rearms the old row.
`verify-docs-only-release.ts` accepts only full `--base`/`--head` SHAs, proves
ancestry, reads `git diff --name-status`, and fail-closes against the exact final
documentation/evidence allowlist. It never modifies Git.

Add:

```json
"verify:deployment": "tsx scripts/verify-deployment-revision.ts",
"release:evidence": "tsx scripts/release-evidence.ts record",
"verify:release-evidence": "tsx scripts/release-evidence.ts verify",
"heartbeat:deployment": "tsx scripts/run-deployment-heartbeat.ts",
"observe:csp": "tsx scripts/run-csp-observation.ts",
"verify:csp-observation": "tsx scripts/verify-csp-observation-window.ts",
"configure:csp-observation": "tsx scripts/configure-csp-observation.ts",
"verify:docs-only-release": "tsx scripts/verify-docs-only-release.ts"
```

Ignore `.artifacts/` and retain no placeholder/secrets in Git.

- [ ] **Step 5: Verify and commit**

```powershell
npm run test -- tests/release/evidence-schema.test.ts tests/release/deployment-revision.test.ts tests/release/csp-observation.test.ts tests/release/deployment-continuity.test.ts tests/release/coolify-observation-gateway.test.ts tests/release/docs-only-release.test.ts
npm run typecheck
git add lib/release/evidence-schema.ts lib/release/deployment-revision.ts lib/release/csp-observation.ts lib/release/deployment-continuity.ts lib/release/observation-store.ts scripts/release-evidence.ts scripts/verify-deployment-revision.ts scripts/run-csp-observation.ts scripts/run-deployment-heartbeat.ts scripts/verify-csp-observation-window.ts scripts/configure-csp-observation.ts scripts/verify-docs-only-release.ts .github/workflows/production-csp-observation.yml services/coolify-observation-gateway/server.mjs services/coolify-observation-gateway/Dockerfile services/coolify-observation-gateway/README.md app/api/health/route.ts tests/release/evidence-schema.test.ts tests/release/deployment-revision.test.ts tests/release/csp-observation.test.ts tests/release/deployment-continuity.test.ts tests/release/coolify-observation-gateway.test.ts tests/release/docs-only-release.test.ts docs/operations/release-evidence/README.md package.json .gitignore
git commit -m "test(release): bind redacted evidence to deployed revision"
```

---

### Task 3: Provision isolated Staging and deterministic core fixtures

**Files:**
- Create: `lib/env/environment-safety.ts`
- Create: `scripts/verify-test-environment.ts`
- Create: `scripts/provision-staging-environment.ts`
- Create: `scripts/provision-staging-fixtures.ts`
- Create: `scripts/verify-staging-fixtures.ts`
- Create: `tests/fixtures/staging-contract.ts`
- Create: `tests/release/environment-safety.test.ts`
- Create: `tests/release/staging-provisioner.test.ts`
- Modify: `.env.test.example`
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `docs/operations/staging-bootstrap.md`

**Interfaces:**
- Consumes: Security Task 1's test harness and database target guard.
- Produces the isolated environment, protected credentials, Stripe Test catalog, and stable fixture manifest required by Security and every later plan.

The tracked fixture contract exposes only stable non-secret references:

```ts
interface StagingFixtureManifest {
  schemaVersion: 1;
  fixtureVersion: string;
  appOrigin: string;
  customers: Record<'ar' | 'en' | 'empty', {
    id: string;
    emailEnv: string;
    passwordEnv: string;
  }>;
  admin: {
    usernameEnv: string;
    passwordEnv: string;
  };
  projectId: string;
  hostileGenerationId: string;
  assets: {
    publicCanonicalAssetId: string;
    legacyAssetId: string;
  };
}
```

- [ ] **Step 1: Write failing safety and idempotency tests**

Test that the environment guard rejects `sk_live`, `pk_live`, absent Test
webhook secret, Production-equal Supabase/app origins, and missing protected E2E
credential names. Accept only `sk_test`, `pk_test`, distinct origins, and complete
Staging values. Provisioner tests prove reruns reconcile by deterministic
metadata/name without duplicate users, prices, webhook endpoints, projects,
generations, or assets; logs never contain secret values.

- [ ] **Step 2: Implement environment guard and scripts**

`assertSafeTestEnvironment()` reports only failing key names. The provisioner
uses available Supabase, Stripe, and deployment APIs/CLIs to create or reconcile:

- one dedicated non-production Supabase project and Staging app;
- all eight Stripe Test prices and one signed Test webhook endpoint;
- protected `E2E_ADMIN_USERNAME`/`E2E_ADMIN_PASSWORD`,
  `E2E_AR_CUSTOMER_EMAIL`/`E2E_AR_CUSTOMER_PASSWORD`,
  `E2E_EN_CUSTOMER_EMAIL`/`E2E_EN_CUSTOMER_PASSWORD`, and
  `E2E_EMPTY_CUSTOMER_EMAIL`/`E2E_EMPTY_CUSTOMER_PASSWORD`;
- one known project/balance, hostile generation, canonical public asset, and
  visible legacy URL row.

Extend `.env.test.example` with empty values—not secrets—for
`STAGING_APP_URL`, `PRODUCTION_APP_URL`, `PRODUCTION_SUPABASE_URL`, the Test
Supabase/Stripe keys and eight price IDs, `SUPABASE_ACCESS_TOKEN`,
`COOLIFY_BASE_URL`, `COOLIFY_API_TOKEN`, `COOLIFY_STAGING_APPLICATION_UUID`, and
the eight exact `E2E_*` credential names above. Production management/Live
secret values never enter this file or the Staging process.

It configures `APP_GIT_SHA`/`APP_RELEASE_ENV=staging`, keeps all values in
`.env.test.local` or provider secret storage, and writes the manifest to ignored
`.artifacts/staging/fixtures.json`. If account authentication/permission is
unavailable, stop at that exact boundary; do not hand Muhammad routine data entry.
Before the Security CSP deployment, it sets the protected Staging value
`CSP_MODE=report-only`; missing/invalid mode is never accepted as a default.

`provision:staging` begins with a bootstrap-safe preflight that validates only
management credentials, Stripe Test key shape, and the declared Production
origins. Before every provider mutation it refuses an existing target/resource
whose project or app origin equals Production. The stricter `verify:test-env`
then runs after provisioning, when all Staging values exist.

Add:

```json
"verify:test-env": "tsx scripts/verify-test-environment.ts",
"provision:staging": "tsx scripts/provision-staging-environment.ts",
"provision:staging-fixtures": "tsx scripts/provision-staging-fixtures.ts",
"verify:staging-fixtures": "tsx scripts/verify-staging-fixtures.ts"
```

- [ ] **Step 3: Provision, deploy, and prove the baseline**

```powershell
npm run provision:staging
npm run verify:test-env
npm run provision:staging-fixtures
npm run verify:staging-fixtures
$currentGitSha = (git rev-parse HEAD).Trim()
npm run verify:deployment -- --environment=staging --expected=$currentGitSha
```

Verify the Admin login fixture, hostile row, public/legacy assets, both locales,
Stripe Test Checkout/webhook signature path, and that no origin/key points to
Production. A clean rerun changes no provider resource or fixture ID.

- [ ] **Step 4: Commit tooling and runbook**

```powershell
npm run test -- tests/release/environment-safety.test.ts tests/release/staging-provisioner.test.ts
npm run typecheck
git add lib/env/environment-safety.ts scripts/verify-test-environment.ts scripts/provision-staging-environment.ts scripts/provision-staging-fixtures.ts scripts/verify-staging-fixtures.ts tests/fixtures/staging-contract.ts tests/release/environment-safety.test.ts tests/release/staging-provisioner.test.ts .env.test.example package.json .gitignore docs/operations/staging-bootstrap.md
git commit -m "chore(staging): provision isolated remediation environment"
```

---

### Task 4: Run the cumulative Staging gate

**Files:**
- Create: `docs/operations/production-remediation-final-checklist.md`
- Create: `docs/operations/release-evidence/staging/quality/release-<quality-git-sha>.json`

**Interfaces:**
- Consumes: completed Security/Financial/Storage Staging records, the Quality candidate, and both core/storage fixture manifests.
- Produces one approved Staging release candidate and the only Quality Staging record.

- [ ] **Step 1: Verify environment and prerequisite evidence**

```powershell
npm run verify:test-env
npm run verify:staging-fixtures
npm run verify:storage-ai-staging-fixtures
npm run verify:release-evidence -- --environment=staging --require=security:report-only,financial:release,storage-ai:release
```

Fail closed on a missing/mismatched record, credential name, public/legacy ID,
or `privateCanonicalAssetId`. Quality has not been recorded yet; this task owns
that record after the combined test succeeds.

- [ ] **Step 2: Rebuild and prove the exact Staging candidate**

From a clean worktree, run the complete gate, deploy the exact Quality commit,
and probe the served revision before browser testing:

```powershell
npm ci
npm run verify
npm run build
npm run test:integration
$qualityGitSha = (git rev-parse HEAD).Trim()
npm run verify:deployment -- --environment=staging --expected=$qualityGitSha
npm run test:e2e
git diff --check
git status --short
```

- [ ] **Step 3: Execute the combined Staging checklist**

Verify both locales; hostile Admin JSON; isolated login/CSP-report limits;
matching nonces and rotated auth cookies; honest collection errors/empty states;
keyboard/mobile focus; all nine studios; same-request replay; save-before-visible;
Campaign with images off/on; free watermark stop/refund; public/private/legacy export; denied browser DML;
generation/account/asset-deletion workers plus the exact persistence schedule/
3/5/10-minute health thresholds and zero lease-expired in-flight attempts;
Stripe Test duplicate, equal-timestamp,
changed-anchor, create/cycle versus proration/multi-line invoice decisions;
paginated multi-subscription cancellation; late persistence receipt after expiry
and first sweep; exact public/private receipt-path missing/extra/duplicate/
mismatch rejection; unknown Storage outcome stays receipt-pending, including
absent probe then delayed sole-PUT commit/catch/cleanup with no retry; crash after
attempt claim before and after network admission promotes expired in-flight to
unknown and emits no second PUT; post-041 039/040 lifecycle/enforcement suites;
Storage 5xx/disconnect maps to the fixed unknown transition and reconciles
without a retry PUT;
lost-response private replay with a fresh signed
URL and zero provider/quota/credit/ledger delta; signing-failure same-key recovery;
both shared-lock orders for post-sign delivery versus account deletion;
generation/list/detail/Admin all use the same all-or-none delivery fence;
deletion-pending duplicate denial; account-cancellation-before-Auth cases; Coming Soon truth; and
no serious/critical axe failures.

- [ ] **Step 4: Record Quality once and commit the gate**

```powershell
npm run release:evidence -- --track=quality --phase=release --environment=staging --from=.artifacts/releases/input/quality-staging.json --proof=.artifacts/releases/proofs/staging.json
npm run verify:release-evidence -- --environment=staging --require=security:report-only,financial:release,storage-ai:release,quality:release
$stagingQualitySha = (Get-Content -LiteralPath .artifacts/releases/proofs/staging.json -Raw | ConvertFrom-Json).revision
git add docs/operations/production-remediation-final-checklist.md "docs/operations/release-evidence/staging/quality/release-$stagingQualitySha.json"
git commit -m "docs: record cumulative staging release gate"
```

---

### Task 5: Release final Quality, observe, and enforce CSP

**Files:**
- Modify: `docs/operations/production-remediation-final-checklist.md`
- Create: `docs/operations/release-evidence/production/quality/release-<quality-git-sha>.json`
- Create: `docs/operations/release-evidence/production/security/enforced-<quality-git-sha>.json`

**Interfaces:**
- Consumes: approved Staging candidate, report-only Security/Financial/Storage Production records, and the real `main` release path.
- Produces revision-bound final Quality and CSP-enforcement records without fabricated Stripe Live activity.

- [ ] **Step 1: Run the fixed-name Production preflight**

```powershell
npm run db:audit:production -- --name=financial-preflight
npm run db:audit:production -- --name=financial-legacy
npm run verify:release-evidence -- --environment=production --require=security:report-only,financial:release,storage-ai:release
```

Confirm backups/prior image, current cron identities, no unexplained financial
delta, CSP still report-only, Production `APP_GIT_SHA` injection configured, and
the approved Quality commit is the only remaining release change. Also require
the disabled exact one-minute/non-overlap heartbeat task, private authenticated
Coolify event gateway/test delivery, fully paginated deployment-history read
authority, and registered runtime identity path; absence blocks activation.

- [ ] **Step 2: Release through `main` and verify identity**

Use the repository's real merge/push/deploy path, wait for Coolify health, then:

```powershell
$mainQualityGitSha = (git rev-parse origin/main).Trim()
npm run verify:deployment -- --environment=production --expected=$mainQualityGitSha
```

Do not treat a feature-branch deployment as Production completion and do not
start smoke if the served SHA differs.

- [ ] **Step 3: Run the smallest safe cumulative report-only smoke**

Using owned test accounts, verify Arabic/English auth/errors; hostile Admin row;
isolated login/CSP-report limits; honest collection failures; one text, image,
and voice operation; same-key replay; save-before-visible; free watermark rule;
public/private/legacy export; cross-user/RLS denial; generation/account/asset-
deletion worker health plus the persistence reconciler's exact schedule and
3/5/10-minute thresholds plus zero lease-expired in-flight attempts; recent real
Stripe Live marker state read-only; and
subscription-period/ledger/reservation agreement.

For the owned private image/audio result, deliberately discard only the first
HTTP response in the controlled smoke and replay the same request key. Require a
fresh signed URL and no provider/quota/credit/ledger delta. A signing failure or
deletion-pending state exposes no partial URL and never turns into a new request.
Do not manufacture a Storage timeout in Production; verify that fence from the
Staging/integration evidence.

Do not replay/fabricate a Stripe Live event or perform an unattended card charge.
If a result cannot be saved or watermarked, the expected outcome is stop, refund,
and retry—not delivery.

- [ ] **Step 4: Record Quality and automate the final seven-day observation**

```powershell
npm run release:evidence -- --track=quality --phase=release --environment=production --from=.artifacts/releases/input/quality-production.json --proof=.artifacts/releases/proofs/production.json
$mainQualityGitSha = (git rev-parse origin/main).Trim()
npm run configure:csp-observation -- activate --expected=$mainQualityGitSha
```

Keep `CSP_MODE=report-only`. The protected fixed-concurrency workflow now runs
`observe:csp` every 15 minutes across seven complete days of this exact served
SHA, while the exact non-overlap Coolify heartbeat task runs every minute and the
private authenticated target-event gateway continuously invalidates changes.
Activation pins Coolify deployment/config plus hashed runtime/edge identities,
pre-provisions a protected one-attempt enforcement token before the clock,
pins the independently registered gateway boot UUID/fingerprint, proves all ready
runtimes registered, and outputs the database-timed first
eligible slot; any scheduled or
manual run before that full slot ends returns `not_yet_eligible` without writing
an interval. Each later previous fully ended immutable slot checks CSP violations, edge/intake
health, application errors, quota denials, failed completions/owed-credit alerts,
account/asset deletion and the exact one-minute persistence-reconciler job's
3/5/10-minute health thresholds plus zero lease-expired in-flight attempts, and
webhook failures. It also requires all 15
database-minute identity heartbeats and fully paginated Coolify deployment
history for the slot. A missing accepted synthetic increment,
batch flush, edge metric, slot, global saturation, intake/limiter unavailability,
heartbeat/history page, gateway/provider read, or failed check makes that slot
unhealthy and breaks the consecutive run; a
public 204 alone is never proof of healthy telemetry. Manual dispatch can record
only the immediately previous eligible ended slot and cannot backfill older gaps
or relabel a pre-activation slot. Any deployment/container/status event, runtime/
edge/config/mode mismatch, or script-affecting redeploy invalidates the run and resets
the expected SHA and seven-day clock, requires Steps 2–4 and the cumulative smoke
again, and creates a new revision-named Quality record; the old record remains
in history and cannot authorize enforcement for the new SHA. Fix legitimate
violations without adding script `'unsafe-inline'`.

- [ ] **Step 5: Enforce and repeat the revision-bound cumulative smoke**

First run the mechanical gate while Production is still report-only:

```powershell
$mainQualityGitSha = (git rev-parse origin/main).Trim()
npm run verify:deployment -- --environment=production --expected=$mainQualityGitSha
npm run verify:csp-observation -- --expected=$mainQualityGitSha
npm run configure:csp-observation -- seal --expected=$mainQualityGitSha
```

The seal command repeats the fresh report-only proof, proves from normalized
provider config that the intended snapshot changes only `CSP_MODE`, drains the
FIFO event queue through a pre-seal barrier, seals the exact run atomically as
`sealed_pending`, and disables both observation schedulers. Only if that succeeds,
run the guarded enforce mode; it rechecks the provider revision/config and applies
that exact one-field snapshot with optimistic concurrency:

```powershell
npm run configure:csp-observation -- enforce --expected=$mainQualityGitSha
```

The enforce runtime cannot become ready from a valid mode string alone. Its first
boot drains a second FIFO barrier and atomically consumes the pre-provisioned
attempt/token for the exact intended config, Git SHA, application and actual
deployment UUID; any other config/event/token fails and revokes the attempt. Prove
the bound deployment is served, repeat the full cumulative smoke, then confirm
the exact smoke artifact before recording the enforcement result:

```powershell
npm run verify:deployment -- --environment=production --expected=$mainQualityGitSha
npm run configure:csp-observation -- confirm --expected=$mainQualityGitSha
npm run release:evidence -- --track=security --phase=enforced --environment=production --from=.artifacts/releases/input/security-enforced-production.json --proof=.artifacts/releases/proofs/production.json
npm run verify:release-evidence -- --environment=production --require=security:enforced,financial:release,storage-ai:release,quality:release
```

The enforcement input must include the verifier's redacted 672-slot summary plus
the exact consumed/confirmed attempt, seal and intended/actual config hashes;
`release:evidence` re-reads them and rejects an unconsumed, unconfirmed, mismatched,
or revoked authorization. General Production monitoring remains active.

Any release-blocking error rolls application code back to the known image while
keeping additive migrations/server-only DML enforcement; CSP may return to
report-only. Fixes roll forward and restart the final observation clock.
Rollback automation runs guarded `rollback --expected=$mainQualityGitSha`, which
revokes the attempt before returning to report-only; report-only startup repeats
that revocation defensively. The old token/seal can never authorize a retry, and
a new run activates only after report-only is served again.

- [ ] **Step 6: Commit the observed records**

```powershell
$productionQualitySha = (Get-Content -LiteralPath .artifacts/releases/proofs/production.json -Raw | ConvertFrom-Json).revision
git add docs/operations/production-remediation-final-checklist.md "docs/operations/release-evidence/production/quality/release-$productionQualitySha.json" "docs/operations/release-evidence/production/security/enforced-$productionQualitySha.json"
git commit -m "chore(release): record final production verification"
```

---

### Task 6: Reconcile documentation and close from observed facts

**Files:**
- Modify: `AGENTS.md`
- Modify: `AGENT-ONBOARDING.md`
- Modify: `CLAUDE.md`
- Modify: `SETUP.md`
- Modify: `docs/INVARIANTS.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/operations/production-remediation-final-checklist.md`

**Interfaces:**
- Consumes: verified four-track Production records plus fresh deployment, database, and monitoring probes.
- Produces accurate current onboarding/runbooks and the final Definition of Done.

- [ ] **Step 1: Recheck live state before declaring completion**

Run the deployment-revision probe, fixed-name Production audits, worker/cron
health reads—including the persistence job identity/cadence/3/5/10 thresholds
and deployment-heartbeat/event-gateway continuity—and current error/CSP
summaries again. Evidence files help review
what happened; they never replace these fresh live checks. No “skip” is success.

- [ ] **Step 2: Reconcile documentation from observed facts only**

Update documents with observed migration fingerprints 038–041, deployed commit,
current cron identities, CSP enforcement date, private bucket/write mode, quota
defaults, zero/current invariant counts, exact verification timestamps, and
remaining external legacy asset IDs. Historical counts/dates remain labeled
snapshots. Never copy secrets or turn a planned claim into deployed fact.

- [ ] **Step 3: Run final repository and release gate**

```powershell
npm run verify
npm run build
npm run test:integration
$finalMainGitSha = (git rev-parse origin/main).Trim()
npm run verify:deployment -- --environment=production --expected=$finalMainGitSha
npm run verify:release-evidence -- --environment=production --require=security:enforced,financial:release,storage-ai:release,quality:release
git diff --check
git status --short
```

- [ ] **Step 4: Commit final documentation**

```powershell
git add AGENTS.md AGENT-ONBOARDING.md CLAUDE.md SETUP.md docs/INVARIANTS.md CHANGELOG.md docs/operations/production-remediation-final-checklist.md
git commit -m "docs: align PyraSuite onboarding and production facts"
```

- [ ] **Step 5: Publish the docs-only descendant and re-probe Production**

Read the currently served pre-docs SHA from the fresh Production proof, verify
the local descendant changes only the exact observed-document/evidence allowlist,
and first materialize the repository's real merge result locally so its full SHA
is exactly the object that will become `origin/main`. Preauthorize that known
target for 30 minutes before push; if the hosting merge path would create a
different unknown SHA, stop rather than deploy it. Then push the exact object,
wait for Coolify health, and prove that final SHA is served:

```powershell
$preDocsServedSha = (Get-Content -LiteralPath .artifacts/releases/proofs/production.json -Raw | ConvertFrom-Json).revision
$localDocsSha = (git rev-parse HEAD).Trim()
npm run verify:docs-only-release -- --base=$preDocsServedSha --head=$localDocsSha
npm run configure:csp-observation -- authorize-docs-descendant
```

Merge/push that reviewed descendant through the repository's actual `main` path
and wait for the Coolify deployment/health result. Then run:

```powershell
$finalMainGitSha = (git rev-parse origin/main).Trim()
npm run verify:docs-only-release -- --base=$preDocsServedSha --head=$finalMainGitSha
npm run verify:deployment -- --environment=production --expected=$finalMainGitSha
npm run configure:csp-observation -- confirm-docs-descendant
npm run verify:release-evidence -- --environment=production --require=security:enforced,financial:release,storage-ai:release,quality:release
npm run db:audit:production -- --name=financial-preflight
npm run check:csp-intake -- --environment=production
git status --short
```

A runtime/config/workflow/migration change fails the docs-only guard and requires a new Quality deployment,
smoke, and seven-day observation instead of using this shortcut.
The target runtime stays unready until its FIFO barrier consumes the exact pending
authorization with unchanged fingerprints. On deployment failure, automation
runs `revoke-docs-descendant`, then guarded
`rollback-enforced --expected=$preDocsServedSha`. That command preauthorizes the exact confirmed
target before asking Coolify to redeploy it, requires its new UUID to consume the
FIFO rollback barrier, then requires a fresh probe plus the latest distinct
rollback-confirm barrier before confirmation. It never changes to
report-only or reuses the original seal.

The program is complete only when every gate passes, the served commit is freshly
confirmed after Step 5, CSP is enforced after the full final observation window, and no
unexplained financial delta or release-blocking post-deploy error remains.
