# Storage and AI Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move generated deliverables to private canonical storage, preserve legacy assets safely, enforce atomic AI-cost quotas, and reject malformed AI output before delivery.

**Architecture:** Migration 041 adds private storage and AI quota state; server helpers sign owned objects and reserve provider capacity; route contracts validate every structured result; an idempotent backfill copies only trusted legacy sources without deletion.

**Tech Stack:** Next.js 15, TypeScript strict, Supabase Storage/Postgres, Zod 4, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-18-storage-ai-safety-design.md`

## Global Constraints

- Complete migrations 039/040 and their application cutover first.
- Do not edit migrations 001–040; this plan creates only 041.
- Canonical private assets use database bucket/path authority; signed URLs are delivery values and are never persisted.
- Legacy URL rows stay visible and are never deleted. External legacy URLs are never fetched by a backfill or export request.
- Free watermark failures continue to fail the whole request and refund credits.
- AI quota failure denies provider work; it never falls back to a customer-editable generation count.
- Stage only named files; never use `git add -A`.

---

### Task 1: Migration 041 private bucket and AI quota primitives

**Files:**
- Create: `supabase/migrations/041_storage_ai_safety.sql`
- Create: `tests/db/041_storage_ai_safety.sql`
- Create: `tests/storage-ai/quota-concurrency.integration.test.ts`
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces private `generated-assets`, `ai_quota_reservations`,
  `ai_quota_windows`, `reserve_ai_quota`, `finish_ai_quota`, and the service-only
  `prepare_asset_delivery`/`authorize_asset_delivery` fence used by every
  asset-returning surface.
- Later tasks consume these objects through service-only helpers.

- [ ] **Step 1: Write failing SQL tests**

Inside `BEGIN`/`ROLLBACK`, assert:

- bucket exists and `public=false`;
- anon/authenticated cannot insert/select/update/delete its objects directly;
- first quota request is allowed and repeated `request_id` is idempotent;
- minute, daily, and concurrent ceilings deny the next request;
- finishing releases concurrency but does not decrement minute/day counts;
- an expired active reservation no longer consumes concurrency;
- anon/authenticated cannot execute either quota RPC;
- 039's public `assets` descriptor still completes successfully;
- a new private descriptor requires `generated-assets`, canonical path, and
  `url=null`;
- both public and private completion require the matching `stored` receipt and
  exact order-independent receipt/asset bucket-path equality;
- deletion-pending, a wrong token, failed/aborted receipt, missing/extra/
  duplicate path, and second completion remain rejected without settlement;
- mixed-pool partial refund/settlement behavior is unchanged, and exactly one
  `complete_generation` signature retains its expected security/search-path/
  grants;
- `assets.url` is nullable only with canonical private bucket/path, while legacy
  URL-only and public 039 rows remain valid;
- bucket/path cannot be half-populated.
- `prepare_asset_delivery` accepts 1–100 unique asset IDs for one owner, locks
  profile then sorted assets, rejects either pending flag, and returns the exact
  database rows plus an opaque fence hash; browser roles cannot execute it;
- `authorize_asset_delivery` re-locks in the same order, recomputes the hash in
  SQL, and denies changed/missing/cross-owner/pending rows. Tests interleave both
  account and asset deletion before/after authorization and prove only the
  authorization-first order succeeds. Duplicate/reordered IDs and a caller-
  computed or stale hash are rejected.

- [ ] **Step 2: Write a real concurrency test**

Using the Test service role, send 100 `reserve_ai_quota` RPC calls with distinct request IDs for one user and a concurrency limit of 3. Assert no observation ever returns more than 3 active reservations and allowed minute/day totals match their configured limits.

- [ ] **Step 3: Verify failure before migration**

```powershell
npm run db:test -- tests/db/041_storage_ai_safety.sql
npm run test:integration -- tests/storage-ai/quota-concurrency.integration.test.ts
```

Expected: missing bucket/table/function failures.

- [ ] **Step 4: Implement migration 041**

Insert the bucket idempotently:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'generated-assets',
  'generated-assets',
  false,
  26214400,
  ARRAY['image/png','image/jpeg','image/webp','audio/mpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
```

Create both quota tables exactly as specified. Enable RLS and grant no browser policies. Add indexes on active expiry and user/studio time.

Execute `ALTER TABLE public.assets ALTER COLUMN url DROP NOT NULL`. Add named,
testable transitional constraints that require bucket/path together and permit a
null URL only for `generated-assets`. Preserve legacy URL-only rows and the 039
public canonical shape. Update generated types and the shared
`PersistedGenerationAsset` union rather than introducing a second descriptor.

`reserve_ai_quota` takes one transaction advisory lock derived from user ID, marks expired active rows, checks global active concurrency, increments both `user:<id>` and `user:<id>:studio:<studio>` minute/day window keys atomically, and inserts one active reservation. Repeated request ID returns its original decision without incrementing.

`finish_ai_quota` accepts only `completed` or `failed`, sets terminal fields once,
and returns duplicate success on retry. Revoke public/browser execute and grant
service role. Add `prepare_asset_delivery`/`authorize_asset_delivery` with
`SECURITY DEFINER SET search_path=public`, service-role-only grants, a hard
1–100 unique-ID bound, and profile-then-UUID-sorted-asset lock order shared with
the deletion RPCs. Both RPCs compute the fence hash exclusively in PostgreSQL
from canonical `jsonb_build_object`/ordered `jsonb_agg` of owner, asset ID,
generation ID, bucket, and path; the application treats it as opaque and cannot
choose serialization. Prepare returns the authoritative rows/hash; authorize
recomputes after signing and is the response linearization point. Replace only migration 039's
`public.is_valid_generation_asset_descriptor(UUID,UUID,JSONB)` predicate at its
identical signature: it accepts 039 `assets` + canonical public
URL and 041 `generated-assets` + null URL, both with the exact owner/generation
prefix. Do not replace or independently re-author `complete_generation`; its
locks, deletion fence, stored-receipt/token/exact-path checks, idempotency,
settlement, and privileges remain unchanged. Record migration 041.

- [ ] **Step 5: Run database gates and update types**

```powershell
npm run db:test -- tests/db/039_generation_workflow.sql
npm run db:test -- tests/db/040_financial_enforcement.sql
npm run db:test -- tests/db/041_storage_ai_safety.sql
npm run test:integration -- tests/storage-ai/quota-concurrency.integration.test.ts
npm run typecheck
```

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/041_storage_ai_safety.sql tests/db/041_storage_ai_safety.sql tests/storage-ai/quota-concurrency.integration.test.ts lib/supabase/types.ts
git commit -m "feat(ai): add private storage and atomic quota primitives"
```

---

### Task 2: Server AI quota facade and route cutover

**Files:**
- Create: `lib/ai/quota.ts`
- Create: `lib/ai/quota-config.ts`
- Modify: `lib/rate-limit.ts`
- Modify: `app/api/studios/analysis/route.ts`
- Modify: `app/api/studios/campaign/route.ts`
- Modify: `app/api/studios/creator/route.ts`
- Modify: `app/api/studios/edit/route.ts`
- Modify: `app/api/studios/photoshoot/route.ts`
- Modify: `app/api/studios/plan/route.ts`
- Modify: `app/api/studios/prompt-builder/route.ts`
- Modify: `app/api/studios/storyboard/route.ts`
- Modify: `app/api/studios/voiceover/route.ts`
- Modify: `app/api/waitlist/route.ts`
- Modify: `app/api/support/route.ts`
- Modify: `app/api/client-errors/route.ts`
- Test: `tests/storage-ai/quota.test.ts`
- Test: `tests/storage-ai/studio-quota-contract.test.ts`

**Interfaces:**
- Consumes: Task 1 RPCs and migration-038 generic limiter.
- Produces `reserveAiQuota()` and `finishAiQuota()` from the spec.

- [ ] **Step 1: Lock exact default ceilings**

Create `quota-config.ts` with validated defaults:

```ts
export const DEFAULT_AI_QUOTAS = {
  free: { minute: 10, daily: 10, concurrent: 1 },
  starter: { minute: 10, daily: 50, concurrent: 2 },
  pro: { minute: 10, daily: 100, concurrent: 3 },
  business: { minute: 10, daily: 200, concurrent: 5 },
  agency: { minute: 10, daily: 500, concurrent: 10 },
} as const;
```

Admin settings may lower or raise minute/daily within bounded schema validation; concurrency uses these reviewed ceilings in this release.

- [ ] **Step 2: Write facade tests**

Assert output mapping including `duplicate`, same-key idempotency, plan fallback
to free, database failure to typed `AiQuotaUnavailableError`, and a `finish` call
from the provider-owning success/failure path. Verify failure never returns an
allowed decision.

- [ ] **Step 3: Write route-wide static/behavior tests**

For all nine studios assert `reserveAiQuota` receives the already validated
`Idempotency-Key` after auth/input validation and before lifecycle/provider work;
`startGeneration` receives the identical key; only its `duplicate=false` caller
invokes the provider and finishes quota. Prompt Builder is limited despite zero
credits, and no route calls legacy `checkRateLimit(supabase,user.id)`.

- [ ] **Step 4: Implement the service-only facade**

Accept the request UUID from the financial request-key helper; never generate a
new server UUID. Call the RPC with validated plan settings and a 10-minute TTL,
return `duplicate` and typed denial carrying `retryAfterSeconds`. Finish is
idempotent; a finish error is logged structurally because it affects concurrency
cleanup but does not change a completed customer result.

- [ ] **Step 5: Convert all studios**

Reserve quota immediately before `startGeneration`, using the same key. On
denial return `429 rate_limited` and `Retry-After`. Only a newly started
generation calls the provider and owns the final quota outcome; a duplicate
replays/returns lifecycle state without another provider job. Store reservation
ID in route scope; mark `completed` only after durable generation completion,
otherwise `failed`.

- [ ] **Step 6: Move public keyed routes to migration-038 limiter**

Replace `system_settings` read/upsert in `checkKeyedRateLimit` with `consumeServerRateLimit`. Public support/waitlist/client-error routes remain fail-open or fail-closed according to their existing availability contract, but their increments are atomic. Delete duplicated record types and raw XFF parsing; use the trusted-IP helper.

- [ ] **Step 7: Run and commit**

```powershell
npm run test -- tests/storage-ai/quota.test.ts tests/storage-ai/studio-quota-contract.test.ts
npm run db:test -- tests/db/041_storage_ai_safety.sql
npm run typecheck
npm run build
git add lib/ai/quota.ts lib/ai/quota-config.ts lib/rate-limit.ts app/api/studios/analysis/route.ts app/api/studios/campaign/route.ts app/api/studios/creator/route.ts app/api/studios/edit/route.ts app/api/studios/photoshoot/route.ts app/api/studios/plan/route.ts app/api/studios/prompt-builder/route.ts app/api/studios/storyboard/route.ts app/api/studios/voiceover/route.ts app/api/waitlist/route.ts app/api/support/route.ts app/api/client-errors/route.ts tests/storage-ai/quota.test.ts tests/storage-ai/studio-quota-contract.test.ts
git commit -m "fix(ai): enforce atomic provider quotas"
```

---

### Task 3: Structured provider and route contracts

**Files:**
- Create: `lib/contracts/api.ts`
- Create: `lib/contracts/studios.ts`
- Create: `lib/ai/parse-structured.ts`
- Create: `tests/fixtures/studios/valid.ts`
- Create: `tests/storage-ai/studio-contracts.test.ts`
- Modify: `app/api/studios/analysis/route.ts`
- Modify: `app/api/studios/campaign/route.ts`
- Modify: `app/api/studios/creator/route.ts`
- Modify: `app/api/studios/edit/route.ts`
- Modify: `app/api/studios/photoshoot/route.ts`
- Modify: `app/api/studios/plan/route.ts`
- Modify: `app/api/studios/prompt-builder/route.ts`
- Modify: `app/api/studios/storyboard/route.ts`
- Modify: `app/api/studios/voiceover/route.ts`
- Modify: `app/[locale]/(dashboard)/analysis/page.tsx`
- Modify: `app/[locale]/(dashboard)/plan/page.tsx`
- Modify: `app/[locale]/(dashboard)/storyboard/page.tsx`
- Modify: `app/[locale]/(dashboard)/prompt-builder/page.tsx`
- Modify: `components/studios/campaign/CampaignPlanDisplay.tsx`
- Modify: `components/studios/photoshoot/PhotoshootPreview.tsx`
- Modify: `components/studios/creator/CreatorPreview.tsx`

**Interfaces:**
- Produces strict Zod schemas and inferred types for all studio outputs and success envelopes.
- Quality plan later consumes the shared API envelope in `fetchJson`.
- Existing `types/api.ts` remains a compatibility type for untouched routes;
  this task does not force a repository-wide envelope migration.

- [ ] **Step 1: Write contract fixtures and malformed cases**

For every schema include one valid fixture and failures for missing field, wrong type, oversized string/array, empty meaningful output, and unexpected root type. Text-provider fixtures include bare JSON, fenced JSON, prefix/suffix prose, braces inside quoted strings, and malformed/truncated JSON.

- [ ] **Step 2: Verify local page interfaces accept invalid shapes today**

```powershell
npm run test -- tests/storage-ai/studio-contracts.test.ts
```

Expected: FAIL because contracts/parser do not exist and current routes accept `Record<string, unknown>` after `JSON.parse`.

- [ ] **Step 3: Implement a balanced JSON extractor**

`parse-structured.ts` must scan character-by-character, track string/escape/depth state, and return the first complete requested object or array. It then applies a supplied Zod schema:

```ts
export function parseStructuredOutput<T>(input: {
  text: string;
  root: 'object' | 'array';
  schema: z.ZodType<T>;
}): T;
```

It throws `StructuredOutputError` with a safe code and issues; it never includes full model text in logs or responses.

- [ ] **Step 4: Implement exact schemas**

Use the fields and bounds in the storage/AI spec. Analysis and Plan match every
field currently read by their pages; require at least one meaningful section.
Storyboard is 1–50 scenes. Prompt Builder is 1–10 results. Campaign is 1–20
posts. Media schemas require persisted delivery URL plus generation/credit
metadata. `lib/contracts/api.ts` exports the strict success/failure schemas and a
generic data-envelope factory later consumed by `fetchJson`; it does not replace
the legacy `types/api.ts` interface globally. Use `.strict()` at validated
route-envelope boundaries.

- [ ] **Step 5: Convert routes and pages**

Replace greedy regex/`JSON.parse` and `Record<string,unknown>` casts with `parseStructuredOutput`. Parse each route success object before calling `completeGeneration` and again before returning the response. Replace local page/component interfaces with `z.infer` exported types.

Malformed output reaches the existing `failGeneration` path and returns `generation_parse_failed`; no malformed output is persisted or delivered.

- [ ] **Step 6: Run and commit**

```powershell
npm run test -- tests/storage-ai/studio-contracts.test.ts
npm run typecheck
npm run build
git --literal-pathspecs add lib/contracts/api.ts lib/contracts/studios.ts lib/ai/parse-structured.ts tests/fixtures/studios/valid.ts tests/storage-ai/studio-contracts.test.ts app/api/studios/analysis/route.ts app/api/studios/campaign/route.ts app/api/studios/creator/route.ts app/api/studios/edit/route.ts app/api/studios/photoshoot/route.ts app/api/studios/plan/route.ts app/api/studios/prompt-builder/route.ts app/api/studios/storyboard/route.ts app/api/studios/voiceover/route.ts "app/[locale]/(dashboard)/analysis/page.tsx" "app/[locale]/(dashboard)/plan/page.tsx" "app/[locale]/(dashboard)/storyboard/page.tsx" "app/[locale]/(dashboard)/prompt-builder/page.tsx" components/studios/campaign/CampaignPlanDisplay.tsx components/studios/photoshoot/PhotoshootPreview.tsx components/studios/creator/CreatorPreview.tsx
git commit -m "fix(ai): validate structured studio outputs"
```

Use literal-path staging on PowerShell for paths containing brackets or parentheses; do not broaden the Git add scope.

---

### Task 4: Move new delivery to private canonical objects

**Files:**
- Create: `lib/assets/delivery.ts`
- Create: `lib/storage/private-write-policy.ts`
- Modify: `lib/storage/persist-image.ts`
- Modify: `lib/storage/persist-audio.ts`
- Modify: `lib/generations/workflow.ts`
- Modify: `lib/supabase/signed-url.ts`
- Modify: `app/api/assets/route.ts`
- Modify: `app/api/assets/[id]/route.ts`
- Modify: `app/api/assets/export/route.ts`
- Modify: `app/api/admin/generations/route.ts`
- Modify: `app/admin/generations/page.tsx`
- Modify: `app/api/studios/campaign/route.ts`
- Modify: `app/api/studios/creator/route.ts`
- Modify: `app/api/studios/edit/route.ts`
- Modify: `app/api/studios/photoshoot/route.ts`
- Modify: `app/api/studios/voiceover/route.ts`
- Modify: `app/[locale]/(dashboard)/campaign/page.tsx`
- Modify: `app/[locale]/(dashboard)/creator/page.tsx`
- Modify: `app/[locale]/(dashboard)/edit/page.tsx`
- Modify: `app/[locale]/(dashboard)/photoshoot/page.tsx`
- Modify: `app/[locale]/(dashboard)/voiceover/page.tsx`
- Modify: `components/shared/ModelComparison.tsx`
- Modify: `scripts/check-invariants.ts`
- Modify: `docs/INVARIANTS.md`
- Modify: `.env.test.example`
- Test: `tests/storage-ai/private-asset-delivery.test.ts`
- Test: `tests/storage-ai/private-asset-export.test.ts`
- Test: `tests/storage-ai/private-write-policy.test.ts`
- Test: `tests/storage-ai/private-replay-client.test.tsx`

**Interfaces:**
- Consumes: `generated-assets` bucket and owner-only server workflow.
- Consumes: 041's service-only prepare/authorize delivery fence.
- Produces `createOwnedAssetDeliveryUrl()`,
  `materializeCompletedGenerationDelivery()`, and private descriptors.

- [ ] **Step 1: Write ownership and fallback tests**

Assert a canonical owner row signs for 900 seconds; a cross-user asset returns
not found; signing error throws; signed URLs are absent from durable insert/update
payloads; canonical export uses service Storage download by path; a legacy row
stays visible but export returns 422. Assert default/flag-off uses the 039 public
writer, a listed canary uses private, and global enable uses private without
accepting malformed canary IDs.

Drop the first successful HTTP response for a private image and audio generation,
then replay the same `Idempotency-Key`: require fresh valid signed URLs and zero
provider/quota/credit/ledger/completion delta. Expired URLs are regenerated.
Signing failure returns no partial output and leaves completed financial state
unchanged; profile/asset deletion-pending exposes no URL; missing or mismatched
asset rows fail closed without a legacy/provider fallback. The client preserves
that key across a retryable delivery failure and creates a new key only for an
explicitly new generation.
Use deterministic two-order concurrency fixtures for both account and asset
deletion: when either deletion fence takes the shared locks before post-sign
authorization, no signed URL is returned; when authorization takes them first,
delivery is linearized before the deletion request. A pre-sign-only check is not
sufficient.
Run those interleavings through generation immediate/duplicate delivery, owner
asset list/detail, and Admin generation projection. Require the bounded whole
owner group to return all-or-none; direct Storage signing outside `delivery.ts`
fails the static invariant.

- [ ] **Step 2: Confirm current public behavior fails**

```powershell
npm run test -- tests/storage-ai/private-asset-delivery.test.ts tests/storage-ai/private-asset-export.test.ts tests/storage-ai/private-write-policy.test.ts tests/storage-ai/private-replay-client.test.tsx
```

Expected: FAIL because new persistence uses public `assets` URLs and signing falls back to originals.

- [ ] **Step 3: Implement strict owner-first signing**

`delivery.ts` sends the bounded unique asset-ID set to
`prepare_asset_delivery`, uses only its authoritative owner/bucket/path rows,
signs private canonical rows for 900 seconds, then calls
`authorize_asset_delivery` with the same IDs and opaque database fence hash. A
deny discards every URL. Return a legacy/public URL only from the authorized
response when canonical private columns are absent; never fall back for a
canonical row. No other module may call the Storage signer directly.

- [ ] **Step 4: Change new writes to private bucket**

Add `PRIVATE_GENERATED_ASSETS_ENABLED=false` and
`PRIVATE_GENERATED_ASSET_CANARY_USER_IDS=` to the environment contract. The
validated policy defaults to the 039 public writer, permits private writes for
listed Staging/Production canary users, then supports global enable.

On the private branch, update persistence descriptors to bucket
`generated-assets`, retain deterministic path, and remove `getPublicUrl`.
`completeGeneration` stores null URL plus bucket/path. The public branch remains
unchanged only for the measured dual-write cutover window. Immediate studio
responses call the delivery signer only after successful completion. Route both
newly completed and completed-duplicate outputs through one owner/generation-
scoped delivery materializer; durable saved output remains URL-free. Recheck
profile and every required asset's deletion state through the shared database
prepare→sign→authorize primitive; its successful authorize is the response
linearization point. Failure returns no partial delivery and never refunds/
reopens settled work. The materializer matches the complete unique asset-ID/
bucket/path reference set from saved output to the generation rows before signing; missing, extra,
or partial data fails closed. After database completion, finish AI quota as
completed before delivery materialization. A later signing error is a retryable
delivery error, not `failGeneration`.

- [ ] **Step 5: Convert read and Admin projections**

Asset list/detail routes and Admin generation API pass every returned owner group
through the same bounded prepare→sign→authorize helper; none signs or exposes a
legacy/public URL directly. The Admin page does not infer private URLs by
scraping arbitrary output JSON. Export downloads canonical private paths through
server authority, then wins the same post-download authorization before sending
bytes; it accepts old public canonical rows during backfill and rejects other
legacy rows.

Media route duplicate branches call the same delivery materializer instead of
returning `savedOutput` directly. Text-only duplicates keep their durable output.
Tests retain the original request UUID after a lost/retryable response so a
delivery retry cannot become a newly charged generation.

The five media pages and Model Comparison retain each attempt UUID across a
retryable transport/delivery error. The explicit delivery retry sends that same
key; only a deliberate new generation action rotates it. No automatic mutation
retry is added.

- [ ] **Step 6: Run and commit**

```powershell
npm run test -- tests/storage-ai/private-asset-delivery.test.ts tests/storage-ai/private-asset-export.test.ts tests/storage-ai/private-write-policy.test.ts tests/storage-ai/private-replay-client.test.tsx
npm run db:test -- tests/db/039_generation_workflow.sql
npm run db:test -- tests/db/040_financial_enforcement.sql
npm run db:test -- tests/db/041_storage_ai_safety.sql
npm run typecheck
npm run build
git --literal-pathspecs add lib/assets/delivery.ts lib/storage/private-write-policy.ts lib/storage/persist-image.ts lib/storage/persist-audio.ts lib/generations/workflow.ts lib/supabase/signed-url.ts app/api/assets/route.ts "app/api/assets/[id]/route.ts" app/api/assets/export/route.ts app/api/admin/generations/route.ts app/admin/generations/page.tsx app/api/studios/campaign/route.ts app/api/studios/creator/route.ts app/api/studios/edit/route.ts app/api/studios/photoshoot/route.ts app/api/studios/voiceover/route.ts "app/[locale]/(dashboard)/campaign/page.tsx" "app/[locale]/(dashboard)/creator/page.tsx" "app/[locale]/(dashboard)/edit/page.tsx" "app/[locale]/(dashboard)/photoshoot/page.tsx" "app/[locale]/(dashboard)/voiceover/page.tsx" components/shared/ModelComparison.tsx scripts/check-invariants.ts docs/INVARIANTS.md .env.test.example tests/storage-ai/private-asset-delivery.test.ts tests/storage-ai/private-asset-export.test.ts tests/storage-ai/private-write-policy.test.ts tests/storage-ai/private-replay-client.test.tsx
git commit -m "feat(storage): deliver generated assets from private storage"
```

---

### Task 5: Inventory and migrate safe legacy assets without deletion

**Files:**
- Create: `scripts/audit-legacy-assets.ts`
- Create: `scripts/backfill-canonical-assets.ts`
- Create: `tests/storage-ai/legacy-asset-backfill.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: public-object parser, private bucket, environment guards.
- Produces dry-run inventory and idempotent copy-only migration.

- [ ] **Step 1: Write classification tests**

Fixtures must classify owned Supabase public URL, bounded image/audio data URI, external provider URL, malformed URL, oversized data, and already canonical row. Assert no external fixture calls global `fetch`.

- [ ] **Step 2: Write migration behavior tests**

Assert dry-run performs zero uploads/updates; copied rows verify byte count and SHA-256 before canonical update; repeated run skips identical canonical rows; checksum mismatch leaves the row unchanged; source URL/object is never deleted; logs redact data URI payloads.

- [ ] **Step 3: Implement CLI contracts**

Both scripts accept:

```text
--target=test|production
--dry-run
--limit=<positive integer>
--after=<asset UUID>
```

Production without `--dry-run` additionally requires the one-use confirmation token printed by a read-only inventory run. Environment guards reject Test/Production mismatches.

- [ ] **Step 4: Implement copy-only sources**

Owned old Supabase objects are downloaded through Storage, not remote fetch. Data URIs are decoded locally with a 20 MiB cap. External/provider URLs are reported `external_unmigrated` and left untouched. Upload to the deterministic private path, verify checksum, then write bucket/path; preserve `url` and source object.

Add:

```json
"assets:audit": "tsx scripts/audit-legacy-assets.ts",
"assets:backfill": "tsx scripts/backfill-canonical-assets.ts"
```

- [ ] **Step 5: Run Test dry and copy passes**

```powershell
npm run test -- tests/storage-ai/legacy-asset-backfill.test.ts
npm run assets:audit -- --target=test --dry-run --limit=100
npm run assets:backfill -- --target=test --limit=100
```

Expected: safe sources become canonical; external/malformed sources remain visible and unchanged.

- [ ] **Step 6: Commit**

```powershell
git add scripts/audit-legacy-assets.ts scripts/backfill-canonical-assets.ts tests/storage-ai/legacy-asset-backfill.test.ts package.json
git commit -m "feat(storage): migrate trusted legacy assets safely"
```

---

### Task 6: Staging and Production storage/AI rollout

**Files:**
- Create: `scripts/provision-storage-ai-staging-fixtures.ts`
- Create: `scripts/verify-storage-ai-staging-fixtures.ts`
- Create: `tests/storage-ai/staging-fixtures.test.ts`
- Create: `docs/operations/storage-ai-rollout.md`
- Create: `docs/operations/release-evidence/staging/storage-ai/release-<storage-ai-git-sha>.json`
- Create: `docs/operations/release-evidence/production/storage-ai/release-<storage-ai-main-git-sha>.json`
- Modify: `package.json`
- Modify: `SETUP.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1–5 plus Program Task 3's core Staging fixture manifest.
- Produces verified private delivery, a stable private-asset fixture extension,
  quota enforcement, contract validation, and a preserved legacy inventory.

- [ ] **Step 1: Write the failing Storage fixture-extension test**

Define ignored `.artifacts/staging/storage-ai-fixtures.json` with
`schemaVersion`, `coreFixtureVersion`, `ownerCustomerId`, and
`privateCanonicalAssetId`. The verifier fails unless the core manifest still
matches, the asset is owned, its bucket is private, signing works, and bounded
export succeeds. It never stores credentials or signed URLs.

```powershell
npm run test -- tests/storage-ai/staging-fixtures.test.ts
```

Expected: FAIL because the provision/verify scripts do not exist.

- [ ] **Step 2: Rehearse Staging sequence and provision the extension**

Apply 041, deploy dual-compatible reads/writers with private writes disabled, and
prove an unchanged 039 public completion still succeeds. Enable private writes
only for the provisioned canary user IDs, verify completion/signing/export, then
run `provision-storage-ai-staging-fixtures.ts` to create/reconcile one owned
private canonical asset and write its non-secret extension manifest. Verify both
core and extension manifests before enabling all new writes. Run the 100-way
quota integration test, generate with all nine studios, run private/legacy export
tests, then run dry and copy backfill. Compare row/object counts and checksums.

Add:

```json
"provision:storage-ai-staging-fixtures": "tsx scripts/provision-storage-ai-staging-fixtures.ts",
"verify:storage-ai-staging-fixtures": "tsx scripts/verify-storage-ai-staging-fixtures.ts"
```

Run:

```powershell
npm run provision:storage-ai-staging-fixtures
npm run verify:staging-fixtures
npm run verify:storage-ai-staging-fixtures
```

- [ ] **Step 3: Canary quota by studio**

Enable one text studio, one image studio, and Voiceover. Verify allowed/denied metrics and expired reservations. Enable the remaining studios only when counts match provider calls and completed/failed outcomes.

- [ ] **Step 4: Run full release gate**

```powershell
npm run check:invariants
npm run typecheck
npm run lint -- --no-cache
npm run test
npm run test -- tests/storage-ai/staging-fixtures.test.ts
npm run test:integration -- tests/storage-ai/quota-concurrency.integration.test.ts
npm run build
npm run db:test -- tests/db/039_generation_workflow.sql
npm run db:test -- tests/db/040_financial_enforcement.sql
npm run db:test -- tests/db/041_storage_ai_safety.sql
```

Only after the canary and every command above pass, record the reviewed Staging
result. The evidence input includes the canary/provider-count comparison and the
full gate hashes; the recorder rejects an earlier or incomplete input:

```powershell
$storageAiGitSha = (git rev-parse HEAD).Trim()
npm run verify:deployment -- --environment=staging --expected=$storageAiGitSha
npm run release:evidence -- --track=storage-ai --phase=release --environment=staging --from=.artifacts/releases/input/storage-ai-staging.json --proof=.artifacts/releases/proofs/staging.json
```

- [ ] **Step 5: Deploy Production without bulk mutation first**

Run fixed preflight/backups and apply 041. Merge the exact reviewed Storage/AI
candidate through the repository's real path into `main`, push `main`, wait for
Coolify health, and refuse canary work until the served SHA equals remote main:

```powershell
$storageAiMainGitSha = (git rev-parse origin/main).Trim()
npm run verify:deployment -- --environment=production --expected=$storageAiMainGitSha
```

The deployed dual-compatible code starts with private writes disabled; prove the
039 public payload still completes. Add only the dedicated Production test
account to the private canary list, generate owned image/audio outputs, verify
signed expiry/export and error metrics, then enable private writes globally.
Enable quota/contracts in the rehearsed order. Confirm legacy items remain
visible and excluded from bulk export until their verified copy exists.

- [ ] **Step 6: Run Production inventory and approved copy pass**

Run dry inventory, record category counts, then use its one-use token for safe owned-Supabase/data rows. Do not migrate external rows and do not delete sources. Re-run inventory and compare checksums.

Record the reviewed Production result before documentation:

```powershell
$storageAiMainGitSha = (git rev-parse origin/main).Trim()
npm run verify:deployment -- --environment=production --expected=$storageAiMainGitSha
npm run release:evidence -- --track=storage-ai --phase=release --environment=production --from=.artifacts/releases/input/storage-ai-production.json --proof=.artifacts/releases/proofs/production.json
```

- [ ] **Step 7: Document observed state and commit**

Record bucket privacy, migration fingerprint, quota defaults, object/row counts, unmigrated legacy IDs, and smoke timestamps without secrets.

```powershell
$stagingStorageAiSha = (Get-Content -LiteralPath .artifacts/releases/proofs/staging.json -Raw | ConvertFrom-Json).revision
$productionStorageAiSha = (Get-Content -LiteralPath .artifacts/releases/proofs/production.json -Raw | ConvertFrom-Json).revision
git add scripts/provision-storage-ai-staging-fixtures.ts scripts/verify-storage-ai-staging-fixtures.ts tests/storage-ai/staging-fixtures.test.ts package.json docs/operations/storage-ai-rollout.md "docs/operations/release-evidence/staging/storage-ai/release-$stagingStorageAiSha.json" "docs/operations/release-evidence/production/storage-ai/release-$productionStorageAiSha.json" SETUP.md CHANGELOG.md
git commit -m "docs: record storage and AI safety rollout"
```
