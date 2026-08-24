# PyraSuite Production Remediation Program — Design

**Date:** 2026-08-18
**Status:** Approved for implementation planning
**Repository:** PyraSuite / Pixora
**Delivery boundary:** Code, migrations, deployment, and production smoke verification

---

## 1. Product context

PyraSuite is an Arabic-first AI marketing SaaS built on Next.js 15, Supabase,
Stripe, and the Pyra AI router. Its critical business path is:

```text
authenticate user
  -> validate studio request
  -> reserve credits
  -> call AI provider
  -> persist output and assets
  -> settle or refund the reservation
  -> show the result to the customer
```

The repository is not the separate ERP/CRM product with Employee, Sales, and
Client audiences. Any onboarding text describing that system is invalid for this
repository.

The current checkout has no `AGENTS.md` or `AGENT-ONBOARDING.md`. `CLAUDE.md` is
the only repository-specific agent briefing currently present.

---

## 2. Why this is a program, not one patch

The audit found four independent failure classes:

1. Immediate security exposure: stored XSS, server-side URL fetching, and
   bypassable admin login limits.
2. Financial authority defects: customers can mutate generation state used by
   reconciliation, and Stripe effects are not committed atomically.
3. Storage and AI-cost controls: asset URLs are treated as authority, AI quotas
   are race-prone, and free watermarking can fail open.
4. Quality and product honesty: malformed AI output, hidden fetch failures,
   missing tests, localization debt, accessibility gaps, and fabricated
   coming-soon content.

Combining all four into one branch would make rollback unsafe and would leave no
clear way to prove which change caused a production regression. The approved
approach is risk-first staged remediation: each subsystem ships as independently
testable software with its own gate.

---

## 3. Locked decisions

These decisions were approved by Muhammad and must not be reopened during
implementation unless new evidence makes one impossible:

- A generated result is not returned to the customer until its database record
  and deliverable assets have been saved successfully.
- If saving fails, the request fails, the remaining reserved credits are
  refunded, and the customer is asked to retry.
- A free-plan image is never delivered without the Pixora watermark. If
  watermarking fails, the request fails and credits are refunded.
- Legacy assets remain visible and are never deleted by this program. A legacy
  asset that has not been migrated cannot be included in server-generated bulk
  exports.
- Historical financial discrepancies are reported first. No historical balance
  is changed automatically; each repair requires a separate approval.
- All current accounts are test accounts owned by Muhammad, but Stripe is in
  Live mode. Stripe therefore remains a real-money system.
- No experiment, webhook replay, or migration rehearsal runs against Stripe
  Live. A separate Stripe Test Mode and non-production Supabase environment are
  required first.
- Work continues through production deployment and a production smoke check.
- The agent automates every safe step it can. Muhammad is asked only for a
  product decision, approval for a consequential external action, or a missing
  permission that cannot be obtained from the existing environment.

---

## 4. Shared safety invariants

Every implementation plan in this program inherits these requirements:

- Do not edit migrations `001` through `037`; all database work is forward-only.
- Migration numbers are reserved as follows:
  - `038_security_containment.sql`
  - `039_financial_generation_workflow.sql`
  - `040_financial_generation_enforcement.sql`
  - `041_storage_ai_safety.sql`
- A browser session may read its own generations and assets but may never create,
  update, or delete authoritative financial or generation state directly.
- Service-role operations may accept a user ID only after the route resolves the
  authenticated user. A user ID from request JSON is never trusted.
- `credit_transactions` is append-only. Corrections are new audited ledger
  entries, never edits or deletes.
- Refunds are capped by an explicit reservation. A display status is never the
  source of financial truth.
- A Stripe event marker and its business effect commit in the same database
  transaction or neither commits.
- No server request fetches a URL controlled by a customer for asset export.
- Every studio HTTP operation carries one client operation UUID through provider
  quota, generation reservation, completion, and retry; transport replay cannot
  create a second provider job or charge.
- Subscription credit grants have one durable
  `(subscription_id,period_start,period_end)` identity shared by invoice handling
  and the recovery cron.
- Only the exact verified paid invoice defines the grant period; Checkout links
  the subscription but does not grant recurring credits.
- Explicit account deletion first blocks new delivery, waits for a terminal
  receipt from every already-started persistence token, fences locally creating
  Checkout Sessions, expires/reconciles every paginated open/processing Session,
  holds any post-fence paid money for explicit resolution, discovers every
  Stripe subscription by paginating the customer with `status=all`, cancels every
  nonterminal one, confirms a second full discovery is terminal, and removes
  canonical objects with a post-receipt sweep before Auth/profile deletion.
  Clock expiry and the profile's one cached subscription ID are never accepted
  as completeness proof. It never issues an automatic monetary refund; any
  refund requires Muhammad's separate approval.
- Unmigrated legacy asset rows/pointers remain visible and can block explicit
  asset/account deletion; no remediation path hides or deletes them before a
  verified canonical copy exists.
- No production command that can write data runs without an explicit target and
  an environment guard proving it is not the test environment by mistake.
- Secrets are read only from ignored environment files or the deployment secret
  store. Plans and logs contain key names, never secret values.
- Existing unrelated files and user changes are preserved. Each task stages only
  the files it names; never use `git add -A`.

---

## 5. Environment model

The repository currently documents Production and Stripe Live, but no separate
Staging configuration was found. The implementation creates this separation:

| Environment | Supabase | Stripe | Purpose |
|---|---|---|---|
| Local/Test | local or dedicated non-production project | Test Mode | unit, SQL, integration, webhook replay |
| Staging | dedicated non-production project | Test Mode | production-like deployment and browser smoke |
| Production | existing live project | Live Mode | final controlled rollout only |

`.env.test.local` and deployment secrets hold test values and remain ignored by
Git. A test-environment guard fails unless Stripe keys identify Test Mode and the
Supabase URL differs from Production. A production-write guard requires both an
explicit `--target=production` flag and a one-use confirmation token printed by a
preceding read-only preflight.

If external access is available, the agent creates and configures the test
resources. If account authentication or billing approval is required, that is a
permission boundary rather than a manual setup handoff.

The isolated Staging app, non-production Supabase project, Stripe Test catalog,
protected test credentials, and deterministic baseline fixtures are provisioned
immediately after the shared Security test harness and before any Security
Staging gate. Later subsystem releases extend those fixtures; they do not defer
creation of the environment needed to verify Release 1.

---

## 6. Release train

```text
Bootstrap — Program Integration
  correct repository onboarding, reviewable evidence tooling, isolated Staging,
  Stripe Test, and deterministic Security/Admin/customer fixtures

Release 1 — Security containment + deterministic test harness
  038 rate limiter, XSS removal, immediate external-fetch rejection in export,
  CSP report-only

Release 2 — Financial foundation
  039 additive lifecycle and Stripe RPCs, no privilege removal yet

Release 3 — Application cutover
  all nine studios, asset persistence, Stripe webhook, admin adjustments

Release 4 — Enforcement
  040 revoke client writes and replace the status-based reconciler

Release 5 — Storage and AI safety
  041 dual-compatible private canonical assets, atomic AI quota, structured AI contracts

Release 6 — Product quality
  honest error states, React Query, i18n, accessibility, and E2E coverage

Final gate — Program Integration plan: onboarding, quality deploy, CSP
enforcement, cumulative launch-readiness smoke, and observed evidence
```

Migration `039` is additive so the current application can continue operating
while the new code is deployed. Migration `040` is applied only after every
writer has moved to the server workflow. This sequencing prevents downtime
without temporarily reopening customer write access after enforcement.

Before applying `039` in Staging or Production, the rollout records and disables
the existing `reconcile_orphaned_generations` cron job. It stays disabled during
the entire `039` and application-cutover window: refunds may be delayed briefly,
but the old status-based reconciler must never act on browser-writable rows. Only
after `040`, its RLS/reconciler gates, and a single-job identity check pass is the
same cron job re-enabled against the replacement reservation-based function. A
second refund scheduler is never created.

Migration `041` first accepts both the already deployed 039 public asset payload
and the new private payload. Private writes are enabled behind an explicit
canary/global flag only after the compatible database function is live. A future
tightening migration is outside this program while preserved legacy rows exist.

---

## 7. Verification gates

Every release must pass, in order:

1. Focused failing test before implementation.
2. Focused test after implementation.
3. Invariant check, typecheck, lint, and the complete local unit suite.
4. Clean production build.
5. Explicit database permission, concurrency, and idempotency integration checks
   in Test/Staging; these never run as fake-green local unit tests.
6. Staging browser smoke against the affected customer and admin paths.
7. Read-only production preflight.
8. Production deployment during a low-traffic window.
9. Production smoke using dedicated test accounts and the smallest non-financial
   actions possible.
10. Post-deploy read-only ledger, cron, error-log, and CSP report review.

The CSP remains report-only across Releases 1–6. After the exact final Quality
commit is deployed, the program observes seven complete days of the fully
assembled Production application, resolves legitimate violations, then changes
only the CSP mode to enforcement and repeats the cumulative smoke. Earlier
report-only time does not shorten this final observation window. Missing
synthetic intake checks, limiter/metric unavailability, or unexplained report
saturation invalidate the affected interval; telemetry blindness never counts as
a clean day. Activation records a database-timed boundary only after the exact
Quality SHA is proved live. The first eligible slot is the first aligned
15-minute interval beginning on or after that boundary; a preceding or straddling
slot is rejected rather than relabeled. Just after each boundary, a protected
scheduler records the previous fully ended immutable interval, including a
separate bounded actionable-CSP-violation result. Activation also pins the
Coolify application/deployment/config identity and hashed non-secret runtime/
edge fingerprints. Every process boot registers before readiness, target-app
deployment/container/status events continuously invalidate the run through a
separately pinned, private observation-gateway service that stays available with
zero ready target replicas. Its random process-boot UUID registers before health,
is pinned at activation, and any later boot invalidates even when its deployment/
config identity is unchanged. A protected non-overlap task records one
database-timed live/provider heartbeat plus a same-minute synthetic marker that
must traverse the gateway's single durable FIFO queue. Any
post-activation process boot invalidates even with identical identity, so a lost
restart notification cannot hide. Each slot requires all 15
matching heartbeats and a fully paginated Coolify application-deployment history
proof for its exact bounds; a missing page/minute, event/gateway/API outage,
temporary redeploy/mode/config change, or identity mismatch invalidates rather
than disappearing between probes. Enforcement is mechanically
blocked until a read-only verifier finds 672 consecutive healthy completed slots
from one activation run spanning 168 hours for the exact still-served Quality SHA
in report-only mode; the collector cannot supply timestamps, certify a current/
partial/pre-activation interval, combine runs, or backfill older gaps, and a
redeploy/mode change/failure starts a new eligible run.

While report-only is still served, the release tool proves the normalized target
configuration differs only by `CSP_MODE`, sends a FIFO pre-seal barrier, and a
service-only database transaction requires its latest acknowledgement before it
rechecks and seals the exact 672-slot active run. The one enforcement attempt/
token was pre-provisioned before activation and is stored only as a hash. The
enforce boot stays unready until its own later FIFO barrier drains earlier events
and an atomic transition consumes that attempt for the exact intended config,
Quality SHA and deployment identity. After cumulative smoke and a fresh probe,
the tool sends a distinct FIFO confirmation barrier; the locked confirm
transaction moves the pointer only if that marker is still the latest committed
sequence. Any other
post-seal event/config, missing token, or rollback permanently revokes the
authorization; report-only must activate a new run and complete seven new days.

The final observed-facts documentation commit uses a separate, expiring
authorization created before push for one already-known descendant SHA. A Git
guard must prove only the fixed documentation/evidence allowlist changed and all
runtime/config/edge fingerprints stayed identical. Its boot consumes that row
through the same FIFO start barrier. Fresh probes then send a distinct FIFO
confirmation barrier, and the locked RPC confirms only if no later event overtook
it; a different merge SHA
or any code/config/workflow/migration change stays unready and requires a new
Quality release/observation. Confirmation advances one database current-enforced
revision/deployment pointer. This never reopens or reuses the original seal.
If a valid first pre-push attempt is revoked, retrying the same already-known docs
SHA uses a new append-only numbered authorization linked to that immutable proof
before redeploy; the spent row is never reset and changed ancestry/bytes/current
pointer/fingerprints are rejected.

Returning from that docs descendant to a previously confirmed enforce revision
is not authorized merely by its old SHA or deployment UUID. Before asking
Coolify to redeploy it, the guarded tool creates a separate 15-minute
authorization for that exact confirmed target and unchanged config/runtime/edge/
gateway boot. It shares the event-recorder lock and stores the latest committed
FIFO sequence, so a racing event falls wholly before or inside the transition.
The new boot must drain a later FIFO rollback barrier, consume the row,
bind its actual new deployment UUID, and pass a fresh probe before the pointer
moves back. That probe is followed by a distinct FIFO rollback-confirm barrier;
the pointer update shares the event-recorder lock and requires the marker to be
latest. Consume starts a separate 15-minute confirmation deadline; enforce
health fails closed if it passes. Each authorize transaction first revokes stale
pending/unconfirmed children, so a crashed attempt cannot wedge later recovery.
Direct, expired, concurrent, or replayed rollback boots stay unready. Returning
to report-only atomically revokes the parent and all live child transitions.

Production Stripe is never sent a fabricated or replayed event. Its smoke check
is limited to signature/configuration visibility and reading the resulting state
from a deliberately initiated, approved transaction when one is necessary.

---

## 8. Rollback policy

- Additive schema remains in place when application code is rolled back.
- After migration `040`, rollback never restores direct customer writes to
  `generations` or `assets`; failures are fixed forward through the server APIs.
- CSP may move from enforce back to report-only, but the XSS sink and remote asset
  fetch are never restored.
- A rollback that keeps CSP enforced and creates a new deployment UUID first
  consumes the separate short-lived rollback authorization for an already
  confirmed revision; an old SHA alone is never a readiness bypass.
- If reconciliation behaves unexpectedly, disable its existing cron schedule,
  preserve all rows, run the audit report, and fix forward. Never run old and new
  refund jobs together.
- Ledger rows, webhook audit rows, and customer assets are never deleted to make
  a rollback look clean.
- A failed storage migration leaves the legacy URL visible and bulk export
  disabled for that item, matching the approved customer behavior.

---

## 9. Sub-project specifications

- `docs/superpowers/specs/2026-08-18-security-containment-design.md`
- `docs/superpowers/specs/2026-08-18-financial-generation-integrity-design.md`
- `docs/superpowers/specs/2026-08-18-storage-ai-safety-design.md`
- `docs/superpowers/specs/2026-08-18-quality-ux-release-design.md`

Each sub-project is independently reviewable and deployable. Its implementation
plan may consume interfaces from an earlier release but cannot silently widen the
scope of that earlier release.

The final execution handoff is
`docs/superpowers/plans/2026-08-18-program-integration-release.md`. It consumes
the four subsystem plans and is the only plan allowed to declare the cumulative
Production Definition of Done complete.

Implementation plans:

- `docs/superpowers/plans/2026-08-18-security-containment.md`
- `docs/superpowers/plans/2026-08-18-financial-generation-integrity.md`
- `docs/superpowers/plans/2026-08-18-storage-ai-safety.md`
- `docs/superpowers/plans/2026-08-18-quality-ux-release.md`
- `docs/superpowers/plans/2026-08-18-program-integration-release.md`
