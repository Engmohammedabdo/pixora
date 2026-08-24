# Security Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Admin stored XSS, asset-export SSRF, bypassable Admin login limiter, and unsafe script policy without changing credits or deleting legacy assets.

**Architecture:** Establish one deterministic test harness, remove HTML rendering, make export resolve only owned Supabase objects, add an atomic service-only limiter in migration 038, and roll out nonce CSP in report-only mode for final-program enforcement.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Supabase/Postgres, Vitest, Testing Library, JSZip.

**Spec:** `docs/superpowers/specs/2026-08-18-security-containment-design.md`

## Global Constraints

- Inherit every locked decision and safety invariant from `docs/superpowers/specs/2026-08-18-production-remediation-program-design.md`.
- Do not edit migrations 001–037; migration 038 is the only database migration in this plan.
- Do not restore `dangerouslySetInnerHTML`, remote `fetch(asset.url)`, or a read-then-write limiter under any rollback.
- Legacy assets remain visible and are never deleted; invalid legacy rows return `asset_not_exportable` from bulk export.
- Do not use Stripe Live or mutate customer balances in this plan.
- Program Integration Tasks 1–3 run after this plan's Task 1 and before Task 2;
  they install correct onboarding/evidence tooling and provision isolated
  Staging, Stripe Test, protected credentials, and deterministic fixtures.
- Stage only files named by the current task; never use `git add -A`.

---

### Task 1: Deterministic test and script foundation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `vitest.integration.config.ts`
- Create: `tests/setup.ts`
- Create: `tests/integration/setup.ts`
- Create: `tests/security/test-harness.test.ts`
- Create: `tests/security/db-target-guard.test.ts`
- Create: `scripts/db-run.ts`
- Create: `scripts/db-audit-production.ts`
- Create: `scripts/audits/production-schema-version.sql`
- Create: `.env.test.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing TypeScript path alias `@/*`.
- Produces: isolated unit/integration runners, `npm run typecheck`, a local
  `tsx` binary, write-capable `npm run db:test` for Test only, and a fixed-name
  read-only `npm run db:audit:production` command with no arbitrary SQL input.

- [ ] **Step 1: Add a failing harness smoke test**

Create `tests/security/test-harness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/utils';

describe('security test harness', () => {
  it('resolves repository aliases', () => {
    expect(cn('a', false && 'b')).toBe('a');
  });
});
```

- [ ] **Step 2: Run it before installing the runner**

Run:

```powershell
npm test -- --run tests/security/test-harness.test.ts
```

Expected: FAIL because `package.json` has no `test` script.

- [ ] **Step 3: Install declared dependencies**

Run:

```powershell
npm install sharp
npm install --save-dev tsx vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Expected: `sharp` is a direct dependency; all test tools and `tsx` are direct dev dependencies; the lockfile changes.

- [ ] **Step 4: Add scripts and stop network-resolving `npx tsx`**

Set these exact scripts in `package.json`:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:security": "vitest run tests/security",
  "test:integration": "vitest run --config vitest.integration.config.ts",
  "typecheck": "tsc --noEmit --incremental false",
  "db:query": "tsx scripts/db-query.ts",
  "db:test": "tsx scripts/db-run.ts --target=test",
  "db:audit:production": "tsx scripts/db-audit-production.ts",
  "db:backfill-images": "tsx scripts/backfill-data-uris.ts",
  "check:invariants": "tsx scripts/check-invariants.ts"
}
```

Keep the existing `dev`, `prebuild`, `build`, `start`, and `lint` scripts unchanged.

- [ ] **Step 5: Configure Vitest once for the whole program**

Create `vitest.config.ts`:

```ts
import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, 'tests/**/*.integration.test.{ts,tsx}'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
    },
  },
});
```

Create `vitest.integration.config.ts` with Node environment, a 30-second
timeout, `tests/**/*.integration.test.{ts,tsx}` as its only include, and
`tests/integration/setup.ts`. Load `.env.test.local` through Vite's `loadEnv`
and pass only the loaded values into the test process. The setup must fail
clearly when the Test Supabase URL/service key is absent or when its origin is
the documented Production origin. Explicit integration runs must fail, not
silently skip, when their environment is unavailable.

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

Add these ignored test artifacts to `.gitignore`:

```gitignore
/playwright-report/
/test-results/
```

- [ ] **Step 6: Add database target guards before any SQL test**

Create `.env.test.example` with empty `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and
`PRODUCTION_SUPABASE_URL` names. The real `.env.test.local` remains ignored.

`scripts/db-run.ts` accepts one UTF-8 SQL file for `--target=test` only. Load
`.env.test.local` and reject a URL equal to `PRODUCTION_SUPABASE_URL` or
`https://pixoradb.pyramedia.cloud`. There is deliberately no production mode:
client-side keyword filtering cannot make service-role SQL read-only because a
mutating function can be called from `SELECT`.

`scripts/db-audit-production.ts` instead accepts only a closed `--name` enum.
At this task the map contains only `schema-version`, pointing to the tracked
single-statement `scripts/audits/production-schema-version.sql`; later plans add
reviewed names to the map. It never accepts a path or inline SQL. Strip one
optional terminal semicolon, reject any other semicolon, and submit exactly:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';
<one mapped SELECT statement>;
ROLLBACK;
```

The PostgreSQL read-only transaction is the write boundary; the closed map and
single-statement rule prevent transaction breakout. Both runners call the
selected `/pg/query` endpoint without printing keys or response headers.

Export pure target/audit builders so `db-target-guard.test.ts` can assert:

- Test rejects the Production origin and accepts a distinct Test origin.
- The Production command rejects an unknown name, a caller-supplied path, and
  mapped content containing an internal semicolon.
- The emitted Production transaction is read-only and always rolls back.
- A `SELECT public.clear_rate_limit(...)` fixture is rejected because it is not
  a mapped audit; no generic SQL escape hatch exists.
- Error messages contain key names/origins only, never key values.

Run:

```powershell
npm run test -- tests/security/db-target-guard.test.ts
```

Expected: PASS; no database request is made by the unit test.

- [ ] **Step 7: Run the foundation gate**

Run:

```powershell
npm run test:security
npm run check:invariants
npm run typecheck
```

Expected: smoke test passes; invariants report only existing known debt; typecheck exits 0.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts vitest.integration.config.ts tests/setup.ts tests/integration/setup.ts tests/security/test-harness.test.ts tests/security/db-target-guard.test.ts scripts/db-run.ts scripts/db-audit-production.ts scripts/audits/production-schema-version.sql .env.test.example .gitignore
git commit -m "test: add deterministic security harness"
```

---

### Task 2: Canonical public-object parser

**Files:**
- Create: `lib/storage/asset-reference.ts`
- Create: `tests/security/asset-reference.test.ts`

**Interfaces:**
- Consumes: configured `NEXT_PUBLIC_SUPABASE_URL` and an authenticated owner ID.
- Produces:

```ts
export interface AssetStorageReference { bucket: 'assets'; path: string }
export function parseAssetStorageReference(input: {
  rawUrl: string;
  supabaseUrl: string;
  expectedUserId: string;
}): AssetStorageReference | null;
```

- [ ] **Step 1: Write the rejection matrix**

In `tests/security/asset-reference.test.ts`, use a fixed owner UUID and assert:

```ts
const owner = '11111111-1111-4111-8111-111111111111';
const base = 'https://pixoradb.pyramedia.cloud';

expect(parseAssetStorageReference({
  rawUrl: `${base}/storage/v1/object/public/assets/${owner}/generations/g.png`,
  supabaseUrl: base,
  expectedUserId: owner,
})).toEqual({ bucket: 'assets', path: `${owner}/generations/g.png` });
```

Test `null` for: localhost, `169.254.169.254`, RFC1918, `file:`, `data:`, external HTTPS, a different Supabase origin, another bucket, another user prefix, every query string (including redirect/download/transform-looking values), `%2f`, `%5c`, `..`, credentials, fragments, malformed percent encoding, and a missing/empty owner supplied through a runtime cast.

- [ ] **Step 2: Verify failure**

Run:

```powershell
npm run test -- tests/security/asset-reference.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement exact-origin and exact-path parsing**

Create `lib/storage/asset-reference.ts` with this decision order:

```ts
export interface AssetStorageReference {
  bucket: 'assets';
  path: string;
}

const PUBLIC_PREFIX = '/storage/v1/object/public/assets/';

export function parseAssetStorageReference(input: {
  rawUrl: string;
  supabaseUrl: string;
  expectedUserId: string;
}): AssetStorageReference | null {
  try {
    const candidate = new URL(input.rawUrl);
    const base = new URL(input.supabaseUrl);
    if (candidate.protocol !== 'https:' || candidate.origin !== base.origin) return null;
    if (candidate.username || candidate.password || candidate.search || candidate.hash) return null;
    if (!candidate.pathname.startsWith(PUBLIC_PREFIX)) return null;
    if (/%2f|%5c|%2e|%00/i.test(candidate.pathname)) return null;

    const encodedPath = candidate.pathname.slice(PUBLIC_PREFIX.length);
    const pathValue = decodeURIComponent(encodedPath);
    const segments = pathValue.split('/');
    if (segments.length < 2 || segments.some((s) => !s || s === '.' || s === '..')) return null;
    if (!input.expectedUserId || segments[0] !== input.expectedUserId) return null;

    return { bucket: 'assets', path: pathValue };
  } catch {
    return null;
  }
}
```

Queries are rejected. If a future Supabase transform endpoint is required, it
gets a separate allowlisted parser that reconstructs the canonical object path;
generic query acceptance cannot widen this export/preview boundary.

- [ ] **Step 4: Run the focused test**

```powershell
npm run test -- tests/security/asset-reference.test.ts
```

Expected: PASS for the owned storage object; every hostile URL returns `null`.

- [ ] **Step 5: Commit**

```powershell
git add lib/storage/asset-reference.ts tests/security/asset-reference.test.ts
git commit -m "feat(security): validate canonical asset references"
```

---

### Task 3: Remove stored XSS and external Admin previews

**Files:**
- Modify: `components/admin/ExpandableRow.tsx`
- Modify: `app/admin/generations/page.tsx`
- Test: `tests/security/admin-expandable-row.test.tsx`

**Interfaces:**
- Consumes: `parseAssetStorageReference()` and the generation row's `user_id`.
- Produces: escaped JSON text and previews restricted to the configured Supabase origin and exact owner prefix.

- [ ] **Step 1: Write the hostile render tests**

Render `ExpandableRow` with:

```ts
const payload = '<img src=x onerror="window.__pwned=1"><script>alert(1)</script>';
```

Assert the payload is present in `textContent`, `container.querySelector('script')` is null, no rendered image has `src="x"`, the `<pre>` has no `dangerouslySetInnerHTML` effect, and copy writes the full JSON string. Also assert an external `.png`, another user's canonical URL, and a canonical URL without an owner prop are not previewed; the exact configured URL under the supplied owner is previewed.
Repeat the URL matrix for both nested output URLs and a direct `imageUrl`
property, including an otherwise canonical owned URL with any query string.

- [ ] **Step 2: Confirm the existing component fails**

```powershell
npm run test -- tests/security/admin-expandable-row.test.tsx
```

Expected: FAIL because the hostile string creates injected markup.

- [ ] **Step 3: Render JSON as React text**

Delete `syntaxHighlight`. Replace the current `<pre dangerouslySetInnerHTML=... />` with:

```tsx
<pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-300">
  {jsonString}
</pre>
```

Add `expectedAssetOwnerId?: string` to `ExpandableRow`. Filter extracted preview
URLs through `parseAssetStorageReference` using that required owner value and
`process.env.NEXT_PUBLIC_SUPABASE_URL`; without either value render no preview.
The Admin generations page passes `row.user_id` for input/output rows. Generic
Admin log rows pass no owner and therefore render JSON only. Keep the explicit
copy button behavior.

- [ ] **Step 4: Run focused and static gates**

```powershell
npm run test -- tests/security/admin-expandable-row.test.tsx
npm run typecheck
npm run check:invariants
```

Expected: hostile markup appears only as text; all commands pass.

- [ ] **Step 5: Commit the P0 fix independently**

```powershell
git add components/admin/ExpandableRow.tsx app/admin/generations/page.tsx tests/security/admin-expandable-row.test.tsx
git commit -m "fix(security): render admin generation JSON safely"
```

---

### Task 4: Remove remote fetch from asset export

**Files:**
- Modify: `app/api/assets/export/route.ts`
- Test: `tests/security/assets-export-route.test.ts`

**Interfaces:**
- Consumes: `parseAssetStorageReference()`, authenticated row ownership, and a service-role Storage client.
- Produces: ZIP only from owned `assets` bucket objects, or structured `422/413` errors.

- [ ] **Step 1: Write route tests with mocked auth, table, and Storage**

Cover these exact cases:

- external, localhost, link-local, private-network, data, and cross-user URLs return `422 asset_not_exportable`;
- invalid selection never calls global `fetch`, Storage `download`, or `zip.generateAsync`;
- duplicate IDs, a missing row, or a cross-user ID fail the complete selection;
- one canonical object calls `storage.from('assets').info(ownerPath)` before a bounded stream download and returns ZIP headers;
- trusted Storage metadata over 25 MiB or a selection over 100 MiB returns `413` before `download`;
- a stream exceeding its metadata/limit is aborted and returns `413`;
- `info` or download failure returns a structured non-2xx and no ZIP;
- one invalid row among valid rows returns `422` with all invalid IDs instead of a partial ZIP.

- [ ] **Step 2: Verify the current route fails**

```powershell
npm run test -- tests/security/assets-export-route.test.ts
```

Expected: FAIL because the route calls `fetch(asset.url)` and silently skips failures.

- [ ] **Step 3: Implement sequential canonical downloads**

Validate a bounded, unique ID array, query rows by both ID and authenticated
`user_id`, and compare the returned ID set to the requested set before touching
Storage. Resolve every row before downloading. If any reference is invalid,
return:

```ts
NextResponse.json(
  { success: false, error: 'asset_not_exportable', assetIds: invalidIds },
  { status: 422 },
);
```

Use `createServiceRoleClient()` only after row ownership is proven. Call Storage
`info(path)` for all resolved objects and enforce limits from its trusted size;
do not trust `assets.size_bytes`. Download sequentially with
`download(path).asStream()`, count chunks, abort on any overrun, accumulate no
more than 100 MiB, and only then add bounded buffers to JSZip. Any metadata or
download failure aborts the entire response. Do not retain a `downloadPromises`
array and do not reference global `fetch`.

- [ ] **Step 4: Run focused and build gates**

```powershell
npm run test -- tests/security/asset-reference.test.ts tests/security/assets-export-route.test.ts
npm run typecheck
npm run build
```

Expected: tests pass; production build exits 0.

- [ ] **Step 5: Commit**

```powershell
git add app/api/assets/export/route.ts tests/security/assets-export-route.test.ts
git commit -m "fix(security): export owned storage objects only"
```

---

### Task 5: Add migration 038 atomic fixed-window limiter

**Files:**
- Create: `supabase/migrations/038_security_containment.sql`
- Create: `tests/db/038_security_containment.sql`
- Create: `tests/security/rate-limit-concurrency.integration.test.ts`
- Create: `tests/security/observation-store-types.test.ts`
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces service-only `consume_rate_limit`, `clear_rate_limit`, fixed-outcome
  CSP intake counters/health reads, immutable 15-minute CSP observation slots,
  runtime-start/deployment-event invalidation, database-minute deployment
  heartbeats, docs-descendant/enforced-rollback authorizations, bounded cleanup,
  and one idempotently named hourly cleanup job.
- Later consumed by `lib/security/server-rate-limit.ts`.

- [ ] **Step 1: Write the transactional SQL assertions**

`tests/db/038_security_containment.sql` must `BEGIN`, verify attempts 1–5 are
allowed and 6 is denied with a positive retry, assert invalid limits raise,
assert `expires_at` advances with a reset window, and verify CSP intake accepts
only the seven fixed outcomes with one row per minute/outcome. Verify one
service-only batch call adds bounded nonnegative deltas without accepting an
attacker-controlled key. Expire 500 limiter
fixtures plus 15-day intake buckets and prove bounded cleanup removes them;
create observation fixtures and prove begin derives only the previous fully
ended aligned slot from database time, returns a one-use token/bounds, finish
accepts only the six non-deployment booleans including `csp_violations_ok` plus
the fixed deployment-history digest, derives `deployment_ok`, and
database-derived healthy cannot be supplied. Create an activation at database
  time and prove a previous ended slot that predates or straddles it returns
  `not_yet_eligible` without a row. Prove only the first wholly post-activation
  aligned slot can begin, repeating activation for the same active SHA cannot
  move the boundary only when attempt ID/token hash and every pinned identity
  match; a mismatch changes nothing. A new SHA creates a new run only after
  explicit closure; the unique live-run index covers active/sealed-pending/
  enforcement-started/enforced, and the reader cannot combine old/new runs.
  Register one current standalone-gateway boot before activation and prove each
  event/marker/heartbeat must carry it; another boot invalidates even with the
  same deployment/config. Race two gateway registrations and require the highest
  database identity sequence to be the sole current boot. Register every current runtime before activation; prove any
  later boot invalidates the run even with identical identity, while an invalid
  boot also cannot become ready. Record 15
  database-derived minute heartbeats and prove a stable exact-identity interval
  can finish, while a missing minute, changed Coolify deployment/config/runtime/
  edge identity, failed live/provider/gateway check, replayed/missing/wrong-minute
  FIFO marker acknowledgement, or relevant deployment/container
  event makes `deployment_ok=false` or invalidates the run. Prove heartbeat
  and event RPCs reject extra/missing/caller-selected identity fields; the exact
  fixed-app provider-enriched deployment UUID/revision/config tuple persists.
  Persist the fixed provider-derived normalized status as well: progressing→
  healthy is allowed only for the exact bound deployment, while failed/stopped/
  restarted/different identity or a non-healthy final read fails consume/confirm.
  Prove heartbeat
  timestamps/backfill are impossible, duplicate identical calls are idempotent,
  and a late event invalidates even an earlier completed slot. Prove current/partial/older slots cannot be selected, a
  collecting/failed/completed row cannot be overwritten, and the reader rejects
  an invalid SHA/limit. Prove 15-day intake cleanup does not remove observation
  history and 400-day retention is bounded separately; assert the named hourly cron exists once and
`anon`/`authenticated` have no table or RPC access, then `ROLLBACK`.
Prove seal rejects 671/gapped/unhealthy slots, a non-latest/replayed/missing FIFO
barrier, a queued real event before it, and any normalized config delta besides
`CSP_MODE`. It atomically seals one exact 672-slot active run as
`sealed_pending` and blocks collection. Prove enforce startup without the exact
pre-provisioned attempt/token/seal stays unready; the post-deploy FIFO barrier
and exact intended config/deployment consume it once, matching replicas pass,
and unexpected events/config or rollback permanently revoke reuse.
Prove a confirmed enforced run can preauthorize one unexpired exact docs-only
target/proof with unchanged fingerprints, that target consumes/confirms once,
and another SHA, expired row, code/config proof, or report-only rollback denies
without invalidating the prior confirmed revision. Prove that revision under a
new rollback deployment UUID still stays unready without a separate pending
15-minute rollback authorization. Revoke any failed descendant first; then prove
one exact previously confirmed target drains a later FIFO rollback barrier,
binds the new UUID once, confirms with a fresh proof, and updates the current-
enforced pointer. Concurrent descendant/rollback authorization, an unconfirmed
target, changed fingerprint/gateway boot, expiry, event overtaking, or replay
must fail. Race one target event against each authorize RPC and prove their
shared run-row/sequence lock puts it wholly before the stored boundary or inside
the later bounded transition stream; it can never disappear between clocks.
After each initial-enforce/docs/rollback smoke, send a distinct confirmation
barrier and prove the confirm RPC locks the recorder, requires that marker to be
the latest committed sequence, and rejects an event accepted after the start
barrier but before confirmation. No pointer may move from a fresh HTTP probe
alone.
Crash after authorize and after consume, advance database time, and prove the
pending/15-minute confirmation deadlines revoke the stale row, fail transition
health, and let a new attempt proceed. Race a report-only boot with both child
types and require one run-lock transaction to revoke the parent plus every
pending/consumed child so neither partial index wedges a future run.
Also consume the initial parent enforcement attempt without confirming it:
health is allowed only for its exact bound deployment during a fixed 60-minute
database deadline, then becomes 503 and atomically revokes it. Revoke a first
docs attempt and prove the identical target can use a new append-only numbered
`retry_of` attempt with the original pre-push proof, while resetting the old row
or changing base/proof/fingerprints fails.

- [ ] **Step 2: Run against the isolated Test database before migration**

Run through the guarded Test runner created in Task 1:

```powershell
npm run db:test -- tests/db/038_security_containment.sql
```

Expected: FAIL because `consume_rate_limit` does not exist. Never run this write-capable test against Production.

- [ ] **Step 3: Implement migration 038 in one transaction**

The migration must create the table/index from the spec and implement the atomic decision with one upsert:

```sql
INSERT INTO public.rate_limit_counters AS c
  (key, window_started_at, count, expires_at, updated_at)
VALUES (p_key, v_now, 1, v_now + make_interval(secs => p_window_seconds), v_now)
ON CONFLICT (key) DO UPDATE SET
  window_started_at = CASE
    WHEN c.window_started_at + make_interval(secs => p_window_seconds) <= v_now
      THEN v_now ELSE c.window_started_at END,
  count = CASE
    WHEN c.window_started_at + make_interval(secs => p_window_seconds) <= v_now
      THEN 1 ELSE c.count + 1 END,
  expires_at = CASE
    WHEN c.window_started_at + make_interval(secs => p_window_seconds) <= v_now
      THEN v_now + make_interval(secs => p_window_seconds) ELSE c.expires_at END,
  updated_at = v_now
RETURNING count, window_started_at INTO v_count, v_window_started_at;
```

Return `allowed := v_count <= p_limit` and a ceiling retry interval. Validate key
length 1–200, limit 1–100000, and window 1–86400. Add bounded
`csp_report_intake_metrics(minute,outcome,count)` plus service-only
`record_csp_report_intake_batch(fixed_outcome_counts)`/
`get_csp_report_intake_health(...)`; outcome is one of `accepted`,
`admission_limited`, `global_limited`, `ip_limited`, `invalid`, `oversized`, or
`limiter_unavailable`, so attacker input never becomes a key and the application
flushes at most one aggregate batch per interval instead of one metric write per
request. Extend the indexed,
lock-safe cleanup to retain these buckets 14 days and schedule exactly one hourly
`pyrasuite-rate-limit-cleanup` job idempotently. Enable RLS, revoke table/RPC
privileges from `PUBLIC/anon/authenticated`, grant only `service_role`, and record
version `038` in `schema_migrations`.

Create `csp_observation_runs`, `csp_observation_intervals`,
`csp_deployment_heartbeats`, `csp_runtime_starts`, `csp_deployment_events`,
`csp_gateway_starts`, `csp_gateway_markers`,
`csp_enforced_descendant_authorizations`,
`csp_enforced_rollback_authorizations`, and their
activate/seal/deactivate/begin/finish/read/
register/record/marker-ack/consume/confirm/revoke service-only RPCs exactly as the spec
defines. Activation derives database `activated_at` plus the first aligned slot
starting on or after it and pins the Coolify application/deployment/config plus
hashed allowlisted runtime/edge identities plus the standalone gateway's current
registered boot UUID/fingerprint. The same already-active SHA and
identical attempt/token hash/identities are idempotent and cannot reset time; the
redacted state reader exposes no token/hash. A differing active value fails
unchanged until explicit deactivation/invalidation and separately proved
activation. Begin uses
database time to derive the previous fully ended aligned 15-minute interval,
validates the active report-only run/full SHA, and returns `not_yet_eligible`
without inserting when that slot begins before the activation boundary.
Otherwise it inserts one `collecting` row for that run and returns an opaque
token and bounds. Runtime-start registration happens before readiness and any
post-activation boot atomically invalidates the active run, even with identical
identity; a valid process may then serve but that observation is lost. Target deployment/container
events do the same while active, including events received after a slot
finished; post-seal events remain ordered for enforcement consumption. The
standalone gateway registers a random boot UUID before its own healthcheck; any
registration receives a database identity sequence; activation pins the highest
one, and any later boot invalidates active observation even under identical config, while a
sealed/enforcement barrier from the new boot is rejected/revoked. Every
heartbeat derives the current database minute, sends a unique internal health
marker through the same authenticated gateway/queue/receiver, waits for its
durable database acknowledgement, and stores the resulting monotonically
increasing acknowledgement hash. The internal marker never invalidates a run;
replay/staleness/wrong-minute acknowledgement fails it. Heartbeats are immutable/
no-backfill. Finish matches
the token once, validates the six non-deployment booleans and fixed paginated-
history digest, requires 15 exact heartbeats plus no event/invalidation, derives
`deployment_ok`, and lets the generated column derive healthy; it has no
timestamp/update/backfill input. The reader is bounded to 700 rows from only the
current active run; the separate revision+attempt+seal reader returns only a
consumed/confirmed authorization and immutable summary. Retain runs/intervals/starts/events/heartbeats/markers for 400 days
through bounded cleanup, never the 14-day intake cleanup.
Activation also stores a hash of one random enforcement token/attempt already
provisioned during report-only. Seal requires the latest acknowledged pre-seal
FIFO barrier, compares fixed normalized current/intended JSON in SQL, proves the
only delta is `CSP_MODE`, rechecks the exact latest 672 consecutive healthy rows,
stores the intended config/runtime hash plus immutable seal, and changes
active→sealed_pending. The first enforce boot sends a second FIFO barrier and
must atomically consume that one attempt for the exact config/deployment before
readiness and receives a 60-minute database confirmation deadline. Confirmation
follows cumulative smoke/fresh probe plus a final FIFO confirmation barrier that
must remain the latest committed sequence under the event-recorder run lock. It
updates the current pointer in the same transaction. Any mismatch/rollback is
revoked and cannot return to an enforcement state.
The event recorder accepts only the fixed receiver's provider-enriched identity
JSON, validates its exact keys/types against the run's application, and stores
the authoritative deployment UUID/revision/config hash, fixed normalized status,
plus registered gateway boot UUID. It rejects caller-
selected applications and incomplete/extra identity fields. Regenerate Supabase
types after 038 so Program Task 2's first typed calls compile before Financial.
The type-only conformance test proves every local `ObservationStore` RPC name,
argument and result is assignable to and from the regenerated 038 declarations;
no `any`, assertion cast, or unchecked index signature may bridge a mismatch.
Add the separate 30-minute docs-descendant authorize/consume/confirm/revoke RPCs.
They require a confirmed enforced run, exact base/target SHAs and guard-proof
hash, unchanged config/runtime/edge fingerprints and registered gateway boot
UUID/fingerprint, and one FIFO-bound target deployment. Both authorize RPCs and
the event/marker recorder use the same run-row lock: each authorization stores
the latest committed FIFO sequence, rejects a pending/consumed row in either
table, and its later barrier accepts only exact target events after that boundary.
They never reopen or
reuse the seal for application changes; an
expired/different target stays unready. Confirmation updates the run's exact
current-enforced revision/deployment pointer only after a fresh probe's distinct
latest FIFO confirmation barrier. A revoked same-target attempt remains
immutable; a new numbered `retry_of` row is allowed before redeploy only when the
original pre-push proof and every current identity still match.
Add the 15-minute enforced-rollback authorize/consume/confirm/revoke RPCs from
the spec. The authorize transaction locks the run, requires the target to be an
already confirmed enforce revision, captures the current pointer, rejects a live
authorization of either transition type, and pins unchanged config/runtime/edge/
gateway boot equal to the run's pinned value plus the latest committed FIFO
sequence before any provider
mutation. The rollback boot must acknowledge
the distinct FIFO barrier and bind its newly created deployment UUID before
readiness; consume starts a separate 15-minute confirmation deadline, and
confirmation requires a fresh exact probe plus a distinct latest FIFO confirm
barrier and advances the pointer in that locked transaction. Both
authorize RPCs first revoke database-expired pending/consumed rows under the
shared run lock; an exact live pending retry resumes idempotently. Add the
service-only runtime-authorization health reader: it expires a stale initial
parent attempt and stale children, and permits only the exact unexpired consumed
`enforcement_started` parent, current confirmed deployment, or an unexpired
consumed child.
Report-only parent revoke cascades atomically to every pending/consumed child.
Direct old-SHA startup, expiry, mismatch, concurrency, or replay fails closed.

- [ ] **Step 4: Re-run SQL and concurrency tests**

The TypeScript integration test calls the Test RPC 50 times with one key using
`Promise.all` and asserts exactly 5 allowed decisions. It is excluded from the
normal unit suite and must fail when `.env.test.local` is absent.

```powershell
npm run db:test -- tests/db/038_security_containment.sql
npm run test:integration -- tests/security/rate-limit-concurrency.integration.test.ts
npm run test -- tests/security/observation-store-types.test.ts
npm run typecheck
```

Expected: SQL finishes with rollback; concurrency result is exactly 5 allowed and 45 denied.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/038_security_containment.sql tests/db/038_security_containment.sql tests/security/rate-limit-concurrency.integration.test.ts tests/security/observation-store-types.test.ts lib/supabase/types.ts
git commit -m "feat(security): add atomic server rate limiter"
```

---

### Task 6: Cut Admin login over to the atomic limiter

**Files:**
- Create: `lib/security/server-rate-limit.ts`
- Create: `lib/security/client-ip.ts`
- Create: `lib/security/admin-login-admission.ts`
- Modify: `lib/admin/auth.ts`
- Modify: `lib/admin/logger.ts`
- Modify: `app/api/admin/auth/login/route.ts`
- Test: `tests/security/admin-rate-limit.test.ts`
- Test: `tests/security/admin-login-admission.test.ts`
- Test: `tests/security/admin-login-route.test.ts`
- Create: `scripts/hammer-admin-login.ts`

**Interfaces:**
- Consumes: Task 5 RPCs.
- Produces `consumeServerRateLimit`, `clearServerRateLimit`, `getTrustedClientIp`, and fail-closed Admin authentication.

- [ ] **Step 1: Write IP and login behavior tests**

Assert `getTrustedClientIp` returns null when the flag is not exactly `true`, rejects comma-separated/spoofed/malformed values, and accepts one valid IPv4/IPv6 value. Assert rotating `X-Forwarded-For` never changes the normalized username key. Assert limiter storage failure returns `503` without calling `verifyCredentials`.
In Staging/Production mode, assert a false flag or missing/malformed trusted IP
returns the same 503 before any limiter or credential call. Send 300 random-
username attempts from one trusted IP and prove only its first 20 touch
`admin-login:global-admitted`; a request from a different admitted IP is not
denied by the one-address flood.

The admission tests use a bounded clock and prove per-IP entries expire, the LRU
never exceeds its hard key cap, and a per-instance global ceiling bounds rotating
addresses. An oversized request and a 10,000-request flood after local admission
closes must make zero Supabase/RPC calls and zero body reads/parses. Route tests
also prove only cheap method/content-type/content-length checks occur before the
trusted-IP/local gates; the application rechecks the 4096-byte cap after
admission even though the edge owns the first limit.

- [ ] **Step 2: Verify current behavior fails**

```powershell
npm run test -- tests/security/admin-rate-limit.test.ts tests/security/admin-login-admission.test.ts tests/security/admin-login-route.test.ts
```

Expected: FAIL because the current limiter reads then upserts, trusts `X-Forwarded-For`, and fails open.

- [ ] **Step 3: Implement the shared server facade**

Use `createServiceRoleClient()` internally. `admin-login-admission.ts` owns a
hard-capped expiring LRU with fixed per-IP 20/15-minute and per-instance
300/minute global admission before any Supabase client/body read. The edge
verifier separately rejects shared/per-replica global budgets summing above 300.
It stores no username/password.
Map RPC output to:

```ts
export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}
```

Throw `RateLimitUnavailableError` for transport/RPC errors. In `client-ip.ts`, use `isIP` from `node:net` and read only `x-real-ip` behind `TRUSTED_PROXY_HEADERS=true`.

- [ ] **Step 4: Replace Admin auth logic**

Do not read or parse the login body at route entry. After cheap header checks, in
Staging/Production require the verified trusted address, pass the bounded local
per-IP/global admission, construct the service client, and consume its durable
20/15-minute IP key. Stop at the first denial. Only an IP-admitted request reads
at most 4096 bytes, parses JSON, validates bounded username/password strings,
normalizes `username.trim().toLowerCase()`, and hashes it with SHA-256. Then
consume `admin-login:global-admitted` at 300/minute and only then create/consume
the 5/15-minute username key. Local/Test uses an explicit test-only identity
path; deployed Admin auth never skips edge, local, or durable IP limiting. Delete the
`system_settings` read/upsert
implementation. On success clear only the username key. Logger receives
`string | null` from the trusted-IP helper. Tests generate many random usernames
and prove one address cannot exhaust the shared counter while admitted
distributed traffic remains globally bounded.

The login route returns `413` for its admitted application-level byte-cap check,
`429` plus `Retry-After` for local/durable denial, and
`503 login_temporarily_unavailable` for trusted-IP/limiter failure. Traffic
blocked by local admission never constructs Supabase or parses the body.

- [ ] **Step 5: Add the staging hammer script**

`scripts/hammer-admin-login.ts` accepts `--base-url`, `--attempts`, and `--username`, sends wrong passwords concurrently, rotates only the untrusted XFF header, and prints status counts without printing credentials.

Run:

```powershell
tsx scripts/hammer-admin-login.ts --base-url https://staging-host --attempts 50 --username security-containment-test
```

Expected: 5 responses `401`, 45 responses `429`.
The Staging evidence also reads fixed limiter health and proves this one-source
run added at most 20 admitted-global increments, not 50.

- [ ] **Step 6: Run gates and commit**

```powershell
npm run test -- tests/security/admin-rate-limit.test.ts tests/security/admin-login-admission.test.ts tests/security/admin-login-route.test.ts
npm run typecheck
npm run build
git add lib/security/server-rate-limit.ts lib/security/client-ip.ts lib/security/admin-login-admission.ts lib/admin/auth.ts lib/admin/logger.ts app/api/admin/auth/login/route.ts tests/security/admin-rate-limit.test.ts tests/security/admin-login-admission.test.ts tests/security/admin-login-route.test.ts scripts/hammer-admin-login.ts
git commit -m "fix(security): enforce atomic admin login limits"
```

---

### Task 7: Roll out request-nonce CSP in report-only mode

**Files:**
- Create: `lib/security/csp.ts`
- Create: `lib/security/startup-security.ts`
- Create: `lib/security/csp-report-admission.ts`
- Create: `instrumentation.ts`
- Create: `app/api/security/csp-report/route.ts`
- Modify: `middleware.ts`
- Modify: `next.config.ts`
- Modify: `app/layout.tsx`
- Modify: `app/[locale]/layout.tsx`
- Modify: `app/admin/layout.tsx`
- Modify: `.env.test.example`
- Modify: `package.json`
- Create: `scripts/check-csp-intake-health.ts`
- Create: `scripts/verify-security-ingress.ts`
- Create: `docs/operations/security-ingress.md`
- Test: `tests/security/csp.test.ts`
- Test: `tests/security/csp-report-admission.test.ts`
- Test: `tests/security/csp-report-route.test.ts`
- Test: `tests/security/middleware-csp.test.ts`
- Test: `tests/security/csp-render.integration.test.ts`
- Test: `tests/security/startup-security.integration.test.ts`
- Test: `tests/security/csp-intake-health.test.ts`
- Test: `tests/security/security-ingress.test.ts`

**Interfaces:**
- Produces `createCspNonce()`, `buildContentSecurityPolicy()`, bounded local
  CSP-report admission, and an exact two-route Traefik ingress verifier from the
  spec; every deployed runtime also registers its fixed release identity before
  readiness through Program Task 2's continuity module.
- Consumed by every middleware response path.

- [ ] **Step 1: Write CSP policy tests**

Assert production `script-src` contains the generated nonce, `'strict-dynamic'`,
Stripe and Vercel hosts, and contains neither script `'unsafe-inline'` nor
`'unsafe-eval'`. Assert development permits only the required eval exception.
Assert exact report-only/enforce values select the correct header; missing/empty/
invalid Staging or Production `CSP_MODE` fails configuration validation, while
local development alone defaults to report-only. Snapshot and preserve the
existing `object-src`, `base-uri`, `form-action`, `frame-ancestors`,
`connect-src`, `img-src`, `media-src`, and `upgrade-insecure-requests` defenses.
Assert the startup validator requires exact `CSP_MODE` and
`TRUSTED_PROXY_HEADERS=true` whenever `APP_RELEASE_ENV` is `staging` or
`production`; unknown/missing release identity also fails deployed startup.
Mock migration 038 and prove every process boot records a unique boot ID plus
Coolify application UUID, exact 40-character SHA, mode, and hashed allowlisted
runtime fingerprint before health can pass. A mismatched active observation run
and even an identical post-activation boot invalidate that run. A process with
valid intrinsic release config may become ready after recording invalidation;
invalid config or database/registration failure remains unready.
For Production enforce, also prove a valid mode string without the matching
attempt/token/seal never becomes ready. A first matching boot must drain an
`enforcement_start_barrier` and consume the `sealed_pending` authorization for
the exact intended config/deployment; later matching replicas pass, but a stale
token, extra config change, unexpected queued event, or revoked attempt fails.
The exact consumed initial parent remains health-eligible for its database-timed
60-minute confirmation deadline; expiry makes health 503 and revokes it. Its
confirm path requires the fresh smoke/probe plus a latest FIFO confirmation
barrier, not the HTTP proof alone.
After confirmation, a boot with the same previously confirmed SHA but a new
deployment UUID must still fail unless an exact pending enforced-rollback row
exists. Prove its distinct FIFO barrier consumes once, confirmation updates the
current pointer, and a direct/replayed/expired/concurrent rollback stays unready.
Mock the enforce health reader and prove an unconfirmed consumed child becomes
503 after its database deadline, while confirmation atomically switches health
to the current pointer. A report-only boot clears all live child transitions.

- [ ] **Step 2: Write report endpoint tests**

Assert the middleware treats the endpoint as public. A valid allowlisted report
returns 204, a body over 8192 bytes returns 413 without logging it,
newline/control characters are stripped, locally denied/global/IP-limited or
limiter-unavailable reports are dropped without logging and application-level
denials still return 204, and the endpoint never echoes the body. Before any
Supabase client/body parse, require a bounded hard-cap LRU with fixed per-IP and
per-instance buckets. A 10,000-request over-limit flood must create no new keys
past the cap and make zero additional Supabase calls after local admission
closes. Require independent durable keys and exact limits:
`csp-report:global` at 1000/minute, then `csp-report:ip:<trusted-ip>` at
120/minute only when a trusted address exists.
Prove CSP traffic never increments, clears, or denies any `admin-login:*`
counter; absent trusted IP skips the optional IP counter rather than sharing an
`unknown` key.

Mock `record_csp_report_intake_batch` and assert request handling increments only
fixed process-local counters; one scheduled/threshold flush writes one bounded
delta batch per interval without report text/cardinality. If the limiter/metric
store or flush is unavailable, emit only an aggregate-safe
`csp_report_intake_unavailable` platform metric. Ingress contract tests require
two higher-priority exact routers. The CSP-report router uses Traefik buffering
`maxRequestBodyBytes=8192`, source-IP rate `average=120`, `period=1m`, and
`burst=20`; the Admin-login router uses `maxRequestBodyBytes=4096`, source-IP
`average=20`, `period=15m`, and `burst=5`, plus a host-grouped global
`average=300`, `period=1m`. Rate middlewares precede buffering, so denied
requests are not body-buffered. Both expose 413/429 metrics; multiple replicas
use shared limiting or explicit per-replica budgets whose sum stays within the
declared ceiling. Missing or ambiguous configuration fails.
`check-csp-intake-health.ts` first runs the protected ingress verifier, sends a
synthetic allowlisted report, reads the service-only minute buckets plus edge
metrics, and fails on a missing accepted increment/batch flush, saturation,
unavailable read, or an unexplained limiter/admission outage.

Add a middleware regression test that simulates Supabase `setAll` cookie
rotation and proves the final CSP response preserves every `Set-Cookie`, redirect,
rewrite, request header, and status from the existing response path.

- [ ] **Step 3: Verify focused tests fail**

```powershell
npm run test -- tests/security/csp.test.ts tests/security/csp-report-admission.test.ts tests/security/csp-report-route.test.ts tests/security/middleware-csp.test.ts tests/security/csp-intake-health.test.ts tests/security/security-ingress.test.ts
npm run test:integration -- tests/security/startup-security.integration.test.ts
```

Expected: FAIL because no nonce CSP module or report route exists.

- [ ] **Step 4: Implement policy construction**

Follow the official Next.js 15 CSP nonce flow documented at `https://nextjs.org/docs/15/app/guides/content-security-policy`: create one UUID-derived base64 nonce per request, set `x-nonce` and the CSP on forwarded request headers, and set the same policy on the response.

Keep non-CSP headers in `next.config.ts`; remove only its static CSP entry.
Preserve every existing directive in the middleware-built policy. Add the report
route to the public API allowlist. The independent Coolify observation gateway
has no target-app API/middleware exception or readiness dependency. Run the hard-capped local admission guard
before Supabase construction/body parsing; only admitted reports consume the
exact independent `csp-report:*` global/IP durable limits before structured
logging. Expired local entries are evicted, the cap never grows, and fixed
outcomes flush through one aggregate batch per interval. Never reuse the Admin
login namespace. Add empty `CSP_MODE` to `.env.test.example`; its value and the
existing service-role/Coolify-or-Traefik read credential names used by the
synthetic health/ingress readers plus `COOLIFY_APPLICATION_UUID` and
the fixed private `COOLIFY_OBSERVATION_GATEWAY_URL`,
`COOLIFY_OBSERVATION_GATEWAY_SECRET`, `CSP_ENFORCEMENT_ATTEMPT_ID`, and
`CSP_ENFORCEMENT_TOKEN` live only in protected environments. The
ingress verifier accepts only Staging/Production environment names and reads the
exact CSP-report plus Admin-login router/middleware/metrics contract; it cannot
mutate config or accept an
arbitrary URL. Implement checks without printing credentials or any report body.

Implement `validateStartupSecurity()` in a server-only module and call it from
the root `instrumentation.ts` `register()` hook before the application becomes
ready. It validates `APP_RELEASE_ENV`, exact `CSP_MODE`, and the trusted-proxy
flag for Staging/Production, then calls Program Task 2's fixed
`registerRuntimeStart` with a process boot UUID and hashes only the approved
non-secret identity allowlist. It never sends or logs raw environment values.
In Production enforce, it stays unready while it sends the fixed start marker
through the FIFO gateway, waits for the exact database acknowledgement, and
calls the one-use consume RPC with the protected attempt/token. Only the exact
currently confirmed deployment or one pending docs-descendant/enforced-rollback
transition—or the exact consumed initial `enforcement_started` parent before its
60-minute deadline—may pass; a new UUID for an old SHA is never treated as an ordinary
restart. A rollback transition uses its distinct marker purpose, binds the new
UUID once, and remains unready until consumed. In enforce mode `/api/health`
calls the service-only runtime-authorization health reader and returns only its
existing safe shape with 503 on an expired/unconfirmed transition or database
failure. Report-only startup during the separate CSP-mode rollback revokes the
parent and all pending/consumed child authorizations before becoming ready.
Readiness remains false on validation/registration failure; middleware
validation remains defense in depth.
The built-server negative integration test launches `next start` with each
missing/invalid value and proves the process exits or never becomes healthy,
then launches the valid report-only fixture successfully. A request-time 500 is
not accepted as startup failure.

Add `"verify:security-ingress": "tsx scripts/verify-security-ingress.ts"` and
`"check:csp-intake": "tsx scripts/check-csp-intake-health.ts"` to `package.json`.

Nonce CSP cannot be combined with the current static/ISR locale contract. Make
the root, locale, and Admin layouts async and call Next.js `connection()` before
rendering; remove comments/exports that claim the locale tree is statically
rendered. Refactor middleware return sites through one response-finalization
helper so redirects, rewrites, Admin, API, public, and authenticated responses
all receive the correct header while preserving Supabase cookie rotation.

- [ ] **Step 5: Verify the report-only build before deployment**

Set `CSP_MODE=report-only`. Run:

```powershell
npm run test -- tests/security/csp.test.ts tests/security/csp-report-admission.test.ts tests/security/csp-report-route.test.ts tests/security/middleware-csp.test.ts tests/security/csp-intake-health.test.ts tests/security/security-ingress.test.ts
npm run test:security
npm run typecheck
npm run build
npm run test:integration -- tests/security/csp-render.integration.test.ts tests/security/startup-security.integration.test.ts
```

Use the integration fixture to launch the built app with safe Test configuration.
`tests/security/csp-render.integration.test.ts` fetches representative root,
locale, auth, and unauthenticated `/admin/login` HTML, extracts the policy nonce,
and asserts every executable script carries that same nonce. Expected response
header: `Content-Security-Policy-Report-Only` with one matching nonce. The real
Staging latency, hostile-row, Stripe Test, and all-studio checks run only in Task
8 after migration 038 is applied there.

- [ ] **Step 6: Commit**

```powershell
git --literal-pathspecs add lib/security/csp.ts lib/security/startup-security.ts lib/security/csp-report-admission.ts instrumentation.ts app/api/security/csp-report/route.ts middleware.ts next.config.ts app/layout.tsx "app/[locale]/layout.tsx" app/admin/layout.tsx .env.test.example package.json scripts/check-csp-intake-health.ts scripts/verify-security-ingress.ts docs/operations/security-ingress.md tests/security/csp.test.ts tests/security/csp-report-admission.test.ts tests/security/csp-report-route.test.ts tests/security/middleware-csp.test.ts tests/security/csp-render.integration.test.ts tests/security/startup-security.integration.test.ts tests/security/csp-intake-health.test.ts tests/security/security-ingress.test.ts
git commit -m "feat(security): stage nonce content security policy"
```

---

### Task 8: Staging and Production report-only gates

**Files:**
- Modify: `SETUP.md`
- Modify: `docs/operations/security-ingress.md`
- Create: `CHANGELOG.md`
- Create: `docs/operations/release-evidence/staging/security/report-only-<security-git-sha>.json`
- Create: `docs/operations/release-evidence/production/security/report-only-<security-main-git-sha>.json`

**Interfaces:**
- Consumes: Tasks 1–7 and the Production program release policy.
- Produces: verified Release 1 in report-only mode plus its initial CSP baseline;
  the final seven-day enforcement window belongs to Program Integration.

- [ ] **Step 1: Apply and verify migration 038 in Staging**

Run the migration through the approved Staging database path, then run the SQL
and 50-request integration suites. Confirm `anon/authenticated` cannot execute
the RPCs and the named expiry-cleanup cron exists once.

- [ ] **Step 2: Configure and prove Staging ingress before app deployment**

Using available Coolify/Traefik authority, automate dedicated higher-priority
exact-path routers for `/api/security/csp-report` and
`/api/admin/auth/login`. The report route uses buffering
`maxRequestBodyBytes=8192` and source-IP rate `average=120`, `period=1m`,
`burst=20`; Admin login uses `maxRequestBodyBytes=4096`, `average=20`,
`period=15m`, `burst=5`, plus a host-grouped global `average=300`, `period=1m`.
Place rate middlewares before buffering. Attach observable 413/429 metrics. For multiple proxy
replicas, configure shared limiters or explicit per-replica budgets whose totals
stay within the documented ceilings. Confirm direct origin traffic is blocked
and the proxy overwrites `X-Real-IP`; do not enable deployed Admin login before
this proof. Run `npm run verify:security-ingress -- --environment=staging` and save no
secret values. A missing external permission is the only point that may require
Muhammad; explain it as permission to protect the public door, not as a manual
configuration task.

Also automate Program Task 2's independent observation-gateway service before
the target app depends on it. Deploy exactly one pinned/manual replica on a
private/source-restricted route with its own healthcheck; disable repository
auto-deploy so target releases cannot stop/restart it. Coolify sends only fixed
target-app deployment/container/status types to its 4 KiB-capped event endpoint;
target instrumentation uses the separately secret-authenticated marker endpoint.
The public router cannot reach either. Stop the target app completely and prove
the gateway still persists/enriches a provider test event and FIFO marker in
order, then cold-start it and prove no readiness deadlock. During a disposable
active observation, restart only the gateway with identical deployment/config;
its new boot UUID must invalidate the run and old-boot marker replay must fail. Create
the protected non-overlapping
`pyrasuite-staging-deployment-heartbeat` schedule at `* * * * *` but leave its
observation flag disabled until the final Quality activation. A missing gateway,
disabled or different cadence, duplicate scheduler, or inability to read fully
paginated Coolify application-deployment history blocks the release.

- [ ] **Step 3: Deploy Staging behind the proved boundary**

Set `TRUSTED_PROXY_HEADERS=true` and `CSP_MODE=report-only`, then deploy. Verify
XSS payload, canonical export, missing-ID and Storage-failure all-or-nothing
behavior, legacy export rejection, login concurrency/order, a one-source flood
that does not exhaust `admin-login:global-admitted`, an oversized/over-limit
login flood with no post-admission body parse or Supabase call, public bounded CSP reports,
an over-limit report flood that causes no post-admission Supabase writes,
Supabase auth cookie refresh, matching rendered nonces, Stripe Test Checkout,
all studio pages, and the recorded public-page latency budget. The Admin
rendering probe uses unauthenticated `/admin/login`; the hostile-row browser
check uses only the protected credential names and seeded fixture from Program
Integration Task 3. Run `npm run check:csp-intake -- --environment=staging` and
require verified edge metrics, an accepted synthetic increment, a batch flush,
and no missing/saturated/unavailable interval. Rerun the hammer script.
Verify every declared runtime replica registered before readiness, the minute
heartbeat test produces one database-timed immutable row with healthy gateway/
queue plus its same-minute FIFO marker acknowledgement, a missing heartbeat
cannot be backfilled, and
either an identical post-activation boot or target deployment test event
invalidates a disposable Staging observation run even if the live probe returns
to the old SHA.

- [ ] **Step 4: Run the complete release gate**

```powershell
npm run check:invariants
npm run typecheck
npm run lint -- --no-cache
npm run test
npm run test:integration -- tests/security/rate-limit-concurrency.integration.test.ts tests/security/csp-render.integration.test.ts
npm run build
git status --short
```

Expected: commands pass; status contains only the intentionally staged documentation update before commit.

Write the reviewed non-secret Staging result and record it through the Program
Integration evidence CLI:

```powershell
$securityGitSha = (git rev-parse HEAD).Trim()
npm run verify:deployment -- --environment=staging --expected=$securityGitSha
npm run release:evidence -- --track=security --phase=report-only --environment=staging --from=.artifacts/releases/input/security-staging.json --proof=.artifacts/releases/proofs/staging.json
```

- [ ] **Step 5: Deploy Production and smoke without financial mutation**

Run the fixed Production preflight/backups and apply/verify 038 first. Then
provision and verify the same exact ingress/body/rate contract, trusted-IP
boundary, independently healthy/pinned observation gateway (including an ordered
database event/marker while the target is unavailable), and disabled one-minute/
non-overlap `pyrasuite-production-deployment-heartbeat` schedule. Run
`npm run verify:security-ingress -- --environment=production`; then merge the reviewed Security candidate
through the repository's real path into `main`, push `main`, and wait for the
Coolify deployment/health result. Resolve the remote SHA and refuse smoke until
the served revision matches it:

```powershell
$securityMainGitSha = (git rev-parse origin/main).Trim()
npm run verify:deployment -- --environment=production --expected=$securityMainGitSha
```

After health succeeds, verify a target-app test-notification round trip, every
ready runtime registration, and read-only fully paginated deployment-history
access without printing its token. Keep the heartbeat observation flag disabled.

That `main` deployment uses `TRUSTED_PROXY_HEADERS=true` and
`CSP_MODE=report-only`. Then expand a hostile owned test
generation, test five failed Admin logins followed by denial, export one
canonical owned asset, and confirm a legacy item remains visible but its bulk
export returns 422. Confirm the report endpoint receives unauthenticated browser
reports, the cleanup job is healthy, rotated auth cookies remain intact, and
rendered script nonces match the response policy.
Run `npm run check:csp-intake -- --environment=production`; verified edge
metrics, aggregate flush, and the accepted canary are required—a 204 response
alone does not count as healthy telemetry.

- [ ] **Step 6: Establish the initial report-only baseline**

Review structured reports for Admin, auth, Stripe, and studio paths through the
immediate smoke, approximately 30 minutes, and the next scheduled check. Fix
legitimate violations in a focused commit. Do not add script `'unsafe-inline'`
as a compatibility shortcut. Keep `CSP_MODE=report-only` through the Financial,
Storage/AI, and Quality releases; this initial time does not count toward the
final enforcement window. Any missing synthetic intake interval, saturation, or
limiter/metric outage is an explicit failed observation rather than a clean day.

- [ ] **Step 7: Document report-only containment**

Leave `CSP_MODE=report-only`, then update `SETUP.md` and `CHANGELOG.md` with the
verified migration, proxy contract, current mode/date, baseline checks, and the
explicit handoff to the final Program Integration enforcement gate.

Record the non-secret Production result before documenting completion:

```powershell
$securityMainGitSha = (git rev-parse origin/main).Trim()
npm run verify:deployment -- --environment=production --expected=$securityMainGitSha
npm run release:evidence -- --track=security --phase=report-only --environment=production --from=.artifacts/releases/input/security-production.json --proof=.artifacts/releases/proofs/production.json
```

```powershell
$stagingSecuritySha = (Get-Content -LiteralPath .artifacts/releases/proofs/staging.json -Raw | ConvertFrom-Json).revision
$productionSecuritySha = (Get-Content -LiteralPath .artifacts/releases/proofs/production.json -Raw | ConvertFrom-Json).revision
git add SETUP.md CHANGELOG.md "docs/operations/release-evidence/staging/security/report-only-$stagingSecuritySha.json" "docs/operations/release-evidence/production/security/report-only-$productionSecuritySha.json"
git commit -m "docs: record security containment rollout"
```
