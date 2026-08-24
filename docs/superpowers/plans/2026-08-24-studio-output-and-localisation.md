# Studio Output Quality & Localisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make what the customer actually receives worth what they paid — the model asked for the right shape in the right language with the context the app already holds, and every failure message reaching them in Arabic instead of collapsing to a generic fallback.

**Architecture:** Two independent halves. **Part A (Tasks 1–9)** is server-side prompt work: the five text studios stop regex-scraping prose and start asking for JSON, the builders stop spending tokens on sections nothing renders, and three studios get the brand and language context the app already loads. **Part B (Tasks 10–15)** is the customer-facing surface: registered error codes so Arabic messages are reachable, honest model attribution, and the colour/label defects. The halves share no files and can ship in either order.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Zod 4.3.6 (`zod/v4`), next-intl, Tailwind v3.4.19, `tsx` for test scripts (no test framework).

**Spec:** The audit report at https://claude.ai/code/artifact/d89501a0-e49d-4c4f-8084-d35e98cbc180 — the `prompt-quality`, `i18n` and `branding` findings. Every requirement is restated inline.

## Global Constraints

- **TypeScript strict, zero `any`.** `npx tsc --noEmit` clean after every task.
- **Pyra branding:** user-facing text says "بايرا" / "محرك Pyra AI", never Gemini/GPT/Flux/OpenAI/ElevenLabs. Internal variable names keep the model names — only UI/UX strings are governed.
- **`messages/ar.json` and `messages/en.json` must stay key-identical** — the `msg-parity` invariant fails the build otherwise. Add to both or neither.
- **No Arabic string literals in `.tsx`** — the `no-arabic-literals-in-tsx` invariant. Use `t()`.
- **RTL-first CSS** (`ps/pe/ms/me/start/end`) and CSS variables for colour. The `rtl-logical-properties` and `contrast-tokens` invariants are live.
- **Bump the prompt version** in `lib/ai/prompts/versions.ts`'s `PROMPT_VERSIONS` for every prompt materially changed. Photoshoot is already v3.0; the rest go to v2.0.
- **If you add a labelled brief line to `buildCreatorPrompt` or `buildCampaignPrompt`, add it to the admin-override composer too** (`creator/route.ts:34-40` `OVERRIDE_BRIEF_LABELS`, `campaign/route.ts:172-179`). Otherwise setting an override in `/admin/settings` silently drops the new field — the exact defect the override composer was written to remove, documented at `campaign/route.ts:44-56` from the last time it happened with `dialect`.
- **Commit after every task.**

## Corrections to the audit, established during research — do not re-litigate

Four findings were mis-stated. Building from the audit's site lists rather than these would produce wrong edits:

- **`lib/ai/prompts/creator.ts:23` is NOT a defect.** `creator/route.ts:136` does `.select('*')` and passes the whole `brandKit` row in, so name, all three colours **and** `brand_voice` all reach the model. `CLAUDE.md` already records this correctly. Only the **campaign** half of that finding is real. **Do not write a task that "fixes" creator's brand kit.**
- **The maintenance/disabled prose is in 7 routes, not the set the audit named.** `campaign` and `creator` are already **correct**; `voiceover` is broken and was omitted. Correct list: `analysis`, `edit`, `photoshoot`, `plan`, `prompt-builder`, `storyboard`, `voiceover`.
- **`failed_to_create_generation` is returned by all nine routes**, not two.
- **The fallback badge is not unrenderable.** It renders today in creator and voiceover, fed from the **API response**, not from `generations.model`. Those are two different problems and Tasks 11 and 12 separate them.

## Facts established during research — do not re-derive

- `maintenance_mode` and `studio_disabled` are **already** in `KNOWN_ERROR_CODES` (`lib/studio-errors.ts:10-11`) with messages in both locales. Task 10 touches no message file.
- `studio.usedFallback` **already** exists in both locales. `FinalizePatch` **already** accepts `model?: string` (`lib/supabase/generation-writes.ts:38`). `generations.Update` **already** has `model?: string` (`lib/supabase/types.ts:163`). Task 11 needs no type or i18n work.
- `edit.original` / `edit.afterEdit` **already** exist and are the exact strings hardcoded as `alt` at `edit/page.tsx:231-232`.
- **`temperature: options.temperature || 0.7` is a live trap** (`gemini.ts:168`, `openai.ts:105`). `||` coerces a deliberate `temperature: 0` back to `0.7`. Task 1 changes it to `??` in both clients.
- **Tailwind v3.4.19 silently drops `X-[var(--token)]/NN`.** Measured with `npx tailwindcss` against a probe and confirmed in the built stylesheet. `color-mix(in_srgb,var(--t)_NN%,transparent)` as an arbitrary value **does** compile. Named-theme alpha (`bg-primary-900/20`, `bg-black/50`) is unaffected. This is Task 14.
- `contrast-tokens` reads `app/globals.css` only and never opens a `.tsx`; `theme-aware-text-color` matches only `text-primary-500|600`. Neither can see a hardcoded `bg-green-50`. Task 13 is a **gap**, not a bypass.

---

# PART A — Output quality

### Task 1: Ask the model for JSON instead of scraping prose

**Files:**
- Create: `lib/ai/response-schemas.ts`
- Create: `scripts/tests/response-schemas.test.ts`
- Modify: `lib/ai/gemini.ts`, `lib/ai/openai.ts`, `lib/ai/router.ts`
- Modify: `app/api/studios/{plan,analysis,storyboard,campaign,prompt-builder}/route.ts` (the `generateText` calls only)
- Modify: `package.json`

**Interfaces:**
- Produces: `GenerateTextOptions.responseSchema?: Record<string, unknown>` on all three AI modules, and `PLAN_RESPONSE_SCHEMA`, `ANALYSIS_RESPONSE_SCHEMA`, `STORYBOARD_RESPONSE_SCHEMA`, `CAMPAIGN_RESPONSE_SCHEMA`, `PROMPT_BUILDER_RESPONSE_SCHEMA` from `lib/ai/response-schemas.ts`.

**This task lands FIRST and ALONE.** It edits the three shared AI-client files every other Part A task sits on top of. Interleaving it with Tasks 2–9 collides in `router.ts`.

**The defect.** Five paid deliverables are extracted with `text.match(/\{[\s\S]*\}/)` or `/\[[\s\S]*\]/` from free-form prose generated at temperature 0.7. The shape contract exists only as English sentences inside the prompt. A model that prefixes one explanatory line still parses; a model that wraps two objects does not.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/response-schemas.test.ts`:

```ts
/**
 * Proof that each studio's response schema matches the Zod schema its route parses.
 *
 *   npx tsx scripts/tests/response-schemas.test.ts
 *
 * WHY A KEY-PARITY TEST AND NOT A ROUND TRIP
 *
 * The value of asking the model for JSON is entirely lost if the shape we ask for
 * is not the shape we then validate — we would have replaced "hope the prose
 * parses" with "hope the two schemas agree", which is worse because it looks
 * solved. The route schemas are declared inline in the route files and are not
 * exported; exporting them just to compare would be scope creep, so the expected
 * key set is stated here as a literal and must be updated deliberately when a
 * route schema changes. That is the point: a silent drift becomes a failing test.
 */
import {
  ANALYSIS_RESPONSE_SCHEMA,
  CAMPAIGN_RESPONSE_SCHEMA,
  PLAN_RESPONSE_SCHEMA,
  PROMPT_BUILDER_RESPONSE_SCHEMA,
  STORYBOARD_RESPONSE_SCHEMA,
} from '../../lib/ai/response-schemas';

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${String(expected)}, got ${String(actual)}`);
  }
}

/** The object-valued schema's top-level property names, sorted. */
function keysOf(schema: Record<string, unknown>): string {
  const props = (schema.properties ?? {}) as Record<string, unknown>;
  return Object.keys(props).sort().join(',');
}

/** An array schema's ITEM property names, sorted. */
function itemKeysOf(schema: Record<string, unknown>): string {
  const items = (schema.items ?? {}) as Record<string, unknown>;
  const props = (items.properties ?? {}) as Record<string, unknown>;
  return Object.keys(props).sort().join(',');
}

// ---- Keys must match the Zod schema each route actually parses. ----
// PlanSchema — app/api/studios/plan/route.ts. `kpis` stays in the schema even
// though the completeness gate no longer counts it (see the money-correctness
// plan): it is parsed and stored, just not proof of a finished plan.
check('plan', keysOf(PLAN_RESPONSE_SCHEMA), 'budget,calendar,channels,kpis,objectives');

// AnalysisSchema — app/api/studios/analysis/route.ts
check('analysis', keysOf(ANALYSIS_RESPONSE_SCHEMA), 'competitors,kpis,personas,roadmap,swot');

// ScenesSchema — app/api/studios/storyboard/route.ts is an ARRAY of scenes.
check('storyboard is an array', STORYBOARD_RESPONSE_SCHEMA.type, 'array');
check(
  'storyboard scene',
  itemKeysOf(STORYBOARD_RESPONSE_SCHEMA),
  'camera_angle,camera_movement,dialogue,duration_seconds,mood,music_note,on_screen_text,scene_number,title,transition,visual_description'
);

// CampaignPostSchema — app/api/studios/campaign/route.ts:27, an ARRAY of posts.
check('campaign is an array', CAMPAIGN_RESPONSE_SCHEMA.type, 'array');
check('campaign post', itemKeysOf(CAMPAIGN_RESPONSE_SCHEMA), 'caption,hashtags,scenario,schedule,tov');

// prompt-builder returns an array of {prompt, style, tip}
check('prompt-builder is an array', PROMPT_BUILDER_RESPONSE_SCHEMA.type, 'array');
check('prompt-builder item', itemKeysOf(PROMPT_BUILDER_RESPONSE_SCHEMA), 'prompt,style,tip');

// ---- Every schema must be a shape the providers accept. ----
for (const [name, schema] of Object.entries({
  plan: PLAN_RESPONSE_SCHEMA,
  analysis: ANALYSIS_RESPONSE_SCHEMA,
  storyboard: STORYBOARD_RESPONSE_SCHEMA,
  campaign: CAMPAIGN_RESPONSE_SCHEMA,
  promptBuilder: PROMPT_BUILDER_RESPONSE_SCHEMA,
})) {
  check(`${name}: declares a type`, typeof schema.type, 'string');
  // Gemini's responseSchema is an OpenAPI 3.0 subset and rejects these two.
  const json = JSON.stringify(schema);
  check(`${name}: no $ref (unsupported by the OpenAPI subset)`, json.includes('"$ref"'), false);
  check(`${name}: no additionalProperties`, json.includes('"additionalProperties"'), false);
}

if (failures > 0) {
  console.log(`\n[response-schemas] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[response-schemas] ${checks} checks passed`);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx scripts/tests/response-schemas.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Read the five route schemas before writing the response schemas**

```bash
sed -n '55,105p' app/api/studios/plan/route.ts
sed -n '55,100p' app/api/studios/analysis/route.ts
sed -n '30,70p' app/api/studios/storyboard/route.ts
sed -n '25,35p' app/api/studios/campaign/route.ts
sed -n '70,90p' app/api/studios/prompt-builder/route.ts
```

The response schema must mirror what each route **parses**, not what its prompt currently asks for —
those disagree today, and Tasks 2–3 fix the prompts to match. If a key in the test above is not in the
route's Zod schema, fix the test literal and say so in the commit.

- [ ] **Step 4: Create the response schemas**

Create `lib/ai/response-schemas.ts`. Each export is an **OpenAPI-3.0-subset** schema — Gemini's
`responseSchema` accepts only `type`, `properties`, `items`, `required`, `enum`, `description`,
`nullable`. **No `$ref`, no `additionalProperties`, no `oneOf`.**

```ts
/**
 * The shape each text studio asks the model for.
 *
 * These mirror the Zod schemas the routes parse. Kept in ONE module so the two
 * cannot drift silently — scripts/tests/response-schemas.test.ts asserts key
 * parity against a literal key list, so a change to a route schema that is not
 * reflected here fails the build.
 *
 * OpenAPI 3.0 SUBSET ONLY. Gemini's responseSchema rejects $ref,
 * additionalProperties and oneOf; the OpenAI path shares the same object with
 * strict:false, which tolerates the subset. Do not "improve" these with JSON
 * Schema features — the failure is a 400 that costs all five studios their
 * fallback provider.
 */

const text = { type: 'string' } as const;

export const PLAN_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    objectives: {
      type: 'array',
      items: { type: 'object', properties: { goal: text, kpi: text, target: text }, required: ['goal', 'kpi', 'target'] },
    },
    channels: {
      type: 'array',
      items: { type: 'object', properties: { name: text, budget_pct: { type: 'number' }, strategy: text }, required: ['name', 'budget_pct', 'strategy'] },
    },
    calendar: {
      type: 'array',
      items: { type: 'object', properties: { week: { type: 'number' }, content: { type: 'array', items: text }, channel: text }, required: ['week', 'content', 'channel'] },
    },
    budget: {
      type: 'object',
      properties: {
        total: text,
        breakdown: { type: 'array', items: { type: 'object', properties: { item: text, amount: text, pct: { type: 'number' } }, required: ['item', 'amount', 'pct'] } },
      },
      required: ['total', 'breakdown'],
    },
    kpis: {
      type: 'array',
      items: { type: 'object', properties: { metric: text, target: text, tracking: text }, required: ['metric', 'target', 'tracking'] },
    },
  },
  required: ['objectives', 'channels', 'calendar', 'budget'],
};
```

Write `ANALYSIS_RESPONSE_SCHEMA`, `STORYBOARD_RESPONSE_SCHEMA`, `CAMPAIGN_RESPONSE_SCHEMA` and
`PROMPT_BUILDER_RESPONSE_SCHEMA` the same way, mirroring what Step 3 showed you. Storyboard, campaign
and prompt-builder are `{ type: 'array', items: { … } }` at the top level, not objects.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx scripts/tests/response-schemas.test.ts`
Expected: passes. If a key-parity check fails, the schema and the route disagree — fix whichever is
actually wrong, and say which in the commit.

- [ ] **Step 6: Thread `responseSchema` through the Gemini client**

In `lib/ai/gemini.ts`, extend `GenerateTextOptions`:

```ts
  /**
   * An OpenAPI-3.0-subset schema. When present the request ASKS the model for JSON
   * of this shape (`responseMimeType` + `responseSchema`) instead of hoping that
   * prose written at temperature 0.7 happens to contain a parseable object. The
   * regex scrape at each call site stays in place on purpose: it still matches a
   * pure-JSON body, so a model or endpoint that ignores the field degrades to
   * today's behaviour rather than failing.
   */
  responseSchema?: Record<string, unknown>;
```

and replace the `generationConfig` block in the request body:

```ts
        generationConfig: {
          maxOutputTokens: options.maxTokens || 4096,
          // `??`, not `||`: a deliberate temperature of 0 — which is what a
          // schema-constrained request wants — was coerced back to 0.7.
          temperature: options.temperature ?? 0.7,
          ...(options.responseSchema
            ? { responseMimeType: 'application/json', responseSchema: options.responseSchema }
            : {}),
        },
```

- [ ] **Step 7: Thread it through the OpenAI client**

In `lib/ai/openai.ts`, add the same `responseSchema?: Record<string, unknown>` to its
`GenerateTextOptions`, then after the `isNextGen` branch and before the fetch:

```ts
  if (options.responseSchema) {
    // strict:false deliberately. Strict mode demands additionalProperties:false and
    // every property listed in `required`; the schema this shares with the Gemini
    // path satisfies neither, and a 400 here costs all five studios their fallback
    // provider — the same failure shape already documented for max_tokens.
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'studio_output', strict: false, schema: options.responseSchema },
    };
  }
  if (!isNextGen) {
    body.temperature = options.temperature ?? 0.7;
  }
```

- [ ] **Step 8: Thread it through the router**

In `lib/ai/router.ts`, add `responseSchema?: Record<string, unknown>;` to `TextGenerationInput`, and
pass `responseSchema: input.responseSchema` in **both** the `gemini` and `gpt` switch arms. Missing one
arm means the fallback provider silently reverts to prose.

- [ ] **Step 9: Pass a schema from each of the five routes**

At each `generateText({ … })` call, add the matching schema and a low temperature:

```ts
      const result = await generateText({
        prompt,
        maxTokens: 8192,
        temperature: 0.2,
        responseSchema: PLAN_RESPONSE_SCHEMA,
      });
```

**Leave every existing regex scrape and Zod parse exactly as it is.** They are the degradation path if
a provider ignores the field, and they are what the money-correctness plan's shape validation depends
on. Removing them is not part of this task.

Do this for `plan`, `analysis`, `storyboard`, `campaign` and `prompt-builder`.

- [ ] **Step 10: Register the test and verify**

In `package.json` add `"test:response-schemas": "npx tsx scripts/tests/response-schemas.test.ts",` and
append ` && npm run test:response-schemas` to `prebuild`.

Run: `npx tsc --noEmit` — no output.
Run: `grep -rn "temperature: options.temperature ||" lib/ai/` — no output. Both clients use `??`.

- [ ] **Step 11: Verify against a live model**

Tests cannot prove this — the whole point is what a remote model returns. Run the dev server and
generate one real `plan` and one real `campaign`. Confirm both complete and their output renders. Then
force the fallback path (temporarily unset `GOOGLE_GEMINI_API_KEY`) and confirm the OpenAI arm also
returns parseable JSON rather than a 400.

If OpenAI 400s on the schema, the cause is almost certainly a JSON Schema feature outside the subset —
re-read Step 4's constraint list.

- [ ] **Step 12: Commit**

```bash
git add lib/ai/response-schemas.ts lib/ai/gemini.ts lib/ai/openai.ts lib/ai/router.ts app/api/studios/plan/route.ts app/api/studios/analysis/route.ts app/api/studios/storyboard/route.ts app/api/studios/campaign/route.ts app/api/studios/prompt-builder/route.ts scripts/tests/response-schemas.test.ts package.json
git commit -m "feat(ai): ask the text models for JSON instead of scraping it out of prose"
```

---

### Task 2: Prompt hygiene across plan, analysis and storyboard

**Files:**
- Modify: `lib/ai/prompts/plan.ts` (lines 45, 50-54, 57)
- Modify: `lib/ai/prompts/analysis.ts` (lines 20, 26, 40)
- Modify: `lib/ai/prompts/storyboard.ts` (line 35)
- Modify: `lib/ai/prompts/versions.ts`
- Create: `scripts/tests/prompts.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `scripts/tests/prompts.test.ts`, extended by Tasks 4–8.

Grouped because these three files' edits sit within 16 lines of each other in `plan.ts` and would
otherwise produce three conflicting patches of `buildPlanPrompt`.

**The defects, all four in one place:**
1. `plan.ts:45` — **every** plan tells the model the business is at `'Growth'` stage. The product never collects this.
2. `plan.ts:57` + `analysis.ts:40` — `quick_wins`, `risks`, `usp`, `gtm`, `pricing` and the KPI headline fields are generated, stored, and rendered by nothing.
3. `plan.ts:50-54` — the customer's 30/60/90-day choice reaches the prose but never constrains the calendar.
4. `analysis.ts:20` — the raw industry **slug** is interpolated into the CMO persona, producing *"20+ years of experience in the other industry"*.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/prompts.test.ts`:

```ts
/**
 * Golden-string assertions over what each prompt builder actually emits.
 *
 *   npx tsx scripts/tests/prompts.test.ts
 *
 * These builders produce the bytes a paid model is asked to work from, and nothing
 * else in the repo looks at them. Every defect this file guards was invisible in
 * review precisely because the prompt "reads fine" — a hardcoded 'Growth' stage, a
 * duration the calendar never sees, a slug rendered as "the other industry". They
 * are all trivially assertable on the returned string.
 *
 * Pure, no network, no database. Belongs in prebuild next to test:safety.
 */
import { buildPlanPrompt } from '../../lib/ai/prompts/plan';
import { buildAnalysisPrompt } from '../../lib/ai/prompts/analysis';
import { buildStoryboardPrompt } from '../../lib/ai/prompts/storyboard';

let failures = 0;
let checks = 0;

function contains(label: string, haystack: string, needle: string): void {
  checks++;
  if (!haystack.includes(needle)) {
    failures++;
    console.log(`FAIL  ${label}\n        expected the prompt to contain: ${needle}`);
  }
}

function omits(label: string, haystack: string, needle: string): void {
  checks++;
  if (haystack.includes(needle)) {
    failures++;
    console.log(`FAIL  ${label}\n        expected the prompt NOT to contain: ${needle}`);
  }
}

const planInput = {
  businessName: 'Acme Coffee',
  industry: 'fnb',
  goals: ['raise awareness', 'grow followers'],
  targetMarket: 'UAE, 25-40, urban professionals',
  budget: '$1,000 - $2,000',
  duration: 60,
};

// ---- plan ----
{
  const p = buildPlanPrompt(planInput);
  omits('plan: no invented business stage', p, 'Growth');
  contains('plan: the chosen duration constrains the calendar', p, '60');
  omits('plan: does not ask for quick_wins nothing renders', p, 'quick_wins');
  omits('plan: does not ask for risks nothing renders', p, 'risks');
  contains('plan: still asks for the four rendered sections', p, 'objectives');
  contains('plan: still asks for channels', p, 'channels');
  contains('plan: still asks for calendar', p, 'calendar');
  contains('plan: still asks for budget', p, 'budget');
}

// ---- analysis ----
{
  const a = buildAnalysisPrompt({
    businessName: 'Acme Coffee',
    industry: 'fnb',
    description: 'specialty coffee roaster',
    targetMarket: 'UAE, 25-40, urban professionals',
  });
  omits('analysis: the raw slug never reaches the persona', a, 'the fnb industry');
  omits('analysis: no "other industry" filler', a, 'the other industry');
  omits('analysis: does not ask for usp nothing renders', a, '"usp"');
  omits('analysis: does not ask for gtm nothing renders', a, '"gtm"');
  omits('analysis: does not ask for pricing nothing renders', a, '"pricing"');
  contains('analysis: still asks for competitors', a, 'competitors');
  contains('analysis: still asks for swot', a, 'swot');
  contains('analysis: still asks for personas', a, 'personas');
}

// ---- storyboard ----
{
  const s = buildStoryboardPrompt({ concept: 'a launch film', duration: 30, style: 'cinematic', platform: 'tiktok' });
  contains('storyboard: still asks for nine scenes', s, '9 scenes');
  contains('storyboard: the duration reaches the model', s, '30');
}

if (failures > 0) {
  console.log(`\n[prompts] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[prompts] ${checks} checks passed`);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx scripts/tests/prompts.test.ts`
Expected: FAIL on `plan: no invented business stage`, the `quick_wins`/`risks` omissions, and the
analysis slug and `usp`/`gtm`/`pricing` omissions.

- [ ] **Step 3: Read all three builders before editing**

```bash
cat -n lib/ai/prompts/plan.ts
cat -n lib/ai/prompts/analysis.ts
sed -n '30,45p' lib/ai/prompts/storyboard.ts
```

- [ ] **Step 4: Remove the invented business stage from `plan.ts:45`**

Delete the line that states a business stage. The product never asks the customer for one, so any value
here is fabricated context steering every plan it generates. Do **not** replace it with a guess — if a
stage is genuinely useful, collecting it is a product change, not a prompt change.

- [ ] **Step 5: Make the duration constrain the calendar (`plan.ts:50-54`)**

The `duration` parameter already reaches the builder. Make the calendar instruction state the number of
weeks explicitly rather than describing a generic calendar:

```ts
  const weeks = Math.max(1, Math.round(duration / 7));
  prompt += `\n- calendar: exactly ${weeks} entries, one per week, covering the full ${duration}-day period. Week numbers run 1..${weeks}.`;
```

Place it where the calendar is described. Keep the surrounding JSON-shape lines intact.

- [ ] **Step 6: Delete the sections nothing renders**

From `plan.ts:57`, remove `quick_wins` and `risks` from the requested shape. From `analysis.ts:40`,
remove `usp`, `gtm` and `pricing`, and the KPI headline fields the page never reads.

**Confirm before deleting**, so this does not remove something that is rendered:

```bash
grep -rn "quick_wins\|risks\|\.usp\|\.gtm\|\.pricing" "app/[locale]/(dashboard)" components/ lib/export/
```

Expected: no output for the fields you are deleting. Any hit means that field **is** rendered — keep it
and say so in the commit.

`kpis` stays in both prompts: it is parsed and stored, and the analysis PDF renders it. It is simply not
proof of a finished plan — that is the money-correctness plan's completeness gate, a different fix.

- [ ] **Step 7: Stop the slug reaching the persona (`analysis.ts:20`)**

The route receives `industry` as a slug (`fnb`, `retail`, `other`) because
`app/[locale]/(dashboard)/analysis/page.tsx:109` does `setIndustry(ind)` with the raw slug while
rendering only the translated label. Add a slug→English-name table in the builder:

```ts
/**
 * Slug -> the English industry name a model can reason about. The page stores the
 * SLUG (analysis/page.tsx:109) and renders the translated label separately, so the
 * raw value was reaching the persona line and producing "20+ years of experience
 * in the other industry". Keys must stay in step with the slug list at
 * app/[locale]/(dashboard)/analysis/page.tsx:29.
 */
const INDUSTRY_NAMES: Record<string, string> = {
  fnb: 'food and beverage',
  retail: 'retail',
  tech: 'technology',
  beauty: 'beauty and personal care',
  fashion: 'fashion',
  health: 'health and wellness',
  education: 'education',
  realestate: 'real estate',
  other: '',
};
```

Read `analysis/page.tsx:29` and make the keys match its actual slug list. Then build the persona line so
`other` degrades to a general marketer rather than "the other industry":

```ts
  const industryName = INDUSTRY_NAMES[industry] ?? '';
  const persona = industryName
    ? `a CMO with 20+ years of experience in the ${industryName} industry`
    : 'a CMO with 20+ years of cross-industry experience';
```

- [ ] **Step 8: Bump the prompt versions**

In `lib/ai/prompts/versions.ts`, raise `marketing_plan`, `marketing_analysis` and `storyboard` to `2.0`.

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx tsx scripts/tests/prompts.test.ts` — passes.
Run: `npx tsc --noEmit` — no output.

- [ ] **Step 10: Register the test as a build gate**

In `package.json` add `"test:prompts": "npx tsx scripts/tests/prompts.test.ts",` and append
` && npm run test:prompts` to `prebuild`.

- [ ] **Step 11: Commit**

```bash
git add lib/ai/prompts/plan.ts lib/ai/prompts/analysis.ts lib/ai/prompts/storyboard.ts lib/ai/prompts/versions.ts scripts/tests/prompts.test.ts package.json
git commit -m "fix(prompts): stop inventing context and stop paying for sections nothing renders"
```

---

### Task 3: Generate in the customer's language

**Files:**
- Modify: `lib/ai/prompts/{plan,analysis,storyboard}.ts`
- Modify: `app/api/studios/{plan,analysis,storyboard}/route.ts`
- Modify: `app/[locale]/(dashboard)/{plan,analysis,storyboard}/page.tsx`
- Modify: `scripts/tests/prompts.test.ts`

**Interfaces:**
- Consumes: `scripts/tests/prompts.test.ts` from Task 2.
- Produces: `locale?: string` on all three prompt inputs and all three route schemas.

**The defect.** Every plan, analysis and storyboard is generated in **Arabic** regardless of locale. An
English-locale customer pays 5, 3 or 14 credits for a deliverable they may not be able to read. The API
sits outside `app/[locale]`, so the caller's language is not recoverable server-side — and
`profiles.locale` is a dead column (`lib/stripe/locale.ts:8-17` documents why). The page must send it.

- [ ] **Step 1: Add the assertions**

Append to `scripts/tests/prompts.test.ts`, before the final `if (failures > 0)`:

```ts
// ---- The deliverable is written in the language the customer reads. ----
{
  const ar = buildPlanPrompt({ ...planInput, locale: 'ar' });
  const en = buildPlanPrompt({ ...planInput, locale: 'en' });
  contains('plan/ar: asks for Arabic', ar, 'Arabic');
  contains('plan/en: asks for English', en, 'English');
  omits('plan/en: does not also demand Arabic', en, 'in Arabic');

  const noLocale = buildPlanPrompt(planInput);
  contains('plan: defaults to Arabic when no locale is given', noLocale, 'Arabic');
}
{
  const base = { businessName: 'Acme', industry: 'fnb', description: 'roaster', targetMarket: 'UAE' };
  contains('analysis/en: asks for English', buildAnalysisPrompt({ ...base, locale: 'en' }), 'English');
  contains('analysis/ar: asks for Arabic', buildAnalysisPrompt({ ...base, locale: 'ar' }), 'Arabic');
}
{
  const sb = { concept: 'a launch film', duration: 30, style: 'cinematic', platform: 'tiktok' };
  contains('storyboard/en: dialogue in English', buildStoryboardPrompt({ ...sb, locale: 'en' }), 'English');
  contains('storyboard/ar: dialogue in Arabic', buildStoryboardPrompt({ ...sb, locale: 'ar' }), 'Arabic');
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/tests/prompts.test.ts`
Expected: FAIL on the `/en` assertions — the prompts hardcode Arabic.

- [ ] **Step 3: Add `locale` to the three builders**

In each of `plan.ts`, `analysis.ts`, `storyboard.ts`, add to the input interface:

```ts
  /** The locale the customer is READING the app in. Defaults to Arabic, which is
   *  what this prompt used to hardcode — an English-locale customer paid full
   *  price for a deliverable they could not read. */
  locale?: string;
```

Destructure it, and derive one value:

```ts
  const outputLanguage = locale === 'en' ? 'English' : 'Arabic';
```

Then replace the hardcoded language instructions:

- `plan.ts:61` → `` prompt += `\n\nAll text in ${outputLanguage}. Be specific, actionable, and realistic for the given budget.`; ``
- `analysis.ts:43-44` → `` prompt += `\n\nAll text content in ${outputLanguage}. Be specific, actionable, and tailored to the market context.`; `` followed by the existing Gulf/MENA insights line unchanged.
- `analysis.ts:36`'s `"3 Arabic taglines"` → `` `"taglines": ["3 ${outputLanguage} taglines"]` ``
- `storyboard.ts:38` → `` prompt += `\n  "dialogue": "Spoken text or voice-over in ${outputLanguage}",`; ``

**Keep the Gulf/MENA market-insight instruction in both languages.** The market is the Gulf whichever
language the customer reads in; only the output language changes.

- [ ] **Step 4: Accept `locale` in the three routes**

In each route, add to `InputSchema`:

```ts
import { routing } from '@/i18n/routing';
// …
  // The API sits outside app/[locale], so the caller's language is not
  // recoverable server-side — and profiles.locale is a dead column
  // (see lib/stripe/locale.ts:8-17). Optional, so existing callers keep working.
  locale: z.enum(routing.locales as unknown as [string, ...string[]]).optional(),
```

and pass it at the builder call:

```ts
      locale: input.locale ?? routing.defaultLocale,
```

- [ ] **Step 5: Send `locale` from the three pages**

In each page, extend the existing next-intl import to `import { useTranslations, useLocale } from 'next-intl';`,
add `const locale = useLocale();` beside the existing `useTranslations()` call, add `locale,` to the
POST body, and add `locale` to that `useCallback`'s dependency array.

**The dependency array matters.** Omitting it means a customer who switches language mid-session keeps
posting the old locale, which is the kind of bug that only shows up for the one user who tries it.

- [ ] **Step 6: Verify**

Run: `npx tsx scripts/tests/prompts.test.ts` — passes.
Run: `npx tsc --noEmit` — no output.
Run: `npm run lint` — clean (the dependency arrays are what this catches).

- [ ] **Step 7: Verify live in both locales**

Run the dev server. Generate a plan from `/en/plan` and confirm the output is English; generate one from
`/ar/plan` and confirm it is Arabic.

- [ ] **Step 8: Commit**

```bash
git add lib/ai/prompts/plan.ts lib/ai/prompts/analysis.ts lib/ai/prompts/storyboard.ts app/api/studios/plan/route.ts app/api/studios/analysis/route.ts app/api/studios/storyboard/route.ts "app/[locale]/(dashboard)/plan/page.tsx" "app/[locale]/(dashboard)/analysis/page.tsx" "app/[locale]/(dashboard)/storyboard/page.tsx" scripts/tests/prompts.test.ts
git commit -m "fix(prompts): generate the deliverable in the language the customer reads"
```

---

### Task 4: Stop the creator prompt ordering the model to preserve an image that is not there

**Files:**
- Modify: `lib/ai/prompts/creator.ts`
- Modify: `lib/ai/prompts/versions.ts`
- Modify: `scripts/tests/prompts.test.ts`

**Interfaces:**
- Consumes: `buildCreatorPrompt`'s signature from the security plan's Task 1 (which adds `safe*` locals). **Land the security plan's Task 1 first** — both edit this function.

**The defect.** The prompt unconditionally emits:

```
- STRICTLY PRESERVE all original brand elements
- STRICTLY PRESERVE original product appearance and branding
```

Creator is a **text-to-image** studio. On the default path there is no original — the model is being
told to preserve something that does not exist, then told one line later to compose freely. When a
reference image *is* attached, nothing tells the model it exists or what it is for.

- [ ] **Step 1: Add the assertions**

Append to `scripts/tests/prompts.test.ts`:

```ts
import { buildCreatorPrompt } from '../../lib/ai/prompts/creator';

// ---- creator: preservation is conditional on there being something to preserve ----
{
  const noRef = buildCreatorPrompt({ userPrompt: 'a red shoe on marble', style: 'photographic', resolution: '1080p' });
  omits('creator/no reference: does not order preservation of a nonexistent original', noRef, 'STRICTLY PRESERVE');
  contains('creator/no reference: still states the subject', noRef, 'a red shoe on marble');

  const withRef = buildCreatorPrompt({ userPrompt: 'a red shoe on marble', style: 'photographic', resolution: '1080p', hasReferenceImage: true });
  contains('creator/reference: tells the model an image is attached', withRef, 'reference image');
  contains('creator/reference: asks for the subject to survive', withRef, 'PRESERVE');
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx scripts/tests/prompts.test.ts`
Expected: FAIL — `STRICTLY PRESERVE` is emitted unconditionally, and `hasReferenceImage` is not a
parameter.

- [ ] **Step 3: Make preservation conditional**

Add `hasReferenceImage?: boolean;` to `CreatorPromptInput`, destructure it, and replace the two
unconditional `STRICTLY PRESERVE` lines with:

```ts
  prompt += `\n\nTechnical Requirements:`;
  if (hasReferenceImage) {
    // Only meaningful when gemini.ts actually attached an image. Emitted
    // unconditionally, this told the model to preserve an original that does not
    // exist on the text-to-image path — and then contradicted itself one line
    // later by asking for a free composition.
    prompt += `\n- A reference image is attached. Treat it as the subject.`;
    prompt += `\n- PRESERVE the subject's shape, proportions, colours, materials and any printed text exactly`;
    prompt += `\n- Change only the setting, lighting and composition described above`;
  }
  prompt += `\n- NO extra text, logos, or watermarks unless specified`;
  prompt += `\n- Professional studio lighting unless otherwise specified`;
  prompt += `\n- High contrast, commercially appealing composition`;
  prompt += `\n- Resolution optimized for ${platform ? safePlatform : 'general use'}`;
```

- [ ] **Step 4: Pass the flag from the route**

In `app/api/studios/creator/route.ts`, at the `buildCreatorPrompt({ … })` call, add:

```ts
          hasReferenceImage: Boolean(input.referenceImageUrl),
```

- [ ] **Step 5: Update the admin-override composer**

`OVERRIDE_BRIEF_LABELS` at `creator/route.ts:34-40` restates the builder's labels by hand. Adding a
brief line to the builder without adding it here means an admin override silently drops it — the exact
defect documented at `campaign/route.ts:44-56`.

The reference-image instruction is a **technical requirement**, not a labelled brief field, so it does
not belong in `OVERRIDE_BRIEF_LABELS`. Confirm by reading `composeOverridePrompt` and, if the override
path also needs to know an image is attached, add it there explicitly. Record which you chose in the
commit message.

- [ ] **Step 6: Bump the version and verify**

Raise `creator_image` to `2.0` in `lib/ai/prompts/versions.ts`.

Run: `npx tsx scripts/tests/prompts.test.ts` — passes.
Run: `npx tsc --noEmit` — no output.

- [ ] **Step 7: Verify live**

Generate one creator image with no reference and one with a reference. Both must complete, and the
referenced one must resemble the reference.

- [ ] **Step 8: Commit**

```bash
git add lib/ai/prompts/creator.ts app/api/studios/creator/route.ts lib/ai/prompts/versions.ts scripts/tests/prompts.test.ts
git commit -m "fix(prompts): creator only asks to preserve an original when one is attached"
```

---

### Task 5: Give the campaign studio its brand kit and its image constraints

**Files:**
- Modify: `app/api/studios/campaign/route.ts` (the brand-kit `select` at ~`:131-138`, and the `generateImage` call at ~`:281-292`)
- Modify: `lib/ai/prompts/versions.ts`

**Interfaces:**
- Consumes: `buildCampaignPrompt`'s existing `brandVoice` / `brandColors` parameters — **they already exist and are simply never passed.** The builder needs no change.
- Consumes: the security plan's Task 5, which adds `safeScenario` to this same image block. **Land that first**, then extend the prompt it builds.

**The defects.**
1. The route fetches only `name` from the brand kit, so a customer who attaches one gets a name and nothing else — while `buildCampaignPrompt`'s `brandVoice` and `brandColors` parameters sit dead.
2. Campaign images are generated from `prompt: post.scenario` — a bare model-written sentence with **none** of the technical constraints every other image in the product gets.

- [ ] **Step 1: Fetch the whole brand kit**

Change the brand-kit query at `campaign/route.ts:131-138` from `.select('name')` to `.select('*')`,
matching what `creator/route.ts:136` already does.

- [ ] **Step 2: Pass voice and colours to the prompt**

At the `buildCampaignPrompt({ … })` call, add:

```ts
      brandVoice: brandKit?.brand_voice ? sanitizePrompt(String(brandKit.brand_voice), 500) : undefined,
      brandColors: brandKit
        ? sanitizePrompt(
            `Primary ${brandKit.primary_color}, Secondary ${brandKit.secondary_color}, Accent ${brandKit.accent_color}`,
            200
          )
        : undefined,
```

The caps mirror `CreateBrandKitSchema` and the security plan's builder caps, for the reason recorded
there: `brand_kits` has no column-level GRANT lockdown, so these values are customer-writable to any
string over PostgREST.

- [ ] **Step 3: Update the admin-override composer**

`campaign/route.ts:172-179` composes the override brief by hand. Add the brand voice and colours lines
there too, or an admin override silently drops them. `campaign/route.ts:44-56` documents the last time
this exact omission shipped, with `dialect`.

- [ ] **Step 4: Give campaign images the constraints every other image gets**

Read what `buildCreatorPrompt` emits under `Technical Requirements` and give the campaign image call the
same class of direction. Replace the bare `prompt: safeScenario` with a composed brief:

```ts
        // `post.scenario` is one model-written sentence. Every other image in the
        // product goes to the model with platform framing, brand colours and the
        // no-text rule; this path had none of it, which is why campaign images
        // look nothing like the rest of the product's output.
        const imagePrompt =
          `Create a professional social media image.` +
          `\n- Scene: ${safeScenario}` +
          `\n- Platform: ${input.platform}` +
          (brandColorsLine ? `\n- Brand Colors: ${brandColorsLine}` : '') +
          `\n\nTechnical Requirements:` +
          `\n- NO text, logos or watermarks in the image` +
          `\n- Professional lighting, high contrast, commercially appealing composition` +
          `\n- Composed for ${input.platform}`;
```

Hoist `brandColorsLine` out of the `posts.map` callback so it is computed once, not nine times.

**Keep `- NO text` even though these are social posts.** `CLAUDE.md` records that Arabic text inside
generated images is not handled and prompts actively forbid it; the caption is delivered as text
alongside the image.

- [ ] **Step 5: Bump the version and verify**

Raise `campaign_planner` to `2.0`.

Run: `npx tsc --noEmit` — no output.
Run: `npm run check:invariants` — 12/12.

- [ ] **Step 6: Verify live**

Generate one campaign **with** a brand kit attached and images on. Confirm it completes, the images
reflect the brand colours, and no image contains text.

- [ ] **Step 7: Commit**

```bash
git add app/api/studios/campaign/route.ts lib/ai/prompts/versions.ts
git commit -m "fix(campaign): pass the brand kit through, and give campaign images real direction"
```

---

### Task 6: Give the edit studio a real prompt

**Files:**
- Create: `lib/ai/prompts/edit.ts`
- Modify: `app/api/studios/edit/route.ts` (the prompt construction at `:143`)
- Modify: `lib/ai/prompts/versions.ts`
- Modify: `scripts/tests/prompts.test.ts`

**Interfaces:**
- Produces: `buildEditPrompt(input: { editType: string; editDescription: string; brandKit?: BrandKit | null }): string`.

**The defect.** The entire prompt is:

```ts
`Image editing - ${editType.replace(/_/g, ' ')}: ${editDescription}`
```

A slug turned into two English words. A reference image **is** attached (`gemini.ts:96-105`) and nothing
tells the model it exists, what it is, or that the customer's subject must survive the edit — on the one
studio where that instruction is unconditionally correct. Edit is the only studio with no prompt file.

- [ ] **Step 1: Read the edit types the UI actually offers**

Run: `grep -n "editType\|background_replace\|object_remove\|color_change\|text_add" "app/[locale]/(dashboard)/edit/page.tsx" app/api/studios/edit/route.ts`

The `EDIT_MODES` table below must have a key for **every** type the schema accepts, or that mode falls
through to a generic prompt. Add any you find.

- [ ] **Step 2: Add the assertions**

Append to `scripts/tests/prompts.test.ts`:

```ts
import { buildEditPrompt } from '../../lib/ai/prompts/edit';

// ---- edit: the one studio where "preserve the original" is always correct ----
{
  const bg = buildEditPrompt({ editType: 'background_replace', editDescription: 'a marble kitchen counter' });
  contains('edit: tells the model an image is attached', bg, 'attached');
  contains('edit: names the customer instruction', bg, 'a marble kitchen counter');
  contains('edit: orders the subject preserved', bg, 'subject');

  const txt = buildEditPrompt({ editType: 'text_add', editDescription: 'SALE 50%' });
  contains('edit/text_add: permits text, which every other prompt forbids', txt, 'text');

  const unknown = buildEditPrompt({ editType: 'not_a_mode', editDescription: 'do a thing' });
  contains('edit: an unknown mode still produces a usable prompt', unknown, 'do a thing');
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx tsx scripts/tests/prompts.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 4: Create the prompt builder**

Create `lib/ai/prompts/edit.ts`:

```ts
import type { BrandKit } from '@/lib/supabase/types';
import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';

interface EditPromptInput {
  editType: string;
  editDescription: string;
  brandKit?: BrandKit | null;
}

/**
 * Per-edit-type direction.
 *
 * The whole prompt used to be `Image editing - ${editType.replace(/_/g,' ')}: ${desc}`,
 * i.e. the slug turned into two English words. A reference image WAS attached
 * (gemini.ts:96-105) and nothing told the model it existed, what it was, or that
 * the customer's subject had to survive the edit — on the one studio where that
 * instruction is unconditionally correct.
 *
 * `text_add` deliberately inverts the no-text rule every other prompt in this repo
 * carries: adding text is the whole point of that mode.
 */
const EDIT_MODES: Record<string, { task: string; must: string[]; avoid: string[] }> = {
  background_replace: {
    task: 'Replace ONLY the background behind the subject.',
    must: [
      'Keep the subject pixel-identical in shape, proportions, colours, materials and any printed text',
      'Cut cleanly around hair, fur, glass and transparent edges — no halo, no fringing',
      'Relight the subject to match the new background and ground it with a physically correct contact shadow',
    ],
    avoid: ['Altering, moving, cropping or restyling the subject itself'],
  },
  object_remove: {
    task: 'Remove the element the customer names and reconstruct what was behind it.',
    must: [
      'Reconstruct the occluded area from surrounding texture, perspective and lighting',
      'Leave every other element of the frame untouched',
    ],
    avoid: ['Blurring or smearing over the removed area instead of reconstructing it', 'Inventing a replacement object'],
  },
  color_change: {
    task: 'Change only the colour the customer names, on the surface they name.',
    must: [
      'Preserve shading, texture, reflections, highlights and material response through the colour change',
      'Leave every other colour in the frame exactly as it is',
    ],
    avoid: ['Applying a flat colour fill', 'Shifting the white balance or grade of the whole image'],
  },
  text_add: {
    // The one mode where text is wanted. Every other prompt in this repo forbids it.
    task: 'Add the text the customer specifies to the image.',
    must: [
      'Set the text in clean, correctly spelled Latin characters exactly as written, with no extra words',
      'Place it in existing negative space with enough contrast to be legible',
      'Match the perspective and lighting of the surface it sits on',
    ],
    avoid: [
      'Adding any text beyond what was asked for',
      'Covering or crossing the subject',
      'Arabic script — it does not render reliably',
    ],
  },
};

export function buildEditPrompt(input: EditPromptInput): string {
  const { editType, editDescription, brandKit } = input;
  const safeDescription = sanitizePrompt(editDescription, 1000);
  const mode = EDIT_MODES[editType];

  let prompt = `You are a professional retoucher working on the attached image.`;
  prompt += `\n\nThe attached image is the customer's own photograph. It is the subject of this edit and must survive it.`;
  prompt += `\n\nTask: ${mode ? mode.task : `Apply the requested edit: ${editType.replace(/_/g, ' ')}.`}`;
  prompt += `\nCustomer instruction: ${safeDescription}`;

  if (brandKit) {
    const safeColors = sanitizePrompt(
      `Primary ${brandKit.primary_color}, Secondary ${brandKit.secondary_color}, Accent ${brandKit.accent_color}`,
      200
    );
    prompt += `\nBrand Colors: ${safeColors}`;
  }

  if (mode) {
    prompt += `\n\nMust:`;
    for (const line of mode.must) prompt += `\n- ${line}`;
    prompt += `\n\nAvoid:`;
    for (const line of mode.avoid) prompt += `\n- ${line}`;
  }

  prompt += `\n\nReturn the edited image at the same aspect ratio and resolution as the original.`;

  return prompt;
}

export const EDIT_PROMPT_VERSION = getPromptVersion('edit');
```

- [ ] **Step 5: Register the version key**

Add `edit: '1.0'` to `PROMPT_VERSIONS` in `lib/ai/prompts/versions.ts`. `getPromptVersion` will throw or
return undefined for an unregistered key — check which by reading it, and make sure this key exists.

- [ ] **Step 6: Call it from the route**

In `app/api/studios/edit/route.ts:143`, replace the interpolated one-liner with
`buildEditPrompt({ editType: input.editType, editDescription: input.editDescription, brandKit })`.

If the route does not currently fetch a brand kit, **do not add a query for it** — pass `undefined` and
note it. Adding a round-trip is a separate decision and the business plan measures the serial-await
chain this would lengthen.

- [ ] **Step 7: Verify**

Run: `npx tsx scripts/tests/prompts.test.ts` — passes.
Run: `npx tsc --noEmit` — no output.

- [ ] **Step 8: Verify live, on every mode**

Run one real edit per mode the UI offers. Each must complete and the customer's subject must survive.
`text_add` is the one to check most carefully — it inverts the no-text rule.

- [ ] **Step 9: Commit**

```bash
git add lib/ai/prompts/edit.ts app/api/studios/edit/route.ts lib/ai/prompts/versions.ts scripts/tests/prompts.test.ts
git commit -m "feat(prompts): give the edit studio a real prompt instead of an interpolated slug"
```

---

### Task 7: Stop the photoshoot BRAND block contradicting its own preset

**Files:**
- Modify: `lib/ai/prompts/photoshoot.ts` (~`:458`)
- Modify: `lib/ai/prompts/versions.ts`
- Modify: `scripts/tests/prompts.test.ts`

- [ ] **Step 1: Read the preset and the block that follows it**

Run: `sed -n '430,470p' lib/ai/prompts/photoshoot.ts`

Identify precisely what the `white_studio` preset asserts (a seamless white background, neutral
lighting) and what the appended BRAND block then asserts (brand colours in the scene). These are
contradictory instructions arriving one after the other, and the model resolves the conflict
arbitrarily.

- [ ] **Step 2: Add an assertion that states the resolution you chose**

Append to `scripts/tests/prompts.test.ts` an assertion that, for the `white_studio` preset with a brand
kit attached, the prompt does **not** ask for brand colours in the background — expressed against the
actual strings you found in Step 1. Write the assertion first, then make it pass.

- [ ] **Step 3: Scope the BRAND block to where it does not conflict**

Make the brand-colour instruction apply to props, surfaces and accents rather than to the background,
and skip it entirely for presets whose whole definition is a controlled neutral background. The rule:
**a preset defines the scene; the brand kit tints what sits in it.**

- [ ] **Step 4: Bump the version and verify**

Photoshoot is already `3.0` — raise it to `3.1`.

Run: `npx tsx scripts/tests/prompts.test.ts` — passes.
Run: `npx tsc --noEmit` — no output.

- [ ] **Step 5: Verify live**

Run one photoshoot on `white_studio` **with** a brand kit and one without. The background must be white
in both.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/prompts/photoshoot.ts lib/ai/prompts/versions.ts scripts/tests/prompts.test.ts
git commit -m "fix(prompts): scope the photoshoot brand block so it stops contradicting its preset"
```

---

### Task 8: Give prompt-builder the context it already has

**Files:**
- Modify: `lib/ai/prompts/prompt-builder.ts`
- Modify: `app/api/studios/prompt-builder/route.ts`
- Modify: `lib/ai/prompts/versions.ts`
- Modify: `scripts/tests/prompts.test.ts`

**The defect.** The prompt uses none of the context the app holds and pins nothing about the shape the
route parses. Task 1 gave the route a response schema; this task makes the prompt agree with it.

- [ ] **Step 1: Read the builder and the route's parse**

```bash
cat -n lib/ai/prompts/prompt-builder.ts
sed -n '60,95p' app/api/studios/prompt-builder/route.ts
```

- [ ] **Step 2: Add assertions**

Append to `scripts/tests/prompts.test.ts` assertions that the built prompt names the three fields the
route parses (`prompt`, `style`, `tip`) and states the requested item count. Write them first.

- [ ] **Step 3: State the shape and use the context**

Make the prompt name the exact JSON shape (matching `PROMPT_BUILDER_RESPONSE_SCHEMA` from Task 1) and
incorporate the output type the customer chose. Bump `prompt_builder` to `2.0`.

- [ ] **Step 4: Verify**

Run: `npx tsx scripts/tests/prompts.test.ts` — passes.
Run: `npx tsc --noEmit` — no output.
Generate one real prompt-builder run and confirm it renders.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/prompts/prompt-builder.ts app/api/studios/prompt-builder/route.ts lib/ai/prompts/versions.ts scripts/tests/prompts.test.ts
git commit -m "fix(prompts): prompt-builder states the shape it is parsed against"
```

---

### Task 9: Wire up the voiceover prompt that was written and never called

**Files:**
- Modify: `lib/ai/prompts/voiceover.ts`
- Modify: `lib/ai/tts-router.ts`
- Modify: `lib/ai/prompts/versions.ts`

**Interfaces:**
- Produces: `DIALECT_PROMPTS`, `voiceOverNeedsEnhancement(dialect, tone, toneEnabled): boolean`, and `buildVoiceOverPrompt(input): string` from `lib/ai/prompts/voiceover.ts`.

**⚠ ORDERING.** This task **must land after** the money-correctness plan's Task 8 (voiceover repricing)
and after the security plan's Task 4 (tone becomes a table). All three edit `lib/ai/tts-router.ts`.
Doing this one first will conflict, and worse: the length target this prompt introduces is exactly what
makes the repricing correct.

**The defect.** `buildVoiceOverPrompt` is imported at `tts-router.ts:5` and **never called**. The prompt
that actually runs is an ad-hoc English one-liner assembled inline. The dead function has the
copywriting direction (length target, CTA, pacing) and no real dialect handling; the live one-liner has
the dialect handling and no direction. Neither is complete.

- [ ] **Step 1: Merge the live dialect table into the builder**

Move `DIALECT_PROMPTS` out of `lib/ai/tts-router.ts:89-95` and into `lib/ai/prompts/voiceover.ts`,
exported:

```ts
/**
 * Per-dialect rewrite instruction. Moved here from lib/ai/tts-router.ts, which is
 * where the LIVE prompt was assembled while this file's buildVoiceOverPrompt() sat
 * imported and never called. The dead function had the copywriting direction
 * (length target, CTA, pacing) and no real dialect handling; the live one-liner had
 * the dialect handling and no direction. This is both.
 *
 * `formal` is deliberately empty: فصحى needs no rewrite, and the caller skips the
 * model round-trip entirely when there is nothing to say.
 */
export const DIALECT_PROMPTS: Record<string, string> = {
  saudi: 'Rewrite in Saudi Arabian Arabic dialect (اللهجة السعودية). Keep the meaning but use Saudi expressions and vocabulary.',
  emirati: 'Rewrite in Emirati Arabic dialect (اللهجة الإماراتية). Keep the meaning but use UAE expressions.',
  egyptian: 'Rewrite in Egyptian Arabic dialect (اللهجة المصرية). Keep the meaning but use Egyptian expressions.',
  gulf: 'Rewrite in Gulf Arabic dialect (اللهجة الخليجية). Keep the meaning but use Gulf Arabic expressions.',
  formal: '',
};

/** True when there is genuinely nothing to ask the model for — فصحى with tone
 *  disabled. Lets the caller skip the round trip, as tts-router.ts did. */
export function voiceOverNeedsEnhancement(dialect: string, tone: string, toneEnabled: boolean): boolean {
  return Boolean(DIALECT_PROMPTS[dialect]) || Boolean(tone && toneEnabled);
}
```

- [ ] **Step 2: Rewrite `buildVoiceOverPrompt` to carry both halves**

```ts
interface VoiceOverPromptInput {
  /** Already sanitised by the route — do NOT re-cap at 500, or a paid
   *  2000-character script is silently truncated. */
  script: string;
  /** estimateVoiceoverDuration(...) from the route. */
  durationSeconds: number;
  tone: string;
  dialect: string;
  toneEnabled: boolean;
}

// v3.0
export function buildVoiceOverPrompt(input: VoiceOverPromptInput): string {
  const { script, durationSeconds, tone, dialect, toneEnabled } = input;
  // ~2.5 words/second for Arabic. This is the number the live path never had:
  // without it the rewrite can come back LONGER than the original, and the price
  // was computed from the ORIGINAL's length.
  const wordCount = Math.max(5, Math.round(durationSeconds * 2.5));
  const dialectInstruction = DIALECT_PROMPTS[dialect] ?? '';
  const toneInstruction = toneEnabled ? TONE_GUIDANCE[tone] : undefined;

  let prompt = 'You are rewriting a voiceover script for recording.';
  if (dialectInstruction) prompt += `\n\n${dialectInstruction}`;
  if (toneInstruction) prompt += `\nDeliver it so it sounds ${toneInstruction}.`;
  prompt += `\n\nKeep it to about ${wordCount} words so it reads in roughly ${durationSeconds} seconds at a natural pace.`;
  prompt += `\nDo not add, remove or invent any claim, offer, price or call to action that is not in the original.`;
  prompt += `\n\nOriginal text:\n${script}`;
  prompt += `\n\nReturn ONLY the rewritten text, nothing else.`;

  return prompt;
}
```

with `TONE_GUIDANCE` keyed on the same four tones the security plan's `TONE_INSTRUCTIONS` uses.
**Keep the two tables in step** — or better, import one from the other so there is only one.

- [ ] **Step 3: Call it from the router**

In `lib/ai/tts-router.ts`, restore the import (the security plan removed it as a misleading signal) and
have `enhanceScript` call `buildVoiceOverPrompt` and `voiceOverNeedsEnhancement` instead of assembling
its own string. The `maxScriptChars` budget the money plan added stays exactly as it is — this prompt's
word target makes the rewrite *usually* fit, and the budget is what guarantees it.

- [ ] **Step 4: Bump the version and verify**

Raise `voiceover_enhancer` to `3.0`.

Run: `npx tsc --noEmit` — no output.
Run: `npm run test:voiceover-budget` (from the money plan) — still passes.
Run: `grep -n "buildVoiceOverPrompt" lib/ai/tts-router.ts` — shows both an import **and** a call.

- [ ] **Step 5: Verify live**

Generate a voiceover on a paid plan with a non-`formal` dialect. Confirm the audio is in that dialect,
the duration is close to the quote, and the credits charged match what was quoted.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/prompts/voiceover.ts lib/ai/tts-router.ts lib/ai/prompts/versions.ts
git commit -m "fix(voiceover): use the written prompt instead of the ad-hoc one-liner beside it"
```

---

# PART B — Localisation, branding and error surfacing

### Task 10: Registered error codes, so the Arabic messages are reachable

**Files:**
- Modify: `app/api/studios/{analysis,edit,photoshoot,plan,prompt-builder,storyboard,voiceover}/route.ts`
- Modify: `app/api/studios/{campaign,creator}/route.ts` (consistency pass)
- Modify: `lib/studio-errors.ts` (export the set; register one code)
- Modify: `messages/ar.json`, `messages/en.json`
- Modify: `scripts/check-invariants.ts`

**Interfaces:**
- Produces: `export const KNOWN_ERROR_CODES` (currently module-private at `lib/studio-errors.ts:1`) and invariant id `studio-error-codes`.

**The defect, in one sentence:** a string reaches `mapApiError` (`lib/studio-errors.ts:37`) that is not
in `KNOWN_ERROR_CODES`, so it collapses to `fallback` and the Arabic message written for that case is
unreachable. Three findings are the same defect:

1. Seven routes return `'System is under maintenance'` / `'This studio is currently disabled'` as the error **string**.
2. `'failed_to_create_generation'` is returned by **all nine** routes and is not registered.
3. `creator`'s all-variations-failed path returns English prose, so the customer is never told their credits came back.

- [ ] **Step 1: Replace the prose with the registered codes**

In each of `analysis`, `edit`, `photoshoot`, `plan`, `prompt-builder`, `storyboard`, `voiceover`:

```ts
      return NextResponse.json({ success: false, error: 'maintenance_mode' }, { status: 503 });
```

```ts
      return NextResponse.json({ success: false, error: 'studio_disabled' }, { status: 403 });
```

Both codes are **already** in `KNOWN_ERROR_CODES` with messages in both locales, so this touches no
message file and cannot break `msg-parity`.

`campaign` and `creator` are already correct. In the same commit, delete their dead `message:` field so
all nine routes are identical.

- [ ] **Step 2: Register `failed_to_create_generation`**

Add `'failed_to_create_generation',` to `KNOWN_ERROR_CODES` in `lib/studio-errors.ts`, and add a message
under `studio.errors` in **both** `messages/ar.json` and `messages/en.json`. Suggested copy — match the
tone of the neighbouring keys rather than copying this verbatim:

- ar: `ما قدرنا نبدأ العملية. جرّب مرة ثانية بعد شوي.`
- en: `We couldn't start this generation. Please try again in a moment.`

- [ ] **Step 3: Give creator's all-variations-failed path a code**

At `creator/route.ts:299`, replace the English prose with `refundAwareErrorCode(refundResult, 'generation_failed')`
— matching the pattern the other refund sites already use, so the customer is told whether their credits
came back.

Read the surrounding lines first: if `refundResult` is not in scope at that point, use `'generation_failed'`
directly and note it.

- [ ] **Step 4: Export the set and add the invariant**

Change `const KNOWN_ERROR_CODES` to `export const KNOWN_ERROR_CODES` in `lib/studio-errors.ts`.

Add to `scripts/check-invariants.ts`:

```ts
const studioErrorCodes: Invariant = {
  id: 'studio-error-codes',
  title: 'Every error a studio route returns is a registered code with a message in both locales',
  why:
    'mapApiError (lib/studio-errors.ts:37) resolves anything not in KNOWN_ERROR_CODES ' +
    'to `fallback`, so an unregistered code — or an English sentence returned where a ' +
    'code belongs — makes the Arabic message written for that case unreachable and ' +
    'shows the customer a generic failure instead. Seven routes returned ' +
    '"System is under maintenance" as the error string, and all nine returned an ' +
    'unregistered failed_to_create_generation. A registered code with no message is ' +
    'just as unreachable, so the second pass checks both message files too.',
  async check(): Promise<Violation[]> {
    const violations: Violation[] = [];
    const files = listFiles(['app/api/studios'], ['.ts'], false).filter((f) =>
      /[\\/]route\.ts$/.test(f)
    );
    const re = /error:\s*'([^']+)'/g;
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const rel = toRel(file);
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        if (KNOWN_ERROR_CODES.has(m[1])) continue;
        violations.push({ file: rel, line: lineAt(content, m.index), text: lineTextAt(content, m.index) });
      }
    }
    // Second pass: a registered code with no message is as unreachable as an
    // unregistered one.
    const ar = JSON.parse(readFileSync(join(ROOT, 'messages', 'ar.json'), 'utf8'));
    const en = JSON.parse(readFileSync(join(ROOT, 'messages', 'en.json'), 'utf8'));
    for (const code of KNOWN_ERROR_CODES) {
      const inAr = ar?.studio?.errors?.[code];
      const inEn = en?.studio?.errors?.[code];
      if (!inAr || !inEn) {
        violations.push({
          file: 'messages/{ar,en}.json',
          line: 1,
          text: `studio.errors.${code} is missing from ${!inAr ? 'ar' : ''}${!inAr && !inEn ? ' and ' : ''}${!inEn ? 'en' : ''}`,
        });
      }
    }
    return violations;
  },
};
```

Import `KNOWN_ERROR_CODES` at the top of `check-invariants.ts` and register `studioErrorCodes` in the
`INVARIANTS` array.

**This invariant must land in the same commit as the fixes**, after them — added first, the build cannot
go green.

- [ ] **Step 5: Run and expect green**

Run: `npm run check:invariants`
Expected: all pass, including `studio-error-codes`.

If it flags a code you did not expect, that is a real unregistered code — register it and add both
messages. Do not exempt it; the baseline is restricted to `no-arabic-literals-in-tsx`.

- [ ] **Step 6: Prove the invariant fires**

Temporarily change one route's maintenance return to `error: 'System is under maintenance'`.
Run `npm run check:invariants` → expect FAIL naming that file and line. Revert.
Run `git diff --stat` → no output.

- [ ] **Step 7: Verify live**

Toggle maintenance mode in `/admin/settings` and confirm an Arabic customer sees the Arabic maintenance
message, not the generic fallback.

- [ ] **Step 8: Commit**

```bash
git add app/api/studios lib/studio-errors.ts messages/ar.json messages/en.json scripts/check-invariants.ts
git commit -m "fix(i18n): return registered error codes so the Arabic messages are reachable"
```

---

### Task 11: Record which model actually served

**Files:**
- Modify: `app/api/studios/{analysis,plan,storyboard,campaign,prompt-builder,creator,edit,photoshoot}/route.ts` (the `finalizeGeneration` patch only)

**Interfaces:**
- Consumes: `FinalizePatch.model?: string` — **already exists** at `lib/supabase/generation-writes.ts:38`. `generations.Update` already has `model?: string`. No type work.

**The defect.** Eight routes insert `model: 'gemini'` and never correct it on finalize, so after a
gemini→gpt fallback the row still reads `gemini` forever. Six admin surfaces read that column; per-model
success rate is wrong, and because `MODEL_COSTS` is gemini `0.002` vs gpt `0.01`, every mis-attributed
run understates estimated API cost **5×**. `voiceover` is the only route that does this correctly — copy it.

**Note:** `edit` and `photoshoot` are exempt by construction — `IMAGE_INPUT_CAPABLE = ['gemini']` makes
fallback impossible on a reference-image request, so their hardcoded value is always accurate. Include
them anyway for uniformity, or skip them and say so; do not leave it undecided.

- [ ] **Step 1: Read the one correct implementation**

Run: `grep -n "model:" app/api/studios/voiceover/route.ts`

- [ ] **Step 2: Pass the serving model on finalize**

In each route's `finalizeGeneration(...)` patch, add:

```ts
        // Correct the model now the provider that actually served is known. The row
        // is inserted before generation from the PREFERRED model, but the router
        // falls back — so a gpt-served run stayed filed under gemini forever, and
        // six admin surfaces read this column.
        model: result.model,
```

The exact expression depends on what each route names the router result — `result.model`,
`textResult.model`, `resultModel`. Read each call site.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` — no output.
Run: `grep -rn "model: 'gemini'" app/api/studios/` — only `.insert(...)` calls remain, never a finalize.

- [ ] **Step 4: Commit**

```bash
git add app/api/studios
git commit -m "fix(admin): record the model that actually served, not the one preferred"
```

---

### Task 12: One fallback notice, shown everywhere it applies

**Files:**
- Create: `components/shared/FallbackNotice.tsx`
- Modify: `components/studios/creator/CreatorPreview.tsx`, `app/[locale]/(dashboard)/voiceover/page.tsx`
- Modify: the remaining studio pages that can fall back
- Modify: the routes that do not yet echo `usedFallback`

**Interfaces:**
- Consumes: `studio.usedFallback` — **already in both locales**.
- Produces: `<FallbackNotice messageKey="..." />`.

**The defect.** The amber "بايرا استخدمت مسار بديل" strip exists twice — `CreatorPreview.tsx:107-112`
(key `studio.usedFallback`) and `voiceover/page.tsx:283-288` (key `voiceover.fallbackNotice`). Every
other studio that can fall back shows nothing. Surfacing it in five more places without extracting first
would make five more copies.

**Note:** `campaign/route.ts` already returns `usedFallback` and no page reads it — that one needs only
the UI half.

- [ ] **Step 1: Extract the component**

Create `components/shared/FallbackNotice.tsx` from the two existing copies. Take the message key as a
prop so voiceover can keep its more specific wording (it discloses a **billing** change, not just a
path change — do not flatten that into the generic message).

Follow the house rules: no Arabic literals in `.tsx` (use `t()`), logical properties (`ps/pe/ms/me`),
`var(--color-*)` for colour.

- [ ] **Step 2: Replace both existing copies**

Point `CreatorPreview.tsx` and `voiceover/page.tsx` at the shared component. **Nothing should change on
screen** — verify both still render identically before going further.

- [ ] **Step 3: Echo `usedFallback` from the routes that do not**

For each text studio, add `usedFallback: result.usedFallback` to the success response `data` object.

- [ ] **Step 4: Render it on the remaining pages**

Add `<FallbackNotice />` wherever a studio's result renders, driven by the response field.

**Judgement call, and make it deliberately:** voiceover shows this because the fallback changes the
engine *and the amount charged*. Creator shows it because the image model visibly changes. A gemini→gpt
**text** fallback yields the same deliverable at the same price — arguably nothing to disclose. If you
decide the text studios should not show it, do Steps 1–3 and stop, and record why in the commit. Steps 1–3
are worth doing either way: they remove the duplication and make the data available.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run check:invariants` — all clean.
Force a fallback (temporarily unset `GOOGLE_GEMINI_API_KEY`), run a creator generation, and confirm the
notice renders in both locales.

- [ ] **Step 6: Commit**

```bash
git add components/shared/FallbackNotice.tsx components/studios/creator/CreatorPreview.tsx "app/[locale]/(dashboard)" app/api/studios
git commit -m "refactor(ui): one fallback notice component instead of two copies"
```

---

### Task 13: Soft-fill tokens, and the analysis page's raw palette

**Files:**
- Modify: `app/globals.css`
- Modify: `app/[locale]/(dashboard)/analysis/page.tsx`
- Modify: `components/waitlist/WaitlistForm.tsx` and the other raw-palette tint sites

**The defect.** The analysis result view hardcodes ~20 Tailwind palette classes for its tinted panels.
No invariant catches it: `contrast-tokens` reads `app/globals.css` only and never opens a `.tsx`, and
`theme-aware-text-color` matches only `text-primary-500|600`. This is a **gap**, not a bypass.

**⚠ Sequence with Task 14.** The alpha-on-var bug is why this fix cannot simply copy
`WaitlistForm.tsx:64`. Read Task 14 before writing any CSS here.

- [ ] **Step 1: Inventory every raw-palette tint site**

Run: `grep -rn "bg-\(red\|green\|amber\|yellow\|blue\|emerald\|rose\|slate\)-[0-9]" "app/[locale]" components/ | grep -v node_modules`

Record the full list. Deciding the token scope without it produces a token group used by one file, which
is worse than none.

- [ ] **Step 2: Define the token group in `app/globals.css`**

Add a **small, closed** set of soft-fill tokens — `--color-{success,warning,danger,info}-soft` and a
matching `-soft-border` — defined for both themes, following the file's existing token structure.

Do **not** invent a token per usage site. If the inventory shows more semantic roles than these four,
either widen the set deliberately or leave the extra sites alone and say so.

- [ ] **Step 3: Convert the analysis page**

Replace its hardcoded panel classes with the new tokens.

- [ ] **Step 4: Convert the other sites, including `WaitlistForm.tsx:64`**

Reuse the same tokens rather than growing a second mechanism.

- [ ] **Step 5: Verify**

Run: `npm run check:invariants` — `contrast-tokens` must still pass with the new tokens.
Run: `npm run build` — clean.
Check the analysis page in **both** themes and **both** locales. Tinted panels must be legible in dark
mode — that is what the raw `bg-green-50` classes were failing at.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css "app/[locale]/(dashboard)/analysis/page.tsx" components/
git commit -m "fix(ui): soft-fill tokens for tinted panels, replacing raw palette classes"
```

---

### Task 14: The Tailwind classes that compile to nothing

**Files:**
- Modify: the ~15 files carrying `X-[var(--token)]/NN` classes

**Interfaces:**
- Consumes: Task 13's tokens where a soft fill is what was intended.

**The defect — newly found during research, not in the audit.** **Tailwind v3.4.19 silently drops
`X-[var(--token)]/NN`.** An arbitrary value combined with an opacity modifier produces **no CSS at
all** — the element renders with no background. Measured with `npx tailwindcss` against a probe and
confirmed against the built stylesheet. ~15 such classes exist across the landing, pricing and studio
pages.

`color-mix(in_srgb,var(--t)_NN%,transparent)` as an arbitrary value **does** compile. Named-theme alpha
(`bg-primary-900/20`, `bg-black/50`) is unaffected.

- [ ] **Step 1: Find every instance**

Run: `grep -rnE "(bg|text|border|ring|from|to|via)-\[var\(--[a-z-]+\)\]/[0-9]+" "app/[locale]" app/ components/ | grep -v node_modules`

Expected: roughly 15 hits. Record them all.

- [ ] **Step 2: Confirm the bug before changing anything**

Build, then grep the emitted stylesheet for one of the class names found in Step 1:

```bash
npm run build
grep -r "var(--color-brand)" .next/static/css/ | head
```

If the class produces no rule, the bug is confirmed on this exact Tailwind version. **Do not skip this
step** — if a later Tailwind fixed it, this whole task is unnecessary and the right change is a version
bump.

- [ ] **Step 3: Replace each one**

Where a soft tint was intended and Task 13's token fits, use the token. Otherwise use
`bg-[color-mix(in_srgb,var(--color-x)_20%,transparent)]`.

- [ ] **Step 4: Verify the CSS is actually emitted**

Rebuild and grep the stylesheet again. Each replacement must now produce a rule. **This is the only
proof that matters** — the class name looking right in the source is exactly what let this ship.

- [ ] **Step 5: Check the affected pages in both themes**

Landing and pricing especially — these are the pages a launch announcement links to.

- [ ] **Step 6: Commit**

```bash
git add app/ components/ "app/[locale]"
git commit -m "fix(ui): replace Tailwind alpha-on-var classes that compile to no CSS

Tailwind 3.4.19 silently drops X-[var(--token)]/NN — arbitrary value plus opacity
modifier emits nothing, so these elements have been rendering with no background.
Verified against the built stylesheet, not just the source."
```

---

### Task 15: Campaign form labels and image alt text

**Files:**
- Modify: `components/studios/campaign/CampaignForm.tsx`
- Modify: `components/studios/creator/CreatorPreview.tsx`, `components/studios/photoshoot/PhotoshootPreview.tsx`, `app/[locale]/(dashboard)/edit/page.tsx`

**Corrected scope:** the audit placed the English alt text in `CampaignForm`. It is not there —
`CampaignPlanDisplay.tsx:137` is `alt=""`. The English alts are in `CreatorPreview` (2),
`PhotoshootPreview` (1) and `edit/page.tsx` (2).

- [ ] **Step 1: Give the two unlabelled inputs accessible labels**

In `CampaignForm.tsx`, two of the four text inputs have no `<Label htmlFor>`. Add them, following the
pattern the other two already use, with `t()` keys. Reuse an existing key if one fits — check the
`campaign` namespace in `messages/ar.json` before adding.

- [ ] **Step 2: Replace the hardcoded English alt text**

`edit/page.tsx:231-232` is the easy one: `edit.original` and `edit.afterEdit` **already exist** in both
locales and are the exact strings hardcoded there.

For `CreatorPreview` (2) and `PhotoshootPreview` (1), add keys to both message files if none fit.

- [ ] **Step 3: Verify**

Run: `npm run check:invariants` — `msg-parity` and `no-arabic-literals-in-tsx` must pass.
Run: `npx tsc --noEmit`, `npm run lint` — clean.
Tab through the campaign form with a screen reader or the accessibility inspector and confirm every
input announces a label.

- [ ] **Step 4: Commit**

```bash
git add components/studios "app/[locale]/(dashboard)/edit/page.tsx" messages/ar.json messages/en.json
git commit -m "fix(a11y): label the campaign inputs and localise generated-image alt text"
```

---

### Task 16: Run every gate and record what is true

- [ ] **Step 1: Run the full gate set**

```bash
npx tsc --noEmit
npm run lint
npm run check:invariants
npm run test:safety
npm run test:uploads
npm run test:plan-switch
npm run test:prompts
npm run test:response-schemas
npm run build
```

Record the actual counts each prints.

- [ ] **Step 2: Generate one of each of the nine studios against live models**

None of Part A is provable by test — the whole subject is what bytes a remote model returns. Run one
real generation per studio, in **both** locales, and confirm each renders.

- [ ] **Step 3: Update `CLAUDE.md`**

Add a section in the established table style, writing only what Steps 1–2 actually produced. Include:
- structured output for the five text studios, and the `??` vs `||` temperature trap;
- prompts no longer inventing a business stage or paying for unrendered sections;
- deliverables generated in the customer's language;
- the edit studio's first real prompt;
- `buildVoiceOverPrompt` wired up after being dead;
- registered error codes across all nine routes + the `studio-error-codes` invariant;
- honest model attribution;
- the Tailwind alpha-on-var classes that emitted no CSS.

Also correct the four mis-statements listed at the top of this plan wherever `CLAUDE.md` repeats them.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the output-quality and localisation round against verified output"
```

---

## Self-Review

**Spec coverage.** All 23 marketing-lens findings map to a task: structured output (1), plan/analysis
prompt hygiene (2), locale (3), creator contradiction (4), campaign brand kit + image prompt (5), edit
prompt (6), photoshoot BRAND block (7), prompt-builder (8), voiceover prompt (9), the seven maintenance
routes + `failed_to_create_generation` + creator prose (10), model attribution (11), fallback notice
(12), analysis colours (13), the newly-found alpha-on-var bug (14), campaign labels + alt text (15).

**Four findings were corrected and are deliberately NOT tasks**, listed at the top so nobody re-adds
them: creator's brand kit already reaches the model; the maintenance site list is 7 routes, not the set
named; `failed_to_create_generation` is all 9 routes; the fallback badge already renders in two studios.

**Ordering constraints, all load-bearing:**
- Task 1 lands **first and alone** — it edits the three shared AI clients.
- Task 4 lands **after the security plan's Task 1** — both edit `buildCreatorPrompt`.
- Task 5 lands **after the security plan's Task 5** — both edit the campaign image block.
- Task 9 lands **after the money plan's Task 8 and the security plan's Task 4** — all three edit `tts-router.ts`, and the word target is what makes the repricing correct.
- Task 13 lands **before or with Task 14** — the alpha-on-var bug is why Task 13 cannot copy the existing pattern.
- Task 10's invariant lands **after** its own fixes, in the same commit.

**Type consistency.** `responseSchema?: Record<string, unknown>` is the same name across `gemini.ts`,
`openai.ts` and `router.ts`. `locale?: string` on all three prompt inputs; `routing.locales` /
`routing.defaultLocale` from `@/i18n/routing` in all three routes. `buildEditPrompt`'s input matches its
call site. `voiceOverNeedsEnhancement` and `DIALECT_PROMPTS` are defined in Task 9 and used only there.
`FallbackNotice` takes a message key so voiceover keeps its billing-specific wording.

**Placeholder scan.** Tasks 7, 8 and 13 specify their edits by required property rather than by finished
code — deliberately, and each says why: Task 7 depends on prompt text this plan has not seen in full,
Task 8 on the exact parse shape, Task 13 on an inventory that must be taken before the token scope can
be chosen. Each names the exact command that produces the missing input and requires the assertion be
written before the change. Everything else carries real code.

**One risk worth flagging.** Task 1 changes `temperature` from `0.7` to `0.2` for the five text studios.
That is correct for JSON-shaped output but **will change the character of the prose inside those JSON
fields** — plans and analyses will read as more conservative. That is a product judgement, not a bug. If
the founder prefers the looser voice, raise it back toward `0.5`; the schema does the shape work now, so
temperature is free to be a style dial rather than a reliability one.
