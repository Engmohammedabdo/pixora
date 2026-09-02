# Public Studio Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each of the nine studios a public, indexable URL that shows what it produces, what it costs, and how to start — so the nine highest-intent keyword clusters in the product have somewhere to land.

**Architecture:** One catalogue module (`lib/studios/catalogue.ts`) is the single source of truth: slug, i18n keys, credit cost read from `lib/credits/costs.ts`, and example asset ids read from `public/examples/studios/manifest.json`. One dynamic route renders all nine in both locales from that catalogue; the landing showcase and the sitemap read the same catalogue, so a studio cannot exist on one surface and not another. Pages are **server components** — no `'use client'` — because their whole job is to be HTML a crawler and an answer engine can read.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, next-intl v4, Tailwind v3, `tsx` test scripts.

**Source:** The 2026-09-01 audit — https://claude.ai/code/artifact/45ba39d5-f41b-4113-b925-470b6a01751f — finding 7: *"The entire indexable footprint is 12 URLs… all nine studios — the highest-intent product terms — have no public URL."*

## Global Constraints

- **TypeScript strict, zero `any`.** `npx tsc --noEmit` clean after every task.
- **All gates green after every task:** `npm run gates` (32 links today) and `npm run lint`.
- **Server components only** in these pages. No `'use client'`, no `framer-motion`. The landing page is already 265 kB of gzipped JS because all 13 of its sections are client components; these pages must not repeat that.
- **No Arabic string literals in TSX** (invariant `no-arabic-literals-in-tsx`). All copy in `messages/{ar,en}.json`, identical key sets (invariant `msg-parity`), no empty values (`msg-no-empty`).
- **RTL-first:** `ps/pe/ms/me/start/end` only, never `pl/pr/ml/mr/left/right` (invariant `rtl-logical-properties`).
- **CSS variables only, and only ones that exist in `app/globals.css`:** `--color-bg`, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-link`, `--color-brand`, `--color-error`, `--color-success`, `--color-warning`, `--color-primary-{50,100,500,600,900}`, `--color-accent-*`. **There is no `--color-primary` and no `--color-surface-hover`.** Never `bg-[var(--x)]/NN` — Tailwind 3.4.19 emits nothing for it (invariant `no-var-opacity-modifier`); use `color-mix(in srgb, var(--x) 50%, transparent)`.
- **Never name a model vendor** (Gemini/OpenAI/Flux/ElevenLabs) in user-facing copy. The engine is **بايرا / Pyra**.
- **Every credit figure is read from `lib/credits/costs.ts`**, never typed into copy. A price in a string is how the published number and the charge drift apart — `StudioCostTable.tsx` already records that rule.
- **Every example asset is read from `public/examples/studios/manifest.json`**, never a hardcoded path.
- **Metadata comes from `lib/seo/alternates.ts`** (`publicAlternates`, `publicOpenGraph`). Never hand-write a canonical.
- **Commit after every task**, trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Do NOT push. Do NOT deploy.**

---

## File Structure

**Created:**
- `lib/studios/catalogue.ts` — the nine studios: slug, i18n key base, cost, example ids, icon name, related slugs.
- `lib/studios/examples.ts` — typed reader over `public/examples/studios/manifest.json`.
- `app/[locale]/(landing)/studios/page.tsx` — the index of nine.
- `app/[locale]/(landing)/studios/[slug]/page.tsx` — one studio, all nine slugs, both locales.
- `components/studios/public/StudioHero.tsx`, `StudioExamples.tsx`, `StudioSteps.tsx`, `StudioFaq.tsx`, `StudioCta.tsx`, `StudioRelated.tsx` — all server components.
- `components/studios/public/BeforeAfter.tsx` — the edit studio's pair.
- `components/studios/public/AudioSample.tsx` — the voiceover sample. A SERVER component: a native `<audio controls>` needs no JavaScript.
- `lib/seo/studio-schema.ts` — `buildStudioSchema(locale, slug, studioName, definition, faq, studiosLabel)`: BreadcrumbList + WebPage + FAQPage, referencing the site-wide Organization/WebSite/SoftwareApplication by @id rather than restating them.
- `scripts/tests/studio-pages.test.ts` — the gate.

**Modified:**
- `messages/ar.json`, `messages/en.json` — a new top-level `studios` namespace.
- `app/sitemap.ts` — the nine studio URLs plus the index, per locale.
- `components/landing/StudiosShowcase.tsx` — each card links to its page.
- `package.json`, `docs/INVARIANTS.md`, `CLAUDE.md`.

---

### Task 1: The catalogue — one source of truth for the nine

**Files:**
- Create: `lib/studios/catalogue.ts`
- Create: `lib/studios/examples.ts`
- Create: `scripts/tests/studio-pages.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `STUDIO_SLUGS: readonly StudioSlug[]`, `STUDIO_CATALOGUE: Record<StudioSlug, StudioEntry>`, `getStudio(slug: string): StudioEntry | null`, `type StudioSlug`, `type StudioEntry`.
- Produces: `getExample(id: string): StudioExample | null`, `type StudioExample` from `lib/studios/examples.ts`.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/studio-pages.test.ts`:

```ts
/**
 * Proof that the nine public studio pages exist, agree with the product, and
 * carry what a search engine and an answer engine need.
 *
 *   npx tsx scripts/tests/studio-pages.test.ts
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * The 2026-09-01 audit measured the whole indexable footprint at 12 URLs with
 * every studio 307'ing to the login form. These pages are the fix, and the
 * thing that would quietly undo it is drift: a studio added to types/studios.ts
 * and not to the catalogue, an example id that names a file nobody built, a
 * credit figure typed into Arabic copy and then changed in code.
 *
 * Every membership assertion here is EXACT, and every scan FAILS when it
 * matches nothing — the rule mock-from-schema.test.ts:246 already states.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STUDIO_CATALOGUE, STUDIO_SLUGS, getStudio } from '../../lib/studios/catalogue';
import { getExample } from '../../lib/studios/examples';
import { CREDIT_COSTS } from '../../lib/credits/costs';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}
const ROOT = join(__dirname, '..', '..');
const ar = JSON.parse(readFileSync(join(ROOT, 'messages/ar.json'), 'utf8')) as Record<string, never>;
const en = JSON.parse(readFileSync(join(ROOT, 'messages/en.json'), 'utf8')) as Record<string, never>;

// ── 1. The catalogue is exactly the nine studios the product ships ─────────
// `video` is in types/studios.ts and is NOT built (CLAUDE.md's not-built table),
// so it must not appear here — a page for a studio that does not exist is the
// worst possible SEO landing.
const EXPECTED = ['creator', 'photoshoot', 'campaign', 'plan', 'storyboard', 'analysis', 'voiceover', 'edit', 'prompt-builder'];
check('the catalogue names exactly the nine shipped studios', JSON.stringify([...STUDIO_SLUGS].sort()) === JSON.stringify([...EXPECTED].sort()), [...STUDIO_SLUGS].sort().join(' '));
check('video is NOT in the catalogue', !(STUDIO_SLUGS as readonly string[]).includes('video'));
check('a scan that finds nothing FAILS', STUDIO_SLUGS.length === 9, String(STUDIO_SLUGS.length));
check('getStudio returns null for an unknown slug', getStudio('nope') === null);

// ── 2. Every studio's copy exists in BOTH locales, non-empty ───────────────
const REQUIRED_KEYS = ['name', 'tagline', 'definition', 'metaTitle', 'metaDescription', 'step1', 'step2', 'step3', 'q1', 'a1', 'q2', 'a2', 'q3', 'a3'];
for (const slug of STUDIO_SLUGS) {
  for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
    const ns = (msgs as Record<string, Record<string, Record<string, string>>>).studios?.[slug];
    check(`${locale}: studios.${slug} exists`, Boolean(ns));
    if (!ns) continue;
    for (const k of REQUIRED_KEYS) {
      const v = ns[k];
      check(`${locale}: studios.${slug}.${k} is a non-empty string`, typeof v === 'string' && v.trim().length > 0);
    }
    // The definition is the sentence an answer engine lifts. One sentence that
    // names the product is the whole point; a tagline is not a definition.
    check(`${locale}: studios.${slug}.definition is a real sentence`, typeof ns.definition === 'string' && ns.definition.length >= 60, String(ns.definition).slice(0, 50));
  }
}

// ── 3. No credit figure is typed into copy ─────────────────────────────────
// Every price the customer reads must come from lib/credits/costs.ts. A number
// in a translation is how the published figure and the charge drift apart —
// the exact reason the admin per-studio price knob was deleted.
for (const slug of STUDIO_SLUGS) {
  for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
    const ns = (msgs as Record<string, Record<string, Record<string, string>>>).studios?.[slug];
    if (!ns) continue;
    const joined = Object.values(ns).join(' ');
    check(`${locale}: studios.${slug} copy states no credit number`, !/\d+\s*(كريدت|credits?)\b/i.test(joined), (joined.match(/\d+\s*(كريدت|credits?)/i) ?? [''])[0]);
  }
}

// ── 4. Every example id names a file that was actually built ───────────────
const manifestPath = join(ROOT, 'public/examples/studios/manifest.json');
check('the example manifest exists', existsSync(manifestPath));
let exampleCount = 0;
for (const slug of STUDIO_SLUGS) {
  for (const id of STUDIO_CATALOGUE[slug].examples) {
    exampleCount++;
    const ex = getExample(id);
    check(`${slug}: example "${id}" is in the manifest`, Boolean(ex));
    if (!ex) continue;
    check(`${slug}: example "${id}" file exists on disk`, existsSync(join(ROOT, 'public', ex.file.replace(/^\//, ''))), ex.file);
    check(`${slug}: example "${id}" has alt text in both locales`, Boolean(ex.alt?.ar?.trim()) && Boolean(ex.alt?.en?.trim()));
  }
}
// Which studios show IMAGES, stated exactly. Deriving this from
// `examples.length` would make the assertion a tautology.
//
// CORRECTED 2026-09-03. This was one line asserting a SUM —
// `exampleCount >= STUDIO_SLUGS.length`, i.e. 12 >= 9 — under a label that
// promised "per studio". Four studios carry all twelve examples and five carry
// none, so the sum had four units of slack. Measured: emptying `edit`'s
// examples removed six checks and left the failure count identical, and `edit`
// is the studio whose entire page IS its two images.
const IMAGE_STUDIOS: readonly string[] = ['creator', 'photoshoot', 'edit', 'campaign'];
for (const slug of STUDIO_SLUGS) {
  const n = STUDIO_CATALOGUE[slug].examples.length;
  const wantsImages = IMAGE_STUDIOS.includes(slug);
  check(
    ,
    wantsImages ? n > 0 : n === 0,
    String(n),
  );
}
check('the example loop actually ran', exampleCount >= 12, String(exampleCount));

// ── 5. The cost each page shows comes from the product's own table ─────────
for (const slug of STUDIO_SLUGS) {
  const entry = STUDIO_CATALOGUE[slug];
  check(`${slug}: costKey is a real key of CREDIT_COSTS`, entry.costKey in CREDIT_COSTS, entry.costKey);
}

if (failures) { console.log(`\n[studio-pages] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[studio-pages] ${checks} checks passed`);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/tests/studio-pages.test.ts`
Expected: FAIL — `lib/studios/catalogue` not found.

- [ ] **Step 3: The examples reader**

Create `lib/studios/examples.ts`:

```ts
import manifest from '@/public/examples/studios/manifest.json';

/**
 * The real product outputs saved under public/examples/studios/.
 *
 * Built by scripts/build-studio-examples.mjs from live-run artifacts, and every
 * one of them is output this product actually produced on a PAID account
 * against production — see that script's header for why nothing here may come
 * from another generator.
 *
 * Read through this module, never by path: an id that names no file is then a
 * build failure (scripts/tests/studio-pages.test.ts) instead of a broken image.
 */
export interface StudioExample {
  id: string;
  file: string;
  width: number;
  height: number;
  bytes: number;
  sourceRun: string;
  sourceFile: string;
  alt: { ar: string; en: string };
}

const BY_ID = new Map<string, StudioExample>(
  (manifest as StudioExample[]).map((e) => [e.id, e]),
);

export function getExample(id: string): StudioExample | null {
  return BY_ID.get(id) ?? null;
}

export function getExamples(ids: readonly string[]): StudioExample[] {
  return ids.map((id) => BY_ID.get(id)).filter((e): e is StudioExample => Boolean(e));
}
```

(`tsconfig.json:12` already sets `"resolveJsonModule": true` — verified, no change needed.)

- [ ] **Step 4: The catalogue**

Create `lib/studios/catalogue.ts`:

```ts
import type { StudioCostKey } from '@/lib/credits/costs';

/**
 * The nine studios, as public pages.
 *
 * ONE source of truth: the landing showcase, the nine /studios/[slug] pages and
 * the sitemap all read this. Before it, the landing page held its own array of
 * nine and nothing else knew the list existed — the shape this repo already
 * records misdirecting decisions for months (app/layout.tsx's hardcoded
 * filename list).
 *
 * `video` is deliberately absent. It is in types/studios.ts and CLAUDE.md's
 * "Not built" table says so; a public page for a studio that does not exist is
 * the worst possible organic landing.
 */
export const STUDIO_SLUGS = [
  'creator',
  'photoshoot',
  'edit',
  'campaign',
  'plan',
  'analysis',
  'storyboard',
  'voiceover',
  'prompt-builder',
] as const;

export type StudioSlug = (typeof STUDIO_SLUGS)[number];

export interface StudioEntry {
  slug: StudioSlug;
  /** The key into lib/credits/costs.ts. The page reads the number from there;
   *  it is never written into a translation. */
  costKey: StudioCostKey;
  /** How the cost is expressed: a flat price, a per-resolution range, or a rate. */
  costShape: 'flat' | 'imageRange' | 'shotRange' | 'perDuration' | 'free';
  /** Ids in public/examples/studios/manifest.json. Empty ONLY for a studio whose
   *  deliverable is text, which the page renders instead. */
  examples: readonly string[];
  /** A real deliverable to render, for the text studios. Path under
   *  .superpowers/live-runs is NOT used at runtime — the JSON is copied into
   *  public/examples/studios/ by the same build script. */
  sample?: string;
  /** lucide-react icon name, matching what StudiosShowcase already uses. */
  icon: string;
  /** Two studios a visitor on this page would plausibly want next. Internal
   *  linking is the cheapest SEO there is, and these pages start with none. */
  related: readonly StudioSlug[];
}

export const STUDIO_CATALOGUE: Record<StudioSlug, StudioEntry> = {
  creator: {
    slug: 'creator', costKey: 'image', costShape: 'imageRange', icon: 'Image',
    examples: ['creator-shawarma-square', 'creator-instagram-portrait', 'creator-signage-wide', 'creator-skyline-wide'],
    related: ['photoshoot', 'edit'],
  },
  photoshoot: {
    slug: 'photoshoot', costKey: 'photoshoot', costShape: 'shotRange', icon: 'Camera',
    examples: ['photoshoot-shot-1', 'photoshoot-shot-2', 'photoshoot-shot-3', 'photoshoot-luxury'],
    related: ['edit', 'creator'],
  },
  edit: {
    slug: 'edit', costKey: 'edit', costShape: 'flat', icon: 'Pencil',
    examples: ['edit-before-cafe', 'edit-after-marketplace'],
    related: ['photoshoot', 'creator'],
  },
  campaign: {
    slug: 'campaign', costKey: 'campaign', costShape: 'flat', icon: 'LayoutGrid',
    examples: ['campaign-post-1', 'campaign-post-2'],
    related: ['plan', 'creator'],
  },
  plan: {
    slug: 'plan', costKey: 'plan', costShape: 'flat', icon: 'Map',
    examples: [], sample: 'plan',
    related: ['analysis', 'campaign'],
  },
  analysis: {
    slug: 'analysis', costKey: 'analysis', costShape: 'flat', icon: 'BarChart3',
    examples: [], sample: 'analysis',
    related: ['plan', 'campaign'],
  },
  storyboard: {
    slug: 'storyboard', costKey: 'storyboard', costShape: 'flat', icon: 'Film',
    examples: [], sample: 'storyboard',
    related: ['campaign', 'voiceover'],
  },
  voiceover: {
    slug: 'voiceover', costKey: 'voiceover', costShape: 'perDuration', icon: 'Mic',
    examples: [], sample: 'voiceover',
    related: ['storyboard', 'campaign'],
  },
  'prompt-builder': {
    slug: 'prompt-builder', costKey: 'prompt', costShape: 'free', icon: 'Lightbulb',
    examples: [], sample: 'prompt-builder',
    related: ['creator', 'photoshoot'],
  },
};

export function getStudio(slug: string): StudioEntry | null {
  return (STUDIO_CATALOGUE as Record<string, StudioEntry>)[slug] ?? null;
}
```

- [ ] **Step 5: Register the test and watch it fail on the COPY, not the module**

`package.json`: add `"test:studio-pages": "npx tsx scripts/tests/studio-pages.test.ts"` and append ` && npm run test:studio-pages` to `prebuild`.

Run: `npx tsx scripts/tests/studio-pages.test.ts`
Expected: FAIL — the catalogue and examples resolve, but `studios.<slug>` is missing from both message files. This is the correct next failure; Task 2 onward supplies the copy.

- [ ] **Step 6: Commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add lib/studios scripts/tests/studio-pages.test.ts package.json
git commit -m "feat(studios): one catalogue the pages, the showcase and the sitemap all read

The landing page held its own array of nine studios and nothing else knew
the list existed. lib/studios/catalogue.ts is now the single source: slug,
credit key, example ids and related slugs. video is deliberately absent —
it is in types/studios.ts and is not built.

Gate: test:studio-pages asserts EXACT membership, that every example id
names a file that exists, and that no credit number is typed into copy.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The route shell, and one complete page — `creator`

**Files:**
- Create: `app/[locale]/(landing)/studios/[slug]/page.tsx`
- Create: `components/studios/public/StudioHero.tsx`, `StudioExamples.tsx`, `StudioSteps.tsx`, `StudioFaq.tsx`, `StudioCta.tsx`, `StudioRelated.tsx`
- Create: `lib/seo/studio-schema.ts`
- Modify: `messages/ar.json`, `messages/en.json`

**Interfaces:**
- Consumes: `STUDIO_SLUGS`, `getStudio`, `getExamples`, `publicAlternates`, `publicOpenGraph`.
- Produces: `buildStudioSchema(locale: string, slug: StudioSlug, faq: {q: string; a: string}[]): object` — the JSON-LD `@graph` for one studio page.

- [ ] **Step 1: The copy for `creator`, both locales**

In `messages/ar.json`, add a **top-level** `"studios"` key (a sibling of `landing`, not inside it), containing a `shared` block and `creator`:

```json
"studios": {
  "shared": {
    "indexTitle": "الاستوديوهات التسعة",
    "indexSubtitle": "كل استوديو بيعمل حاجة واحدة كويس. اشتراك واحد يفتحهم كلهم.",
    "indexMetaTitle": "استوديوهات PyraSuite التسعة — تسويق بالذكاء الاصطناعي بالعربي",
    "indexMetaDescription": "تسعة استوديوهات: صور منتجات، حملات، خطط، تحليل منافسين، تعليق صوتي بلهجتك، وتعديل صور. شوف نتائج حقيقية وسعر كل عملية قبل ما تسجّل.",
    "howItWorks": "بيشتغل إزاي",
    "examplesTitle": "نتائج حقيقية من الاستوديو ده",
    "examplesNote": "كل صورة هنا مخرج فعلي من المنتج، اتولّد على حساب مدفوع. مفيش صور من أي أداة تانية.",
    "faqTitle": "أسئلة شائعة",
    "costLabel": "التكلفة",
    "creditUnit": "كريدت",
    "freeLabel": "مجاني",
    "perImage": "لكل صورة، حسب الدقة",
    "perShoot": "للجلسة، حسب عدد اللقطات",
    "perDuration": "لكل 15 ثانية",
    "ctaTitle": "جرّبه دلوقتي",
    "ctaBody": "سجّل ببريدك وابدأ على طول — {credits} كريدت مجاناً وبدون بطاقة ائتمان.",
    "ctaButton": "ابدأ مجاناً",
    "seePricing": "شوف كل الأسعار",
    "relatedTitle": "استوديوهات تانية تنفعك",
    "backToStudios": "كل الاستوديوهات"
  },
  "creator": {
    "name": "منشئ الصور",
    "tagline": "اكتب فكرتك بالعربي، واطلع بصورة إعلانية",
    "definition": "منشئ الصور في PyraSuite بيحوّل جملة عربية واحدة لصورة إعلانية جاهزة للنشر: بيفهم نشاطك ومدينتك من البراند كِت، وبيأطّر الصورة على مقاس المنصة اللي هتنشر عليها، وبيكتب العربي على الصورة موصول صح ومن اليمين للشمال.",
    "metaTitle": "منشئ الصور — صور إعلانية بالذكاء الاصطناعي بالعربي",
    "metaDescription": "اكتب جملة بالعربي واطلع بصورة إعلانية جاهزة. نص عربي صحيح على الصورة، ومقاس مضبوط لإنستجرام وتيك توك. شوف نتائج حقيقية والسعر قبل ما تسجّل.",
    "step1": "اكتب اللي في دماغك بالعربي — «صورة لساندويتش شاورما تجيب جوع لمطعمي في دبي».",
    "step2": "اختار المنصة والأسلوب. بايرا بتاخد نشاطك ومدينتك من البراند كِت من غير ما تكتبهم تاني.",
    "step3": "حمّل الصورة، أو كمّل عليها في استوديو تعديل الصور.",
    "q1": "بيكتب عربي صحيح على الصورة؟",
    "a1": "أيوه. الحروف بتطلع موصولة وبأشكالها الصحيحة ومن اليمين للشمال، ومن غير تشكيل ما طلبتوش. ودي كانت أصعب حاجة في المنتج، وفيه قاعدة مكتوبة بتمنع الموديل إنه يخترع نص في أي مكان تاني في الصورة.",
    "q2": "لازم أكتب وصف احترافي؟",
    "a2": "لأ. جرّبنا الاتنين على نفس الطلب: جملة عامية قصيرة بالعربي طلعت صورة أحسن من بريف إنجليزي مكتوب بعناية فيه عدسة وإضاءة. اكتب بلغتك العادية.",
    "q3": "المقاس بيطلع مضبوط للمنصة؟",
    "a3": "أيوه. بتختار المنصة والقماش بيتحدد على أساسها — مربع، أو طولي 4:5 لإنستجرام، أو عريض. الصورة بتتأطّر للمقاس ده من الأول، مش بتتقص عليه بعدين."
  }
}
```

In `messages/en.json`, the same keys with English values:

```json
"studios": {
  "shared": {
    "indexTitle": "The nine studios",
    "indexSubtitle": "Each studio does one thing well. One subscription opens all of them.",
    "indexMetaTitle": "The nine PyraSuite studios — AI marketing built for Arabic",
    "indexMetaDescription": "Nine studios: product photography, campaigns, marketing plans, competitor analysis, Arabic voiceover in your dialect, and image editing. See real output and the price of every action before you sign up.",
    "howItWorks": "How it works",
    "examplesTitle": "Real output from this studio",
    "examplesNote": "Every image here is actual product output, generated on a paid account. Nothing on this page came from another tool.",
    "faqTitle": "Common questions",
    "costLabel": "Cost",
    "creditUnit": "credits",
    "freeLabel": "Free",
    "perImage": "per image, by resolution",
    "perShoot": "per shoot, by number of frames",
    "perDuration": "per 15 seconds",
    "ctaTitle": "Try it now",
    "ctaBody": "Sign up with your email and start straight away — {credits} free credits, no card.",
    "ctaButton": "Start free",
    "seePricing": "See all prices",
    "relatedTitle": "Other studios you might want",
    "backToStudios": "All studios"
  },
  "creator": {
    "name": "Image Creator",
    "tagline": "Type your idea in Arabic, get an ad-grade image",
    "definition": "PyraSuite's Image Creator turns one Arabic sentence into a publish-ready ad image: it takes your business and city from your Brand Kit, frames the picture for the platform you are posting to, and renders Arabic on the image correctly joined and right to left.",
    "metaTitle": "Image Creator — AI ad images that get Arabic right",
    "metaDescription": "Type a sentence in Arabic and get a publish-ready ad image. Correct Arabic text on the image, sized for Instagram and TikTok. See real output and the price before you sign up.",
    "step1": "Write what you have in mind, in Arabic — \"a shawarma wrap that makes people hungry, for my restaurant in Dubai\".",
    "step2": "Pick the platform and the style. Pyra takes your business and city from your Brand Kit; you do not type them again.",
    "step3": "Download it, or take it further in the Image Editing studio.",
    "q1": "Does it render Arabic correctly on the image?",
    "a1": "Yes. Letters come out joined, in their correct contextual forms, right to left, with no diacritics you did not ask for. This was the hardest thing in the product, and there is an explicit rule stopping the model inventing text anywhere else in the frame.",
    "q2": "Do I need to write a professional prompt?",
    "a2": "No. We ran both against the same request: a short colloquial Arabic sentence produced a better image than a carefully written English brief naming lens, aperture and lighting. Write the way you speak.",
    "q3": "Is the image the right size for the platform?",
    "a3": "Yes. You pick the platform and the canvas follows it — square, Instagram's 4:5 portrait, or wide. The picture is composed for that frame from the start rather than cropped into it afterwards."
  }
}
```

- [ ] **Step 2: The JSON-LD builder**

Create `lib/seo/studio-schema.ts`:

```ts
import type { StudioSlug } from '@/lib/studios/catalogue';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';

/**
 * The @graph for one studio page.
 *
 * BreadcrumbList so an engine can place the page in the site; FAQPage because
 * these are the questions a Gulf SME actually asks and the format answer
 * engines quote. Both nodes reference the site-wide Organization by @id rather
 * than restating it — lib/seo/schema.ts owns that entity.
 */
export function buildStudioSchema(
  locale: string,
  slug: StudioSlug,
  studioName: string,
  definition: string,
  faq: readonly { q: string; a: string }[],
  studiosLabel: string,
): Record<string, unknown> {
  const url = `${APP_URL}/${locale}/studios/${slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'PyraSuite', item: `${APP_URL}/${locale}` },
          { '@type': 'ListItem', position: 2, name: studiosLabel, item: `${APP_URL}/${locale}/studios` },
          { '@type': 'ListItem', position: 3, name: studioName, item: url },
        ],
      },
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: studioName,
        description: definition,
        inLanguage: locale,
        isPartOf: { '@id': `${APP_URL}/#website` },
        about: { '@id': `${APP_URL}/#software` },
        publisher: { '@id': `${APP_URL}/#organization` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };
}
```

- [ ] **Step 3: The section components**

All six are **server components**. Create them under `components/studios/public/`. Each takes plain props — no translation hooks inside, so the page owns every string and the components stay testable.

`StudioHero.tsx`:

```tsx
import { Badge } from '@/components/ui/badge';

interface StudioHeroProps {
  name: string;
  tagline: string;
  definition: string;
  costLabel: string;
  costValue: string;
}

/**
 * The definition paragraph is a plain <p> directly under the H1 and is not
 * behind any interaction: it is the sentence an answer engine lifts when
 * someone asks what this studio does.
 */
export function StudioHero({ name, tagline, definition, costLabel, costValue }: StudioHeroProps): React.ReactElement {
  return (
    <header className="mx-auto max-w-3xl px-6 pt-16 pb-10 text-center">
      <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-primary)]">{name}</h1>
      <p className="mt-3 text-lg text-[var(--color-text-secondary)]">{tagline}</p>
      <p className="mt-6 text-base leading-relaxed text-[var(--color-text-secondary)]">{definition}</p>
      <div className="mt-6 flex items-center justify-center gap-2 text-sm">
        <span className="text-[var(--color-text-muted)]">{costLabel}</span>
        <Badge variant="secondary">{costValue}</Badge>
      </div>
    </header>
  );
}
```

`StudioExamples.tsx`:

```tsx
import NextImage from 'next/image';
import type { StudioExample } from '@/lib/studios/examples';

interface StudioExamplesProps {
  title: string;
  note: string;
  locale: 'ar' | 'en';
  examples: readonly StudioExample[];
}

export function StudioExamples({ title, note, locale, examples }: StudioExamplesProps): React.ReactElement | null {
  if (examples.length === 0) return null;
  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{note}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {examples.map((ex) => (
          <figure key={ex.id} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <NextImage
              src={ex.file}
              alt={ex.alt[locale]}
              width={ex.width}
              height={ex.height}
              sizes="(max-width: 640px) 100vw, 50vw"
              className="h-auto w-full"
            />
            <figcaption className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">{ex.alt[locale]}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
```

`StudioSteps.tsx`:

```tsx
interface StudioStepsProps {
  title: string;
  steps: readonly string[];
}

/**
 * Numbered because these ARE a sequence — the customer does them in this order.
 * Do not reuse this shape for anything that is merely a list.
 */
export function StudioSteps({ title, steps }: StudioStepsProps): React.ReactElement {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <ol className="mt-6 space-y-5">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-sm font-bold text-[var(--color-text-primary)]">
              {i + 1}
            </span>
            <p className="pt-1 text-[var(--color-text-secondary)]">{step}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

`StudioFaq.tsx` — **`<details>`, so every answer is in the server HTML.** The landing FAQ shipped its answers only when open, and the audit measured that as zero answers reaching a crawler:

```tsx
import { ChevronDown } from 'lucide-react';

interface StudioFaqProps {
  title: string;
  items: readonly { q: string; a: string }[];
}

export function StudioFaq({ title, items }: StudioFaqProps): React.ReactElement {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <details key={item.q} className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <summary className="flex cursor-pointer list-none items-center justify-between p-5 text-start font-medium text-[var(--color-text-primary)]">
              {item.q}
              <ChevronDown className="ms-4 h-5 w-5 shrink-0 text-[var(--color-text-muted)] transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
```

`StudioCta.tsx`:

```tsx
import { Link } from '@/i18n/routing';

interface StudioCtaProps {
  title: string;
  body: string;
  button: string;
  pricing: string;
}

export function StudioCta({ title, body, button, pricing }: StudioCtaProps): React.ReactElement {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-3 text-[var(--color-text-secondary)]">{body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/signup"
          className="rounded-lg bg-[var(--color-brand)] px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
        >
          {button}
        </Link>
        <Link href="/pricing" className="text-[var(--color-link)] underline underline-offset-4">
          {pricing}
        </Link>
      </div>
    </section>
  );
}
```

`StudioRelated.tsx`:

```tsx
import { Link } from '@/i18n/routing';

interface StudioRelatedProps {
  title: string;
  items: readonly { slug: string; name: string; tagline: string }[];
}

export function StudioRelated({ title, items }: StudioRelatedProps): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-3xl px-6 pb-16">
      <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((s) => (
          <Link
            key={s.slug}
            href={`/studios/${s.slug}`}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:bg-[var(--color-bg)]"
          >
            <span className="block font-medium text-[var(--color-text-primary)]">{s.name}</span>
            <span className="mt-1 block text-sm text-[var(--color-text-secondary)]">{s.tagline}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: The page**

Create `app/[locale]/(landing)/studios/[slug]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { NavBar } from '@/components/landing/NavBar';
import { Footer } from '@/components/landing/Footer';
import { JsonLd } from '@/components/seo/JsonLd';
import { routing } from '@/i18n/routing';
import { publicAlternates, publicOpenGraph } from '@/lib/seo/alternates';
import { buildStudioSchema } from '@/lib/seo/studio-schema';
import { STUDIO_SLUGS, getStudio, type StudioSlug } from '@/lib/studios/catalogue';
import { getExamples } from '@/lib/studios/examples';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { PLANS } from '@/lib/stripe/plans';
import { StudioHero } from '@/components/studios/public/StudioHero';
import { StudioExamples } from '@/components/studios/public/StudioExamples';
import { StudioSteps } from '@/components/studios/public/StudioSteps';
import { StudioFaq } from '@/components/studios/public/StudioFaq';
import { StudioCta } from '@/components/studios/public/StudioCta';
import { StudioRelated } from '@/components/studios/public/StudioRelated';

export function generateStaticParams(): { locale: string; slug: string }[] {
  return routing.locales.flatMap((locale) => STUDIO_SLUGS.map((slug) => ({ locale, slug })));
}

/** The credit figure a page shows, built from lib/credits/costs.ts and never
 *  from a translation. A price in a string is how the published number and the
 *  charge drift apart. */
function costValue(slug: StudioSlug, unit: string, free: string, perImage: string, perShoot: string, perDuration: string): string {
  const entry = getStudio(slug);
  if (!entry) return '';
  switch (entry.costShape) {
    case 'free':
      return free;
    case 'imageRange':
      return `${CREDIT_COSTS.image['1080p']}–${CREDIT_COSTS.image['4K']} ${unit} · ${perImage}`;
    case 'shotRange':
      // The per-shot table is module-private to the photoshoot route; the
      // published ceiling is CREDIT_COSTS.photoshoot and the floor is one shot.
      return `2–${CREDIT_COSTS.photoshoot} ${unit} · ${perShoot}`;
    case 'perDuration':
      return `${CREDIT_COSTS.voiceover}+ ${unit} · ${perDuration}`;
    case 'flat':
    default:
      return `${CREDIT_COSTS[entry.costKey] as number} ${unit}`;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!getStudio(slug)) return {};
  const t = await getTranslations({ locale, namespace: `studios.${slug}` });
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    title,
    description,
    alternates: publicAlternates(locale, `/studios/${slug}`),
    openGraph: publicOpenGraph(locale, { title, description, path: `/studios/${slug}` }),
  };
}

export default async function StudioPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<React.ReactElement> {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const entry = getStudio(slug);
  if (!entry) notFound();

  const t = await getTranslations({ locale, namespace: `studios.${entry.slug}` });
  const s = await getTranslations({ locale, namespace: 'studios.shared' });
  const loc = locale === 'en' ? 'en' : 'ar';

  const faq = [1, 2, 3].map((n) => ({ q: t(`q${n}`), a: t(`a${n}`) }));
  const cost = costValue(entry.slug, s('creditUnit'), s('freeLabel'), s('perImage'), s('perShoot'), s('perDuration'));

  const related = entry.related.map((r) => ({ slug: r, name: '', tagline: '' }));
  for (const r of related) {
    const rt = await getTranslations({ locale, namespace: `studios.${r.slug}` });
    r.name = rt('name');
    r.tagline = rt('tagline');
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <JsonLd data={buildStudioSchema(locale, entry.slug, t('name'), t('definition'), faq, s('indexTitle'))} />
      <NavBar />
      <main>
        <StudioHero
          name={t('name')}
          tagline={t('tagline')}
          definition={t('definition')}
          costLabel={s('costLabel')}
          costValue={cost}
        />
        <StudioExamples
          title={s('examplesTitle')}
          note={s('examplesNote')}
          locale={loc}
          examples={getExamples(entry.examples)}
        />
        <StudioSteps title={s('howItWorks')} steps={[t('step1'), t('step2'), t('step3')]} />
        <StudioFaq title={s('faqTitle')} items={faq} />
        <StudioCta
          title={s('ctaTitle')}
          body={s('ctaBody', { credits: PLANS.free.credits })}
          button={s('ctaButton')}
          pricing={s('seePricing')}
        />
        <StudioRelated title={s('relatedTitle')} items={related} />
      </main>
      <Footer />
    </div>
  );
}
```

(Verified before writing this plan: `JsonLd` takes `data: object` — `components/seo/JsonLd.tsx:8`. `NavBar` takes no props — `components/landing/NavBar.tsx:28`. `tsconfig.json:12` already sets `resolveJsonModule: true`.)

- [ ] **Step 5: Prove one page renders**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

Run: `npm run build`
Expected: the build output lists `/[locale]/studios/[slug]` as SSG with **18** generated paths… **but only `creator` has copy**, so the other eight will throw on a missing message key. That is expected at this task: temporarily narrow `generateStaticParams` to `[{ locale: 'ar', slug: 'creator' }, { locale: 'en', slug: 'creator' }]`, build, confirm both pages render, then restore the full version and leave the build failing until Task 5 supplies the rest. **Record in the commit message that the build is red until Task 5.**

Verify in the built HTML for `/ar/studios/creator`: exactly one `<h1>`, the definition paragraph present as text, all three FAQ answers present as text, one `<script type="application/ld+json">` containing `FAQPage` and `BreadcrumbList`, a page-exact canonical, three hreflang links, and four `<img>` with non-empty `alt`.

- [ ] **Step 6: Commit**

```bash
git add "app/[locale]/(landing)/studios" components/studios/public lib/seo/studio-schema.ts messages
git commit -m "feat(studios): the public studio page shape, and creator in full

One dynamic route renders all nine studios in both locales from
lib/studios/catalogue.ts. Server components only — the landing page is
already 265 kB of gzipped JS because all thirteen of its sections are
client components, and these pages exist to be HTML a crawler reads.

The FAQ uses <details>, so every answer ships in the server HTML: the
landing FAQ rendered answers only when open and the 2026-09-01 audit
measured zero of them reaching a crawler.

The build is RED until Task 5: generateStaticParams asks for all nine
slugs and only creator has copy.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `photoshoot` and `edit` — the two other image studios

**Files:**
- Create: `components/studios/public/BeforeAfter.tsx`
- Modify: `app/[locale]/(landing)/studios/[slug]/page.tsx` (render `BeforeAfter` for `edit`)
- Modify: `messages/ar.json`, `messages/en.json`

- [ ] **Step 1: The before/after component**

Create `components/studios/public/BeforeAfter.tsx`:

```tsx
import NextImage from 'next/image';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { StudioExample } from '@/lib/studios/examples';

interface BeforeAfterProps {
  title: string;
  note: string;
  beforeLabel: string;
  afterLabel: string;
  locale: 'ar' | 'en';
  before: StudioExample;
  after: StudioExample;
}

/**
 * The edit studio's whole argument in one row: the SAME product, from the photo
 * a customer actually has to the one a marketplace accepts. Both frames come
 * from one live run (see public/examples/studios/manifest.json's sourceRun), so
 * the pairing is real rather than assembled.
 *
 * The arrow points with the reading direction, which is why there are two.
 */
export function BeforeAfter({ title, note, beforeLabel, afterLabel, locale, before, after }: BeforeAfterProps): React.ReactElement {
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{note}</p>
      <div className="mt-6 grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <figure className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <NextImage src={before.file} alt={before.alt[locale]} width={before.width} height={before.height} sizes="(max-width: 640px) 100vw, 45vw" className="h-auto w-full" />
          <figcaption className="px-4 py-3 text-sm font-medium text-[var(--color-text-muted)]">{beforeLabel}</figcaption>
        </figure>
        <Arrow className="mx-auto hidden h-8 w-8 text-[var(--color-text-muted)] sm:block" aria-hidden />
        <figure className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <NextImage src={after.file} alt={after.alt[locale]} width={after.width} height={after.height} sizes="(max-width: 640px) 100vw, 45vw" className="h-auto w-full" />
          <figcaption className="px-4 py-3 text-sm font-medium text-[var(--color-text-primary)]">{afterLabel}</figcaption>
        </figure>
      </div>
    </section>
  );
}
```

Add to `studios.shared` in BOTH message files: ar `"beforeLabel": "قبل — الصورة اللي عندك"`, `"afterLabel": "بعد — جاهزة للماركت بليس"`; en `"beforeLabel": "Before — the photo you have"`, `"afterLabel": "After — marketplace-ready"`.

In the page, render `BeforeAfter` **instead of** `StudioExamples` when `entry.slug === 'edit'`, taking `getExamples(entry.examples)` as `[before, after]` and guarding that both exist.

- [ ] **Step 2: The copy**

Add `studios.photoshoot` and `studios.edit` to both message files with all 14 required keys (`name`, `tagline`, `definition`, `metaTitle`, `metaDescription`, `step1..3`, `q1..3`, `a1..3`).

Anchor each in a measured fact from `CLAUDE.md`, never a claim you cannot name evidence for:
- **photoshoot** — six angles of one product from one photo; environment presets including a `food` set; marketplace presets that hit **exactly `rgb(255,255,255)` on 6 of 6 background samples**; paid plans deliver 2K/4K (Pro measured at 3072×5504).
- **edit** — fifteen presets rather than a prompt box; the customer's own photo must survive the edit; Arabic text onto the product itself; `marketplace_white` for Amazon.ae and noon.

Arabic FAQ questions to use (they are what the keyword research found people search):
- photoshoot: «محتاج مصور محترف؟» / «الصور تنفع لأمازون ونون؟» / «كام لقطة بياخد؟»
- edit: «هيغيّر شكل منتجي؟» / «ينفع يشيل الخلفية ويخليها بيضا؟» / «أقدر أكتب عربي على المنتج؟»

- [ ] **Step 3: Verify and commit**

Run: `npx tsx scripts/tests/studio-pages.test.ts` — the three image studios now pass their copy checks; the six text studios still fail. Run `npx tsc --noEmit && npm run lint` — clean.

```bash
git add components/studios/public/BeforeAfter.tsx "app/[locale]/(landing)/studios" messages
git commit -m "feat(studios): photoshoot and edit, with a real before/after pair

The edit page shows the SAME date-syrup jar from a busy café scene to a
pure-white marketplace background, label intact — both frames from one
live run, so the pairing is real rather than assembled.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The deliverable renderer, and the four text studios

**Files:**
- Modify: `scripts/build-studio-examples.mjs` (copy the four real JSON deliverables into `public/examples/studios/`)
- Create: `components/studios/public/DeliverableSample.tsx`
- Modify: `app/[locale]/(landing)/studios/[slug]/page.tsx`
- Modify: `messages/ar.json`, `messages/en.json`

**Why:** `plan`, `analysis`, `storyboard` and `prompt-builder` produce text. Rendering the real deliverable as HTML beats a screenshot on every axis that matters here: it is indexable, it is what the customer actually receives, and it needs no image.

- [ ] **Step 1: Copy the real deliverables**

In `scripts/build-studio-examples.mjs`, add after the image loop — copying the newest run that has each file, and recording the run in the output so the page can name it:

```js
const DELIVERABLES = [
  { out: 'plan', sourceRun: '2026-09-01T03-43-10-125Z', file: 'plan_en.json' },
  { out: 'analysis', sourceRun: '2026-09-01T03-43-10-125Z', file: 'analysis_ar.json' },
  { out: 'storyboard', sourceRun: '2026-08-27T13-07-38-852Z', file: 'storyboard_ar.json' },
  { out: 'prompt-builder', sourceRun: '2026-08-27T13-07-38-852Z', file: 'prompt_builder.json' },
];
```

For each: read the JSON, write `public/examples/studios/deliverable-<out>.json` as `{ sourceRun, generatedOn: 'https://pyrasuite.pyramedia.cloud', data: <the parsed deliverable> }`, and exit 1 if a source is missing. Run the script and confirm four files appear.

- [ ] **Step 2: The renderer**

Create `components/studios/public/DeliverableSample.tsx` — a server component taking `{ title: string; note: string; slug: string; data: unknown }` and rendering per slug:

- `plan` → the objectives table (goal / KPI / target), the channels list with budget percentages, and the first two calendar weeks. Wrap the table in `overflow-x-auto`.
- `analysis` → the SWOT quadrants as a 2×2 grid and the KPI cards with their headline numbers.
- `storyboard` → the first three scenes as cards: scene number, camera angle, and the line of dialogue.
- `prompt-builder` → the rough input and the three prompts it produced, in `<code>` blocks.

Every value comes from the JSON; nothing is retyped. Use `font-variant-numeric: tabular-nums` on any column of digits. Add `"sampleTitle"` and `"sampleNote"` to `studios.shared` in both locales — ar: `"نموذج حقيقي من الاستوديو ده"` / `"ده مخرج فعلي، اتولّد على الإنتاج. مختصر عشان الصفحة — النسخة الكاملة بتوصلك في حسابك."`

- [ ] **Step 3: The copy for the four**

Add `studios.plan`, `studios.analysis`, `studios.storyboard`, `studios.prompt-builder` to both message files, all 14 keys each. Anchor in measured facts: a plan covers the exact number of weeks the duration asks for; analysis fills all five tabs and every KPI carries a headline number; a storyboard is nine scenes with camera angles and dialogue; prompt-builder is free and turns a rough sentence into a brief.

- [ ] **Step 4: Verify and commit**

Run the gate; the four text studios now pass. `npx tsc --noEmit && npm run lint` clean.

```bash
git add scripts/build-studio-examples.mjs public/examples/studios components/studios/public/DeliverableSample.tsx "app/[locale]/(landing)/studios" messages
git commit -m "feat(studios): render the real text deliverables, and the four text studios

plan, analysis, storyboard and prompt-builder produce text, so the page
renders the ACTUAL deliverable from a live run as HTML rather than a
screenshot of one: indexable, and it is what the customer receives.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: `campaign` and `voiceover` — and the build goes green

**Files:**
- Create: `components/studios/public/AudioSample.tsx`
- Modify: `app/[locale]/(landing)/studios/[slug]/page.tsx`
- Modify: `messages/ar.json`, `messages/en.json`

- [ ] **Step 1: The audio sample**

Create `components/studios/public/AudioSample.tsx` — a **server** component (a native `<audio controls>` needs no JavaScript):

```tsx
interface AudioSampleProps {
  title: string;
  note: string;
  src: string;
  transcript: string;
  transcriptLabel: string;
  meta: string;
}

/**
 * A native <audio controls> — no player library, no client component. The
 * transcript is rendered as text beside it: a crawler cannot listen, and the
 * Arabic script is the only part of this section an answer engine can read.
 */
export function AudioSample({ title, note, src, transcript, transcriptLabel, meta }: AudioSampleProps): React.ReactElement {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{note}</p>
      <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <audio controls preload="none" src={src} className="w-full">
          <track kind="captions" />
        </audio>
        <p className="mt-4 text-xs uppercase tracking-wider text-[var(--color-text-muted)]">{transcriptLabel}</p>
        <p className="mt-1 text-[var(--color-text-secondary)]">{transcript}</p>
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">{meta}</p>
      </div>
    </section>
  );
}
```

The page reads `public/examples/studios/voiceover-gulf-sample.json` for `file`, `scriptAsSpoken`, `durationSeconds` and `dialect`, and passes `meta` as a translated string carrying the duration and dialect. Add `studios.shared.transcriptLabel` (ar `"النص المنطوق"` / en `"What is spoken"`) and `studios.shared.audioMeta` (ar `"لهجة خليجية · {seconds} ثانية · مولّدة من المنتج نفسه"` / en `"Gulf dialect · {seconds} seconds · generated by the product itself"`).

- [ ] **Step 2: The copy for both**

Add `studios.campaign` and `studios.voiceover`. For voiceover, the FAQ must answer the searches the audit found: «فيه لهجة خليجية؟» / «الصوت طبيعي ولا آلي؟» / «بكام الدقيقة؟». For campaign: nine posts with captions, images optional and priced separately, dialect per market.

- [ ] **Step 3: The build must now be GREEN**

Run: `npx tsx scripts/tests/studio-pages.test.ts` → all nine studios pass.
Run: `npm run build` → clean; the route list shows `/[locale]/studios/[slug]` with **18** paths generated.

Verify in the built HTML for three pages (`/ar/studios/creator`, `/ar/studios/edit`, `/ar/studios/voiceover`): one `<h1>` each, the definition present as text, every FAQ answer present as text, `FAQPage` + `BreadcrumbList` in the JSON-LD, page-exact canonical, three hreflang links, and for voiceover an `<audio>` element with the transcript as text.

```bash
git add components/studios/public/AudioSample.tsx "app/[locale]/(landing)/studios" messages
git commit -m "feat(studios): campaign and voiceover — all nine pages build

The voiceover page plays a real 16-second Gulf-dialect sample generated by
the product (3 credits, elevenlabs) with the spoken Arabic rendered beside
it as text: a crawler cannot listen, and the script is the only part of
that section an answer engine can read.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The index page, the sitemap, and the links in from the landing page

**Files:**
- Create: `app/[locale]/(landing)/studios/page.tsx`
- Modify: `app/sitemap.ts`
- Modify: `components/landing/StudiosShowcase.tsx`
- Modify: `scripts/tests/studio-pages.test.ts`, `scripts/tests/sitemap.test.ts`

- [ ] **Step 1: Extend the gates first**

In `scripts/tests/studio-pages.test.ts` add:
- every studio URL (`/{locale}/studios/{slug}`) and the index (`/{locale}/studios`) is in `sitemap()` — **20 new URLs**, both locales;
- `StudiosShowcase.tsx` contains `href={\`/studios/` (the cards link out) — read the file with `stripComments` first;
- the showcase's studio array length equals `STUDIO_SLUGS.length`.

In `scripts/tests/sitemap.test.ts` update the total-URL expectation. Run both; they fail.

- [ ] **Step 2: The index page**

Create `app/[locale]/(landing)/studios/page.tsx` — a server component listing all nine as cards (name, tagline, cost, link), with `generateStaticParams` over the locales, metadata from `studios.shared.indexMetaTitle`/`indexMetaDescription` through `publicAlternates(locale, '/studios')` and `publicOpenGraph`, plus an `ItemList` JSON-LD naming the nine in order.

- [ ] **Step 3: Sitemap**

In `app/sitemap.ts`, add `/studios` to `PAGES` and generate the nine `/studios/{slug}` entries from `STUDIO_SLUGS` — imported, never listed again. `changeFrequency: 'monthly'`, `priority: 0.8` for the index and `0.7` for each studio, `updated: '2026-09-02'`.

- [ ] **Step 4: Link in from the landing showcase**

In `components/landing/StudiosShowcase.tsx`, add a `slug` to each of the nine entries (matching `STUDIO_SLUGS` order-independently, by meaning) and wrap each card in `<Link href={\`/studios/${slug}\`}>`. Keep the section's existing `id="studios"` so the landing anchor still works.

> If the file's nine entries and the catalogue's nine can drift, the gate in Step 1 catches it. Do not "fix" that by making the showcase read the catalogue's copy keys as well — the landing card copy (`landing.studios.sNName`) is deliberately shorter than the page copy (`studios.<slug>.name`), and merging them would flatten both.

- [ ] **Step 5: Verify and commit**

Run: `npm run gates` → all green including the two updated gates.
Run: `npm run build` → clean; **20 more prerendered documents**; `.next/server/app/sitemap.xml.body` carries 30 `<loc>` (10 existing + 20 new).

```bash
git add "app/[locale]/(landing)/studios/page.tsx" app/sitemap.ts components/landing/StudiosShowcase.tsx scripts/tests
git commit -m "feat(studios): the index, the sitemap entries, and links in from the landing page

The indexable footprint goes from 10 URLs to 30. Each landing card now
links to its own page, which is the internal linking these pages had none
of. The gate fails if the showcase's nine and the catalogue's nine drift.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Record it, and the honest limits

**Files:** `CLAUDE.md`, `docs/INVARIANTS.md`, `package.json`

- [ ] **Step 1:** Add a `### Public studio pages — 2026-09-02` section to `CLAUDE.md` recording: the 20 new URLs; that every example is real paid-plan product output with its source run named; that the voiceover sample cost 3 credits and was measured non-silent by `scripts/live/audio.ts` but **has not been listened to by any automated check**; the `cornerMarkPresent` false-positive finding; and the JPEG-named-`.png` harness finding.

- [ ] **Step 2:** Update the Commands section: the new `test:studio-pages` line and the new prebuild count.

- [ ] **Step 3:** State the limits plainly under a `#### Still open` heading:
- **Nothing here is verified against production** until the founder deploys; the re-measurement is Step 4 below.
- **The `plan` sample is English and the `analysis` sample is Arabic** — that is what the live runs produced, and rendering an English plan on the Arabic page is a real mismatch. Either generate an Arabic plan (5 credits) or say on the page which language the sample is in.
- **No use-case or comparison pages** — the audit's other two content routes are still absent.
- **`/studios` is not in the NavBar**, so the only path in is the landing showcase and the sitemap.

- [ ] **Step 4: After the founder deploys, re-measure**

```bash
S=https://pyrasuite.pyramedia.cloud
curl -s $S/sitemap.xml | grep -c '<loc>'                      # expect 30
curl -s -o /dev/null -w '%{http_code}\n' $S/ar/studios         # expect 200
for s in creator photoshoot edit campaign plan analysis storyboard voiceover prompt-builder; do
  printf '%-16s %s\n' "$s" "$(curl -s -o /dev/null -w '%{http_code}' $S/ar/studios/$s)"
done                                                           # expect nine 200s
curl -s $S/ar/studios/creator | grep -c 'application/ld+json'  # expect 1
curl -s $S/ar/studios/voiceover | grep -c '<audio'             # expect 1
curl -s -o /dev/null -w '%{http_code}\n' $S/ar/studios/video   # expect 404 — video is not built
```

```bash
git add CLAUDE.md docs/INVARIANTS.md package.json
git commit -m "docs: record the public studio pages and what they do not yet prove

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Out of scope, deliberately

- `/use-cases/[industry]` and `/compare/[slug]` — the audit's other two content routes.
- Guides / blog.
- Adding `/studios` to the NavBar — a navigation decision, not a content one.
- Regenerating the English `plan` sample in Arabic (5 credits, founder's call).
