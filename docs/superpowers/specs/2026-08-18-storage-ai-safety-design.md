# Storage and AI Safety — Design

**Date:** 2026-08-18
**Status:** Approved for planning
**Program:** `docs/superpowers/specs/2026-08-18-production-remediation-program-design.md`
**Depends on:** Financial workflow and enforcement migrations `039` and `040`

---

## 1. Scope

This release completes the trust boundary after server-owned generation state:

- new generated files move to a private canonical bucket;
- legacy assets are inventoried and migrated without deletion;
- canonical assets are delivered with short-lived signed URLs;
- AI provider usage receives atomic per-user, per-studio, daily, and concurrency
  limits independent of credits;
- all structured AI results are validated against explicit Zod contracts before
  completion or delivery.

Watermark failure already fails closed in the financial workflow. This release
preserves and tests that policy while changing delivery URLs.

---

## 2. Private canonical storage

Migration `041_storage_ai_safety.sql` creates a private bucket named
`generated-assets`. New generated image and audio objects use:

```text
<user-id>/generations/<generation-id>/<index-or-primary>.<extension>
```

Only the server service role uploads, signs, or removes generated objects. The
browser receives a signed URL only after an owner-scoped database lookup.

For canonical rows, `assets.storage_bucket` and `assets.storage_path` are the
authority. `assets.url` becomes nullable and remains only for legacy compatibility.
Signed URLs are never stored as durable database values.

Migration 041 explicitly executes `ALTER TABLE assets ALTER COLUMN url DROP NOT
NULL` and adds transitional checks: bucket/path are either both null or both
present, and a null URL is legal only for a canonical `generated-assets` row.
`complete_generation` remains compatible with the 039 public descriptor
(`bucket='assets'` plus canonical URL) while also accepting the new private
descriptor (`bucket='generated-assets'`, `url=null`). New private writes must use
the latter. `PersistedGenerationAsset.storageBucket` remains the union
`'assets' | 'generated-assets'` during the cutover.

Migration 041 changes only the internal descriptor predicate consumed by the
exact migration-039 `complete_generation` function; it does not replace that
lifecycle body. The same signature, `SECURITY DEFINER SET search_path`, grants,
profile/generation locks, deletion-pending rejection, token-matched stored
receipt, exact receipt-path equality, single completion, reservation settlement,
and ledger behavior remain intact for both public and private shapes.

```ts
export interface CanonicalAssetReference {
  bucket: 'generated-assets';
  path: string;
}

export async function createOwnedAssetDeliveryUrl(input: {
  userId: string;
  assetId: string;
  expiresInSeconds?: number;
}): Promise<string>;

export async function materializeCompletedGenerationDelivery(input: {
  userId: string;
  generationId: string;
  savedOutput: Record<string, unknown>;
}): Promise<Record<string, unknown>>;

// service-only RPCs added by 041; used by every asset-returning surface
public.prepare_asset_delivery(
  p_owner_user_id UUID,
  p_asset_ids UUID[]
) RETURNS JSONB;
// { fence_hash, assets: [{ id, generation_id, bucket, path, legacy_url? }] }

public.authorize_asset_delivery(
  p_owner_user_id UUID,
  p_asset_ids UUID[],
  p_fence_hash TEXT
) RETURNS JSONB;
// { authorized: boolean, error? }
```

The helper first obtains the authoritative owned row/fence from
`prepare_asset_delivery`, then signs that exact bucket/path for 15 minutes and
must win `authorize_asset_delivery` before returning it. Signing/fence failure is
an error; it never falls back to a stale public URL for a canonical private asset.

Immediate studio responses sign newly completed descriptors. Asset list/detail
and Admin generation APIs project signed URLs at response time. Durable
`generations.output` keeps asset descriptors or IDs, not expiring links.

A completed duplicate never returns that durable descriptor directly. Private
saved output contains stable URL-free asset-ID/bucket/path references. One
owner-scoped delivery materializer calls `prepare_asset_delivery` with the exact
unique asset IDs from the saved generation. The RPC locks/rechecks the owner and
sorted rows and returns the authoritative paths plus an opaque database-computed
fence hash. Before signing, the materializer compares that complete returned
ID/generation/bucket/path set with the stable references in `savedOutput` and
fails closed on any missing, extra, or changed reference; the RPC itself never
receives or trusts `savedOutput`. The application never serializes or computes
the fence hash. After all signing succeeds it calls
`authorize_asset_delivery` with the same owner/IDs/hash. That service-only RPC
locks the same profile row and then the same deterministically ordered asset rows
as account/asset deletion, recomputes the hash from owner, asset ID, generation
ID, bucket and path using one SQL canonical JSON representation, rechecks every
pending flag, and is the
delivery linearization point. If either deletion path wins
the lock, every just-signed URL is discarded and none is returned or logged; if
authorization wins, the delivery is ordered before deletion. The response is
returned only from the authorized branch. It never
trusts a saved delivery URL or invents ordering from a partial row set. Replay
performs no provider, quota, reservation, ledger, completion, refund, or durable-
output mutation. If the profile/required asset is
deletion-pending, return `account_deletion_pending`/`asset_unavailable` with no
URL. If signing fails, return a retryable delivery error with no partial output
while preserving the already-settled generation; never call `failGeneration` or
refund it. The client retains the same `Idempotency-Key` for that delivery retry;
only an explicitly new generation action creates a new key.

`createOwnedAssetDeliveryUrl`, owner asset list/detail, generation duplicate/
immediate materialization, export/download, and Admin generation projection all
use this same prepare→sign→authorize primitive; direct Storage signing outside it
is a static invariant failure. Multi-asset responses are bounded to 100 unique
IDs for one owner and authorize the whole response once, never per-item partial
fences. Admin groups different owners into independent response sections and
omits an entire failed group. Public/legacy URLs are also withheld when the fence
denies, even though only private canonical rows require signing.

---

## 3. Legacy preservation and backfill

The backfill has two passes:

1. **Read-only inventory** classifies every legacy row as:
   - existing Supabase `assets` object owned by the row's user;
   - bounded image/audio data URI;
   - external/provider URL;
   - malformed or missing.
2. **Approved migration** copies only the first two classes to
   `generated-assets`, verifies byte count and checksum, and writes canonical
   columns. It does not delete or overwrite the legacy URL or source object;
   delivery prefers the signed canonical copy while the preserved source remains
   historical data under the locked no-deletion rule.

The migration script never fetches an arbitrary external URL. External/provider
rows remain visible through their current legacy view path and remain excluded
from bulk export, matching the locked decision.

Every run is idempotent and supports `--dry-run`, `--target=test`, and an explicit
production confirmation token. Its report contains row IDs, classification,
bytes, checksum, and result, but no secret or full data URI.

---

## 4. Atomic AI quota

Credits control customer entitlement; they do not cap provider concurrency or a
zero-credit studio. Migration `041` therefore adds a separate quota reservation:

```sql
CREATE TABLE public.ai_quota_reservations (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  studio TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  outcome TEXT CHECK (outcome IN ('completed', 'failed', 'expired'))
);

CREATE TABLE public.ai_quota_windows (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL CHECK (count > 0),
  PRIMARY KEY (key, window_start)
);
```

Service-only RPCs:

```sql
public.reserve_ai_quota(
  p_request_id UUID,
  p_user_id UUID,
  p_studio TEXT,
  p_plan_id TEXT,
  p_minute_limit INTEGER,
  p_daily_limit INTEGER,
  p_concurrency_limit INTEGER,
  p_ttl_seconds INTEGER
) RETURNS JSONB;
-- { allowed, duplicate, reservation_id, reason, retry_after_seconds }

public.finish_ai_quota(
  p_reservation_id UUID,
  p_outcome TEXT
) RETURNS JSONB;
```

`reserve_ai_quota` takes a transaction-scoped advisory lock for the user and
studio, expires abandoned concurrency rows, checks active concurrency, atomically
increments minute/day windows, and inserts one active reservation. The same
`request_id` is idempotent and returns its original decision.

Finishing releases the concurrency slot but does not decrement minute or daily
usage. A failed provider call is still an attempt, preventing unlimited retry
loops. TTL releases a process that died.

Application boundary:

```ts
export interface AiQuotaReservation {
  id: string;
  duplicate: boolean;
  retryAfterSeconds: number;
}

export async function reserveAiQuota(input: {
  requestId: string;
  userId: string;
  studio: string;
  planId: string;
}): Promise<AiQuotaReservation>;

export async function finishAiQuota(
  reservationId: string,
  outcome: 'completed' | 'failed',
): Promise<void>;
```

`requestId` is the validated client `Idempotency-Key` already used by
`start_generation`; the server never creates a fresh UUID on an HTTP retry.
Every studio, including Prompt Builder, reserves quota before lifecycle start and
provider work. It then calls `startGeneration` with the same key; only the caller
that receives `duplicate=false` may call the provider and finish the shared quota
reservation. Duplicate completed text work replays its saved value; completed
asset work materializes fresh delivery URLs from saved references as defined
above. Processing or failed duplicates return their existing state without
another provider job.
Quota configuration is loaded from validated Admin settings, with safe hardcoded
ceilings if settings are unavailable. Missing quota storage fails closed for AI
generation so a database outage cannot turn into unlimited provider spend.

---

## 5. Structured AI contracts

`lib/contracts/studios.ts` becomes the single source of truth for provider output,
stored output, and route response types. Zod schemas are strict enough to protect
the current UI while allowing optional business sections already supported by the
components.

Core schemas include:

```ts
export const PromptResultSchema = z.object({
  prompt: z.string().min(1).max(4000),
  style: z.string().max(200),
  tip: z.string().max(1000),
});

export const StoryboardSceneSchema = z.object({
  scene_number: z.number().int().positive(),
  visual_description: z.string().min(1).max(4000),
  dialogue: z.string().max(4000),
  camera_angle: z.string().max(500),
  camera_movement: z.string().max(500),
  duration_seconds: z.number().positive(),
  mood: z.string().max(500),
  music_note: z.string().max(1000),
});

export const CampaignPostSchema = z.object({
  scenario: z.string().min(1).max(4000),
  caption: z.string().min(1).max(5000),
  tov: z.string().max(500),
  schedule: z.string().max(500),
  hashtags: z.string().max(2000),
  imageUrl: z.string().url().nullable().optional(),
});
```

Analysis and Plan schemas mirror the exact sections currently consumed by their
pages, with bounded arrays and strings. Creator, Photoshoot, Edit, and Voiceover
response schemas require canonical delivery metadata. All route success envelopes
are parsed before being returned.

Provider text is first extracted from a fenced or unfenced JSON object/array, then
parsed by the relevant schema. JSON that parses but has missing or wrong fields is
a generation failure, not a partial success. The financial workflow refunds it.

The pages import `z.infer` types from the contracts instead of maintaining local
interfaces that can drift from the API.

---

## 6. Request ordering

After this release each studio performs:

```text
authenticate and validate
  -> reserve AI quota
  -> start generation / reserve credits
  -> call provider
  -> validate output contract
  -> persist canonical private assets
  -> complete generation
  -> finish AI quota
  -> materialize/sign immediate delivery URLs
  -> return success
```

Every error before durable completion after quota reservation marks the quota
failed, and every pre-completion error after generation start also reaches
`failGeneration`. Once completion commits, financial state never reopens: quota
finishes completed, and a later delivery-signing failure returns a retryable
same-key error with no output/refund/provider call. The user never receives
unvalidated output or an unpersisted asset.

---

## 7. Tests

- SQL concurrency tests issue at least 100 parallel reservations and prove minute,
  daily, and concurrency limits are never exceeded.
- TTL and idempotency tests prove an abandoned slot expires and a repeated request
  ID does not consume twice.
- Contract fixtures include valid, missing-field, wrong-type, oversized, fenced,
  and non-JSON provider responses.
- Storage tests prove a user cannot sign another user's path and that a canonical
  signing failure never returns a legacy URL.
- Lost-response tests replay the same completed private image/audio request,
  regenerate expired signed URLs, and prove zero provider/quota/credit/ledger
  delta. Signing failure or deletion-pending exposes no partial URL and a same-key
  retry can recover the completed result.
- Post-041 database tests rerun the 039 lifecycle and 040 enforcement suites and
  prove public/private assets both require one matching stored receipt with exact
  bucket/path equality; wrong token, failed receipt, deletion pending, and second
  completion remain rejected.
- Backfill tests run dry, migrate Supabase/data rows, leave external rows unchanged,
  and preserve source rows and objects.
- Free-plan tests prove any watermark or persistence failure returns no result and
  invokes the refund path.

---

## 8. Rollout and rollback

1. Apply additive/dual-compatible `041` and the private bucket to Test/Staging.
2. Deploy canonical reads and private-write code with the write flag off; prove
   the 039 public completion payload still succeeds.
3. Enable private writes for dedicated canary user IDs, then all new writes after
   completion/signing/export metrics pass.
4. Run the backfill dry report, then the approved copy pass.
5. Enable atomic AI quota for one studio, then all nine after metrics agree.
6. Deploy structured contracts by studio group: text, image, then voice.
7. Repeat on Production with read-only before/after inventories.

Rollback keeps the private bucket and canonical columns. Reads may temporarily
prefer preserved legacy URLs for legacy rows, but new canonical objects are never
made public and remote server fetch is never restored. Quota enforcement may be
rolled back per studio only to a conservative deny, not to the generation-count
limiter that customers can mutate.
