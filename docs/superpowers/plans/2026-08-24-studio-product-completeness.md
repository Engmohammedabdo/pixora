# Studio Product Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sure a customer can get back everything they paid for, and is never left in a state the product has nothing to say about.

**Architecture:** Three strands. **Retrieval** — campaign joins the studios whose work survives a reload, guarded by an inline-image stripper so the multi-megabyte response the detail route refuses cannot come back; the exports render what the screen shows. **Dead ends** — every state a customer can reach gets a message, a way out, or both. **Integrity** — the last check-then-act throttle is replaced with the atomic RPC that already exists, and the things that quietly do nothing are either wired up or deleted.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Zod (`zod/v4`), next-intl, Supabase JS, `tsx` for test scripts (no test framework).

**Spec:** The audit report at https://claude.ai/code/artifact/d89501a0-e49d-4c4f-8084-d35e98cbc180 — the `ux` and `correctness` findings.

## Global Constraints

- **TypeScript strict, zero `any`.** `npx tsc --noEmit` clean after every task.
- **`messages/ar.json` and `messages/en.json` stay key-identical** — `msg-parity` fails the build otherwise. Exactly **one** new key exists in this whole plan: `analysis.sectionEmpty`. If you find yourself adding more, check whether an existing key fits first.
- **No new error codes are needed anywhere in this plan.** Every response these fixes produce already resolves through `KNOWN_ERROR_CODES`: `rate_limited`, `validation_error`, `generation_parse_failed`, `prompt_blocked`, `refund_failed`.
- **No Arabic literals in `.tsx`** (`no-arabic-literals-in-tsx`); **RTL logical properties** (`rtl-logical-properties`); **CSS variables for colour**.
- **Commit after every task.**

## Corrections to the audit — do not repeat these claims

- **`storyboard`'s `PromptBlockedError` handler is NOT dead code.** `buildStoryboardPrompt` **does** call `sanitizePrompt` (`lib/ai/prompts/storyboard.ts:17`), so the handler is reachable. This is not the `plan.ts` case. The real defects at that site are different — the filter runs after the reservation, and `style`/`platform`/`brandKitName` are unfiltered — and they belong to the **security plan, Task 1**. Writing the original claim into a changelog would put a falsehood in a repo whose stated rule is that a ✅ must name a `file:line`.
- **The prompt-builder "phantom studios" claim is unverified.** The two output types produce prompts with nowhere obvious to go, but the claim that they *link* to non-existent studios did not survive checking. Task 13 investigates before changing anything.

## Facts established during research — do not re-derive

- **The atomic throttle already exists.** `lib/throttle.ts:22-38` exports `consumeAttempt(key, max, windowMinutes)`, backed by migration 039's RPC and generalised by 043. `consume_login_attempt` is already typed in `lib/supabase/types.ts:449-464`, so `.rpc()` compiles. **No migration is needed** — Task 1 is a code change.
- `'rate_limited'` is already in `KNOWN_ERROR_CODES` with messages in both locales.
- `app/api/studios/edit/route.ts:51-70` and `photoshoot/route.ts:51-70` are **byte-identical** copies of `readableImageUrl` + `inputImageRef` — only the comments differ. The security plan's Task 3 extracts them to `lib/storage/reference-image.ts`; creator becomes the third importer here.
- The `printable` leaf (`z.union([...]).transform(String).catch('')`) is duplicated verbatim in `analysis/route.ts:41-44` and `storyboard/route.ts:40-43`.
- **Three findings are provable by the compiler alone.** Removing `watermark` from `VoiceoverCostConfig` and deleting the eight dead `*_PROMPT_VERSION` exports are self-verifying: if "zero readers" is wrong, `tsc` names the reader.

---

### Task 1: Replace the last check-then-act throttle with the atomic one that already exists

**Files:**
- Modify: `lib/rate-limit.ts` (the whole file)
- Modify: `app/api/waitlist/route.ts:39`, `app/api/support/route.ts:46`, `app/api/client-errors/route.ts:60`
- Create: `scripts/tests/rate-limit-parallel.ts`

**Interfaces:**
- Consumes: `consumeAttempt(key, max, windowMinutes)`, `ipBucket()`, `clientIp()` from `lib/throttle.ts` — all already exist.

**The defect.** `lib/rate-limit.ts:11` is the **only** throttle in front of all nine studios and it is a
`SELECT`-then-act count: two round trips, no row lock. `checkKeyedRateLimit` at `:54-94` is the identical
defect one function below, **plus** an explicit `catch { return true }` that **fails OPEN**, **plus**
`getRequestIp()` at `:97-103` reading the **leftmost** `x-forwarded-for` entry — the attacker-chosen one.

That leftmost-XFF read is **defect #3 from migration 039's own header, still live in this file.** Its
three callers are all unauthenticated: waitlist, support, client-errors — exactly the surface 039 was
written for.

- [ ] **Step 1: Read the existing atomic wrapper and its two established callers**

```bash
sed -n '1,80p' lib/throttle.ts
sed -n '145,180p' app/api/auth/recover/route.ts
sed -n '55,75p' lib/admin/auth.ts
```

Note the caller shape: `try { await consumeAttempt(...) } catch { → 429 }`, with a `console.error` and an
explicit *"fails CLOSED"* comment. `consumeAttempt` **throws** rather than returning `false`, deliberately,
so the caller decides.

- [ ] **Step 2: Convert `checkRateLimit`**

Rewrite it over `consumeAttempt`, keyed on the user id. Read the current limit and window out of the
existing implementation and keep them **exactly the same** — this task changes the mechanism, not the
policy. Changing both at once makes a rate-limit regression indistinguishable from a mechanism bug.

**It must fail CLOSED.** The current studio limiter's whole purpose is being the only throttle in front
of nine paid studios; a limiter that opens under database pressure is not a limiter.

- [ ] **Step 3: Convert `checkKeyedRateLimit` and delete the leftmost-XFF reader**

Replace its body with `consumeAttempt(\`waitlist:${ipBucket(clientIp(request))}\`, 5, 1)` and the
equivalents for support (3/min) and client-errors (20/min) — read each caller for its actual numbers.

Delete `getRequestIp()`, `createRateLimitStoreClient()`, the `RateLimitRecord` interface and the
`system_settings` counter writes. `system_settings` is read on **every** studio request via
`getCachedFeatureFlags()`; migration 039's header names that as a reason it moved off that table.

The `catch { return true }` fail-open goes with them.

- [ ] **Step 4: Verify nothing still reads the old machinery**

```bash
grep -rn "getRequestIp\|RateLimitRecord\|createRateLimitStoreClient" app/ lib/
```

Expected: no output.

Run: `npx tsc --noEmit` — no output.

- [ ] **Step 5: Write the parallel proof**

Create `scripts/tests/rate-limit-parallel.ts` firing **25 genuinely parallel** `checkRateLimit` calls for
one user against a cap of 5, asserting **exactly 5** are allowed. This is the same proof migration 039
was signed off with.

It needs the live database, so it is **NOT** a `prebuild` gate — register it like `test:logo-parity`:

```json
"test:rate-limit": "npx tsx scripts/tests/rate-limit-parallel.ts",
```

- [ ] **Step 6: Run it**

Run: `npm run test:rate-limit`
Expected: exactly 5 allowed of 25. **A check-then-act limiter passes a sequential test and fails this
one** — that is the entire point of running it in parallel.

- [ ] **Step 7: Verify the unauthenticated surfaces still work**

Submit the waitlist form and the contact form once each — they must succeed. Then submit past the cap and
confirm a 429.

- [ ] **Step 8: Commit**

```bash
git add lib/rate-limit.ts app/api/waitlist/route.ts app/api/support/route.ts app/api/client-errors/route.ts scripts/tests/rate-limit-parallel.ts package.json
git commit -m "fix(rate-limit): atomic throttle everywhere, failing closed, reading the nearest hop

lib/rate-limit.ts was the last SELECT-then-act limiter in the codebase and the only
throttle in front of all nine studios. checkKeyedRateLimit additionally failed OPEN
and keyed on the leftmost x-forwarded-for entry — the attacker-chosen one, and
defect #3 from migration 039's own header. Proved with 25 parallel calls against a
cap of 5."
```

---

### Task 2: Campaign's work survives a reload

**Files:**
- Modify: `lib/studios/text-output.ts`
- Modify: `app/api/generations/route.ts`, `app/api/generations/[id]/route.ts`
- Modify: `app/[locale]/(dashboard)/campaign/page.tsx`
- Create: `scripts/tests/retrievable-output.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `RETRIEVABLE_STUDIOS`, `isRetrievableStudio()`, `stripInlineImages()`, `MAX_RETRIEVABLE_OUTPUT_BYTES` from `lib/studios/text-output.ts`.

**The defect.** A campaign's nine Arabic captions, hooks, hashtag sets and schedules live **only** in
`generations.output`. `TEXT_STUDIOS` excludes campaign, so `/api/generations` filters it out and the
detail route refuses it by name — on the reasoning, stated in that file's own header, that campaign
"produces files… so their work survives a reload". With **"Generate All Images" unchecked**, zero asset
rows are written and 3 credits of strategy vanish on refresh.

**The trap the naive fix walks into.** The detail route refuses image studios because their `output`
carries 904 kB – 2.8 MB of base64. Campaign's output is **not reliably small**:
`lib/storage/persist-image.ts` hands back a base64 `data:` URL on four degradation paths (`:137` both
branches, `:149`, `:170`). Adding campaign to the list without stripping those reintroduces exactly the
multi-megabyte response the refusal exists to prevent.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/retrievable-output.test.ts`:

```ts
/**
 * Proof that a retrievable output can never be a multi-megabyte response.
 *
 *   npx tsx scripts/tests/retrievable-output.test.ts
 *
 * The detail route refuses the image studios because their `output` holds
 * 904 kB - 2.8 MB of base64. Campaign is being ADDED to the retrievable set, and
 * its output carries an imageUrl per post that lib/storage/persist-image.ts fills
 * with a base64 data: URL on four degradation paths. stripInlineImages() is the
 * guard that makes the addition safe.
 *
 * The rule is stated on the VALUE, not on the key name `imageUrl` — a blacklist of
 * key names is the same shape of mistake as migration 038 v1's blacklist on OLD,
 * which a NULL hop walked straight through.
 */
import {
  MAX_RETRIEVABLE_OUTPUT_BYTES,
  RETRIEVABLE_STUDIOS,
  isRetrievableStudio,
  stripInlineImages,
} from '../../lib/studios/text-output';

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ---- The set. ----
check('campaign is retrievable', isRetrievableStudio('campaign'), true);
check('plan is retrievable', isRetrievableStudio('plan'), true);
check('analysis is retrievable', isRetrievableStudio('analysis'), true);
check('storyboard is retrievable', isRetrievableStudio('storyboard'), true);
check('creator is NOT retrievable', isRetrievableStudio('creator'), false);
check('photoshoot is NOT retrievable', isRetrievableStudio('photoshoot'), false);
check('edit is NOT retrievable', isRetrievableStudio('edit'), false);
check('voiceover is NOT retrievable', isRetrievableStudio('voiceover'), false);
check('an unknown studio is NOT retrievable', isRetrievableStudio('nope'), false);
check('the set has exactly four members', RETRIEVABLE_STUDIOS.length, 4);

// ---- The stripper, stated on the value. ----
{
  const out = stripInlineImages({ posts: [{ caption: 'مرحبا', imageUrl: 'data:image/png;base64,AAAA' }] }) as {
    posts: { caption: string; imageUrl: string | null }[];
  };
  check('an inline image becomes null', out.posts[0].imageUrl, null);
  check('the caption survives', out.posts[0].caption, 'مرحبا');
}
{
  const url = 'https://pixoradb.pyramedia.cloud/storage/v1/object/public/generated/a.png';
  const out = stripInlineImages({ posts: [{ imageUrl: url }] }) as { posts: { imageUrl: string }[] };
  check('an https image survives', out.posts[0].imageUrl, url);
}
{
  // The key name must be irrelevant — a future studio may call it something else.
  const out = stripInlineImages({ thumb: 'data:image/jpeg;base64,BBBB', nested: { deep: ['data:image/png;base64,CC'] } }) as {
    thumb: string | null;
    nested: { deep: (string | null)[] };
  };
  check('a differently-named inline image is stripped', out.thumb, null);
  check('an inline image nested in an array is stripped', out.nested.deep[0], null);
}
{
  check('null survives', stripInlineImages(null), null);
  check('a number survives', stripInlineImages(42), 42);
  check('a boolean survives', stripInlineImages(true), true);
}

// ---- The second, independent ceiling. ----
check('the byte ceiling is 256 kB', MAX_RETRIEVABLE_OUTPUT_BYTES, 256 * 1024);
{
  // A stripped campaign of nine posts must sit far under the ceiling.
  const posts = Array.from({ length: 9 }, (_, i) => ({
    scenario: 'x'.repeat(400), caption: 'ن'.repeat(400), tov: 'y'.repeat(120),
    schedule: 'z'.repeat(80), hashtags: '#a '.repeat(30), imageUrl: `data:image/png;base64,${'A'.repeat(50_000)}`,
  }));
  const stripped = JSON.stringify(stripInlineImages({ posts }));
  checks++;
  if (Buffer.byteLength(stripped, 'utf8') >= MAX_RETRIEVABLE_OUTPUT_BYTES) {
    failures++;
    console.log('FAIL  a stripped nine-post campaign must fit well under the ceiling');
  }
}

if (failures > 0) {
  console.log(`\n[retrievable-output] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[retrievable-output] ${checks} checks passed`);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/tests/retrievable-output.test.ts`
Expected: FAIL — the exports do not exist.

- [ ] **Step 3: Add the retrievable set and the stripper**

Append to `lib/studios/text-output.ts` (keeping `TEXT_STUDIOS` — the two lists answer different questions):

```ts
/**
 * Every studio a customer can reopen from history.
 *
 * `campaign` belongs here and NOT in TEXT_STUDIOS, because the two lists answer
 * different questions. Its nine Arabic captions live only in `generations.output`
 * — with "Generate All Images" unchecked the route writes zero `assets` rows, so a
 * reload destroyed 3 credits of strategy exactly the way it destroyed a plan. But
 * its output also carries an `imageUrl` per post, and lib/storage/persist-image.ts
 * hands back a base64 `data:` URL on four degradation paths (:137 BOTH branches,
 * :149, :170) — so unlike the three above, this row is not reliably small.
 * `stripInlineImages()` is what makes it safe to serve; adding campaign here
 * without it reintroduces exactly the multi-megabyte response the detail route was
 * written to refuse.
 */
export const RETRIEVABLE_STUDIOS = ['plan', 'analysis', 'storyboard', 'campaign'] as const;

export type RetrievableStudio = (typeof RETRIEVABLE_STUDIOS)[number];

export function isRetrievableStudio(value: string): value is RetrievableStudio {
  return (RETRIEVABLE_STUDIOS as readonly string[]).includes(value);
}

/**
 * A stored `output` is only ever served after this. Any string value that is an
 * inline `data:` payload becomes null.
 *
 * Stated on the VALUE, not on the key name `imageUrl`: the rule has to hold for
 * whatever a future studio calls its image field, and a blacklist of key names is
 * the same shape of mistake as migration 038 v1's blacklist on OLD. The bytes are
 * already reachable through `assets` and the files page, so a null here costs a
 * thumbnail, never the deliverable.
 */
export function stripInlineImages(value: unknown): unknown {
  if (typeof value === 'string') return value.startsWith('data:') ? null : value;
  if (Array.isArray(value)) return value.map(stripInlineImages);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = stripInlineImages(v);
    return out;
  }
  return value;
}

/**
 * Second, independent ceiling on one detail response. `stripInlineImages` covers
 * the only unbounded source known TODAY; this covers the one nobody has thought of
 * yet. 256 kB is ~50x the largest legitimate text deliverable measured (a
 * 14-credit storyboard) and ~1/10th of the smallest blob the route refuses.
 */
export const MAX_RETRIEVABLE_OUTPUT_BYTES = 256 * 1024;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx scripts/tests/retrievable-output.test.ts` — passes.

- [ ] **Step 5: Point both API routes at the new set**

In `app/api/generations/route.ts`, change `.in('studio', TEXT_STUDIOS)` to `RETRIEVABLE_STUDIOS` and the
guard from `isTextStudio` to `isRetrievableStudio`.

In `app/api/generations/[id]/route.ts`, change the refusal to `isRetrievableStudio`, and — **before
returning** — pass the output through `stripInlineImages` and refuse with the same not-found shape if the
serialised result still exceeds `MAX_RETRIEVABLE_OUTPUT_BYTES`.

**Keep the not-found/not-yours responses identical.** That route answers both the same way on purpose, so
it cannot be used to probe which ids exist.

- [ ] **Step 6: Mount `RecentWork` on the campaign page**

Copy the pattern from `plan/page.tsx:141`, `analysis/page.tsx:132` and `storyboard/page.tsx:141`. The
restore callback sets the posts state.

Reuse the existing i18n keys those three pages use for the history panel — check before adding any.

- [ ] **Step 7: Register the test and verify**

Add `"test:retrievable-output": "npx tsx scripts/tests/retrievable-output.test.ts",` and append it to
`prebuild`.

Run: `npx tsc --noEmit`, `npm run check:invariants` — clean.

- [ ] **Step 8: Verify live, including the path that motivated it**

Generate a campaign with **"Generate All Images" unchecked** (3 credits). Reload. The nine posts must be
retrievable from the history panel. Then generate one **with** images and confirm the detail response is
small — check the response size in the network tab, not by eye.

- [ ] **Step 9: Commit**

```bash
git add lib/studios/text-output.ts app/api/generations "app/[locale]/(dashboard)/campaign/page.tsx" scripts/tests/retrievable-output.test.ts package.json
git commit -m "fix(campaign): make a campaign's posts survive a reload, without shipping inline images"
```

---

### Task 3: Restoring a past run restores its inputs too

**Files:**
- Modify: `components/shared/RecentWork.tsx`
- Modify: `app/[locale]/(dashboard)/{analysis,storyboard,plan,campaign}/page.tsx`

**Interfaces:**
- Produces: `RecentWork`'s `onRestore` widens from `(output: Record<string, unknown>) => void` to `(output: Record<string, unknown>, input: Record<string, unknown>) => void`.

**The defect.** `onRestore` hands back only `output`. So a restored analysis is **exported under whatever
business name is currently typed in the form** — `analysis/page.tsx:175` passes the live `businessName`
state into `generateAnalysisPdf`, and `lib/export/pdf.ts:177` interpolates it straight into the document
H1. Storyboard has the identical defect at `:141`/`:165`.

- [ ] **Step 1: Read the component and every call site**

```bash
cat -n components/shared/RecentWork.tsx
grep -rn "RecentWork" "app/[locale]/(dashboard)"
```

- [ ] **Step 2: Widen the callback**

`GET /api/generations` already returns `input` in its select — confirm with
`grep -n "select(" app/api/generations/route.ts`. If it does, `RecentWork` already has the data and only
needs to pass it on. If it does not, add `input` to the select.

Change the prop type and the call:

```ts
  /** The row's stored `input` alongside its `output`. Restoring only the output
   *  meant a restored run was exported under whatever was currently typed in the
   *  form — the PDF's H1 came from live component state, not from the row. */
  onRestore: (output: Record<string, unknown>, input: Record<string, unknown>) => void;
```

- [ ] **Step 3: Rehydrate the form fields at each call site**

In `analysis/page.tsx`, set `businessName` — and `industry`, `description`, `targetMarket` while you are
there, so a restored run can be **re-run**, not just re-read.

In `storyboard/page.tsx`, set `concept` and the other inputs.

In `plan/page.tsx` and `campaign/page.tsx`, do the same. Plan has no PDF export today (Task 5 adds one),
so rehydrating there is about re-running rather than about export correctness.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — no output. The widened signature makes every call site a compile error until
updated, which is the point.

Run: `npm run lint` — clean.

- [ ] **Step 5: Verify the exact defect is gone**

Type one business name into the analysis form, restore a **different** past analysis from history, and
export the PDF. The H1 must name the **restored** run, not what is in the form.

- [ ] **Step 6: Commit**

```bash
git add components/shared/RecentWork.tsx "app/[locale]/(dashboard)"
git commit -m "fix(history): restore a run's inputs, not just its output"
```

---

### Task 4: The competitor-analysis PDF contains competitors

**Files:**
- Modify: `lib/export/pdf.ts` (`:65` is already typed; `:143-181` builds the fragments)

**The defect.** `generateAnalysisPdf` builds `swotHtml`, `personasHtml`, `roadmapHtml` and `kpisHtml`, and
interpolates exactly those four at `:179`. `competitors` is declared in the `AnalysisData` interface at
`:65` and **rendered nowhere**. The studio is called تحليل المنافسين. It exports the KPIs block — which is
the half-broken one — and omits the competitors the customer can see on screen.

- [ ] **Step 1: Read the existing fragment builders and the on-screen renderer**

```bash
sed -n '140,185p' lib/export/pdf.ts
sed -n '175,190p' "app/[locale]/(dashboard)/analysis/page.tsx"
```

The PDF fragment must match what `analysis/page.tsx:179` renders — `name`, `market_share`, `strengths`,
`weaknesses` — so the export and the screen agree.

- [ ] **Step 2: Build `competitorsHtml` in the established style**

Follow the exact shape of `swotHtml` / `personasHtml` — same guard (`hasContent(...)`), same table or card
markup, same class names. Do not introduce a new layout idiom for one section.

- [ ] **Step 3: Interpolate it**

At `:179`, add `${competitorsHtml}` — placed **first**, before SWOT, because it is the section the studio
is named for.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — no output.
Run: `grep -n "competitorsHtml" lib/export/pdf.ts` — the builder and the interpolation.

- [ ] **Step 5: Verify live, in both locales**

Generate an analysis, export the PDF, and confirm the competitors section is present, populated, and
RTL-correct in Arabic. Then export one whose model output has **no** competitors and confirm the section
is omitted cleanly rather than rendering an empty shell.

- [ ] **Step 6: Commit**

```bash
git add lib/export/pdf.ts
git commit -m "fix(export): the competitor-analysis PDF now contains the competitors"
```

---

### Task 5: The plan studio gets an export

**Files:**
- Modify: `lib/export/pdf.ts` (add `generatePlanPdf`)
- Modify: `app/[locale]/(dashboard)/plan/page.tsx`

**The defect.** There is **no** `generatePlanPdf`. A 5-credit plan can be read on screen and nowhere else.
Analysis and storyboard both export.

- [ ] **Step 1: Read the two existing generators as templates**

```bash
grep -n "export function generateAnalysisPdf\|export function generateStoryboardPdf\|openPdfInNewTab\|wrapInHtml" lib/export/pdf.ts
```

- [ ] **Step 2: Write `generatePlanPdf`**

Render the four sections the page actually shows — `objectives`, `channels`, `calendar`, `budget` — in the
same fragment style, guarded by `hasContent`.

**Include `kpis` only if you also add its tab in Task 6's spirit.** Exporting a section the screen does not
show recreates, in reverse, the exact defect Task 4 fixes. Choose one and say which in the commit.

- [ ] **Step 3: Add the export button**

Copy the button placement and i18n key from `analysis/page.tsx`. Check whether a shared export key exists
before adding a new one.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`, `npm run check:invariants` — clean.
Generate a plan, export it, and check both locales. Arabic must render RTL with the numerals reading
correctly.

- [ ] **Step 5: Commit**

```bash
git add lib/export/pdf.ts "app/[locale]/(dashboard)/plan/page.tsx"
git commit -m "feat(plan): export a plan as PDF, like analysis and storyboard already do"
```

---

### Task 6: Analysis tells the truth about what the model returned

**Files:**
- Modify: `lib/ai/prompts/analysis.ts` (~`:40`)
- Modify: `app/[locale]/(dashboard)/analysis/page.tsx` (~`:146`)
- Modify: `messages/ar.json`, `messages/en.json` (one new key)

**⚠ Ordering:** the prompt fix must land **before or with** the empty-section message, or the KPIs tab
renders cards with blank headline numbers rather than an honest "this section is missing" panel.

**The defects.** The analysis prompt asks for KPI keys that **neither the schema, the page, nor the PDF
read**, so every KPI card renders a blank headline number. And the default tab renders a **blank panel
with no message** when the model omits SWOT — which the route's own completeness gate explicitly permits.

- [ ] **Step 1: Establish the three-way disagreement**

```bash
sed -n '35,50p' lib/ai/prompts/analysis.ts
sed -n '55,100p' app/api/studios/analysis/route.ts
sed -n '140,200p' "app/[locale]/(dashboard)/analysis/page.tsx"
```

Write down, for KPIs, what the **prompt asks for**, what the **schema parses**, and what the **page
reads**. Those three must end up identical.

- [ ] **Step 2: Make the prompt ask for the keys the page reads**

Change the KPI field names in the prompt to match the schema and the page. If the page reads
`{ metric, target, tracking }`, ask for exactly those.

- [ ] **Step 3: Add the empty-section panel**

Add **one** key to both message files:

- ar: `هذا القسم ما رجع من بايرا هالمرة. جرّب تولّد مرة ثانية.`
- en: `Pyra didn't return this section this time. Try generating again.`

Key: `analysis.sectionEmpty`. **Both files in the same commit** or `msg-parity` fails the build.

Render it in each tab whose section is empty — including the default SWOT tab — instead of a blank panel.

- [ ] **Step 4: Verify**

Run: `npm run check:invariants` — `msg-parity` and `no-arabic-literals-in-tsx` must pass.
Run: `npx tsc --noEmit` — no output.

- [ ] **Step 5: Verify both states live**

Generate an analysis and confirm the KPI cards show real numbers. Then temporarily stub the route to
return an analysis with no `swot` and confirm the default tab shows the message rather than a blank panel.
Revert the stub.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/prompts/analysis.ts "app/[locale]/(dashboard)/analysis/page.tsx" messages/ar.json messages/en.json
git commit -m "fix(analysis): ask for the KPI keys the page reads, and say when a section is missing"
```

---

### Task 7: Storyboard stops truncating its own deliverable

**Files:**
- Modify: `app/[locale]/(dashboard)/storyboard/page.tsx:182`

**The defect.** A 14-credit storyboard — the most expensive text deliverable — is truncated to **80
characters** on screen, with an ellipsis appended **unconditionally**, so even a 40-character line reads as
though something was cut.

- [ ] **Step 1: Read the exact JSX**

Run: `sed -n '176,190p' "app/[locale]/(dashboard)/storyboard/page.tsx"`

- [ ] **Step 2: Show the whole field**

Remove the truncation. If the layout genuinely needs a bound, use CSS (`line-clamp`) so the full text stays
selectable, copyable and present for the PDF export — never a substring in the data path.

If a truncation is kept anywhere, the ellipsis must be **conditional** on the string actually being longer.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`, `npm run check:invariants` — clean.
Generate a storyboard and confirm every scene's full text is visible and selectable, in both locales.

- [ ] **Step 4: Commit**

```bash
git add "app/[locale]/(dashboard)/storyboard/page.tsx"
git commit -m "fix(storyboard): stop truncating the 14-credit deliverable to 80 characters"
```

---

### Task 8: Campaign raises maxTokens, and one bad post stops destroying nine

**Files:**
- Modify: `app/api/studios/campaign/route.ts` (`:238` and `:241-270`)

**These are ONE edit and causally linked.** Raising `maxTokens` makes a truncated-but-mostly-valid response
arrive; the per-post filter is what turns that arrival into eight delivered posts instead of a full refund.
Shipping the filter without the token raise leaves the studio failing at the JSON boundary instead of the
schema boundary.

- [ ] **Step 1: Establish what the other text routes pass**

Run: `grep -n "maxTokens" app/api/studios/*/route.ts`

Campaign is the only multi-item text studio at the 4096 default. Nine Arabic posts × five fields do not fit.

- [ ] **Step 2: Raise it**

Match the highest of its peers (storyboard/analysis pass 8192 — confirm), with a comment:

```ts
      // Nine posts x five fields of Arabic does not fit in the 4096 default, so a
      // full-length campaign truncated mid-JSON and the whole 12-credit run failed
      // to parse. Every other multi-item text studio already raises this.
      maxTokens: 8192,
```

- [ ] **Step 3: Filter per post instead of failing the batch**

`posts = arr.map(p => CampaignPostSchema.parse(p))` throws on the **first** malformed entry, discarding
eight good posts. Change to a per-post filter:

```ts
      // One malformed post out of nine used to destroy the whole campaign: .map()
      // throws on the first bad entry and the catch below refunds everything. The
      // partial-refund path at :373-392 was built for exactly this — it sizes the
      // refund from EXPECTED_POSTS minus what arrived — so dropping a bad post pays
      // the customer back for it and delivers the eight that are good.
      posts = arr
        .slice(0, EXPECTED_POSTS)
        .map((p: unknown) => {
          const parsed = CampaignPostSchema.safeParse(p);
          return parsed.success ? parsed.data : null;
        })
        .filter((p): p is z.infer<typeof CampaignPostSchema> => p !== null);
      if (posts.length === 0) throw new Error('campaign returned no usable posts');
```

The `.slice(0, EXPECTED_POSTS)` is the money-correctness plan's image cap — if that plan has already
landed, it is already there; keep it either way.

- [ ] **Step 4: Confirm the refund arithmetic pays for the dropped posts**

Run: `grep -n "missingPosts\|EXPECTED_POSTS\|refundAmount" app/api/studios/campaign/route.ts`

`missingPosts = Math.max(0, EXPECTED_POSTS - posts.length)` now counts the dropped ones, so the existing
partial refund covers them. **No change to the arithmetic** — verify that by reading, and say so in the
commit.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`, `npm run check:invariants` — clean.
Generate a full nine-post campaign in Arabic and confirm it completes without a parse failure.

- [ ] **Step 6: Commit**

```bash
git add app/api/studios/campaign/route.ts
git commit -m "fix(campaign): raise maxTokens, and drop a malformed post instead of the whole run"
```

---

### Task 9: Campaign says something when every image fails

**Files:**
- Modify: `components/studios/campaign/CampaignPlanDisplay.tsx` (~`:142`, and `:52` for the clipboard)
- Modify: `app/api/studios/campaign/route.ts` (response only, if the refund figure is not already returned)
- Modify: `messages/ar.json`, `messages/en.json` if no suitable key exists

**The defects.** When every campaign image fails, **9 credits are refunded** and the screen says nothing —
nine empty tiles inviting the customer to regenerate elsewhere. And **Copy / Copy All silently do nothing**
when the clipboard write rejects, in the studio whose entire deliverable is text to be copied.

- [ ] **Step 1: Check what the route already returns**

Run: `grep -n "refunded\|creditsUsed\|failedImageCount" app/api/studios/campaign/route.ts`

If the response already carries the refunded amount, the fix is UI-only.

- [ ] **Step 2: Tell the customer what happened**

When every image is null, render a message stating the images could not be generated **and that the credits
for them were returned** — not a generic error. Reuse an existing key if one fits; check the `campaign` and
`studio` namespaces first.

- [ ] **Step 3: Make Copy report its own failure**

`navigator.clipboard.writeText` rejects on an insecure context, a permissions denial, or a background tab.
Both call sites ignore the rejection.

Find the toast helper already in use (`grep -rn "toast" components/studios/`) and reuse it — on success and
on failure. A copy button that does nothing and says nothing is worse than no button.

- [ ] **Step 4: Verify**

Run: `npm run check:invariants` — `msg-parity`, `no-arabic-literals-in-tsx` pass.
Run: `npx tsc --noEmit` — no output.

Force the all-images-failed path (temporarily make `generateImage` throw) and confirm the message renders
and names the refund. Revert.

Deny clipboard permission in the browser and confirm Copy reports a failure.

- [ ] **Step 5: Commit**

```bash
git add components/studios/campaign/CampaignPlanDisplay.tsx app/api/studios/campaign/route.ts messages/ar.json messages/en.json
git commit -m "fix(campaign): say when every image failed and the credits came back, and when a copy fails"
```

---

### Task 10: The Generate button agrees with the route's schema

**Files:**
- Modify: `app/[locale]/(dashboard)/plan/page.tsx:83`
- Modify: `app/[locale]/(dashboard)/analysis/page.tsx` (the same mismatch)

**The defect.** Generate is enabled with an empty `industry`, which the route **requires** — so the customer
gets an instant 400 naming no field. Research found the same enable-gate/schema mismatch on **analysis**,
and confirmed the other seven studios are consistent.

- [ ] **Step 1: Compare each gate to its schema**

```bash
grep -n "isValid" "app/[locale]/(dashboard)/plan/page.tsx" "app/[locale]/(dashboard)/analysis/page.tsx"
grep -n "InputSchema" -A 12 app/api/studios/plan/route.ts app/api/studios/analysis/route.ts
```

Write down every required field and whether the gate checks it.

- [ ] **Step 2: Make the gate match**

Add the missing fields to each `isValid` expression, with the same minimum lengths the schema enforces —
`industry` must be non-empty on both.

- [ ] **Step 3: Name the field when it is missing**

A disabled button with no explanation is its own dead end. Either mark the required field visibly, or show
which field is missing next to the button. Reuse an existing validation key if one exists.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`, `npm run lint` — clean.
Open the plan form, fill everything except industry, and confirm Generate stays disabled and the reason is
visible. Then fill it and confirm the request succeeds.

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(dashboard)/plan/page.tsx" "app/[locale]/(dashboard)/analysis/page.tsx"
git commit -m "fix(forms): the Generate gate now matches what the route requires"
```

---

### Task 11: Voiceover stops selling a speed the premium engine rejects

**Files:**
- Modify: `lib/ai/elevenlabs.ts` (~`:100`) or `app/[locale]/(dashboard)/voiceover/page.tsx`
- Modify: `lib/ai/tts-router.ts` (~`:122`)

**The defects.** **0.5× and 1.5× speed are offered only to paying plans and are outside ElevenLabs'
accepted range**, so the premium path dead-ends on a message that blames the *voice*. And the
dialect/tone rewrite fails into a **bare `catch {}`** — the customer pays the premium rate, receives a
plain reading of their original text, and nothing says so.

- [ ] **Step 1: Establish the accepted range**

Run: `sed -n '90,115p' lib/ai/elevenlabs.ts`

Record what the provider accepts and what the UI offers.

- [ ] **Step 2: Decide, and make the two agree**

Two honest shapes — pick one and say which in the commit:
- **Clamp** the requested speed into the accepted range before the call, and disclose it, or
- **Stop offering** the out-of-range options on plans routed to ElevenLabs.

Do **not** leave the UI selling something the engine refuses.

- [ ] **Step 3: Stop swallowing the rewrite failure**

`tts-router.ts:122`'s bare `catch {}` returns `{ text: script, enhanced: false }` — indistinguishable from
"nothing to enhance". Log the failure and let `enhanced: false` reach the customer as a visible notice.

**The security plan's Task 4 and the marketing plan's Task 9 both edit this function.** If either has
landed, extend rather than replace. `TTSResult.enhanced` already exists; check whether any UI reads it and
surface it if not.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — no output.
Generate a premium voiceover at each offered speed — every one must succeed. Then force the rewrite to fail
and confirm the customer is told the dialect was not applied.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/elevenlabs.ts lib/ai/tts-router.ts "app/[locale]/(dashboard)/voiceover/page.tsx"
git commit -m "fix(voiceover): stop selling a speed the engine rejects, and disclose a failed rewrite"
```

---

### Task 12: The creator error panel stops hiding paid work

**Files:**
- Modify: `components/studios/creator/CreatorPreview.tsx` (~`:71`, `:96`)
- Modify: `components/studios/photoshoot/PhotoshootPreview.tsx` (~`:84`)
- Modify: `app/api/studios/edit/route.ts` (~`:178`)

**The defects.** The creator error panel **hides images the customer already paid for**, offers no dismiss,
and its only button **re-sends the identical request** — spending credits again on the same failure. And
download buttons always name the file `.png` while the bytes may be JPEG or WebP; photoshoot additionally
renumbers by **filtered index**, so filenames mismatch the on-screen badges.

- [ ] **Step 1: Show the work and the error together**

Read `CreatorPreview.tsx:60-90`. Render the error **beside** the successful variations, not instead of
them — a partial failure delivered three of four images and the customer paid for those three.

Give the panel a dismiss. Change the retry button so it is clearly a **new, paid** request, or remove it.

- [ ] **Step 2: Name downloads by their real format**

The export ZIP fix already solved this — find it: `grep -rn "formatFromUrl" lib/ app/ components/`

Reuse that helper in both preview components instead of hardcoding `.png`.

- [ ] **Step 3: Number photoshoot downloads by the true index**

`PhotoshootPreview.tsx:84` numbers by filtered index, so a filtered view produces `shot-1` for what the
badge calls shot 3. Use the shot's own index.

- [ ] **Step 4: Give edit's asset row a format**

`edit/route.ts:178` is the only image studio omitting `format` on its asset row, so **every** edit export is
named `.png`. Add `format: formatFromUrl(url)`, matching the other three studios.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`, `npm run check:invariants` — clean.

Run a 4-variation creator generation where some variations fail: the successes must remain visible.
Download from creator, photoshoot and the files page — **open each downloaded file** and confirm the
extension matches the actual bytes. Confirm photoshoot filenames match the on-screen badges under a filter.

- [ ] **Step 6: Commit**

```bash
git add components/studios app/api/studios/edit/route.ts
git commit -m "fix(previews): stop hiding paid work behind an error, and name downloads by their real format"
```

---

### Task 13: Prompt-builder tells the truth, and its row reflects reality

**Files:**
- Modify: `app/api/studios/prompt-builder/route.ts` (`:51`, `:81`)
- Modify: `app/[locale]/(dashboard)/prompt-builder/page.tsx:83` — **only if Step 1 confirms the claim**

**The defects.** The generation row is written **`'completed'` before the model runs**, and the outer catch
never corrects it. Model output is **never shape-validated** — any JSON array is returned as success.

- [ ] **Step 1: Investigate the unverified claim first**

The audit says two of the four output types point at studios that do not exist. **This did not survive
verification.** Establish the truth before changing anything:

```bash
sed -n '75,95p' "app/[locale]/(dashboard)/prompt-builder/page.tsx"
ls "app/[locale]/(dashboard)/"
```

If all four types correspond to real studios, **make no UI change** and record that the finding was refuted.
If any genuinely points nowhere, remove or repoint it.

- [ ] **Step 2: Validate the model's shape**

`:81` returns any JSON array as success. Add a Zod schema matching `{ prompt, style, tip }` and route a
mismatch into the existing parse-failure branch. The route charges **0 credits**, so this is about not
returning junk as success, not about money.

Task 1 of the output-and-localisation plan gives this route a response schema — this is the validation half.

- [ ] **Step 3: Stop writing `completed` before the work happens**

`:51` inserts the row already `completed`. That is deliberate — `check-invariants.ts:320-321` exempts
`.insert()` precisely because this route charges nothing and is never in the reconciler's window.

**So do not change the insert.** Change the **failure** path: when the parse fails, correct the row rather
than leaving it claiming success. Use `failGeneration(supabase, id, { creditsSettled: true }, 'prompt-builder')`
from the money-correctness plan — `creditsSettled: true` because nothing was ever charged.

If that plan has not landed, note the dependency and do the rest of this task.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`, `npm run check:invariants` — clean.
Run a prompt-builder generation and confirm it succeeds. Force a malformed response and confirm the customer
gets `generation_parse_failed` and the row does not read `completed`.

- [ ] **Step 5: Commit**

```bash
git add app/api/studios/prompt-builder/route.ts "app/[locale]/(dashboard)/prompt-builder/page.tsx"
git commit -m "fix(prompt-builder): validate the model's shape and stop rows claiming a success that failed"
```

---

### Task 14: Delete what quietly does nothing

**Files:**
- Modify: `lib/credits/voiceover-costs.ts:29`
- Modify: `lib/ai/prompts/versions.ts` and the eight prompt files

**Both claims are provable by the compiler.** If "zero readers" is wrong, `tsc` names the reader and the
finding was false. Run `tsc` first and treat a clean build as the evidence.

**The defects.** The free plan's voiceover `watermark: true` is a config field with **zero readers**, so
free-tier audio ships unmarked while the config claims otherwise. And `lib/ai/prompts/versions.ts` versions
nothing: every `*_PROMPT_VERSION` export has zero importers and no generation records a prompt version.

- [ ] **Step 1: Prove both claims**

```bash
grep -rn "watermark" lib/ app/ components/ --include=*.ts --include=*.tsx | grep -iv "image/watermark\|watermarkAndReupload\|maybeWatermark"
grep -rn "_PROMPT_VERSION" lib/ app/ --include=*.ts
grep -n "prompt_version" lib/supabase/types.ts
```

Record what each returns. If `generations` has **no** `prompt_version` column, versioning cannot be recorded
without a migration — which decides Step 3.

- [ ] **Step 2: Decide the voiceover watermark, honestly**

An audio watermark is real work (an audible tag or an inaudible mark) and is **not** in this plan's scope.
The dishonest state is a config field claiming a protection that does not exist.

**Recommended:** delete the `watermark` field from `VoiceoverCostConfig` and every plan entry, and record in
`CLAUDE.md` that free-tier audio ships unmarked. That is the same discipline `CLAUDE.md` already applies to
the image watermark, whose fail-closed behaviour is documented precisely because it once silently did nothing.

If you would rather build it, that is a separate plan — do not leave the field.

- [ ] **Step 3: Either wire prompt versions up or delete them**

If `generations` has a `prompt_version` column, pass the version at each `finalizeGeneration` and the
mechanism becomes real — genuinely useful now that the marketing plan bumps versions.

If it does not, **delete** the eight dead exports and `getPromptVersion`. A version constant nothing records
is a comment pretending to be a mechanism.

**Coordinate with the output-and-localisation plan**, which bumps these version strings. If that plan has
landed, wiring them up is the better half of this choice.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` — **no output is the proof.** Any error names a real reader and the finding was wrong.
Run: `npm run build` — clean.

- [ ] **Step 5: Commit**

```bash
git add lib/credits/voiceover-costs.ts lib/ai/prompts
git commit -m "chore: remove a watermark flag nothing reads and prompt versions nothing records"
```

---

### Task 15: Creator's reference image is validated like the other two studios'

**Files:**
- Modify: `app/api/studios/creator/route.ts` (`:27` schema, `:207` insert object)

**Interfaces:**
- Consumes: `readableImageUrl`, `inputImageRef` from `lib/storage/reference-image.ts` — **created by the security plan's Task 3.** Land that first.

**The defect.** Creator is the one image studio that never got the fix: `referenceImageUrl: z.string().url()`
accepts `blob:`, `http:` and `data:` — none of which the server can read for the first two, and unbounded for
the third — and it writes the **raw payload** into `generations.input` via a bare `...input` spread.

- [ ] **Step 1: Use the shared schema**

Replace `referenceImageUrl: z.string().url().optional()` with `referenceImageUrl: readableImageUrl.optional()`.

- [ ] **Step 2: Keep the payload out of the row**

At the insert (~`:207`), replace the bare `...input` spread with one that summarises the reference:

```ts
      input: { ...input, referenceImageUrl: input.referenceImageUrl ? inputImageRef(input.referenceImageUrl) : undefined },
```

**This is the same line the marketing plan's prompt-version work would touch.** If both are in flight,
sequence this one first and have the other add its key to the already-rewritten object.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — no output.
Run: `grep -n "referenceImageUrl" app/api/studios/creator/route.ts` — the schema uses `readableImageUrl` and
the insert uses `inputImageRef`.

Submit a creator generation with a `blob:` URL and confirm a clean **400**, not a 500 and not a request that
dies inside the model client. That silent-death path is the defect `CLAUDE.md` records as having made three
studios unusable with no message.

- [ ] **Step 4: Commit**

```bash
git add app/api/studios/creator/route.ts
git commit -m "fix(creator): validate the reference image like edit and photoshoot already do"
```

---

### Task 16: Run every gate and record what is true

- [ ] **Step 1: Run the full gate set**

```bash
npx tsc --noEmit && npm run lint && npm run check:invariants
npm run test:safety && npm run test:uploads && npm run test:plan-switch
npm run test:retrievable-output
npm run build
npm run test:rate-limit   # needs the live database — NOT a prebuild gate
```

- [ ] **Step 2: Walk all nine studios as a customer, in both locales**

For each: generate, reload, retrieve, export where offered, download where offered. This plan is about what
a customer can get back — the only proof is getting it back.

- [ ] **Step 3: Update `CLAUDE.md`**

Add a section in the established table style covering: the atomic throttle replacing the last check-then-act
limiter (with the parallel-proof result); campaign retrieval and the inline-image stripper; restored runs
carrying their inputs; the competitors section; the plan export; analysis telling the truth about missing
sections; storyboard's truncation; campaign's `maxTokens` and per-post filter; the dead ends; the download
formats; and whatever Task 14 decided about the voiceover watermark and prompt versions.

**Also record the two refutations** — `storyboard`'s `PromptBlockedError` handler is reachable, and the
prompt-builder phantom-studios claim did not survive — because this repo's rule is that a ✅ must name a
`file:line`, and a corrected claim is worth as much as a fixed defect.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the product-completeness round against verified output"
```

---

## Self-Review

**Spec coverage.** All 31 product-lens findings map to a task: rate limiting (1), campaign retrieval (2),
restore-with-inputs (3), competitors PDF (4), plan export (5), analysis KPIs + empty sections (6),
storyboard truncation (7), campaign maxTokens + per-post filter (8), campaign all-images-failed + clipboard
(9), form gates (10), voiceover speed + swallowed rewrite (11), creator error panel + download formats +
edit asset format (12), prompt-builder (13), dead watermark + dead versions (14), creator reference image (15).

**Two findings are handled as refutations, not fixes**, and are recorded as such in Task 16: storyboard's
`PromptBlockedError` handler is reachable, and the prompt-builder phantom-studios claim is investigated in
Task 13 Step 1 before any change.

**Cross-plan dependencies, all load-bearing:**
- Task 15 needs the **security plan's Task 3** (`lib/storage/reference-image.ts`).
- Task 13 Step 3 needs the **money-correctness plan's Task 1** (`failGeneration`).
- Task 11 Step 3 overlaps the **security plan's Task 4** and the **marketing plan's Task 9** — all three edit `enhanceScript`.
- Task 8's `.slice(0, EXPECTED_POSTS)` is the **money-correctness plan's** image cap.
- Task 6's prompt fix overlaps the **marketing plan's Task 2** — both edit `lib/ai/prompts/analysis.ts`.

**Type consistency.** `stripInlineImages(value: unknown): unknown`, `isRetrievableStudio(value: string)`,
`RETRIEVABLE_STUDIOS` and `MAX_RETRIEVABLE_OUTPUT_BYTES` are defined in Task 2 and consumed in Task 2's own
route edits. `onRestore(output, input)` is widened in Task 3 and every call site updated in the same task —
the compiler enforces this. `consumeAttempt`, `ipBucket`, `clientIp` already exist and are not redefined.
`formatFromUrl` already exists and is reused, not reimplemented.

**Placeholder scan.** Tasks 4, 5, 7, 9, 10, 11, 12 and 13 specify edits by required outcome plus the exact
command that reveals the current code, rather than by finished code. That is deliberate for UI work whose
current markup this plan has not seen line by line — and each names the file, the line, the acceptance
check, and where to find the pattern to copy. Tasks 1, 2, 3, 8, 14 and 15 carry real code.

**Two risks worth flagging.**
1. **Task 1 changes the failure mode of the studio throttle from open to closed.** That is correct — it is
   the only throttle in front of nine paid studios — but it means a database outage now blocks generation
   instead of allowing unlimited ones. That is the right trade and it should be a deliberate one.
2. **Task 2 widens what `/api/generations/[id]` will serve.** The stripper and the byte ceiling are two
   independent guards, and Step 8's live check on a campaign **with** images is what proves them. If that
   response is not small, stop and re-read `persist-image.ts` — it means a degradation path is producing
   inline images the stripper is not catching.
