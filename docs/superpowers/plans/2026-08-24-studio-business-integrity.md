# Studio Business Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ledger, the customer and the pricing page agree about what was charged and what was delivered — and stop the platform paying for upstream calls that were never going to succeed.

**Architecture:** Three strands. **Ledger honesty** — one `settleCharge()` helper so a charge is only ever restated from a refund that actually landed. **Claim honesty** — the plan's resolution promise is delivered where it can be and qualified where it cannot, and credit prices become code rather than a decorative admin knob. **Unit economics** — provider calls get deadlines and a retry policy that distinguishes transient from permanent, the same 20 MB reference image stops being fetched eighteen times, and the serial preamble in front of every model call gets cached and parallelised.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Zod (`zod/v4`), Supabase JS, Stripe, `tsx` for test scripts (no test framework).

**Spec:** The audit report at https://claude.ai/code/artifact/d89501a0-e49d-4c4f-8084-d35e98cbc180 — the `money`, `performance` and `duplication` findings not already covered by the money-correctness plan.

## Global Constraints

- **TypeScript strict, zero `any`.** `npx tsc --noEmit` clean after every task.
- **Build gates green after every task:** `npm run check:invariants`, `npm run test:safety`, `npm run test:uploads`, `npm run test:plan-switch`.
- **Never change a refund AMOUNT in this plan.** Tasks 1–2 change *which figure is recorded and reported*; Task 3 changes *what resolution is requested*. If a diff changes an arithmetic expression that produces a refund, stop — that is the credit-minting shape `CLAUDE.md`'s round-2 and round-3 notes were written about.
- **Commit after every task.**

## Two decisions already made — build to these

**1. Credit prices are CODE, not config.** The admin per-studio cost knob is being **deleted**, not wired up.

> The evidence: `components/pricing/StudioCostTable.tsx` is a **public, unauthenticated** page that statically imports `CREDIT_COSTS` and prints *"These are the real per-action costs — the same numbers you see inside the product"* (`messages/en.json:892`). It can never read a database override. So every override makes the public pricing page lie with no correcting path, and wiring the remaining seven routes would multiply that by seven.

**2. Photoshoot is uplifted to the plan's resolution; the claim is qualified for campaign and edit.**

> Campaign cannot simply be raised: its 12-credit price is decomposed against `CREDIT_COSTS.image['1080p']` at `campaign/route.ts:121` and mirrored client-side at `CampaignForm.tsx:46-49`, and both prices are published as literals. Raising the resolution without moving `perImageCost` **and** `textCost` **and** the client mirror makes the refund arithmetic at `:373-377` size refunds against a price that is no longer what was charged.

## Facts established during research — do not re-derive

- **The duplication figure in the audit is low.** Measured: **748 of 2,626 raw lines (28.5%)**, and **615 of 1,732 executable lines (35.5%)** excluding comments and blanks.
- **`migration 015_admin_dashboard.sql:13-16` seeds `studio_config` and `prompt_overrides` as `'{}'`.** This is why the dead cost controls and the CreatorForm price split are **latent** rather than mis-charging anyone today. Task 4 Step 1 verifies this against the live database before deleting anything.
- **`voiceover/route.ts:210-237` and `campaign/route.ts:379-392` already settle charges correctly.** They are the pattern being copied, and are not changed by this plan.
- **Two pre-existing dead imports in `creator/route.ts`:** `:8` imports `CREDIT_COSTS` unused (Task 4 makes it used) and `:14` imports `getPromptVersion` unused. Neither gate catches this — `tsconfig.json` has `strict:true` but no `noUnusedLocals`, and `.eslintrc.json` adds no rules over `next/core-web-vitals`.
- **The prose-error-string finding (7 routes) is owned by the output-and-localisation plan, Task 10.** It is not duplicated here.

---

## File Structure

**Created:**
- `lib/credits/settle.ts` — one function deciding what a customer was actually charged.
- `scripts/tests/settle.test.ts` — its proof; a build gate.
- `lib/ai/http.ts` — provider timeouts, error classification, `fetchWithTimeout`.
- `lib/cache/ttl.ts` — `memoizeWithTtl`, replacing four hand-rolled copies.
- `lib/studios/with-studio.ts` — the shared route preamble (Task 8, last).

**Modified:**
- `app/api/studios/{creator,photoshoot}/route.ts` — settled charges, plan resolution.
- `lib/stripe/plans.ts`, `messages/{ar,en}.json` — the qualified 4K claim.
- `lib/admin/settings.ts`, `app/api/admin/**`, `components/studios/creator/CreatorForm.tsx` — the knob goes.
- `lib/ai/{router,gemini,openai,replicate,elevenlabs}.ts` — deadlines and retry policy.
- `app/api/generations/[id]/route.ts` — stop fetching the blob it refuses to serve.

---

### Task 1: One helper decides what the customer was actually charged

**Files:**
- Create: `lib/credits/settle.ts`
- Create: `scripts/tests/settle.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `settleCharge(reserved: number, refundAmount: number, refundLanded: boolean): { charged: number; refunded: number }`. Tasks 2 consumes it.

**The defect.** `creator/route.ts:409` and `photoshoot/route.ts:306` capture the refund result — so the
`refund-captured` invariant passes — and then state the **charge** from the *intended* figure rather than
the *settled* one. The ledger and the customer are both told credits came back that did not.

Landed first and alone because it is the only genuinely unit-testable fix in this plan, and it turns
Task 2 into two three-line edits against a proven helper.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/settle.test.ts`:

```ts
/**
 * Proof for the charge-settlement rule (lib/credits/settle.ts).
 *
 *   npx tsx scripts/tests/settle.test.ts
 *
 * WHY THIS IS A SEPARATE FUNCTION AND NOT THREE LINES INLINE
 *
 * creator and photoshoot both wrote `credits_used: totalCost - refundAmount` and
 * returned the same figure to the customer, WITHOUT checking that the refund
 * landed. The refund result was captured — so the `refund-captured` invariant was
 * satisfied — and then ignored at the only place it mattered. Two files, same
 * mistake, because the rule lived in nobody's head as a rule.
 *
 * The rule: a charge may only be restated DOWNWARD, and only from a refund that
 * actually landed. Everything else is the reservation.
 */
import { settleCharge } from '../../lib/credits/settle';

let failures = 0;
let checks = 0;

function check(label: string, actual: number, expected: number): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${expected}, got ${actual}`);
  }
}

// ---- A refund that landed reduces the charge. ----
{
  const s = settleCharge(12, 4, true);
  check('landed: charge drops by the refund', s.charged, 8);
  check('landed: refunded is reported', s.refunded, 4);
}

// ---- A refund that did NOT land leaves the charge at the reservation. ----
// This is the whole point: the ledger must not claim credits came back when the
// customer's balance says otherwise. The failure is already logged [credits][OWED].
{
  const s = settleCharge(12, 4, false);
  check('not landed: charge stays at the reservation', s.charged, 12);
  check('not landed: nothing is reported as refunded', s.refunded, 0);
}

// ---- No refund was due. ----
{
  const s = settleCharge(8, 0, true);
  check('no refund due: charge is the reservation', s.charged, 8);
  check('no refund due: refunded is zero', s.refunded, 0);
}

// ---- A refund larger than the reservation can never mint credits. ----
// Not reachable through today's call sites, but the arithmetic must be total:
// every previous credit defect in this repo was a case nobody thought reachable.
{
  const s = settleCharge(5, 9, true);
  check('over-refund: charge floors at zero', s.charged, 0);
  check('over-refund: refunded is capped at the reservation', s.refunded, 5);
}

// ---- A negative refund is nonsense and must not raise the charge. ----
{
  const s = settleCharge(10, -3, true);
  check('negative refund: charge is unchanged', s.charged, 10);
  check('negative refund: refunded is zero', s.refunded, 0);
}

// ---- A zero reservation settles to zero. ----
{
  const s = settleCharge(0, 0, true);
  check('zero reservation: charge is zero', s.charged, 0);
  check('zero reservation: refunded is zero', s.refunded, 0);
}

if (failures > 0) {
  console.log(`\n[settle] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[settle] ${checks} checks passed`);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx scripts/tests/settle.test.ts`
Expected: FAIL — `does not provide an export named 'settleCharge'`.

- [ ] **Step 3: Implement the helper**

Create `lib/credits/settle.ts`:

```ts
/**
 * What the customer was ACTUALLY charged, given a reservation and a refund that
 * may or may not have landed.
 *
 * ── WHY THIS IS A FUNCTION ─────────────────────────────────────────────────
 * creator and photoshoot both wrote `credits_used: totalCost - refundAmount` and
 * returned that same figure, without consulting `refundResult.success`. The refund
 * result WAS captured — the `refund-captured` invariant passed — and then ignored
 * at the only place it mattered. So `generations.credits_used` said the customer
 * paid less than their balance says they did, every admin revenue figure reads off
 * that column, and the response told the customer the same untruth.
 *
 * voiceover/route.ts:226-229 and campaign/route.ts:380 already state the rule
 * correctly in prose. This is that rule, once, where it can be tested.
 *
 * The rule: a charge may only be restated DOWNWARD, and only from a refund that
 * actually landed. A refund that failed is already recorded as `[credits][OWED]`
 * by refundCredits(); it must not also be recorded here as if it had succeeded.
 */
export function settleCharge(
  reserved: number,
  refundAmount: number,
  refundLanded: boolean
): { charged: number; refunded: number } {
  // Clamped at both ends so the arithmetic is total. Neither bound is reachable
  // through today's call sites — and every credit defect in this repo's history
  // was a case nobody thought was reachable.
  const refunded = refundLanded ? Math.min(Math.max(refundAmount, 0), Math.max(reserved, 0)) : 0;
  return { charged: Math.max(reserved, 0) - refunded, refunded };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx scripts/tests/settle.test.ts`
Expected: `[settle] 12 checks passed`

- [ ] **Step 5: Register as a build gate**

In `package.json` add `"test:settle": "npx tsx scripts/tests/settle.test.ts",` and append
` && npm run test:settle` to `prebuild`.

- [ ] **Step 6: Commit**

```bash
git add lib/credits/settle.ts scripts/tests/settle.test.ts package.json
git commit -m "feat(credits): settleCharge() — a charge only drops from a refund that landed"
```

---

### Task 2: Creator and photoshoot report the settled charge

**Files:**
- Modify: `app/api/studios/creator/route.ts` (~`:271-273`, `:370-373`, `:407-411`, `:435-438`)
- Modify: `app/api/studios/photoshoot/route.ts` (the twin sites; `~:306`)

**Interfaces:**
- Consumes: `settleCharge` from Task 1.

- [ ] **Step 1: Read both routes' partial-refund blocks**

```bash
sed -n '265,280p;360,380p;400,440p' app/api/studios/creator/route.ts
sed -n '290,320p' app/api/studios/photoshoot/route.ts
```

- [ ] **Step 2: Declare the settled figure beside the balance it belongs with**

In `creator/route.ts`, replace lines 271-273:

```ts
    // Tracks the balance actually left after any partial refund below. Stays at the
    // reservation's balance when no partial refund is needed.
    let balanceAfterPartialRefund = reserveResult.newBalance;
    // What the customer was ACTUALLY charged. Starts at the reservation and only
    // drops when a refund is confirmed landed — the rule voiceover/route.ts:226-229
    // states and campaign/route.ts:380 already follows.
    let creditsCharged = totalCost;
```

- [ ] **Step 3: Settle where the refund verdict is known**

Replace the block at `:370-373`:

```ts
        const settled = settleCharge(totalCost, refundAmount, partialRefund.success);
        creditsCharged = settled.charged;
        if (partialRefund.success) {
          balanceAfterPartialRefund = partialRefund.newBalance;
          refundedSoFar += settled.refunded;
        }
```

Add `import { settleCharge } from '@/lib/credits/settle';` to the imports.

**`refundedSoFar` must only advance by what actually landed.** It is what stops the outer catch
refunding the same credits twice — `creator/route.ts:457`'s `outstanding = totalCost - refundedSoFar`
depends on it, and over-advancing it is the credit-minting shape.

- [ ] **Step 4: Record the settled figure, not the hoped-for one**

Replace the `finalizeGeneration` patch at `:407-411`:

```ts
    await finalizeGeneration(supabase, generation.id, {
      output: { urls: imageUrls, mock: hasMock, usedFallback: hasUsedFallback },
      credits_used: creditsCharged,
      status: 'completed',
    }, 'creator');
```

- [ ] **Step 5: Tell the customer the same number**

Replace the response fields at `:435-438`:

```ts
        creditsUsed: creditsCharged,
        totalReserved: totalCost,
        refunded: totalCost - creditsCharged,
        newBalance: balanceAfterPartialRefund,
```

- [ ] **Step 6: Apply the identical change to photoshoot**

`photoshoot/route.ts` has the same four sites around `:306`. Same edits, with photoshoot's own variable
names — read them rather than assuming they match creator's.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit` — no output.
Run: `npm run check:invariants` — 12/12 (`refund-captured` covers both routes).
Run: `grep -n "credits_used: totalCost - \|credits_used: creditCost - " app/api/studios/` — no output. Any
hit is a site still stating the charge by arithmetic instead of by settlement.

- [ ] **Step 8: Commit**

```bash
git add app/api/studios/creator/route.ts app/api/studios/photoshoot/route.ts
git commit -m "fix(credits): creator and photoshoot record the charge that actually settled"
```

---

### Task 3: Deliver the resolution the plan sells, where it can be delivered

**Files:**
- Modify: `app/api/studios/photoshoot/route.ts` (~`:122-127`, `:150`, `:210-215`)
- Modify: `lib/stripe/plans.ts` (5 `features` + 5 `featuresAr` entries)
- Modify: `messages/ar.json`, `messages/en.json` (the plan-feature strings at ~`:811/817/823/829`)
- Modify: `scripts/check-invariants.ts`

**Interfaces:**
- Consumes: `getMaxResolution(planId)` from `lib/stripe/plans.ts` — read it first to confirm the exact name and return type.
- Produces: invariant id `plan-resolution-honoured`.

**The defect.** `photoshoot/route.ts:213` hardcodes `'1080p'`, so **every paid plan receives 1K product
photos** while `lib/stripe/plans.ts` sells Starter 2K and Pro/Business/Agency 4K. The plan read that
would have told it otherwise sits *after* `Promise.all`, because it was only ever added to feed the
watermark decision.

- [ ] **Step 1: Read the plan resolution helper and creator's correct implementation**

```bash
grep -n "getMaxResolution\|maxResolution\|'4K'\|'2K'" lib/stripe/plans.ts
sed -n '100,120p' app/api/studios/creator/route.ts
```

- [ ] **Step 2: Read the plan once, before the reservation**

In `photoshoot/route.ts`, insert after the `projectId` guard (~`:122-125`) and **before**
`const creditCost = SHOT_COSTS[input.shots] || 8;` (~`:127`):

```ts
    // The plan decides the resolution the customer is sold. This read used to sit
    // AFTER Promise.all because it only fed the watermark decision, which is why
    // every plan got a 1K product photo while lib/stripe/plans.ts sells Starter 2K
    // and Pro/Business/Agency 4K. Read once, used for both.
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single();
    const planId = profile?.plan_id || 'free';
    const shotResolution = getMaxResolution(planId);
```

Add `import { getMaxResolution } from '@/lib/stripe/plans';`.

**Delete the later `profiles` read** that fed the watermark decision and point that code at `planId`.
Leaving both means two round-trips for one fact — and Task 6 is about removing exactly that.

- [ ] **Step 3: Record what was actually requested**

Replace the insert's `input:` line (~`:150`):

```ts
        input: { ...input, productImageUrl: inputImageRef(input.productImageUrl), resolution: shotResolution },
```

Without this the row looks like it was used for a 1080p job — the "the row looked like it was used for
something else" defect `campaign/route.ts:44-56` documents.

- [ ] **Step 4: Ask for it**

Replace the hardcoded resolution at `~:210-215`:

```ts
      return generateImage({
        prompt,
        model: 'gemini',
        resolution: shotResolution,
      });
```

- [ ] **Step 5: Qualify the claim for campaign and edit**

In `lib/stripe/plans.ts`, change the 5 `features` and 5 `featuresAr` entries from an unqualified
"4K resolution" to one that names where it applies — e.g. `4K resolution (Image Creator & Product Photoshoot)`
and its Arabic equivalent. Make the same change in `messages/ar.json` and `messages/en.json` at the plan
feature strings.

**Both message files must change together** or `msg-parity` fails the build.

- [ ] **Step 6: Add the `plan-resolution-honoured` invariant**

Model it on `generation-finalized` (`scripts/check-invariants.ts:300-335`): scan
`app/api/studios/*/route.ts` for a hardcoded `resolution: '1080p'` and report each as a violation.

`campaign` and `edit` will be flagged — and that is the point. Those two are **deliberate**, for the
reason stated at the top of this plan. Record them explicitly in the invariant's `why` text as known,
priced-in exceptions:

```ts
  why:
    'lib/stripe/plans.ts sells 2K/4K on paid tiers. photoshoot hardcoded 1080p, so ' +
    'every paid plan received a 1K product photo. campaign and edit ALSO hardcode ' +
    '1080p and are deliberate: campaign\'s 12-credit price is decomposed against ' +
    'CREDIT_COSTS.image[\'1080p\'] (campaign/route.ts:121) and mirrored at ' +
    'CampaignForm.tsx:46-49, so raising the resolution without moving perImageCost, ' +
    'textCost and the client mirror together makes the refund arithmetic size ' +
    'refunds against a price that is no longer what was charged. The plan features ' +
    'were qualified instead. A NEW hardcoded resolution is a defect; these two are ' +
    'a recorded trade.',
```

Since the baseline is restricted to `no-arabic-literals-in-tsx`, the exception must be expressed **in
the rule** — allowlist the `campaign` and `edit` route paths by name, with that comment. An allowlist a
reader can see beats a silent pass.

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit` — no output.
Run: `npm run check:invariants` — all pass, including the new rule.
Run: `grep -rn "resolution: '1080p'" app/api/studios/` — only `campaign` and `edit`.

- [ ] **Step 8: Verify live, on a paid plan**

Run a photoshoot on a Pro account and confirm the returned images are 4K, not 1K. Then run one on a
**free** account and confirm it is still watermarked — Step 2 moved the `plan_id` read that the
watermark decision depends on, and a fail-open watermark is a worse defect than the one being fixed.

- [ ] **Step 9: Commit**

```bash
git add app/api/studios/photoshoot/route.ts lib/stripe/plans.ts messages/ar.json messages/en.json scripts/check-invariants.ts
git commit -m "fix(plans): deliver the sold resolution in photoshoot, qualify the claim elsewhere"
```

---

### Task 4: Credit prices are code

**Files:**
- Modify: `lib/admin/settings.ts` (remove `getEffectiveCost` and the studio-cost half of `getStudioConfig`)
- Modify: `app/api/studios/*/route.ts` (any route reading the override)
- Modify: `app/[locale]/admin/**` and `app/api/admin/**` (remove the control)
- Modify: `components/studios/creator/CreatorForm.tsx`

**⚠ Step 1 is not optional.** Deleting `getEffectiveCost` while a non-empty override is live would
silently change prices on deploy.

- [ ] **Step 1: Verify no override is live**

```bash
node scripts/db-query.ts "SELECT key, value FROM system_settings WHERE key IN ('studio_config','prompt_overrides','rate_limits','app_config','feature_flags');"
```

Expected: `studio_config` is `{}` (migration `015_admin_dashboard.sql:13-16` seeds it so). **Record the
actual output in the commit message.**

If `studio_config` is **not** empty, stop. Someone has set a live override, and deleting the mechanism
changes prices for real customers. Reconcile the values into `CREDIT_COSTS` first, in their own commit.

- [ ] **Step 2: Find every consumer**

```bash
grep -rn "getEffectiveCost\|studio_config\|studioConfig" app/ lib/ components/ --include=*.ts --include=*.tsx
```

Record the full list before deleting anything.

- [ ] **Step 3: Remove the cost override from the read path**

Delete `getEffectiveCost` from `lib/admin/settings.ts` and point every route at `CREDIT_COSTS` directly.

Leave `getStudioConfig`'s **enable/disable** half alone — the studio-disabled control is real, works, and
Task 10 of the output-and-localisation plan depends on it.

Add a comment where the knob used to be:

```ts
// Credit prices are CODE, not config, and deliberately so:
// components/pricing/StudioCostTable.tsx is a PUBLIC, unauthenticated page that
// statically imports CREDIT_COSTS and tells the visitor "These are the real
// per-action costs — the same numbers you see inside the product". It cannot read
// a database override, so an override makes that page lie with no correcting path.
// Change a price in lib/credits/costs.ts and deploy.
```

- [ ] **Step 4: Remove the control from the admin UI**

Delete the per-studio cost input from the admin settings page and its handler from the admin API.
**Leave the enable/disable toggle.**

- [ ] **Step 5: Fix `edit`'s hardcoded cost**

`edit/route.ts:79` hardcodes `CREDIT_COST = 1`. With prices as code that is no longer a no-op knob — but
it should still read from the one table. Point it at `CREDIT_COSTS`, so every studio's price lives in one
file.

- [ ] **Step 6: Make `CreatorForm` price from the same table**

`CreatorForm.tsx:101` prices from a hard-coded table while the route charged the admin-configurable
cost. With Step 3 done, both sides are `CREDIT_COSTS` — make the form import it rather than restating
the numbers, so the displayed price and the affordability gate cannot drift from the charge.

- [ ] **Step 7: Clean up the two dead imports**

While in `creator/route.ts`: `:8` imports `CREDIT_COSTS` (now used — good) and `:14` imports
`getPromptVersion` unused with no replacement. Delete the second.

Neither `tsc` nor `eslint` catches this class here (`noUnusedLocals` is off and the eslint config adds
nothing over `next/core-web-vitals`), so it is a manual sweep.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit` — no output.
Run: `npm run lint` — clean.
Run: `grep -rn "getEffectiveCost" app/ lib/ components/` — no output.
Run: `npm run build` — clean.

- [ ] **Step 9: Verify the numbers agree in three places**

For one studio, confirm the same figure appears in `lib/credits/costs.ts`, on the public pricing page,
and in the studio form's displayed cost. This is the invariant the deletion exists to protect.

- [ ] **Step 10: Commit**

```bash
git add lib/admin/settings.ts app/api components/studios/creator/CreatorForm.tsx "app/[locale]/admin"
git commit -m "refactor(pricing): credit prices are code, not config

The public pricing page statically imports CREDIT_COSTS and tells visitors these
are the real per-action costs. It can never read a DB override, so the knob could
only ever make that page lie. Verified studio_config was '{}' on the live database
before removing it."
```

---

### Task 5: Provider calls get a deadline and a retry policy that knows what is retryable

**Files:**
- Create: `lib/ai/http.ts`
- Create: `scripts/tests/provider-retry.test.ts`
- Modify: `lib/ai/{router,gemini,openai,replicate,elevenlabs}.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `ProviderTimeoutError`, `ProviderPermanentError`, `isRetryable(error: unknown): boolean`, `fetchWithTimeout(url, init, ms)`, `PROVIDER_TIMEOUTS`.

**The defect, and it is the money finding of this plan.** No provider call has a deadline, and
`withRetry` retries **every** error class. One failing image request becomes up to **9 upstream calls**;
a nine-post campaign becomes **81**. The retries fire hardest on the errors that will never succeed — a
rotated key, a 404 model id, a host that is not on the allowlist — and a hung provider holds a credit
reservation open with no deadline at all.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/provider-retry.test.ts` asserting `isRetryable()`:

```ts
/**
 * Proof that the retry policy distinguishes "try again" from "this will never work".
 *
 *   npx tsx scripts/tests/provider-retry.test.ts
 *
 * withRetry retried EVERY error class, so a rotated API key became three 401s, a
 * wrong model id became three 404s, and a nine-post campaign could drive 81 upstream
 * calls. The platform pays for every one of them. Retrying a permanent error is not
 * resilience — it is triple-billing yourself for the same certain failure.
 */
import { ProviderPermanentError, ProviderTimeoutError, isRetryable } from '../../lib/ai/http';

let failures = 0;
let checks = 0;

function expectRetry(label: string, err: unknown, want: boolean): void {
  checks++;
  if (isRetryable(err) !== want) {
    failures++;
    console.log(`FAIL  ${label}\n        expected isRetryable=${want}`);
  }
}

// ---- Transient: worth another attempt. ----
expectRetry('429 rate limit', new ProviderPermanentError('rate limited', 429), true);
expectRetry('500', new ProviderPermanentError('server error', 500), true);
expectRetry('502', new ProviderPermanentError('bad gateway', 502), true);
expectRetry('503', new ProviderPermanentError('unavailable', 503), true);
expectRetry('504', new ProviderPermanentError('gateway timeout', 504), true);
expectRetry('a timeout we imposed', new ProviderTimeoutError('gemini', 30_000), true);
expectRetry('a socket failure', new TypeError('fetch failed'), true);

// ---- Permanent: retrying is paying three times for the same certain failure. ----
expectRetry('400 bad request', new ProviderPermanentError('bad request', 400), false);
expectRetry('401 rotated key', new ProviderPermanentError('unauthorized', 401), false);
expectRetry('403 forbidden', new ProviderPermanentError('forbidden', 403), false);
expectRetry('404 wrong model id', new ProviderPermanentError('not found', 404), false);
expectRetry('422 unprocessable', new ProviderPermanentError('unprocessable', 422), false);

// ---- Our own refusals must never be retried. ----
expectRetry('host not on the allowlist', new Error('host not allowed: evil.example'), false);
expectRetry('reference image too large', new Error('image too large'), false);

if (failures > 0) {
  console.log(`\n[provider-retry] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[provider-retry] ${checks} checks passed`);
```

Note `429` is **retryable** — it is the provider asking you to wait, not refusing you.

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/tests/provider-retry.test.ts` — FAIL, module missing.

- [ ] **Step 3: Read every provider call site first**

```bash
grep -n "fetch(" lib/ai/gemini.ts lib/ai/openai.ts lib/ai/replicate.ts lib/ai/elevenlabs.ts
sed -n '100,140p' lib/ai/router.ts
```

Record every `fetch` — each needs a timeout, and a missed one is a call that can still hang forever.

- [ ] **Step 4: Create `lib/ai/http.ts`**

```ts
/**
 * Provider HTTP: deadlines, and a retry policy that knows what is worth retrying.
 *
 * withRetry used to retry every error class, so a rotated key became three 401s and
 * a nine-post campaign could drive 81 upstream calls — with no deadline anywhere, so
 * a hung provider held a credit reservation open indefinitely. Retrying a permanent
 * error is not resilience; it is paying three times for the same certain failure.
 */

export class ProviderTimeoutError extends Error {
  constructor(public readonly provider: string, public readonly ms: number) {
    super(`${provider} did not respond within ${ms}ms`);
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderPermanentError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ProviderPermanentError';
  }
}

/** Per-provider deadlines. Image generation is genuinely slow; a settings lookup is
 *  not. These are ceilings, not targets — a request that hits one has already failed
 *  the customer, and the point is to fail it while a refund can still be issued
 *  inside the request rather than leaving the row to the reconciler. */
export const PROVIDER_TIMEOUTS = {
  text: 60_000,
  image: 120_000,
  tts: 90_000,
  referenceImage: 30_000,
} as const;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isRetryable(error: unknown): boolean {
  if (error instanceof ProviderTimeoutError) return true;
  if (error instanceof ProviderPermanentError) return RETRYABLE_STATUS.has(error.status);
  // A socket-level failure — DNS, connection reset, TLS. `fetch` surfaces these as
  // TypeError, and they are the classic transient case.
  if (error instanceof TypeError) return true;
  // Everything else is one of OUR refusals — an off-allowlist host, an oversized
  // reference image, a blocked prompt. Retrying our own verdict is pointless.
  return false;
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
  provider: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') throw new ProviderTimeoutError(provider, ms);
    throw e;
  } finally {
    // Always clear it. A pending timer keeps the event loop alive and, in a
    // serverless runtime, can hold the invocation open past the response.
    clearTimeout(timer);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx scripts/tests/provider-retry.test.ts` — passes.

- [ ] **Step 6: Give every provider call a deadline and a classified error**

In each of `gemini.ts`, `openai.ts`, `replicate.ts`, `elevenlabs.ts`: replace `fetch(...)` with
`fetchWithTimeout(..., PROVIDER_TIMEOUTS.<kind>, '<provider>')`, and on a non-OK response throw
`new ProviderPermanentError(text, response.status)` instead of a bare `Error`.

**`replicate.ts` polls.** A poll loop needs a deadline for the *whole operation*, not just each poll —
otherwise a prediction that never finishes still hangs forever. Give the loop a wall-clock budget and
throw `ProviderTimeoutError` when it is exhausted.

- [ ] **Step 7: Make `withRetry` consult the policy**

In `lib/ai/router.ts`, have `withRetry` re-throw immediately when `!isRetryable(error)`:

```ts
      } catch (error: unknown) {
        // A permanent error will fail identically on the next attempt. Retrying it
        // bills us three times for one certain failure and delays the customer's
        // refund by the backoff.
        if (!isRetryable(error)) throw error;
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit` — no output.
Run: `grep -n "await fetch(" lib/ai/*.ts` — no output. Every provider call goes through
`fetchWithTimeout`.

- [ ] **Step 9: Verify live, including the failure path**

Generate one real image and one real text run — both must still succeed. Then temporarily set an invalid
`GOOGLE_GEMINI_API_KEY` and confirm the failure arrives **once per provider**, not three times, and that
the customer is refunded.

- [ ] **Step 10: Register and commit**

Add `"test:provider-retry": "npx tsx scripts/tests/provider-retry.test.ts",` to `package.json` and
append it to `prebuild`.

```bash
git add lib/ai scripts/tests/provider-retry.test.ts package.json
git commit -m "fix(ai): deadlines on every provider call, and stop retrying permanent failures"
```

---

### Task 6: Fetch the reference image once, not eighteen times

**Files:**
- Modify: `lib/ai/router.ts` (~`:195`), `lib/ai/gemini.ts`
- Modify: `app/api/studios/photoshoot/route.ts` (~`:214`)

**Interfaces:**
- Consumes: `ProviderPermanentError` from Task 5 — a reference-image resolution failure must be classified permanent so Task 5's policy does not retry it.

**The defect.** The router hands a **URL** down to each provider call, so the same reference image is
downloaded once per parallel shot **and again per retry** — up to **18 fetches of one 20 MB file** for a
single 8-credit photoshoot. Separately, `photoshoot/route.ts:214` re-resolves and re-base64-encodes the
customer's product photo once per shot.

**These are one task in this order:** the router signature change first, then the photoshoot call site
that consumes it. Landing the second without the first does not compile.

- [ ] **Step 1: Resolve once, above the fan-out**

Change the image path so the reference image is fetched and base64-encoded **once**, above the
`Promise.all`, and the resolved bytes are passed down — rather than the URL being passed and each call
resolving it independently.

Read `lib/ai/router.ts:180-210` and `lib/ai/gemini.ts`'s `fetchReferenceImage` call site first, then
change `generateImage`'s input to accept already-resolved bytes alongside (or instead of) the URL.

- [ ] **Step 2: Classify a resolution failure as permanent**

An off-allowlist host or an oversized payload is **our** verdict and must not be retried. With Task 5's
`isRetryable`, a plain `Error` is already non-retryable — confirm that is what these throw, and if any
throws a `TypeError` (which Task 5 treats as transient), fix it.

- [ ] **Step 3: Resolve the photoshoot product photo once**

In `photoshoot/route.ts`, hoist the resolution above the shot loop so one download serves all shots.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — no output.
Run a photoshoot with a reference image against the dev server with request logging on, and **count the
fetches of the reference URL**. Expected: **1**. That count is the whole deliverable — a code change
that looks right and still fetches six times has not fixed anything.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/router.ts lib/ai/gemini.ts app/api/studios/photoshoot/route.ts
git commit -m "perf(ai): resolve a reference image once per request instead of once per shot and retry"
```

---

### Task 7: Cache the settings lookups, and stop shipping a blob to throw it away

**Files:**
- Create: `lib/cache/ttl.ts`
- Modify: `lib/admin/settings.ts`, `lib/ai/router.ts:9-24`
- Modify: `app/api/generations/[id]/route.ts:47`
- Modify: `app/api/studios/creator/route.ts` (the preamble only — the reference implementation)

**Interfaces:**
- Produces: `memoizeWithTtl<T>(load: () => Promise<T>, fallback: T, ttlMs: number): () => Promise<T>`.

**The defects.** `getStudioConfig` and `getEffectivePrompt` are uncached and build a **fresh
service-role client per call**, sitting in a chain of **8 strictly serial round-trips** before the first
model call. And `GET /api/generations/[id]:47` `SELECT`s the **904 kB – 2.8 MB** output blob it then
refuses to serve.

- [ ] **Step 1: Extract the caching pattern that already exists four times**

`lib/ai/router.ts:9-24` and `lib/admin/settings.ts:114-129` hand-roll the same memoize-with-TTL shape,
including the "never cache a rejection" reasoning. Create `lib/cache/ttl.ts` with one implementation and
that reasoning stated once:

```ts
/**
 * Memoize an async load for `ttlMs`, and NEVER cache a rejection.
 *
 * A memoized rejected promise poisons every later call for the lifetime of the
 * process, turning one cold-start blip into permanently broken settings. That
 * reasoning was written out four times in this repo (lib/ai/router.ts:9-24,
 * lib/admin/settings.ts:114-129, and the two caches this replaces); it belongs
 * once, where it can be got right once.
 */
export function memoizeWithTtl<T>(load: () => Promise<T>, fallback: T, ttlMs: number): () => Promise<T> {
  let value: T | undefined;
  let expiresAt = 0;
  let inflight: Promise<T> | null = null;

  return async (): Promise<T> => {
    // Date.now() is fine here — this is runtime code, not a workflow script.
    if (value !== undefined && Date.now() < expiresAt) return value;
    if (inflight) return inflight;

    inflight = load()
      .then((loaded) => {
        value = loaded;
        expiresAt = Date.now() + ttlMs;
        return loaded;
      })
      .catch(() => fallback)
      .finally(() => {
        inflight = null;
      });

    return inflight;
  };
}
```

The `inflight` guard matters: without it, N concurrent requests on a cold cache each issue their own
query — which is exactly the stampede this is meant to remove.

- [ ] **Step 2: Point the four sites at it**

Convert `getStudioConfig`, `getEffectivePrompt`, the feature-flags cache and the model-config cache.
Choose a TTL that matches how quickly an admin expects a settings change to take effect — 60 seconds is
defensible; state whatever you choose in a comment.

- [ ] **Step 3: Parallelise creator's preamble — and only creator's**

Read the top of `app/api/studios/creator/route.ts` and identify which of the 8 serial awaits are
genuinely independent (typically: profile, brand kit, project, settings). Group them:

```ts
    const [profileResult, brandKitResult, studioConfig] = await Promise.all([
      supabase.from('profiles').select('plan_id').eq('id', user.id).single(),
      input.brandKitId
        ? supabase.from('brand_kits').select('*').eq('id', input.brandKitId).eq('user_id', user.id).single()
        : Promise.resolve({ data: null }),
      getStudioConfig(),
    ]);
```

**Do this on `creator` ONLY.** It is the reference implementation Task 8's wrapper generalises;
hand-parallelising all nine is Task 8's job and doing it twice guarantees a conflict.

Keep `checkRateLimit` and the auth check where they are — they must gate the work, not race it.

- [ ] **Step 4: Stop selecting the blob**

In `app/api/generations/[id]/route.ts:47`, narrow the `select` so the refusal path never pulls `output`.
Read the route first: the studio check that drives the refusal needs `studio`, not `output`. Select the
metadata, decide, and fetch `output` only on the path that actually serves it.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` — no output.
Run: `npm run check:invariants` — 12/12.

Time one creator generation before and after Step 3 with the dev server's timing logs, and **record both
numbers in the commit message**. A parallelisation that does not measurably reduce the preamble is not
worth the review cost.

Confirm the detail route still refuses an image studio with the same status and body as before — narrowing
a `select` must not change the response.

- [ ] **Step 6: Commit**

```bash
git add lib/cache/ttl.ts lib/admin/settings.ts lib/ai/router.ts app/api/studios/creator/route.ts "app/api/generations/[id]/route.ts"
git commit -m "perf: cache settings lookups, parallelise creator's preamble, stop shipping a blob to discard it"
```

---

### Task 8: `withStudio()` — the wrapper, last

**Files:**
- Create: `lib/studios/with-studio.ts`
- Modify: all nine `app/api/studios/*/route.ts`

**⚠ This task lands LAST in the entire programme** — after the money-correctness plan, the security
plan, the output-and-localisation plan and Tasks 1–7 here. It touches all nine routes; every other task
in every plan edits at least one of them. Doing it earlier turns every other task into a merge conflict;
doing it last means the wrapper absorbs already-correct code.

**The measurement.** 748 of 2,626 raw lines (**28.5%**), 615 of 1,732 executable lines (**35.5%**) are
near-identical across the nine routes. The audit's "26%" was low.

- [ ] **Step 1: Re-measure before designing**

The earlier tasks will have changed these numbers. Re-run the comparison across all nine routes and
record the current per-route, per-block line ranges. **Design the wrapper against what the code is
then, not against this plan's figures.**

- [ ] **Step 2: Establish where the nine genuinely diverge**

Before writing a line, list what each route does that the others do not: reference-image handling
(3 routes), partial refunds (4), asset writes (5), tiered pricing (voiceover), zero cost
(prompt-builder), multi-item fan-out (campaign, creator, photoshoot).

**A wrapper that cannot express these becomes a straitjacket** and the next feature works around it —
which is worse than the duplication, because the workaround looks like the pattern.

- [ ] **Step 3: Design the signature and get it reviewed before implementing**

The wrapper should own: auth, rate limit, maintenance/disabled, Zod parse, sanitization,
plan resolution, credit reservation, refund-on-throw, `finalizeGeneration`/`failGeneration`, and the
error-code response shape. The handler receives a context and returns output plus what to charge.

**Stop at the end of this step and have the signature reviewed.** This is the largest change in the
programme and the cost of getting the interface wrong is nine routes rewritten twice.

- [ ] **Step 4: Convert ONE route and prove nothing changed**

Convert `plan` first — it is the simplest text studio. Then verify: `tsc`, `lint`, all invariants, all
tests, and a real generation end to end producing an identical response body.

- [ ] **Step 5: Convert the remaining eight, one commit each**

One route per commit, with the full gate set run each time. Nine routes in one commit is unreviewable,
and this is the change where a silent behaviour difference is most likely.

- [ ] **Step 6: Verify the invariants still cover the routes**

`generation-finalized`, `refund-captured`, `studio-error-codes` and `prompt-input-bounded` all scan
`app/api/studios/*/route.ts` **by path**. If logic moves into `lib/studios/with-studio.ts`, those rules
stop seeing it — the gates would pass because there is nothing left to scan.

Widen each rule's file list to include the wrapper, and **prove it** by reintroducing a violation inside
the wrapper and confirming the build fails.

This step is the one most likely to be skipped and the most expensive to skip.

- [ ] **Step 7: Final gate run and commit**

```bash
npm run build
git add lib/studios/with-studio.ts app/api/studios scripts/check-invariants.ts
git commit -m "refactor(studios): one preamble in withStudio() instead of nine copies"
```

---

### Task 9: Record what is true

- [ ] **Step 1: Run the full gate set**

```bash
npx tsc --noEmit && npm run lint && npm run check:invariants
npm run test:safety && npm run test:uploads && npm run test:plan-switch
npm run test:settle && npm run test:provider-retry
npm run build
```

- [ ] **Step 2: Update `CLAUDE.md`**

Add a section in the established table style covering: the settled-charge rule and its two call sites;
photoshoot delivering the sold resolution and the qualified claim for campaign/edit; credit prices
becoming code and why; provider deadlines and the retry policy; the reference-image fetch count; the
cached settings lookups; and the `withStudio` refactor with its re-measured duplication figure.

Include the numbers Step 1 actually printed, the before/after preamble timing from Task 7, and the
before/after reference-image fetch count from Task 6.

Also correct the audit's 26% duplication figure to the measured 35.5% of executable lines.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the business-integrity round against verified output"
```

---

## Self-Review

**Spec coverage.** All 16 business-lens findings map to a task: photoshoot resolution and the 4K claim
(3), creator + photoshoot settled charge (1–2), the dead admin cost controls, `edit`'s hardcoded cost and
the CreatorForm price split (4), provider timeouts and retry policy (5), the reference-image refetch and
photoshoot's per-shot re-encode (6), uncached settings and the discarded blob (7), duplication (8).

**Explicitly NOT covered here**, to avoid duplicating another plan:
- The 7 routes returning English prose where an error code belongs — **output-and-localisation plan, Task 10**.
- `failGeneration`, voiceover repricing, campaign image cap, storyboard scene floor, plan completeness gate — **money-correctness plan**. Note `voiceover/route.ts:210-237` is *cited* throughout as the correct settlement pattern; it is not changed.

**Ordering, all load-bearing:**
- Task 1 before Task 2 — Task 2 is three-line edits against a proven helper.
- Task 4 Step 1 (verify `studio_config` is `{}`) before any deletion.
- Task 5 before Task 6 — the reference-image resolver's failure must be classified by Task 5's policy.
- Task 7's parallelisation is `creator` **only**; Task 8 generalises it.
- **Task 8 is last across all four plans.**

**Type consistency.** `settleCharge(reserved, refundAmount, refundLanded)` is defined in Task 1 and
called in Task 2 with that exact shape. `isRetryable`, `fetchWithTimeout`, `PROVIDER_TIMEOUTS`,
`ProviderTimeoutError`, `ProviderPermanentError` are defined in Task 5 and consumed in Tasks 5–6.
`memoizeWithTtl(load, fallback, ttlMs)` is defined in Task 7 and used at four sites there.

**Placeholder scan.** Tasks 6 and 8 specify their edits by required outcome rather than by finished code
— deliberately. Task 6's router signature depends on code Tasks 5 and 7 will have already changed, and
its acceptance criterion is a **measured fetch count of 1**, not a shape. Task 8 is explicitly a
design-then-review task and says so, because committing a wrapper signature in advance of the eight
plans' worth of edits that precede it would be a guess dressed as a specification.

**Two risks worth flagging.**
1. **Task 3 moves the `profiles` read that the watermark decision depends on.** A fail-open watermark on
   the free plan is a worse defect than the 1K resolution being fixed — `CLAUDE.md` records that free-plan
   watermarking is fail-CLOSED by design and that it once shipped drawing empty boxes for a week. Step 8's
   free-plan check is not optional.
2. **Task 5 changes failure timing, not just failure count.** A 120-second image deadline means a
   customer waits up to two minutes before a refund. That is still better than an unbounded hang holding
   the reservation open until the reconciler finds it — but if the founder would rather fail faster,
   `PROVIDER_TIMEOUTS` is the one place to change and the tests do not constrain the values.
