# Studio Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every path by which unfiltered, unbounded text or an attacker-chosen URL reaches an AI model or a server-side fetch in the nine studios — and make the class self-policing so it cannot silently return.

**Architecture:** The filter is applied at the **prompt-builder layer**, not at the route's Zod schema, because three of the eight channels never pass through a request body at all (brand-kit columns come from a `SELECT`, campaign's image prompt comes from the text model's own output). Closed sets become `z.enum` rather than filtered strings, the two duplicated SSRF allowlists collapse into one exact-or-subdomain rule, and two new build invariants make both defects fail the build if reintroduced.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Zod 4.3.6 (`zod/v4`), Supabase JS, `tsx` for test scripts (no test framework).

**Spec:** The audit report at https://claude.ai/code/artifact/d89501a0-e49d-4c4f-8084-d35e98cbc180 — the seven `security` findings plus the `creator` brand-kit finding. Every requirement is restated inline; this plan is self-contained.

## Global Constraints

- **TypeScript strict, zero `any`.** `npx tsc --noEmit` clean after every task.
- **Zod from `zod/v4`**, never `zod`.
- **No new error codes are needed anywhere in this plan.** Verified against `lib/studio-errors.ts:1-24` and both message files: everything lands on `prompt_blocked` (already registered; its copy — `ما نقدر نولّد على كلمة "{term}"` — is phrased generically enough to cover a word that came from a brand kit rather than the prompt) or `validation_error` (already registered). **Therefore no `messages/ar.json` or `messages/en.json` edit is required and the `msg-parity` invariant is not in play.** If you find yourself adding a code, stop — you have diverged from the plan.
- **Build gates green after every task:** `npm run check:invariants`, `npm run test:safety`, `npm run test:uploads`, `npm run test:plan-switch`.
- **Commit after every task.**
- **Do not touch credit arithmetic.** Task 5 changes *which* image is dropped, never what is refunded.

---

## Background: why the filter goes in the builder, not the schema

The obvious fix for "free text reaches a model unfiltered" is a Zod transform at each route's
`InputSchema`, so a field cannot arrive unsanitized. That was evaluated by experiment against this
repo's actual zod 4.3.6, not reasoned about. The measured results:

```
S = z.object({ prompt: z.string().min(3).max(100).transform(v => sanitizePrompt(v, 100)), other: z.string() })

CLEAN     -> {"prompt":"hello world","other":"x"}   (trims + truncates)
BLOCKED   -> THREW PromptBlockedError | instanceof PromptBlockedError = true
                                      | instanceof z.ZodError = FALSE | term = "bomb"
SAFEPARSE -> ALSO THREW (safeParse does NOT return {success:false})
SHORT     -> ZodError (a failing prior check on the same field short-circuits the transform)
MIXED     -> blocked field + malformed other field => PromptBlockedError wins
DEFAULT   -> .transform(f).default('photographic'): the DEFAULT BYPASSES f
```

So a throw inside a zod v4 transform is **not** wrapped into a `ZodError` — it propagates unchanged,
the routes' catch order (`z.ZodError` first, `PromptBlockedError` second) still reaches the right arm,
and the `400 + term` response survives. **The schema-transform approach is not broken.**

It is still the wrong choice here, for one decisive reason: **a route `InputSchema` transform only
sees the request body.** Three of the eight channels never pass through one:

| Channel | Where it comes from |
|---|---|
| `brandKit.name`, `brand_voice`, colours | a Supabase `SELECT`, in the route |
| campaign `post.scenario` | the **text model's own output** |
| `style`, `concept`, `tone` | the request body — the only ones a transform would catch |

A schema transform would close three channels and leave the worst one open. The prompt builder is
where **all** channels converge, so that is where the rule belongs. Routes still sanitize before the
credit reservation (belt), and the builder sanitizes again (braces) — the pattern
`lib/ai/prompts/plan.ts:30-38` + `app/api/studios/plan/route.ts:136-140` already establishes.

### The finding behind the findings

`brand_kits` **never received a column-level GRANT lockdown.** Migration 022 covered `profiles` only;
migration 042 constrains `logo_url` alone. Every migration was grepped for a `REVOKE`/`GRANT`/`CHECK`
on `brand_kits` — there is none. So `authenticated` still holds Supabase's bootstrap `GRANT ALL`, and
a customer can `PATCH brand_kits.name` / `brand_voice` to an arbitrary unbounded string straight over
PostgREST, bypassing `app/api/brand-kits/route.ts:16`'s `max(100)` and `:23`'s `max(500)` entirely.

This is the **"RLS gates WHICH ROW, only a GRANT gates WHICH COLUMN"** class `CLAUDE.md` already names.
Tasks 1 and 2 cap and filter it at every read site, which is correct and sufficient for these findings.
**Task 6 closes the source.** Do not let the app-layer caps be recorded as having closed it.

---

## File Structure

**Created:**
- `lib/storage/reference-image.ts` — the shape a studio's reference image may take, stated once. Replaces byte-identical copies in two routes.
- `lib/ai/allowed-hosts.ts` — the SSRF allowlist and its matcher, stated once. Replaces two copies matched by bare suffix.
- `scripts/tests/image-host.test.ts` — pure string logic guarding an SSRF sink; a build gate.
- `scripts/tests/reference-image.test.ts` — the inline-payload ceiling; a build gate.
- `supabase/migrations/044_brand_kits_column_lockdown.sql` — closes the source of the brand-kit channel.

**Modified:**
- `lib/ai/prompts/creator.ts`, `lib/ai/prompts/storyboard.ts` — every interpolated value meets the filter.
- `app/api/studios/{creator,storyboard,voiceover,campaign}/route.ts` — bounded schemas, sanitize before the money moves.
- `lib/ai/gemini.ts`, `lib/image/watermark.ts` — one allowlist, one rule.
- `app/api/studios/{edit,photoshoot}/route.ts` — import the shared reference-image module.
- `lib/ai/tts-router.ts` — tone becomes a table lookup; the dead sanitizing import goes.
- `scripts/check-invariants.ts` — two new rules.
- `scripts/tests/safety.test.ts` — builder-level tables.

---

### Task 1: Every value the creator and storyboard prompts interpolate meets the filter

**Files:**
- Modify: `lib/ai/prompts/creator.ts:15-42`
- Modify: `app/api/studios/creator/route.ts:24`
- Modify: `lib/ai/prompts/storyboard.ts:15-28`
- Modify: `app/api/studios/storyboard/route.ts:11`, `:15-22`, `:99-134`
- Modify: `scripts/tests/safety.test.ts`

**Interfaces:**
- Consumes: `sanitizePrompt(value: string, maxLength?: number): string` and `PromptBlockedError` from `lib/ai/prompts/safety.ts:180` / `:114` — both already imported in all four files.
- Produces: `buildCreatorPrompt` and `buildStoryboardPrompt` keep their exact existing signatures. No caller changes.

Grouped because they are the same defect shape and share one test table.

- [ ] **Step 1: Write the failing test**

Append to `scripts/tests/safety.test.ts`, before its final `if (failures > 0)` block. Match the file's
existing `check`/`checks`/`failures` helper names — read the top of the file first and reuse them
rather than declaring new ones.

```ts
// ---------------------------------------------------------------------------
// Builder-level filtering: every value a prompt builder interpolates.
//
// sanitizePrompt() on `userPrompt` alone was never the rule — it was the only
// field anyone had got to. The brand-kit columns are the sharp edge: `brand_kits`
// has no column-level GRANT lockdown, so a customer can PATCH `name` and
// `brand_voice` to any string over PostgREST and the route's own Zod caps never
// run. These assert on the BUILT PROMPT, because that is the string that reaches
// the model — asserting on the schema would miss the SELECT-sourced fields
// entirely, which is how this stayed open.
// ---------------------------------------------------------------------------
{
  const { buildCreatorPrompt } = await import('../../lib/ai/prompts/creator');
  const { buildStoryboardPrompt } = await import('../../lib/ai/prompts/storyboard');
  const { PromptBlockedError } = await import('../../lib/ai/prompts/safety');

  const BLOCKED = 'bomb';

  function throwsBlocked(label: string, fn: () => unknown): void {
    checks++;
    try {
      fn();
      failures++;
      console.log(`FAIL  ${label}\n        expected PromptBlockedError, nothing was thrown`);
    } catch (e) {
      if (!(e instanceof PromptBlockedError)) {
        failures++;
        console.log(`FAIL  ${label}\n        expected PromptBlockedError, got ${String(e)}`);
      }
    }
  }

  // --- creator: the DEFAULT path, which every customer hits ---
  throwsBlocked('creator: a blocked word in `style` is refused', () =>
    buildCreatorPrompt({ userPrompt: 'a red shoe on marble', style: BLOCKED, resolution: '1080p' })
  );
  throwsBlocked('creator: a blocked word in the brand-kit NAME is refused', () =>
    buildCreatorPrompt({
      userPrompt: 'a red shoe on marble', style: 'photographic', resolution: '1080p',
      brandKit: { name: BLOCKED, primary_color: '#111', secondary_color: '#222', accent_color: '#333' } as never,
    })
  );
  throwsBlocked('creator: a blocked word in brand_voice is refused', () =>
    buildCreatorPrompt({
      userPrompt: 'a red shoe on marble', style: 'photographic', resolution: '1080p',
      brandKit: { name: 'Acme', primary_color: '#111', secondary_color: '#222', accent_color: '#333', brand_voice: BLOCKED } as never,
    })
  );

  // An over-long brand name is TRUNCATED, not refused — the honest path is
  // unchanged and the PostgREST path is truncated back onto it.
  {
    const long = 'A'.repeat(5000);
    const built = buildCreatorPrompt({
      userPrompt: 'a red shoe on marble', style: 'photographic', resolution: '1080p',
      brandKit: { name: long, primary_color: '#111', secondary_color: '#222', accent_color: '#333' } as never,
    });
    checks++;
    if (built.includes('A'.repeat(200))) {
      failures++;
      console.log('FAIL  creator: an over-long brand name must be truncated to the CreateBrandKitSchema cap');
    }
  }

  // A clean call still produces a usable prompt — the filter must not eat content.
  {
    const built = buildCreatorPrompt({
      userPrompt: 'a red shoe on marble', style: 'cinematic', resolution: '4K',
      brandKit: { name: 'Acme', primary_color: '#111', secondary_color: '#222', accent_color: '#333' } as never,
    });
    checks++;
    if (!built.includes('a red shoe on marble') || !built.includes('cinematic') || !built.includes('Acme')) {
      failures++;
      console.log('FAIL  creator: a clean call must keep subject, style and brand in the prompt');
    }
  }

  // --- storyboard: the 14-credit studio ---
  throwsBlocked('storyboard: a blocked word in `style` is refused', () =>
    buildStoryboardPrompt({ concept: 'a launch film for a coffee brand', duration: 30, style: BLOCKED, platform: 'tiktok' })
  );
  throwsBlocked('storyboard: a blocked word in `platform` is refused', () =>
    buildStoryboardPrompt({ concept: 'a launch film for a coffee brand', duration: 30, style: 'cinematic', platform: BLOCKED })
  );
  throwsBlocked('storyboard: a blocked word in the brand NAME is refused', () =>
    buildStoryboardPrompt({ concept: 'a launch film for a coffee brand', duration: 30, style: 'cinematic', platform: 'tiktok', brandName: BLOCKED })
  );
  throwsBlocked('storyboard: a blocked word in targetAudience is refused', () =>
    buildStoryboardPrompt({ concept: 'a launch film for a coffee brand', duration: 30, style: 'cinematic', platform: 'tiktok', targetAudience: BLOCKED })
  );
  throwsBlocked('storyboard: a blocked word in keyMessage is refused', () =>
    buildStoryboardPrompt({ concept: 'a launch film for a coffee brand', duration: 30, style: 'cinematic', platform: 'tiktok', keyMessage: BLOCKED })
  );
}
```

If `BLOCKED = 'bomb'` is not actually a blocked term in this repo's filter, read
`lib/ai/prompts/safety.ts`'s blocklist and substitute one that is — then say which in the commit
message. The test is worthless if the sentinel is not blocked.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:safety`
Expected: FAIL, with the `creator:` and `storyboard:` lines reporting "expected PromptBlockedError,
nothing was thrown". That is the defect: today those fields go to the model verbatim.

- [ ] **Step 3: Cap `style` in the creator schema**

In `app/api/studios/creator/route.ts:24`, replace:

```ts
  style: z.string().default('photographic'),
```

with:

```ts
  // `style` reaches the image model on BOTH branches and had no ceiling at all.
  // 100 is the cap the admin-override branch already truncates it to (route:183).
  style: z.string().max(100).default('photographic'),
```

- [ ] **Step 4: Filter every value `buildCreatorPrompt` interpolates**

Replace `lib/ai/prompts/creator.ts:15-42` (the whole `buildCreatorPrompt` body) with:

```ts
// v2.0 — matches system-prompts.md creator_image_v1
export function buildCreatorPrompt(input: CreatorPromptInput): string {
  const { userPrompt, style, resolution, brandKit, mood, platform } = input;

  // EVERY value interpolated below reaches the image model, so every value below
  // meets the filter. Sanitizing only `userPrompt` is how the gap stayed open:
  // app/api/studios/creator/route.ts:173-190 fixed exactly these fields on the
  // ADMIN-OVERRIDE branch and left the default branch — the one every customer
  // actually hits, since an override is opt-in — untouched.
  //
  // The brand-kit columns are NOT covered by app/api/brand-kits/route.ts's Zod
  // caps. `brand_kits` never received a column-level GRANT lockdown (022 covered
  // `profiles` only; 042 constrains `logo_url` alone), so `authenticated` still
  // holds the bootstrap GRANT ALL and a customer can PATCH `name`/`brand_voice`
  // to any string over PostgREST. RLS gates WHICH ROW; only a GRANT gates WHICH
  // COLUMN. These caps mirror CreateBrandKitSchema, so the honest path is
  // unchanged and the PostgREST path is truncated back onto it.
  const safePrompt = sanitizePrompt(userPrompt);
  const safeStyle = sanitizePrompt(style, 100);
  const safeMood = sanitizePrompt(mood || 'Professional', 100);
  const safePlatform = sanitizePrompt(platform || 'General', 100);
  const safeBrandName = brandKit ? sanitizePrompt(String(brandKit.name ?? ''), 100) : '';
  const safeBrandColors = brandKit
    ? sanitizePrompt(
        `Primary ${brandKit.primary_color}, Secondary ${brandKit.secondary_color}, Accent ${brandKit.accent_color}`,
        200
      )
    : '';
  const safeBrandVoice = brandKit?.brand_voice
    ? sanitizePrompt(String(brandKit.brand_voice), 500)
    : '';

  let prompt = `You are a world-class commercial photographer and visual designer.\n\nCreate a professional commercial image with these specifications:`;
  prompt += `\n- Subject: ${safePrompt}`;

  if (brandKit) {
    prompt += `\n- Brand: ${safeBrandName}`;
    prompt += `\n- Brand Colors: ${safeBrandColors}`;
    if (safeBrandVoice) prompt += `\n- Brand Voice: ${safeBrandVoice}`;
  }

  prompt += `\n- Visual Style: ${safeStyle}`;
  prompt += `\n- Mood: ${safeMood}`;
  prompt += `\n- Platform: ${safePlatform}`;
  prompt += `\n- Resolution: ${resolution}`;

  prompt += `\n\nTechnical Requirements:`;
  prompt += `\n- STRICTLY PRESERVE all original brand elements`;
  prompt += `\n- STRICTLY PRESERVE original product appearance and branding`;
  prompt += `\n- NO extra text, logos, or watermarks unless specified`;
  prompt += `\n- Professional studio lighting unless otherwise specified`;
  prompt += `\n- High contrast, commercially appealing composition`;
  // `platform ? safePlatform : 'general use'`, not `safePlatform` unconditionally:
  // the original fallback here is 'general use', not 'General', and swapping it
  // would be a silent copy change riding along with a security fix.
  prompt += `\n- Resolution optimized for ${platform ? safePlatform : 'general use'}`;

  return prompt;
}
```

`resolution` needs no filter — it is a closed `z.enum(['1080p','2K','4K'])` at `route.ts:23`.

**Do not fix the "STRICTLY PRESERVE" contradiction here.** That prompt is written for an image-EDIT
flow and is wrong for creator, but it is an output-quality defect and belongs to the marketing plan.
Changing it inside a security commit would make both harder to review.

- [ ] **Step 5: Close storyboard's schema**

In `app/api/studios/storyboard/route.ts`, replace the import at line 11:

```ts
import { PromptBlockedError } from '@/lib/ai/prompts/safety';
```

with:

```ts
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
```

Then replace the `InputSchema` at `:15-22` with:

```ts
/**
 * `style` and `platform` were `z.string().min(1).max(100)` and reached the model
 * verbatim (lib/ai/prompts/storyboard.ts:24-25). Both are closed sets in the only
 * client that posts here — app/[locale]/(dashboard)/storyboard/page.tsx:28-29 —
 * and an enum makes the set of reachable prompts finite rather than merely
 * filtered. Same shape as `dialect` in campaign and `environment` in photoshoot.
 */
const InputSchema = z.object({
  projectId: z.string().uuid().optional(),
  concept: z.string().min(10).max(2000),
  duration: z.enum(['15', '30', '60']),
  style: z.enum(['cinematic', 'ugc', 'animation', 'documentary']),
  platform: z.enum(['instagram_reel', 'tiktok', 'youtube', 'tv']),
  brandKitId: z.string().uuid().optional(),
});
```

**Before committing, confirm the enum values match the page.** Run:
`grep -n "style\|platform" "app/[locale]/(dashboard)/storyboard/page.tsx" | head -20`
If the page offers a value not in these enums, every submission with it becomes a 400. Add it.

- [ ] **Step 6: Sanitize storyboard before the money moves**

In `app/api/studios/storyboard/route.ts`, in the block currently around `:99-134` — **above** the
`generations` insert and **above** `reserveCredits` — add:

```ts
    // Sanitize BEFORE the insert and BEFORE the reservation, so a blocked word
    // costs nothing. plan (route:136-140) and analysis (route:153-161) already do
    // this; storyboard was the one that charged first and filtered second, and at
    // 14 credits it is the most expensive place to get that order wrong.
    // PromptBlockedError thrown here reaches the OUTER catch directly, which
    // returns 400 + `term` with no credits moved and no orphan row.
    const safeConcept = sanitizePrompt(input.concept, 2000);

    let brandKitName: string | undefined;
    if (input.brandKitId) {
      const { data: brandKit } = await supabase
        .from('brand_kits').select('name')
        .eq('id', input.brandKitId).eq('user_id', user.id).single();
      // See the note in lib/ai/prompts/creator.ts: `brand_kits` has no
      // column-level GRANT lockdown, so this value is customer-writable to any
      // string over PostgREST. Cap mirrors CreateBrandKitSchema.
      brandKitName = brandKit?.name ? sanitizePrompt(String(brandKit.name), 100) : undefined;
    }
```

Then change the `generations` insert to record the filtered values:

```ts
      input: { ...input, concept: safeConcept, brandKitName },
```

the reservation description to `` `Storyboard - ${safeConcept.substring(0, 50)}` ``, and the builder
call to:

```ts
    const prompt = buildStoryboardPrompt({
      ...input,
      concept: safeConcept,
      duration: parseInt(input.duration, 10),
      brandName: brandKitName,
    });
```

If the route already fetches the brand kit elsewhere, reuse that fetch rather than adding a second
round-trip — `grep -n "brand_kits" app/api/studios/storyboard/route.ts` before writing.

- [ ] **Step 7: Filter every value `buildStoryboardPrompt` interpolates**

In `lib/ai/prompts/storyboard.ts`, replace lines 15-28 (through the `keyMessage` line) with:

```ts
export function buildStoryboardPrompt(input: StoryboardPromptInput): string {
  const { concept, duration, style, platform, brandName, targetAudience, keyMessage } = input;

  // Belt AND braces, exactly as lib/ai/prompts/plan.ts:30-38 does: the route
  // filters before the money moves, and the builder filters again so no future
  // caller can reach the model around it.
  const safeConcept = sanitizePrompt(concept);
  const safeStyle = sanitizePrompt(style, 100);
  const safePlatform = sanitizePrompt(platform, 100);
  // targetAudience and keyMessage are on the interface and no caller passes them
  // today. Covered anyway, because "nothing sends it yet" is exactly how an
  // unfiltered field gets wired up later without anyone re-reading this function.
  const safeBrandName = brandName ? sanitizePrompt(brandName, 100) : '';
  const safeTargetAudience = targetAudience ? sanitizePrompt(targetAudience, 500) : '';
  const safeKeyMessage = keyMessage ? sanitizePrompt(keyMessage, 500) : '';

  let prompt = `You are a professional film director and storyboard artist with experience in commercial advertising.`;

  prompt += `\n\nVideo Brief:`;
  prompt += `\n- Concept: ${safeConcept}`;
  prompt += `\n- Duration: ${duration} seconds total`;
  prompt += `\n- Style: ${safeStyle}`;
  prompt += `\n- Platform: ${safePlatform}`;
  if (safeTargetAudience) prompt += `\n- Target Audience: ${safeTargetAudience}`;
  if (safeBrandName) prompt += `\n- Brand: ${safeBrandName}`;
  if (safeKeyMessage) prompt += `\n- Key Message: ${safeKeyMessage}`;
```

Everything from the `Create a professional storyboard with exactly 9 scenes.` line onward is unchanged.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm run test:safety`
Expected: passes, with a higher check count than before.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 9: Confirm storyboard's `PromptBlockedError` handler is now reachable**

Run: `grep -n "sanitizePrompt\|PromptBlockedError" app/api/studios/storyboard/route.ts`
Expected: both an import and at least one **call** to `sanitizePrompt` in the route. An import with no
call is precisely the `plan.ts` defect that made a handler dead code — if you see that, Step 6 was not
applied.

- [ ] **Step 10: Commit**

```bash
git add lib/ai/prompts/creator.ts lib/ai/prompts/storyboard.ts app/api/studios/creator/route.ts app/api/studios/storyboard/route.ts scripts/tests/safety.test.ts
git commit -m "fix(security): filter every value the creator and storyboard prompts interpolate"
```

---

### Task 2: One SSRF allowlist, matched by exact host or real subdomain

**Files:**
- Create: `lib/ai/allowed-hosts.ts`
- Create: `scripts/tests/image-host.test.ts`
- Modify: `lib/ai/gemini.ts:43-63`
- Modify: `lib/image/watermark.ts:87-96`
- Modify: `package.json`

**Interfaces:**
- Produces: `REFERENCE_IMAGE_ALLOWED_HOSTS: string[]` and `isAllowedImageHost(hostname: string): boolean`. Task 3 must import from here and must not restate the list.

**The defect.** The allowlist is matched with `hostname.endsWith(h)`. `endsWith('placehold.co')` also
matches `xplacehold.co`; `endsWith('replicate.delivery')` also matches `notreplicate.delivery`; and
`endsWith('oaidalleapiprodscus.blob.core.windows.net')` also matches
`xoaidalleapiprodscus.blob.core.windows.net`, because an Azure Blob **storage account name is the
first label and is chosen by whoever creates the account**. All three are ordinary registrations — an
SSRF allowlist any registrar can sell you a seat on. The same rule exists in a second copy in
`lib/image/watermark.ts`.

Ordered before Task 3 because both edit the same six lines of `fetchReferenceImage`.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/image-host.test.ts`. Copy the harness idiom from
`scripts/tests/uploaded-url.test.ts` (read it first — reuse its `check` helper shape and its final
`process.exit(1)` block).

```ts
/**
 * Proof that the reference-image host allowlist is a HOST rule, not a suffix rule.
 *
 *   npx tsx scripts/tests/image-host.test.ts
 *
 * WHY THIS IS A BUILD GATE
 *
 * This is pure string logic in front of a server-side fetch. The rule it replaces
 * was `hostname.endsWith(h)`, which any registrar could sell you a seat on:
 * `xplacehold.co`, `notreplicate.delivery` and `xoaidalleapiprodscus.blob.core.windows.net`
 * are all ordinary registrations that ended with an allowed name. A suffix rule
 * looks correct in review and is wrong in production, so it gets a test.
 */
import { isAllowedImageHost } from '../../lib/ai/allowed-hosts';

let failures = 0;
let checks = 0;

function allow(host: string): void {
  checks++;
  if (!isAllowedImageHost(host)) {
    failures++;
    console.log(`FAIL  expected ALLOWED: ${host}`);
  }
}

function refuse(host: string): void {
  checks++;
  if (isAllowedImageHost(host)) {
    failures++;
    console.log(`FAIL  expected REFUSED: ${host}`);
  }
}

// ---- Hosts we own or already trust for bytes. ----
allow('pyramedia.cloud');
allow('pixoradb.pyramedia.cloud');
allow('placehold.co');
allow('replicate.delivery');
allow('oaidalleapiprodscus.blob.core.windows.net');
allow('OAIDALLEAPIPRODSCUS.BLOB.CORE.WINDOWS.NET'); // new URL() lower-cases, but restate it

// ---- Every join the suffix rule accepted. Each is a real, purchasable name. ----
refuse('xplacehold.co');
refuse('evilplacehold.co');
refuse('notreplicate.delivery');
refuse('xoaidalleapiprodscus.blob.core.windows.net');
refuse('evilpyramedia.cloud');

// ---- The case that proves this is a suffix rule and not a substring rule. ----
refuse('placehold.co.evil.com');
refuse('pyramedia.cloud.attacker.net');

// ---- Internal targets. An IP literal ends with none of the allowed names, so
//      the exact match refuses these by construction — asserted so it stays true.
refuse('localhost');
refuse('169.254.169.254');
refuse('127.0.0.1');
refuse('[::1]');
refuse('metadata.google.internal');

if (failures > 0) {
  console.log(`\n[image-host] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[image-host] ${checks} checks passed`);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx scripts/tests/image-host.test.ts`
Expected: FAIL — `does not provide an export named 'isAllowedImageHost'`.

- [ ] **Step 3: Create the shared allowlist**

Create `lib/ai/allowed-hosts.ts`:

```ts
/**
 * Hosts a reference image may be fetched from.
 *
 * Matched by EXACT hostname or as a proper subdomain (`.` + host) — NEVER by bare
 * suffix. `hostname.endsWith('placehold.co')` also matches `xplacehold.co`;
 * `endsWith('replicate.delivery')` also matches `notreplicate.delivery`; and
 * `endsWith('oaidalleapiprodscus.blob.core.windows.net')` also matches
 * `xoaidalleapiprodscus.blob.core.windows.net`, because an Azure Blob storage
 * account name is the FIRST LABEL and is chosen by whoever creates the account.
 * All three are ordinary registrations, so the allowlist was a suffix an attacker
 * could join. Same reasoning as lib/storage/export-source.ts:94, which compares
 * `target.origin` for equality rather than matching a tail.
 *
 * An IP literal ends with none of these names, so 169.254.169.254, localhost and
 * every other bare address stay refused by the exact match itself.
 *
 * Keep in step with next.config.ts remotePatterns (which Next matches exactly)
 * and the CSP img-src directive.
 */
export const REFERENCE_IMAGE_ALLOWED_HOSTS = [
  // Self-hosted storage. NOT .supabase.co/.supabase.in: this deployment is
  // self-hosted, so those matched nothing we own while letting a customer point a
  // reference image at any free Supabase project they registered.
  'pyramedia.cloud',
  'placehold.co',
  'oaidalleapiprodscus.blob.core.windows.net',
  'replicate.delivery',
];

/**
 * Exact host, or a real subdomain of it. Lower-cased because `new URL()` already
 * lower-cases `hostname`, and restating it costs nothing.
 */
export function isAllowedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return REFERENCE_IMAGE_ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx scripts/tests/image-host.test.ts`
Expected: `[image-host] 18 checks passed`

- [ ] **Step 5: Point both call sites at the one rule**

In `lib/ai/gemini.ts`, delete its local host list and suffix match, add
`import { isAllowedImageHost } from './allowed-hosts';`, and make the https branch of
`fetchReferenceImage` read:

```ts
  const url = new URL(imageUrl);
  if (url.protocol !== 'https:') throw new Error('only HTTPS URLs allowed');
  if (!isAllowedImageHost(url.hostname)) {
    throw new Error(`host not allowed: ${url.hostname}`);
  }
```

In `lib/image/watermark.ts:87-96`, delete its own copy of the list and matcher, add
`import { isAllowedImageHost } from '@/lib/ai/allowed-hosts';`, and replace the guard with:

```ts
  // SSRF protection: HTTPS only, and a known host. The allowlist lives in
  // lib/ai/allowed-hosts.ts and is matched by exact host or proper subdomain —
  // this file used to keep its own copy matched by bare suffix, which any
  // registrable domain ending in an allowed name could join.
  const url = new URL(imageUrl);
  if (url.protocol !== 'https:') throw new Error('Only HTTPS URLs allowed');
  if (!isAllowedImageHost(url.hostname)) {
    throw new Error(`Host not allowed: ${url.hostname}`);
  }
```

- [ ] **Step 6: Hunt for a third copy**

Run: `grep -rn "endsWith(h)\|allowedHosts\|ALLOWED_HOSTS\|supabase.co" --include=*.ts app lib scripts`
Expected: only `lib/ai/allowed-hosts.ts` and its two importers. Two identical copies produced two
identical bugs; a third would produce a third. If you find one, point it at the shared module in this
same commit.

- [ ] **Step 7: Register the test as a build gate**

In `package.json` add `"test:image-host": "npx tsx scripts/tests/image-host.test.ts",` and append
` && npm run test:image-host` to `prebuild`.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit` — no output.
Run: `npm run test:image-host` — passes.

- [ ] **Step 9: Commit**

```bash
git add lib/ai/allowed-hosts.ts lib/ai/gemini.ts lib/image/watermark.ts scripts/tests/image-host.test.ts package.json
git commit -m "fix(security): match the reference-image allowlist by host, not by suffix

The rule was hostname.endsWith(h), which any registrar could sell a seat on:
xplacehold.co, notreplicate.delivery and xoaidalleapiprodscus.blob.core.windows.net
are all ordinary registrations. Note this also now admits the pyramedia.cloud APEX,
which the old leading-dot form excluded — the apex is ours and the CSP already
trusts it, so this widens nothing an attacker controls.

Residual and known: this does not stop DNS rebinding. An allowlisted NAME that
resolves to an internal address still connects. Pinning that needs an undici Agent
with a custom connect hook; every allowlisted name is either ours or a third party
we already trust for bytes, so the risk is accepted rather than closed."
```

---

### Task 3: Bound the inline reference image, in one place instead of two copies

**Files:**
- Create: `lib/storage/reference-image.ts`
- Create: `scripts/tests/reference-image.test.ts`
- Modify: `lib/ai/gemini.ts` (the `data:` branch of `fetchReferenceImage`)
- Modify: `app/api/studios/edit/route.ts` (delete lines 14-70)
- Modify: `app/api/studios/photoshoot/route.ts` (delete lines 15-70)
- Modify: `package.json`

**Interfaces:**
- Consumes: `isAllowedImageHost` from Task 2 — this module must NOT restate the host list.
- Produces: `MAX_REFERENCE_IMAGE_BYTES: number`, `MAX_REFERENCE_IMAGE_URL_CHARS: number`, `readableImageUrl` (a Zod schema), `inputImageRef(url: string): string`.

**The defect.** The https path is capped at 20 MB in `lib/ai/gemini.ts`. The inline `data:` path had no
ceiling at all — the cheapest way in was the branch that skipped the cap. `edit/route.ts:14-70` and
`photoshoot/route.ts:15-70` hold **byte-identical copies** of `readableImageUrl` and `inputImageRef`,
and both copies accepted `data:image/` unbounded. Fixing one and not the other leaves the 8-credit
studio open.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/reference-image.test.ts`:

```ts
/**
 * Proof that an inline reference image is bounded before it costs anything.
 *
 *   npx tsx scripts/tests/reference-image.test.ts
 *
 * The https path was capped at 20 MB and the data: path was not, so the inline
 * form was the way in that skipped the ceiling. The cap is asserted on the RAW
 * STRING, because that is what the request carries and what the schema can refuse
 * BEFORE the generations insert and before the credit reservation.
 */
import {
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_REFERENCE_IMAGE_URL_CHARS,
  inputImageRef,
  readableImageUrl,
} from '../../lib/storage/reference-image';

let failures = 0;
let checks = 0;

function accepts(label: string, value: string): void {
  checks++;
  if (!readableImageUrl.safeParse(value).success) {
    failures++;
    console.log(`FAIL  expected ACCEPTED: ${label}`);
  }
}

function refuses(label: string, value: string): void {
  checks++;
  if (readableImageUrl.safeParse(value).success) {
    failures++;
    console.log(`FAIL  expected REFUSED: ${label}`);
  }
}

function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ---- Shapes the server can actually read. ----
accepts('an https URL', 'https://pixoradb.pyramedia.cloud/storage/v1/object/public/uploads/a.png');
accepts('a small inline png', `data:image/png;base64,${'A'.repeat(1000)}`);

// ---- Shapes it cannot read server-side. ----
refuses('a blob: URL', 'blob:https://pyrasuite.pyramedia.cloud/8f3c-1');
refuses('a plain http URL', 'http://pixoradb.pyramedia.cloud/a.png');
refuses('a relative path', '/uploads/a.png');
refuses('an empty string', '');
refuses('a non-image data URL', `data:text/html;base64,${'A'.repeat(100)}`);

// ---- The ceiling. ----
accepts('an inline payload exactly at the cap', `data:image/png;base64,${'A'.repeat(MAX_REFERENCE_IMAGE_URL_CHARS - 30)}`);
refuses('an inline payload past the cap', `data:image/png;base64,${'A'.repeat(MAX_REFERENCE_IMAGE_URL_CHARS + 1)}`);

// ---- The cap must actually correspond to 20 MB decoded, not to a magic number. ----
check(
  'the char cap decodes to at most MAX_REFERENCE_IMAGE_BYTES',
  Math.floor(((MAX_REFERENCE_IMAGE_URL_CHARS - 128) * 3) / 4) <= MAX_REFERENCE_IMAGE_BYTES,
  true
);

// ---- What reaches generations.input. ----
check('an https URL is recorded as itself', inputImageRef('https://x.pyramedia.cloud/a.png'), 'https://x.pyramedia.cloud/a.png');
{
  const ref = inputImageRef(`data:image/jpeg;base64,${'A'.repeat(4000)}`);
  checks++;
  if (ref.includes('AAAA') || !ref.includes('image/jpeg')) {
    failures++;
    console.log(`FAIL  an inline payload must be summarised, not stored — got ${ref.slice(0, 60)}`);
  }
}

if (failures > 0) {
  console.log(`\n[reference-image] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[reference-image] ${checks} checks passed`);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx scripts/tests/reference-image.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Create the shared module**

Create `lib/storage/reference-image.ts`:

```ts
/**
 * The shape a studio's reference image may take, stated ONCE.
 *
 * This lived as a byte-identical copy in app/api/studios/edit/route.ts and
 * app/api/studios/photoshoot/route.ts, and the copies had drifted in the way
 * duplicated rules always drift: both accepted `data:image/` with no ceiling at
 * all, while the https form they were written alongside is capped at
 * MAX_REFERENCE_IMAGE_BYTES in lib/ai/gemini.ts. The cheapest way in was the
 * branch that skipped the cap.
 *
 * Stated on the RAW string and enforced by the schema, so an oversized payload is
 * refused BEFORE the generations insert and before the credit reservation.
 */
import { z } from 'zod/v4';

/** The decoded ceiling lib/ai/gemini.ts already enforces on the fetched (https)
 *  path. Restated here so both paths share one number; change one, change both. */
export const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * The same ceiling expressed as a length limit on the `data:` STRING, because
 * that is what the request carries. base64 is 4 characters per 3 bytes, so a
 * string no longer than this can never decode past the ceiling; the +128 covers
 * the `data:<mime>;base64,` header. An https URL is far shorter than this, so one
 * cap serves both forms.
 */
export const MAX_REFERENCE_IMAGE_URL_CHARS =
  Math.ceil((MAX_REFERENCE_IMAGE_BYTES / 3) * 4) + 128;

export const readableImageUrl = z
  .string()
  .min(1)
  .max(MAX_REFERENCE_IMAGE_URL_CHARS, {
    message: `reference image is too large (inline payloads are capped at ${MAX_REFERENCE_IMAGE_BYTES} bytes)`,
  })
  .refine((v) => v.startsWith('https://') || v.startsWith('data:image/'), {
    message:
      'must be an https:// URL the server can fetch, or an inline data:image/ payload (blob:, http: and relative URLs cannot be read server-side)',
  });

/**
 * What gets recorded in `generations.input`. An inline reference image is a
 * legitimate input but an unbounded one, and that column is JSONB every admin
 * screen reads row by row. Record that one was supplied; the bytes stay in memory,
 * where the model call is the only thing that needs them.
 */
export function inputImageRef(url: string): string {
  if (!url.startsWith('data:')) return url;
  const mime = url.slice(5).split(';')[0] || 'image';
  return `[inline ${mime} reference, ${url.length} chars]`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx scripts/tests/reference-image.test.ts`
Expected: `[reference-image] 14 checks passed`

- [ ] **Step 5: Delete both duplicated copies**

In `app/api/studios/edit/route.ts`, delete lines 14-70 (the two definitions and their comments) and add:

```ts
import { inputImageRef, readableImageUrl } from '@/lib/storage/reference-image';
```

The `InputSchema` and the `inputImageRef()` call site are unchanged — same names, same behaviour.

Do the same in `app/api/studios/photoshoot/route.ts`, deleting lines 15-70.

- [ ] **Step 6: Cap the branch in gemini.ts that skipped the ceiling**

In `lib/ai/gemini.ts`, import the constant
(`import { MAX_REFERENCE_IMAGE_BYTES } from '@/lib/storage/reference-image';`) and replace the `data:`
branch of `fetchReferenceImage`:

```ts
  if (imageUrl.startsWith('data:')) {
    const [header, data] = imageUrl.split(',');
    if (!data) throw new Error('invalid data URL');
    // The https path below is capped and this one was not, so the inline form was
    // the way in that skipped the ceiling. base64 decodes to 3 bytes per 4
    // characters, so this bounds the payload WITHOUT allocating it — checking
    // Buffer.byteLength after decoding would mean doing the very allocation this
    // guard exists to prevent.
    if (Math.floor((data.length * 3) / 4) > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error('image too large');
    }
    return { mimeType: header.slice(5).split(';')[0] || 'image/png', base64: data };
  }
```

If `lib/ai/gemini.ts` declares its own `MAX_REFERENCE_IMAGE_BYTES`, delete that declaration — one
number, one place.

- [ ] **Step 7: Register the test and verify**

In `package.json` add `"test:reference-image": "npx tsx scripts/tests/reference-image.test.ts",` and
append ` && npm run test:reference-image` to `prebuild`.

Run: `npx tsc --noEmit` — no output.
Run: `grep -n "readableImageUrl\|inputImageRef" app/api/studios/edit/route.ts app/api/studios/photoshoot/route.ts` — each file shows the import and the use, and no local definition.

- [ ] **Step 8: Commit**

```bash
git add lib/storage/reference-image.ts app/api/studios/edit/route.ts app/api/studios/photoshoot/route.ts lib/ai/gemini.ts scripts/tests/reference-image.test.ts package.json
git commit -m "fix(security): bound the inline reference image, in one module instead of two copies"
```

---

### Task 4: Voiceover `tone` becomes a table lookup, not an interpolation

**Files:**
- Modify: `app/api/studios/voiceover/route.ts:24-31`
- Modify: `lib/ai/tts-router.ts` (line 5, and the tone expression around `:107-109`)

**Interfaces:**
- Consumes: nothing.
- Produces: `TONES` (a const tuple) in the route; `TONE_INSTRUCTIONS: Record<string, string>` in the router.

**The defect.** `tone: z.string()` is unbounded and unvalidated, and is interpolated **raw** into the
LLM rewrite prompt at `lib/ai/tts-router.ts:108` — whose *output is what the narrator reads aloud on a
paid generation*. `sanitizePrompt` is applied to `script` only. On pro/business/agency `toneEnabled`
is true, so this fires on essentially every paid request.

- [ ] **Step 1: Close the schema**

In `app/api/studios/voiceover/route.ts`, replace the `InputSchema` at `:24-31` with:

```ts
/**
 * The four tones this studio actually sells. app/[locale]/(dashboard)/voiceover/page.tsx:40
 * offers exactly these and lib/ai/elevenlabs.ts:61-66 keys TONE_SETTINGS on the
 * same four, so `tone: z.string()` was an unbounded, unfiltered value on the ONE
 * field lib/ai/tts-router.ts interpolates raw into a rewrite prompt — whose OUTPUT
 * is what the narrator reads aloud on a paid generation. An enum makes the set of
 * reachable prompts finite rather than merely filtered, which is what `speed` two
 * lines below and `dialect` in campaign already do.
 *
 * `voice` and `dialect` are bounded at runtime instead, against the plan's own
 * allowlists (route:88 and :97), and reach only Record lookups — never a template
 * literal. The `.max()` here is hygiene, not the guard.
 */
const TONES = ['professional', 'friendly', 'energetic', 'calm'] as const;

const InputSchema = z.object({
  projectId: z.string().uuid().optional(),
  script: z.string().min(1).max(2000),
  voice: z.string().max(50),
  dialect: z.string().max(50),
  speed: z.enum(['0.5', '0.75', '1', '1.25', '1.5']),
  tone: z.enum(TONES),
});
```

**Before committing, confirm the four values match the page.** Run:
`grep -n "professional\|friendly\|energetic\|calm" "app/[locale]/(dashboard)/voiceover/page.tsx"`
A tone the page offers that is missing here becomes an instant 400 for every customer who picks it.

- [ ] **Step 2: Delete the dead sanitizing import**

In `lib/ai/tts-router.ts`, delete line 5:

```ts
import { buildVoiceOverPrompt } from './prompts/voiceover';
```

Nothing in the file calls it. It is the version that *does* sanitize, so leaving it imported-but-unused
makes the file read as if the filter is applied here — the same shape as `plan.ts`'s unused
`sanitizePrompt` import, which made a route's `PromptBlockedError` handler dead code. `npm run lint`
passes with it today, so only a human or Task 7's invariant catches it.

**Wiring `buildVoiceOverPrompt` up properly is an output-quality fix and belongs to the marketing
plan.** Here it is only being removed as a misleading signal.

- [ ] **Step 3: Make tone a table**

In `lib/ai/tts-router.ts`, next to `DIALECT_PROMPTS` (already a table, around `:89-95`), add:

```ts
/**
 * The delivery instruction for each tone. A TABLE, not an interpolation: the
 * caller's value now only ever selects a row, so no string a customer sends can
 * reach the prompt. Same shape as DIALECT_PROMPTS above, and the same reason — the
 * tone branch was the one place a raw request field was pasted into a prompt whose
 * output becomes the audio the customer is billed for. Keys must stay in step with
 * TONES in app/api/studios/voiceover/route.ts and TONE_SETTINGS in
 * lib/ai/elevenlabs.ts:61-66.
 */
const TONE_INSTRUCTIONS: Record<string, string> = {
  professional: 'formal and authoritative',
  friendly: 'warm and conversational',
  energetic: 'excited and dynamic',
  calm: 'calm and soothing',
};
```

Then replace the `tonePrompt` expression at `:107-109` with:

```ts
  const toneInstruction = config.toneEnabled ? TONE_INSTRUCTIONS[tone] : undefined;
  // An unrecognised tone yields no instruction at all, exactly as an unrecognised
  // dialect yields no dialect prompt on the line above. The old ternary had no such
  // exit: anything that was not one of three named strings fell through to
  // 'calm and soothing' and was still pasted in verbatim.
  const tonePrompt = toneInstruction
    ? `Also adjust the tone so it sounds ${toneInstruction}.`
    : '';
```

- [ ] **Step 4: Verify no raw request field reaches the rewrite prompt**

Run: `grep -n '${tone}\|${dialect}\|${input.tone}' lib/ai/tts-router.ts`
Expected: no output. Every remaining interpolation in that prompt should be `${script}` (already
sanitized as `safeScript` by the route) or a table lookup.

Run: `npx tsc --noEmit` — no output.

- [ ] **Step 5: Commit**

```bash
git add app/api/studios/voiceover/route.ts lib/ai/tts-router.ts
git commit -m "fix(security): make voiceover tone a table lookup instead of a raw interpolation"
```

---

### Task 5: Filter the model's own text before it reaches the image model

**Files:**
- Modify: `app/api/studios/campaign/route.ts:280-295`

**Interfaces:**
- Consumes: `sanitizePrompt`, `PromptBlockedError` — confirm both are already imported in this route (`grep -n "safety" app/api/studios/campaign/route.ts`); add to the existing import braces if not.
- Produces: nothing.

**The defect.** `post.scenario` is **model-authored** text going straight to the image model, and it is
the only image path in the product that never meets the filter. The customer's own text *is* filtered
— which is exactly what makes this the way around it: steer the text model with a brief that passes,
and whatever scenario it writes is handed to the image model verbatim.

- [ ] **Step 1: Filter each scenario, and drop only that image**

Replace the image block at `app/api/studios/campaign/route.ts:280-295`:

```ts
    if (input.generateImages && posts.length > 0) {
      const imagePromises = posts.map(async (post, i) => {
        // `post.scenario` is MODEL-authored text going straight to the image model,
        // and it is the only image path in the product that never met the filter.
        // The customer's own text IS filtered above — which is what makes this the
        // way around it.
        //
        // Blocked => drop THIS image, never the campaign. Nine text posts and up to
        // eight other images are legitimate delivered work, and this block runs
        // inside the try, so throwing would reach the outer catch and refund the
        // whole reservation over one bad scenario. Returning null needs no new
        // branch: failedImageCount is sized from what was DELIVERED, so the partial
        // refund already pays for a dropped image. Same verdict, and the same
        // reasoning, as the WatermarkRequiredError drop below.
        let safeScenario: string;
        try {
          safeScenario = sanitizePrompt(post.scenario, 2000);
        } catch (e: unknown) {
          if (!(e instanceof PromptBlockedError)) throw e;
          console.error(
            `[campaign] post ${i} image skipped, model-written scenario blocked on "${e.blockedTerm}"`
          );
          return null;
        }

        try {
          const imgResult = await generateImage({
            prompt: safeScenario,
            model: 'gemini',
            resolution: '1080p',
          });
          return imgResult.url || null;
        } catch {
          return null;
        }
      });
      postImages = await Promise.all(imagePromises);
      failedImageCount = postImages.filter((url) => url === null).length;
    }
```

- [ ] **Step 2: Confirm the refund arithmetic still pays for a dropped image**

Run: `grep -n "failedImageCount\|missingPosts\|refundAmount" app/api/studios/campaign/route.ts`
Expected: `failedImageCount` is still computed from `postImages.filter((url) => url === null).length`
and still feeds `refundAmount`. A blocked scenario now counts as a failed image, so the customer is
refunded `perImageCost` for it — which is the correct outcome and required no new branch.

Run: `npx tsc --noEmit` — no output.
Run: `npm run check:invariants` — 12/12 (this route is scanned by `refund-captured`).

- [ ] **Step 3: Commit**

```bash
git add app/api/studios/campaign/route.ts
git commit -m "fix(security): filter model-authored scenarios before they reach the image model"
```

---

### Task 6: Close the source — column-level lockdown on `brand_kits`

**Files:**
- Create: `supabase/migrations/044_brand_kits_column_lockdown.sql`

**Interfaces:**
- Consumes: nothing. Tasks 1 and 2 cap and filter this data at every read site; this closes the write.
- Produces: nothing consumed by later tasks.

**Why this exists.** Tasks 1 and 5 make the brand-kit channel *harmless at every read site*. They do
not make it *closed*. `brand_kits` still carries Supabase's bootstrap `GRANT ALL TO authenticated`, so
a customer can still `PATCH` `name` and `brand_voice` to an arbitrary unbounded string over PostgREST.
The next feature that reads a brand kit inherits the hole unless the source is shut.

This is the same class as migrations 040 (`assets.url`) and 042 (`brand_kits.logo_url`) — **constrain
the shape, revoke what nothing legitimately writes** — and those two are the templates to copy.

- [ ] **Step 1: Read the two templates before writing anything**

Run: `sed -n '1,80p' supabase/migrations/042_brand_kit_logo_url.sql`
Run: `sed -n '1,80p' supabase/migrations/040_assets_url_lockdown.sql`

Note in particular how each one proves itself **as the `authenticated` role** inside the transaction
and refuses to commit if a probe cannot reach a verdict. Copy that structure exactly.

**Read `CLAUDE.md`'s "Database Migrations" section before proceeding.** The two rules that matter:
`apply.js` discards `NOTICE`/`WARNING`, so report probe results as a final `SELECT`, never
`RAISE NOTICE`; and a migration that changes an access rule must prove itself as `authenticated`.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/044_brand_kits_column_lockdown.sql`. It must:

1. Add `CHECK` constraints mirroring `app/api/brand-kits/route.ts`'s Zod schema exactly —
   `char_length(name) <= 100`, `brand_voice IS NULL OR char_length(brand_voice) <= 500`, and the three
   colour columns constrained to a hex-colour shape. **Read that route first and copy its real caps**;
   a constraint stricter than the route rejects rows the product creates.
2. `REVOKE UPDATE` on the columns nothing legitimately rewrites after creation, following 040's
   reasoning about which grants exist to begin with.
3. Prove itself as `authenticated`, inside the transaction, with probes that:
   - a legitimate insert/update still succeeds (`OK`);
   - an over-long `name` returns `23514`;
   - an over-long `brand_voice` returns `23514`;
   - a non-hex colour returns `23514`.
4. Refuse to commit if any probe cannot reach a verdict — a probe blocked by RLS certifies nothing.

**One thing to check before writing the CHECK on colours:** run
`node scripts/db/apply.js` against a `SELECT DISTINCT primary_color FROM brand_kits;` first, or query
the live table, and confirm every existing row already satisfies the constraint. A `CHECK` that
existing rows violate will fail at `ALTER TABLE`. If any row is non-conforming, the migration must
normalise it in the same transaction, before adding the constraint.

- [ ] **Step 3: Rehearse against the live database**

Copy the file, swap its trailing `COMMIT` for `ROLLBACK`, and run:

```bash
node scripts/db/apply.js supabase/migrations/044_brand_kits_column_lockdown_REHEARSAL.sql
```

Expected: the final `SELECT` reports every probe reaching its expected verdict, then the transaction
rolls back. **A migration that cannot pass its own probes must never reach production.** Delete the
rehearsal file.

- [ ] **Step 4: Apply**

```bash
node scripts/db/apply.js supabase/migrations/044_brand_kits_column_lockdown.sql
```

Expected: the probe `SELECT` reports the same verdicts, and the transaction commits.

- [ ] **Step 5: Re-probe independently, as `authenticated`**

Do not trust the in-transaction probes alone. Re-run each attack shape against the live database as
`authenticated`, outside the migration:

- `PATCH brand_kits` with a 5,000-character `name` → expect `23514` or `42501`
- `PATCH brand_kits` with a 5,000-character `brand_voice` → expect `23514` or `42501`
- create a brand kit through the app UI → expect success

Record the actual SQLSTATEs returned. If any probe returns success, the lockdown did not take.

- [ ] **Step 6: Verify the app still works end to end**

Create a brand kit, attach it to a creator generation, and confirm the generation completes. The caps
in Task 1 mirror this migration's constraints, so a mismatch shows up here as a 500 carrying raw
Postgres text instead of a clean 400 — the exact defect `CLAUDE.md` records for `isOwnUploadUrl()`,
where the route and the database disagreed about the same bytes.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/044_brand_kits_column_lockdown.sql
git commit -m "fix(security): column-level lockdown on brand_kits

RLS gates WHICH ROW; only a GRANT gates WHICH COLUMN. Migration 022 applied
column-level lockdown to profiles and to no other table, and 042 constrained
brand_kits.logo_url alone — so name and brand_voice were writable to any string
over PostgREST, bypassing the route's Zod caps. That is the channel the prompt
builders now filter at every read site; this closes it at the source."
```

---

### Task 7: Two invariants that make this class self-policing

**Files:**
- Modify: `scripts/check-invariants.ts`

**Interfaces:**
- Consumes: all previous tasks — both rules must be green when added, so this task goes last.
- Produces: invariant ids `prompt-input-bounded` and `prompt-builder-sanitized`.

**Why.** Every fix above was found by an audit. Without a gate, the next unbounded field or unfiltered
interpolation is found by the next audit — or not at all. Rule (b) would have found the two worst
findings in this plan on its own.

- [ ] **Step 1: Read the invariant idiom**

Run: `sed -n '296,340p' scripts/check-invariants.ts`

Note the `Invariant` shape: `id`, `title`, `why`, and `check()` returning `Violation[]`. Note also
`listFiles`, `toRel`, `lineAt` and `lineTextAt` — reuse them; do not write new file walking.

- [ ] **Step 2: Add `prompt-input-bounded`**

```ts
const promptInputBounded: Invariant = {
  id: 'prompt-input-bounded',
  title: 'Every z.string() in a studio route InputSchema carries a bound',
  why:
    'An unbounded z.string() in a studio route is a field a customer can send ' +
    'megabytes of, and several of them are interpolated into a prompt sent to a ' +
    'paid model. creator\'s `style` and voiceover\'s `tone` were both unbounded ' +
    'and both reached a model; `tone` reached the LLM REWRITE prompt whose output ' +
    'is read aloud on a paid generation. A bound is not the filter — ' +
    'sanitizePrompt() is — but an unbounded field is the shape that keeps ' +
    'producing this defect, and it is mechanically checkable where the filter is ' +
    'not. Use .max(n), or .uuid()/.url() where the format is the bound, or a ' +
    'z.enum() where the set is closed (which is better than any of them).',
  async check(): Promise<Violation[]> {
    const violations: Violation[] = [];
    const files = listFiles(['app/api/studios'], ['.ts'], false).filter((f) =>
      /[\\/]route\.ts$/.test(f)
    );
    // `z.string()` not immediately followed by a bounding call. `.min()` is not a
    // bound — it sets a floor, not a ceiling — so it must be followed by more.
    const re = /z\s*\.\s*string\s*\(\s*\)((?:\s*\.\s*\w+\s*\([^)]*\))*)/g;
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const rel = toRel(file);
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        const chain = m[1] || '';
        if (/\.\s*(max|uuid|url|regex|length)\s*\(/.test(chain)) continue;
        violations.push({ file: rel, line: lineAt(content, m.index), text: lineTextAt(content, m.index) });
      }
    }
    return violations;
  },
};
```

- [ ] **Step 3: Add `prompt-builder-sanitized`**

```ts
const promptBuilderSanitized: Invariant = {
  id: 'prompt-builder-sanitized',
  title: 'A prompt builder interpolates only values it has sanitized',
  why:
    'lib/ai/prompts/*.ts builds the string sent to a paid model, and it is where ' +
    'every channel converges — the request body, a brand_kits SELECT, and the ' +
    'text model\'s own output. A route-level Zod transform cannot cover the last ' +
    'two, which is why the rule lives here. The convention is that a sanitized ' +
    'value is named `safeX`, so a bare interpolated identifier is a value that ' +
    'reached the model unfiltered. This rule would have found the creator ' +
    'brand-kit channel and the storyboard style/platform channel on its own.',
  async check(): Promise<Violation[]> {
    const violations: Violation[] = [];
    const files = listFiles(['lib/ai/prompts'], ['.ts'], false).filter(
      (f) => !/[\\/](safety|versions)\.ts$/.test(f)
    );
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const rel = toRel(file);
      // Identifiers destructured from the builder's input parameter.
      const destructured = new Set<string>();
      const destructureRe = /const\s*\{([^}]+)\}\s*=\s*input\s*;/g;
      let d: RegExpExecArray | null;
      while ((d = destructureRe.exec(content))) {
        for (const raw of d[1].split(',')) {
          const name = raw.split(':')[0].trim().replace(/^\.\.\./, '');
          if (name) destructured.add(name);
        }
      }
      if (destructured.size === 0) continue;
      // Any `${identifier}` or `${identifier.field}` naming one of them.
      const interpRe = /\$\{\s*([A-Za-z_$][\w$]*)/g;
      let m: RegExpExecArray | null;
      while ((m = interpRe.exec(content))) {
        const name = m[1];
        if (!destructured.has(name)) continue;
        if (/^safe/i.test(name)) continue;
        violations.push({ file: rel, line: lineAt(content, m.index), text: lineTextAt(content, m.index) });
      }
    }
    return violations;
  },
};
```

- [ ] **Step 4: Register both in the `INVARIANTS` array**

Add `promptInputBounded` and `promptBuilderSanitized` to the `INVARIANTS` array (around line 1156).

- [ ] **Step 5: Run and expect green**

Run: `npm run check:invariants`
Expected: **14/14**, all passing.

If `prompt-input-bounded` flags something, it is a genuinely unbounded field Tasks 1–5 did not reach —
bound it. Expect it to flag `campaign`'s `platform: z.string().min(1)` and `CampaignPostSchema`'s five
`z.string()` fields if those were not covered; fix them here rather than exempting them.

If `prompt-builder-sanitized` flags `lib/ai/prompts/voiceover.ts`, that is correct — it interpolates
raw `tone`/`dialect`. That builder is dead code today (its import was removed in Task 4), so either
sanitize it now or delete the file. **Do not add an exemption.**

Neither rule may use the baseline: `BASELINE_ELIGIBLE_IDS` restricts it to `no-arabic-literals-in-tsx`
precisely so a new violation cannot be silenced.

- [ ] **Step 6: Prove both rules actually fire**

Temporarily add to `app/api/studios/plan/route.ts`'s `InputSchema`:

```ts
  probeField: z.string(),
```

Run: `npm run check:invariants` → expect FAIL naming `prompt-input-bounded` and that line.

Remove it. Then temporarily change `lib/ai/prompts/plan.ts` to interpolate a destructured identifier
without the `safe` prefix, run the invariants, and expect FAIL naming `prompt-builder-sanitized`.
Remove that too.

Run: `git diff --stat` → expect no output. Both probes left nothing behind.

- [ ] **Step 7: Commit**

```bash
git add scripts/check-invariants.ts
git commit -m "test(invariants): fail the build on unbounded studio inputs and unsanitized prompt interpolation"
```

---

### Task 8: Run every gate and record what is true

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run the full gate set**

```bash
npx tsc --noEmit
npm run lint
npm run check:invariants
npm run test:safety
npm run test:uploads
npm run test:plan-switch
npm run test:image-host
npm run test:reference-image
npm run build
```

Record the actual counts each test prints. They go in the doc — not approximations.

- [ ] **Step 2: Verify against the live product after deploy**

These are fetch-path changes; tests do not prove them. Note that `git push` does **not** deploy —
Coolify's webhook does not fire, so trigger the deploy explicitly.

- A real photoshoot and a real edit still complete (they fetch from `pixoradb.pyramedia.cloud`).
- A free-plan generation still watermarks (the `urlToBuffer` path in `watermark.ts`).
- A creator generation with a brand kit attached still completes.
- A voiceover on a paid plan still applies its tone.

- [ ] **Step 3: Add a section to `CLAUDE.md`**

Insert after the existing "Security hardening" section, in the same table style, writing only what
Step 1 actually printed.

```markdown
### Studio input hardening — fixed 2026-08-24

The recurring class this round: **the filter was applied where the text was
convenient, not where it converges.** `sanitizePrompt()` covered each studio's
headline field and nothing else, so five channels reached a paid model unfiltered.

| Defect | State |
|--------|-------|
| creator's DEFAULT prompt path sent `style` and every brand-kit column to the image model with no filter and no cap — the admin-override branch had been fixed, the branch every customer hits had not | ✅ fixed — every value `buildCreatorPrompt` interpolates meets the filter |
| storyboard (14 credits) never called `sanitizePrompt` in the route; `style`/`platform`/`brandKitName` went to the model raw and `concept` was filtered only AFTER the reservation | ✅ fixed — enums for the closed sets, sanitize before the money moves |
| voiceover `tone` was `z.string()`, interpolated raw into the LLM rewrite prompt **whose output is read aloud on a paid generation** | ✅ fixed — `z.enum` + a `TONE_INSTRUCTIONS` table; the value now selects a row |
| campaign sent MODEL-authored `post.scenario` straight to the image model — the only image path that never met the filter, and therefore the way around it | ✅ fixed — filtered per post; a blocked scenario drops that image and is refunded, never the campaign |
| The SSRF allowlist matched by **bare suffix**, so `xplacehold.co`, `notreplicate.delivery` and `xoaidalleapiprodscus.blob.core.windows.net` all passed — every one an ordinary registration | ✅ fixed — exact host or proper subdomain, one copy, `[image-host] 18` |
| The inline `data:` reference image had no ceiling while the https path was capped at 20 MB — and both routes held byte-identical copies of the rule | ✅ fixed — `lib/storage/reference-image.ts`, `[reference-image] 14` |
| `brand_kits` never received a column-level GRANT lockdown, so `name`/`brand_voice` were writable to any string over PostgREST | ✅ fixed — migration 044 |

**Why the filter went in the builder and not the route schema.** A zod v4 transform
was measured, not assumed: a throw inside one is NOT wrapped into a `ZodError`, so
the `400 + term` response would have survived. It was rejected anyway because a
route `InputSchema` only sees the request body, and three of the channels above
never pass through one — the brand-kit columns come from a `SELECT` and campaign's
image prompt comes from the text model's own output. The prompt builder is where
all three converge.

**Two invariants now police the class**: `prompt-input-bounded` (every `z.string()`
in a studio route carries a bound) and `prompt-builder-sanitized` (a builder
interpolates only `safe*` identifiers). The second would have found two of the
findings above on its own. Both proved by deliberately reintroducing a violation.

**Verified:** `tsc` clean, `lint` clean, invariants 14/14, `[safety] N`,
`[image-host] 18`, `[reference-image] 14`, `[uploaded-url] 37`, `[plan-switch] 15`,
clean production build. Migration 044 rehearsed in a rolled-back transaction,
applied, then re-probed independently as `authenticated`.

**Residual and known, not closed:** the host allowlist does not stop DNS rebinding
— an allowlisted NAME resolving to an internal address still connects. Pinning that
needs an undici Agent with a custom connect hook. Every allowlisted name is either
ours or a third party already trusted for bytes, so this is accepted rather than
fixed.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the studio input-hardening round against verified output"
```

---

## Self-Review

**Spec coverage.** All eight security findings have tasks: creator `style` + brand kit (Task 1),
storyboard route + builder (Task 1), inline `data:` cap (Task 3), SSRF suffix match (Task 2), voiceover
`tone` (Task 4), campaign model-authored text (Task 5), `lib/ai/prompts/storyboard.ts:24` (Task 1,
Step 7), `lib/ai/prompts/creator.ts:23` (Task 1, Step 4). Task 6 closes the source the audit did not
name, and Task 7 makes the class self-policing.

**Deliberately out of scope**, recorded so nobody reads their absence as an oversight:
- Wiring `buildVoiceOverPrompt` up properly, and fixing creator's self-contradicting "STRICTLY
  PRESERVE" block — both output-quality, both in the marketing plan. Task 4 only *removes* the dead
  import, because an unused sanitizing import makes a file read as filtered when it is not.
- `script-src 'unsafe-inline'` — a deliberate trade already recorded in `CLAUDE.md`, unchanged here.
- DNS rebinding — stated as residual in Task 2's commit and in the `CLAUDE.md` entry.

**Type consistency.** `isAllowedImageHost(hostname: string): boolean` is defined in Task 2 Step 3 and
imported in Task 2 Step 5 and Task 3. `MAX_REFERENCE_IMAGE_BYTES` is defined in Task 3 Step 3 and
imported by `gemini.ts` in Task 3 Step 6 — with an instruction to delete the local declaration so one
number has one home. `readableImageUrl` / `inputImageRef` keep the exact names the two routes already
use, so their call sites need no edit. `TONES` and `TONE_INSTRUCTIONS` are defined in Task 4 and used
only there.

**Placeholder scan.** Every code step carries real code. Task 6 is the one task that specifies a
migration by its required properties rather than by finished SQL — deliberately, because a `CHECK`
must match the live table's existing rows and this plan cannot know them. It names the two template
migrations, the four probes, the exact SQLSTATEs, and the pre-flight query. Do not write that SQL
without running the pre-flight.

**Two risks worth flagging to the reviewer.**
1. **Task 2 widens `.pyramedia.cloud` to `pyramedia.cloud`**, admitting the apex, which the old
   leading-dot form excluded. The apex is ours and the CSP already trusts it, so nothing an attacker
   controls is added — but it reads like a widening in review, which is why the commit message says so.
2. **Tasks 1 and 6 must agree on the same caps.** Task 1 truncates a brand name to 100 characters;
   Task 6 constrains the column to the same. If they disagree, the failure mode is a 500 carrying raw
   Postgres text instead of a clean 400 — the exact `isOwnUploadUrl()` defect `CLAUDE.md` records,
   where the route and the database disagreed about the same bytes. Task 6 Step 6 exists to catch it.
