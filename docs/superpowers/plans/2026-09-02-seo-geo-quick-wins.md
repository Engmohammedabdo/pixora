# SEO + GEO Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make what Google and the answer engines see of PyraSuite truthful, complete and consistent — every public page canonical to itself, one robots.txt that is the one the code writes, FAQ answers in the HTML with no placeholders, an entity that can be found, a sitemap that matches the open-signup reality, and real 404s — plus the four small API/config hygiene items the audit rated high, and CI so the gates run on every push.

**Architecture:** Every fix is a small, independently testable change with its own prebuild gate, following the repo's rule that a defect class found by an audit gets a gate so the next instance is found at build time. SEO metadata is consolidated into ONE helper (`lib/seo/alternates.ts`) that both the canonical and the OpenGraph of every public page derive from, so the two cannot disagree. Protected routes are derived from the `(dashboard)` directory listing, never a filename list.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, `next-intl` v4, Zod (`zod/v4`), `tsx` test scripts (no framework), Supabase.

**Source:** The 2026-09-01 audit — https://claude.ai/code/artifact/45ba39d5-f41b-4113-b925-470b6a01751f — every finding below carries its measured evidence there.

## Global Constraints

- **TypeScript strict, zero `any`.** `npx tsc --noEmit` clean after every task.
- **All gates green after every task:** `npm run check:invariants`, `npm run lint`, and every `test:*` script in `prebuild`. New tests are ADDED to the `prebuild` chain in `package.json`.
- **RTL-first CSS:** `ps/pe/ms/me/start/end` only. **CSS variables** for colours. **No `bg-[var(--x)]/NN`** (Tailwind 3.4.19 drops it; invariant `no-var-opacity-modifier`).
- **No Arabic string literals in TSX** (invariant `no-arabic-literals-in-tsx`); all copy through `messages/{ar,en}.json` with identical key sets (invariant `msg-parity`).
- **Pyra brand rule:** never name a model vendor (Gemini/OpenAI/Flux/ElevenLabs) in user-facing text. "ChatGPT" as a named competitor in the comparison section is allowed; do not add more.
- **Never invent facts for structured data.** `sameAs` holds only URLs that exist in the repo or that the founder supplies. No emails, phones or addresses that are not already in the codebase (`support@pyramedia.info` is real — `EMAIL_REPLY_TO`).
- **Commit after every task.** Commit trailer: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **`git push` does NOT deploy.** After the final merge the founder triggers the Coolify deploy; the plan ends with a live re-measurement step that must be run only after that.
- **Tests are `scripts/tests/<name>.test.ts`, run with `npx tsx`, hand-rolled `check()` counters, exit 1 on failure** — match `scripts/tests/settle.test.ts` exactly. Every new test is registered as `"test:<name>": "npx tsx scripts/tests/<name>.test.ts"` and appended to the `prebuild` chain.

---

## File Structure

**Created:**
- `lib/seo/alternates.ts` — `publicAlternates(locale, path)` and `publicOpenGraph(locale, {title, description, path})`: the ONE source for canonical/hreflang/OG on every public page.
- `lib/seo/profiles.ts` — `SOCIAL_PROFILES` (owned profile URLs; empty until the founder fills it) and `ORGANIZATION_ALTERNATE_NAMES`.
- `lib/routing/protected.ts` — `PROTECTED_PREFIXES` + `isProtectedPath()`, pure and testable, used by `middleware.ts`.
- `public/llms.txt`, `public/.well-known/security.txt`.
- `scripts/tests/robots.test.ts`, `alternates.test.ts`, `schema.test.ts`, `sitemap.test.ts`, `landing-copy.test.ts`, `api-hygiene.test.ts`, `config-hygiene.test.ts`, `protected-prefixes.test.ts`, `invariants-doc.test.ts`, `run-all.ts`.
- `.github/workflows/gates.yml`.

**Modified:**
- `app/robots.ts` (AI-crawler groups), `public/robots.txt` (DELETED).
- `app/[locale]/layout.tsx` (drop the site-wide canonical; OG locale/url), `i18n/routing.ts` (`alternateLinks: false`).
- `app/[locale]/pricing/page.tsx`, `app/[locale]/(landing)/{contact,waitlist,privacy,terms}/page.tsx` (page-exact alternates + OG via the helper), `app/[locale]/(auth)/layout.tsx` (noindex).
- `lib/seo/schema.ts` (FAQ placeholders, Organization/SoftwareApplication enrichment, WebSite node), `components/landing/FaqSection.tsx` (answers in HTML), `components/landing/Footer.tsx` (profile links).
- `app/sitemap.ts`, `next.config.ts` (waitlist redirect; CSP/images/poweredBy), `app/fonts.ts`.
- `components/landing/HeroSection.tsx`, `messages/ar.json`, `messages/en.json`.
- `app/api/upload/route.ts`, `app/api/assets/[id]/route.ts`, `app/api/public/gate-status/route.ts`.
- `middleware.ts`, `package.json`, `docs/INVARIANTS.md`, `CLAUDE.md`, `scripts/invariants-baseline.json`.

---

### Task 1: One robots.txt — the one the code writes, with an explicit AI-crawler stance

**Files:**
- Delete: `public/robots.txt`
- Modify: `app/robots.ts`
- Create: `scripts/tests/robots.test.ts`
- Modify: `package.json` (scripts)

**Why:** The live `/robots.txt` is the 140-byte static file (3 disallows, none of which match a real localized path); `app/robots.ts` with 19 rules has never shipped. AI crawlers are allowed only by omission.

**Interfaces:**
- Produces: `app/robots.ts` default export unchanged in shape (`MetadataRoute.Robots`), now with two rule groups.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/robots.test.ts`:

```ts
/**
 * Proof that ONE robots.txt ships — the one app/robots.ts writes.
 *
 *   npx tsx scripts/tests/robots.test.ts
 *
 * Measured 2026-09-01: production served public/robots.txt (140 B, static-file
 * headers) while app/robots.ts with 19 disallow rules had never been reachable —
 * Next serves a public/ file over a metadata route of the same name. The three
 * rules that DID ship matched no real URL (`/dashboard/` vs `/ar/dashboard/`).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import robots from '../../app/robots';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}

const ROOT = join(__dirname, '..', '..');
check('public/robots.txt does not exist (it shadows app/robots.ts)', !existsSync(join(ROOT, 'public', 'robots.txt')));

const out = robots();
const rules = Array.isArray(out.rules) ? out.rules : [out.rules];
const star = rules.find((r) => r.userAgent === '*');
check('a * group exists', Boolean(star));
const starDisallow = ([] as string[]).concat((star?.disallow as string[] | string) ?? []);
check('* disallows /admin/', starDisallow.includes('/admin/'), starDisallow.join(', '));
check('* disallows the localized dashboard by wildcard', starDisallow.includes('/*/dashboard/'));
check('* has at least 19 disallow rules', starDisallow.length >= 19, String(starDisallow.length));

const AI = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Bingbot', 'CCBot'];
const aiGroup = rules.find((r) => Array.isArray(r.userAgent) && r.userAgent.includes('GPTBot'));
check('an explicit AI-crawler group exists', Boolean(aiGroup));
for (const ua of AI) check(`AI group names ${ua}`, Array.isArray(aiGroup?.userAgent) && aiGroup!.userAgent.includes(ua));
check('AI group allows /', aiGroup?.allow === '/');
check('AI group carries the same disallows as *', JSON.stringify(aiGroup?.disallow) === JSON.stringify(star?.disallow));
check('sitemap declared', typeof out.sitemap === 'string' && out.sitemap.endsWith('/sitemap.xml'));

if (failures) { console.log(`\n[robots] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[robots] ${checks} checks passed`);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/tests/robots.test.ts`
Expected: FAIL — `public/robots.txt does not exist` and `an explicit AI-crawler group exists`.

- [ ] **Step 3: Delete the static file and add the AI group**

```bash
git rm public/robots.txt
```

Replace the body of `app/robots.ts` with:

```ts
import type { MetadataRoute } from 'next';

/**
 * The ONE robots.txt. A static public/robots.txt shadowed this route from the
 * day it was written (Next serves public/ files over metadata routes of the
 * same name), so production carried three rules — none matching a localized
 * path — while these nineteen never shipped. scripts/tests/robots.test.ts
 * fails the build if the static file ever comes back.
 *
 * AI crawlers are listed by NAME so that allowing them is a decision on
 * record rather than an omission. They get exactly the * rules.
 */
const DISALLOW = [
  '/api/',
  '/admin/',
  '/*/dashboard/',
  '/*/onboarding/',
  '/*/settings/',
  '/*/billing/',
  '/*/assets/',
  '/*/brand-kit/',
  '/*/creator/',
  '/*/photoshoot/',
  '/*/campaign/',
  '/*/plan/',
  '/*/storyboard/',
  '/*/analysis/',
  '/*/voiceover/',
  '/*/edit/',
  '/*/prompt-builder/',
  '/*/projects/',
  '/*/referrals/',
];

// Answer engines and their search crawlers. Bingbot is here because Copilot and
// ChatGPT search ride on Bing's index.
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Bingbot',
  'CCBot',
];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: '/', disallow: DISALLOW },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
```

- [ ] **Step 4: Register the test and run it**

In `package.json` add `"test:robots": "npx tsx scripts/tests/robots.test.ts"` and append ` && npm run test:robots` to the `prebuild` chain.

Run: `npx tsx scripts/tests/robots.test.ts`
Expected: `[robots] 18 checks passed`

- [ ] **Step 5: Gates + commit**

Run: `npx tsc --noEmit && npm run lint && npx tsx scripts/check-invariants.ts`
Expected: clean, 18/18.

```bash
git add app/robots.ts scripts/tests/robots.test.ts package.json
git commit -m "fix(seo): the robots.txt that ships is the one the code writes

public/robots.txt shadowed app/robots.ts since it was committed: production
served 3 rules (none matching a localized path) while 19 never shipped, so
/admin/ was crawlable. Deleted. AI crawlers are now named so allowing them
is a decision on record. Gate: test:robots.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Every public page canonical to itself, one hreflang channel, real OpenGraph on inner pages, auth pages noindex

**Files:**
- Create: `lib/seo/alternates.ts`
- Modify: `app/[locale]/layout.tsx:52-64` (delete the `alternates` block; OG locale/url)
- Modify: `i18n/routing.ts`
- Modify: `app/[locale]/pricing/page.tsx`, `app/[locale]/(landing)/contact/page.tsx`, `app/[locale]/(landing)/waitlist/page.tsx`
- Modify: `app/[locale]/(landing)/privacy/page.tsx`, `app/[locale]/(landing)/terms/page.tsx` (add `generateMetadata`)
- Modify: `app/[locale]/(auth)/layout.tsx` (export `metadata` with noindex)
- Create: `scripts/tests/alternates.test.ts`
- Modify: `package.json`

**Why:** Six public pages emit `canonical = /ar` (root layout default), telling Google they duplicate the landing page. The HTTP `Link` header says `x-default = /` (a 307) while the HTML says `/ar`. Inner pages have no `og:image`/`og:site_name`. Login/signup/forgot/reset should not be indexed at all.

**Interfaces:**
- Produces: `publicAlternates(locale: string, path: string): { canonical: string; languages: Record<'ar'|'en'|'x-default', string> }` and `publicOpenGraph(locale: string, o: { title: string; description: string; path: string }): NonNullable<Metadata['openGraph']>` from `lib/seo/alternates.ts`. `path` is `''` for the locale root or `'/pricing'`-style.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/alternates.test.ts`:

```ts
/**
 * Proof that every public page is canonical to ITSELF and that hreflang has
 * exactly one channel.
 *
 *   npx tsx scripts/tests/alternates.test.ts
 *
 * Measured 2026-09-01: /ar/contact, /ar/privacy, /ar/terms, /ar/login and
 * /ar/signup all carried <link rel="canonical" href=".../ar"> from the root
 * layout's site-wide default; only /ar/pricing emitted its own. The HTTP Link
 * header (next-intl's alternateLinks) said x-default = "/" — a 307 — while the
 * HTML said "/ar". Two channels, two answers.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { publicAlternates, publicOpenGraph } from '../../lib/seo/alternates';

let failures = 0;
let checks = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failures++; console.log(`FAIL  ${label}\n        expected ${e}\n        got      ${a}`); }
}
const ROOT = join(__dirname, '..', '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';

// ── the helper ──
const root = publicAlternates('ar', '');
check('root canonical is the locale root', root.canonical, `${BASE}/ar`);
check('root x-default is Arabic', root.languages['x-default'], `${BASE}/ar`);
const pricing = publicAlternates('en', '/pricing');
check('inner canonical is page-exact', pricing.canonical, `${BASE}/en/pricing`);
check('inner ar alternate', pricing.languages.ar, `${BASE}/ar/pricing`);
check('inner en alternate', pricing.languages.en, `${BASE}/en/pricing`);
check('inner x-default follows the page', pricing.languages['x-default'], `${BASE}/ar/pricing`);
check('a missing leading slash is normalised', publicAlternates('ar', 'contact').canonical, `${BASE}/ar/contact`);

const og = publicOpenGraph('ar', { title: 'T', description: 'D', path: '/pricing' });
check('og url is page-exact', og.url, `${BASE}/ar/pricing`);
check('og locale is the UAE Arabic tag', og.locale, 'ar_AE');
check('og alternateLocale', og.alternateLocale, ['en_US']);
check('og siteName', og.siteName, 'PyraSuite');
check('og type', og.type, 'website');
check('og title passes through', og.title, 'T');

// ── the wiring ──
check('root layout no longer sets a site-wide canonical', /alternates\s*:/.test(src('app/[locale]/layout.tsx')), false);
check('next-intl alternate Link header is off', /alternateLinks:\s*false/.test(src('i18n/routing.ts')), true);
for (const p of ['app/[locale]/pricing/page.tsx', 'app/[locale]/(landing)/contact/page.tsx', 'app/[locale]/(landing)/waitlist/page.tsx', 'app/[locale]/(landing)/privacy/page.tsx', 'app/[locale]/(landing)/terms/page.tsx']) {
  check(`${p} uses publicAlternates`, /publicAlternates\(/.test(src(p)), true);
  check(`${p} uses publicOpenGraph`, /publicOpenGraph\(/.test(src(p)), true);
}
check('auth pages are noindex', /index:\s*false/.test(src('app/[locale]/(auth)/layout.tsx')), true);

if (failures) { console.log(`\n[alternates] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[alternates] ${checks} checks passed`);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/tests/alternates.test.ts`
Expected: FAIL — module `lib/seo/alternates` not found.

- [ ] **Step 3: Create the helper**

Create `lib/seo/alternates.ts`:

```ts
import type { Metadata } from 'next';

/**
 * The ONE place a public page's canonical, hreflang and OpenGraph identity
 * come from.
 *
 * Before this, the root layout stamped `canonical = /{locale}` on EVERY page as
 * a "site-wide default", so six public pages told Google they were duplicates
 * of the landing page; next-intl separately emitted an HTTP Link header whose
 * x-default was "/" (a 307). A helper both the canonical and the OG derive from
 * is how the two stop disagreeing.
 *
 * `path` is '' for the locale root, or '/pricing'-style for an inner page.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';
const LOCALES = ['ar', 'en'] as const;
type Locale = (typeof LOCALES)[number];

function normalise(path: string): string {
  if (!path || path === '/') return '';
  return path.startsWith('/') ? path : `/${path}`;
}

function toLocale(locale: string): Locale {
  return locale === 'en' ? 'en' : 'ar';
}

export function publicAlternates(
  locale: string,
  path: string,
): { canonical: string; languages: Record<Locale | 'x-default', string> } {
  const p = normalise(path);
  return {
    canonical: `${APP_URL}/${toLocale(locale)}${p}`,
    languages: {
      ar: `${APP_URL}/ar${p}`,
      en: `${APP_URL}/en${p}`,
      // Arabic is the product's first language and the default locale; a
      // visitor whose language matches neither lands on the Arabic page.
      'x-default': `${APP_URL}/ar${p}`,
    },
  };
}

/** OG locale tags. ar_AE, not ar_SA: the company and its first customers are in the UAE. */
const OG_LOCALE: Record<Locale, string> = { ar: 'ar_AE', en: 'en_US' };

export function publicOpenGraph(
  locale: string,
  o: { title: string; description: string; path: string },
): NonNullable<Metadata['openGraph']> {
  const l = toLocale(locale);
  const other = l === 'ar' ? 'en' : 'ar';
  return {
    type: 'website',
    siteName: 'PyraSuite',
    title: o.title,
    description: o.description,
    url: `${APP_URL}/${l}${normalise(o.path)}`,
    locale: OG_LOCALE[l],
    alternateLocale: [OG_LOCALE[other]],
  };
}
```

- [ ] **Step 4: Remove the site-wide canonical, switch OG locale, and turn off the Link header**

In `app/[locale]/layout.tsx` delete the whole `alternates: { … }` block (lines ~52-64 including its comment). Change `openGraph.locale` from `isAr ? 'ar_SA' : 'en_US'` to `isAr ? 'ar_AE' : 'en_US'` and add `url: \`${APP_URL}/${locale}\`,` and `alternateLocale: [isAr ? 'en_US' : 'ar_AE'],` inside `openGraph`.

In `i18n/routing.ts`:

```ts
export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  // The HTML <link rel="alternate"> tags are the one hreflang channel. With this
  // on, next-intl ALSO sent an HTTP Link header whose x-default was "/" — a URL
  // that 307s — while the HTML said "/ar". See lib/seo/alternates.ts.
  alternateLinks: false,
});
```

- [ ] **Step 5: Page-exact metadata on the five public pages**

`app/[locale]/pricing/page.tsx` — inside `generateMetadata`, replace the existing `alternates: { canonical: … }` and `openGraph: { … }` with:

```ts
    alternates: publicAlternates(locale, '/pricing'),
    openGraph: publicOpenGraph(locale, { title: t('title'), description: t('description'), path: '/pricing' }),
```
(and add `import { publicAlternates, publicOpenGraph } from '@/lib/seo/alternates';`). Keep whatever `twitter` block exists but set its `title`/`description` to the same `t('title')`/`t('description')` so the card matches the page.

`app/[locale]/(landing)/contact/page.tsx` and `waitlist/page.tsx` — same shape with paths `/contact` and `/waitlist`, using the `t('title')` / `t('subtitle')` those files already read.

`app/[locale]/(landing)/privacy/page.tsx` and `terms/page.tsx` — these are server components with no metadata. Add at the top (after imports):

```ts
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { publicAlternates, publicOpenGraph } from '@/lib/seo/alternates';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // These two pages carry hardcoded Arabic and read NO translations (their own
  // headers say so), so the metadata gets its own small namespace.
  const t = await getTranslations({ locale, namespace: 'seo.privacy' }); // 'seo.terms' in terms/page.tsx
  const title = t('title');
  const description = t('description');
  return {
    title,
    description,
    alternates: publicAlternates(locale, '/privacy'), // '/terms'
    openGraph: publicOpenGraph(locale, { title, description, path: '/privacy' }),
  };
}
```

Then add a top-level `seo` namespace to BOTH message files (identical key sets — invariant `msg-parity`):

`messages/ar.json`:
```json
"seo": {
  "privacy": { "title": "سياسة الخصوصية", "description": "كيف تجمع PyraSuite بياناتك، وليه، ومين يشوفها، وإزاي تمسحها." },
  "terms": { "title": "شروط الاستخدام", "description": "شروط استخدام PyraSuite: الكريدت، الاسترجاع، الاستخدام المقبول، وإنهاء الحساب." }
}
```
`messages/en.json`:
```json
"seo": {
  "privacy": { "title": "Privacy Policy", "description": "What PyraSuite collects, why, who can see it, and how to delete it." },
  "terms": { "title": "Terms of Service", "description": "PyraSuite terms: credits, refunds, acceptable use, and account termination." }
}
```

- [ ] **Step 6: Auth pages noindex**

In `app/[locale]/(auth)/layout.tsx` add (top-level, after imports):

```ts
import type { Metadata } from 'next';

// Login, signup and password pages are not landing pages. They inherited the
// site-wide title AND a canonical pointing at the landing page, so Google was
// asked to index six near-identical forms and told they were all "/ar".
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};
```

- [ ] **Step 7: Register + run**

`package.json`: add `"test:alternates": "npx tsx scripts/tests/alternates.test.ts"`, append to `prebuild`.

Run: `npx tsx scripts/tests/alternates.test.ts`
Expected: `[alternates] 25 checks passed`

Run: `npx tsc --noEmit && npm run lint && npx tsx scripts/check-invariants.ts`
Expected: clean; `msg-parity` passes (both locales gained the same keys).

- [ ] **Step 8: Commit**

```bash
git add lib/seo/alternates.ts "app/[locale]" i18n/routing.ts messages scripts/tests/alternates.test.ts package.json
git commit -m "fix(seo): every public page is canonical to itself, one hreflang channel

Six public pages carried canonical=/ar from the root layout's site-wide
default, telling Google they duplicate the landing page; the HTTP Link
header said x-default=/ (a 307) while the HTML said /ar. One helper,
lib/seo/alternates.ts, now derives canonical, hreflang and OpenGraph for
every public page, and auth pages are noindex. Gate: test:alternates.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: FAQ answers in the HTML, no `{credits}` in the JSON-LD, and an entity an engine can find

**Files:**
- Create: `lib/seo/profiles.ts`
- Modify: `lib/seo/schema.ts:22-148`
- Modify: `components/landing/FaqSection.tsx:30-75`
- Modify: `components/landing/Footer.tsx`
- Modify: `messages/ar.json`, `messages/en.json` (`landing.faq.q1`, footer keys)
- Create: `scripts/tests/schema.test.ts`
- Modify: `package.json`

**Why:** `{credits}` appears raw 11 times in the live `/ar` because `buildFaqSchema` reads the untranslated message; FAQ answers render only under `{isOpen && (` so a non-JS fetch sees none; the Organization node has no `alternateName`/`sameAs`, its `logo` is the 1200×630 OG image, and its `url` changes per locale under one `@id`.

**Interfaces:**
- Produces: `SOCIAL_PROFILES: readonly string[]` and `ORGANIZATION_ALTERNATE_NAMES: readonly string[]` from `lib/seo/profiles.ts`; `buildStructuredData(locale)` now returns a 4-node `@graph` (Organization, WebSite, SoftwareApplication, FAQPage).

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/schema.test.ts`:

```ts
/**
 * Proof that the structured data is complete, true, and free of placeholders.
 *
 *   npx tsx scripts/tests/schema.test.ts
 *
 * Measured 2026-09-01: the FAQPage answer stating the free allowance shipped
 * the raw ICU placeholder "{credits}" — 11 occurrences in the live /ar — because
 * buildFaqSchema read the untranslated message. The Organization node had no
 * alternateName or sameAs, a 1200x630 OG image as its logo, and a url that
 * changed per locale under one @id.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildStructuredData } from '../../lib/seo/schema';
import { SOCIAL_PROFILES } from '../../lib/seo/profiles';
import { PLANS } from '../../lib/stripe/plans';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}
const ROOT = join(__dirname, '..', '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';

for (const locale of ['ar', 'en'] as const) {
  const g = buildStructuredData(locale)['@graph'];
  const json = JSON.stringify(g);
  check(`${locale}: no ICU placeholder survives serialisation`, !/\{[a-zA-Z]+\}/.test(json), (json.match(/\{[a-zA-Z]+\}/g) || []).join(','));
  check(`${locale}: graph has 4 nodes`, g.length === 4, String(g.length));

  const org = g.find((n) => n['@type'] === 'Organization') as Record<string, unknown> | undefined;
  check(`${locale}: Organization present`, Boolean(org));
  check(`${locale}: Organization url is locale-independent`, org?.url === BASE, String(org?.url));
  check(`${locale}: Organization logo is the 512 icon`, String(org?.logo).endsWith('/icon-512.png'), String(org?.logo));
  const alt = org?.alternateName as string[] | undefined;
  check(`${locale}: alternateName carries the Arabic name`, Array.isArray(alt) && alt.includes('بايرا سويت'));
  check(`${locale}: sameAs is an array`, Array.isArray(org?.sameAs));
  check(`${locale}: every sameAs is https`, (org?.sameAs as string[]).every((u) => u.startsWith('https://')));
  check(`${locale}: areaServed names the UAE`, JSON.stringify(org?.areaServed).includes('AE'));

  const site = g.find((n) => n['@type'] === 'WebSite') as Record<string, unknown> | undefined;
  check(`${locale}: WebSite node present`, Boolean(site));
  check(`${locale}: WebSite inLanguage lists both`, JSON.stringify(site?.inLanguage) === JSON.stringify(['ar', 'en']));

  const app = g.find((n) => n['@type'] === 'SoftwareApplication') as Record<string, unknown> | undefined;
  check(`${locale}: SoftwareApplication name is the bare product name`, app?.name === 'PyraSuite', String(app?.name));
  check(`${locale}: SoftwareApplication isAccessibleForFree`, app?.isAccessibleForFree === true);
  check(`${locale}: featureList has 9 studios`, Array.isArray(app?.featureList) && (app!.featureList as string[]).length === 9);
  check(`${locale}: offers still read from PLANS`, (app?.offers as unknown[]).length === Object.keys(PLANS).length);

  const faq = g.find((n) => n['@type'] === 'FAQPage') as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] } | undefined;
  check(`${locale}: FAQ present`, Boolean(faq));
  const free = faq?.mainEntity.map((q) => q.acceptedAnswer.text).find((t) => t.includes(String(PLANS.free.credits)));
  check(`${locale}: the free-credit answer states the real number ${PLANS.free.credits}`, Boolean(free));
  check(`${locale}: first FAQ asks what PyraSuite is`, /PyraSuite/.test(faq?.mainEntity[0]?.name ?? ''), faq?.mainEntity[0]?.name);
}

// The profiles file must exist even if empty — and must never carry a made-up URL.
check('SOCIAL_PROFILES is exported', Array.isArray(SOCIAL_PROFILES));

// FAQ answers must be in the server HTML: no conditional render on open state.
check('FaqSection renders answers unconditionally', !/\{isOpen\s*&&/.test(src('components/landing/FaqSection.tsx')));
check('FaqSection uses <details>', /<details/.test(src('components/landing/FaqSection.tsx')));

if (failures) { console.log(`\n[schema] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[schema] ${checks} checks passed`);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/tests/schema.test.ts`
Expected: FAIL — `lib/seo/profiles` not found.

- [ ] **Step 3: The profiles constant (true values only)**

Create `lib/seo/profiles.ts`:

```ts
/**
 * Owned public profiles, for Organization.sameAs.
 *
 * DELIBERATELY EMPTY until a real URL is added. The 2026-09-01 audit found no
 * profile URL anywhere in this repo — only share-intent links — and an entity
 * graph that points at a profile the company does not own is worse than one
 * that points nowhere: answer engines key on it. Add only URLs you control:
 *   'https://www.instagram.com/<handle>',
 *   'https://www.linkedin.com/company/<slug>',
 *   'https://x.com/<handle>',
 * Footer.tsx renders whatever is here, so one edit updates both the schema
 * and the visible links.
 */
export const SOCIAL_PROFILES: readonly string[] = [];

/** How people and engines write the name. Arabic first. */
export const ORGANIZATION_ALTERNATE_NAMES: readonly string[] = ['Pyra Suite', 'بايرا سويت', 'بايرا'];

/** ISO 3166-1 alpha-2, the Gulf. */
export const AREA_SERVED: readonly string[] = ['AE', 'SA', 'KW', 'QA', 'BH', 'OM'];
```

- [ ] **Step 4: Fix the schema builders**

In `lib/seo/schema.ts`:

Add imports: `import { AREA_SERVED, ORGANIZATION_ALTERNATE_NAMES, SOCIAL_PROFILES } from '@/lib/seo/profiles';`

Extend the interfaces (replace the existing `SchemaOrgOrganization` and `SchemaOrgSoftwareApplication` declarations, and add `SchemaOrgWebSite`):

```ts
interface SchemaOrgOrganization {
  '@type': 'Organization';
  '@id': string;
  name: string;
  alternateName: string[];
  url: string;
  logo: string;
  description: string;
  sameAs: string[];
  areaServed: string[];
  contactPoint: { '@type': 'ContactPoint'; contactType: 'customer support'; url: string; availableLanguage: string[] };
}

interface SchemaOrgWebSite {
  '@type': 'WebSite';
  '@id': string;
  url: string;
  name: string;
  inLanguage: string[];
  publisher: { '@id': string };
}

interface SchemaOrgSoftwareApplication {
  '@type': 'SoftwareApplication';
  '@id': string;
  name: string;
  alternateName: string[];
  description: string;
  applicationCategory: 'BusinessApplication';
  applicationSubCategory: 'MarketingApplication';
  operatingSystem: 'Web';
  url: string;
  inLanguage: string[];
  isAccessibleForFree: true;
  featureList: string[];
  publisher: { '@id': string };
  offers: SchemaOrgOffer[];
}
```

Replace `buildOrganizationSchema`:

```ts
export function buildOrganizationSchema(locale: string): SchemaOrgOrganization {
  const og = OG_CONTENT[toOgLocale(locale)];
  return {
    '@type': 'Organization',
    '@id': `${APP_URL}/#organization`,
    name: 'PyraSuite',
    alternateName: [...ORGANIZATION_ALTERNATE_NAMES],
    // ONE url under ONE @id. It was `/{locale}`, so the same entity claimed two
    // different homepages depending on which page an engine fetched.
    url: APP_URL,
    // A real square icon, not the 1200x630 OpenGraph image.
    logo: `${APP_URL}/icon-512.png`,
    description: og.description,
    sameAs: [...SOCIAL_PROFILES],
    areaServed: [...AREA_SERVED],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      url: `${APP_URL}/${locale}/contact`,
      availableLanguage: ['ar', 'en'],
    },
  };
}

export function buildWebSiteSchema(locale: string): SchemaOrgWebSite {
  return {
    '@type': 'WebSite',
    '@id': `${APP_URL}/#website`,
    url: `${APP_URL}/${locale}`,
    name: 'PyraSuite',
    inLanguage: ['ar', 'en'],
    publisher: { '@id': `${APP_URL}/#organization` },
  };
}
```

Replace `buildSoftwareApplicationSchema`'s return with:

```ts
  return {
    '@type': 'SoftwareApplication',
    '@id': `${APP_URL}/#software`,
    // The bare product name. The tagline lived here and became the entity's
    // name in every engine that read it.
    name: 'PyraSuite',
    alternateName: [...ORGANIZATION_ALTERNATE_NAMES],
    description: og.description,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'MarketingApplication',
    operatingSystem: 'Web',
    url: `${APP_URL}/${locale}`,
    inLanguage: ['ar', 'en'],
    isAccessibleForFree: true,
    featureList: STUDIO_FEATURES[isAr ? 'ar' : 'en'],
    publisher: { '@id': `${APP_URL}/#organization` },
    offers: Object.values(PLANS).map((plan) => ({
      '@type': 'Offer' as const,
      name: isAr ? plan.nameAr : plan.name,
      price: plan.price.toString(),
      priceCurrency: 'USD' as const,
      url: `${APP_URL}/${locale}/pricing`,
      category: 'SaaS subscription',
    })),
  };
```

and add, above the builders:

```ts
// The nine studios as the product names them: landing.studios.s1Name..s9Name,
// the same strings the landing page renders, so the schema cannot list a
// studio the page does not.
const STUDIO_FEATURES: Record<'ar' | 'en', string[]> = {
  ar: Array.from({ length: 9 }, (_, i) => (arMessages.landing.studios as Record<string, string>)[`s${i + 1}Name`]),
  en: Array.from({ length: 9 }, (_, i) => (enMessages.landing.studios as Record<string, string>)[`s${i + 1}Name`]),
};
```

Fix `buildFaqSchema` — replace the `text:` line:

```ts
        // The same params the FaqSection passes. Reading the raw message shipped
        // the literal "{credits}" to every engine that read the schema.
        text: faq[`a${n}`].replaceAll('{credits}', String(PLANS.free.credits)),
```

and add `buildWebSiteSchema(locale)` as the SECOND element of the `@graph` in `buildStructuredData` (update its return type to `[SchemaOrgOrganization, SchemaOrgWebSite, SchemaOrgSoftwareApplication, SchemaOrgFaqPage]`).

- [ ] **Step 5: FAQ answers in the HTML**

In `components/landing/FaqSection.tsx`, replace the per-item block (the `<div key={num} …>` … `</div>` from Step 1's listing) with a native disclosure that ships the answer in the server HTML:

```tsx
            return (
              <details
                key={num}
                className="group rounded-xl border border-[color-mix(in_srgb,var(--color-border)_50%,transparent)] overflow-hidden"
              >
                <summary className="list-none cursor-pointer w-full flex items-center justify-between p-5 text-start hover:bg-[color-mix(in_srgb,var(--color-surface-2)_50%,transparent)] transition-colors">
                  <span className="font-medium text-[var(--color-text-primary)]">{t(`faq.q${num}`)}</span>
                  <ChevronDown className="h-5 w-5 shrink-0 ms-4 text-[var(--color-text-muted)] transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-5 pb-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {/* `credits` is passed to EVERY answer; next-intl ignores a param an
                      answer does not reference. PLANS.free is the one source. */}
                  {t(`faq.a${num}`, { credits: PLANS.free.credits })}
                </div>
              </details>
            );
```

Remove the now-unused `openIndex`/`toggle` state, the `motion`/`AnimatePresence` imports if nothing else in the file uses them, and the `isOpen` variable.

- [ ] **Step 6: The first question asks what PyraSuite is**

In `messages/ar.json` change `landing.faq.q1` from `"إيش هي Pyra AI؟"` to `"ما هو PyraSuite (بايرا سويت)؟"` and set `a1` to:
`"PyraSuite منصة تسويق بالذكاء الاصطناعي للمطاعم والمتاجر والعيادات في الإمارات والخليج. تكتب فكرتك بالعربي، وبايرا — محرك المنصة — تطلّعها صور منتجات، وبوستات بكابشناتها، وخطة تسويق، وتحليل منافسين، وتعليق صوتي بلهجتك. 9 استوديوهات باشتراك واحد ونظام كريدت شفاف."`

In `messages/en.json` set `q1` to `"What is PyraSuite?"` and `a1` to:
`"PyraSuite is an AI marketing studio for restaurants, shops and clinics in the UAE and the Gulf. Type your idea in Arabic and Pyra — the platform's engine — turns it into product photos, posts with captions, a marketing plan, a competitor analysis and a voiceover in your dialect. Nine studios, one subscription, a transparent credit system."`

- [ ] **Step 7: Footer renders the profiles**

In `components/landing/Footer.tsx` import `SOCIAL_PROFILES` from `@/lib/seo/profiles` and, inside the footer's bottom row, render:

```tsx
{SOCIAL_PROFILES.length > 0 && (
  <ul className="flex items-center gap-4">
    {SOCIAL_PROFILES.map((url) => (
      <li key={url}>
        <a href={url} rel="me noopener" target="_blank" className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
          {new URL(url).hostname.replace(/^www\./, '')}
        </a>
      </li>
    ))}
  </ul>
)}
```

(The hostname is the label — no new i18n key needed and no Arabic literal.)

- [ ] **Step 8: Register + run + commit**

`package.json`: `"test:schema": "npx tsx scripts/tests/schema.test.ts"`, append to `prebuild`.

Run: `npx tsx scripts/tests/schema.test.ts` → `[schema] 41 checks passed`
Run: `npx tsc --noEmit && npm run lint && npx tsx scripts/check-invariants.ts && npm run test:prompts` → clean.

```bash
git add lib/seo components/landing/FaqSection.tsx components/landing/Footer.tsx messages scripts/tests/schema.test.ts package.json
git commit -m "fix(geo): FAQ answers in the HTML, no {credits} placeholder, an entity engines can find

buildFaqSchema read the untranslated message, so the answer stating the
free allowance shipped the literal {credits} — 11 times in the live /ar.
FaqSection rendered answers only when open, so a non-JS fetch saw none.
Organization gains alternateName, a locale-independent url, the 512 icon
as logo, areaServed and a contactPoint; a WebSite node is added;
SoftwareApplication is named PyraSuite (the tagline was its name).
sameAs is deliberately empty: no owned profile URL exists in this repo
and a made-up one is worse than none. Gate: test:schema.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Sitemap tells the truth about an open signup; the waitlist redirects

**Files:**
- Modify: `app/sitemap.ts`
- Modify: `next.config.ts` (add `redirects()`)
- Modify: `messages/ar.json`, `messages/en.json` (`referrals.gatedBody`)
- Create: `scripts/tests/sitemap.test.ts`
- Modify: `package.json`

**Why:** `/api/public/gate-status` returns `inviteOnly:false` — signup is open — yet the sitemap lists `/waitlist` at priority 0.9 ("the waitlist is the door now"), omits `/signup` and `/contact`, lists `/login` twice, and stamps `lastModified: new Date()` at every build (a fake freshness signal). `referrals.gatedBody` still says invite-only.

**Interfaces:**
- Produces: `next.config.ts` `redirects()` with a permanent `/:locale(ar|en)/waitlist → /:locale/signup`.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/sitemap.test.ts`:

```ts
/**
 * Proof the sitemap matches the product's real state: signup is OPEN.
 *
 *   npx tsx scripts/tests/sitemap.test.ts
 *
 * Measured 2026-09-01: gate-status returned inviteOnly:false while the sitemap
 * still sent organic visitors to /waitlist at priority 0.9, omitted /signup and
 * /contact, listed /login, and stamped every URL with build-time lastModified.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sitemap from '../../app/sitemap';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}
const ROOT = join(__dirname, '..', '..');
const urls = sitemap().map((e) => new URL(e.url).pathname);

check('no /login in the sitemap', !urls.some((u) => u.endsWith('/login')), urls.join(' '));
check('no /waitlist in the sitemap', !urls.some((u) => u.endsWith('/waitlist')));
for (const l of ['ar', 'en']) {
  check(`/${l}/signup listed`, urls.includes(`/${l}/signup`));
  check(`/${l}/contact listed`, urls.includes(`/${l}/contact`));
  check(`/${l}/pricing listed`, urls.includes(`/${l}/pricing`));
  check(`/${l} listed`, urls.includes(`/${l}`));
}
check('sitemap source does not stamp build time as lastModified', !/new Date\(\)/.test(readFileSync(join(ROOT, 'app/sitemap.ts'), 'utf8')));
const cfg = readFileSync(join(ROOT, 'next.config.ts'), 'utf8');
check('waitlist redirects permanently to signup', /waitlist[\s\S]{0,200}signup[\s\S]{0,120}permanent:\s*true/.test(cfg));
for (const f of ['ar', 'en']) {
  const m = JSON.parse(readFileSync(join(ROOT, `messages/${f}.json`), 'utf8'));
  const body: string = m.referrals?.gatedBody ?? '';
  check(`${f} referrals.gatedBody no longer claims invite-only`, !/بالدعوة فقط|invite-only|invite only/i.test(body), body);
}

if (failures) { console.log(`\n[sitemap] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[sitemap] ${checks} checks passed`);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/tests/sitemap.test.ts` → FAIL on `/login`, `/waitlist`, `new Date()`, redirect, gatedBody.

- [ ] **Step 3: Rewrite the sitemap**

Replace `app/sitemap.ts` with:

```ts
import type { MetadataRoute } from 'next';

/**
 * Only pages worth an organic landing. Auth forms are noindex (see
 * app/[locale]/(auth)/layout.tsx) and are not listed; /waitlist 301s to /signup
 * now that signup is open (next.config.ts redirects()).
 *
 * `lastModified` is a hand-kept date per page, NOT `new Date()`: stamping every
 * URL with the build time told crawlers the privacy policy changed on every
 * deploy — a freshness signal that was always a lie.
 */
const LOCALES = ['ar', 'en'] as const;

const PAGES: { path: string; updated: string; changeFrequency: 'weekly' | 'monthly' | 'yearly'; priority: number }[] = [
  { path: '', updated: '2026-09-02', changeFrequency: 'weekly', priority: 1 },
  { path: '/pricing', updated: '2026-08-29', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/signup', updated: '2026-09-01', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/contact', updated: '2026-08-23', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/privacy', updated: '2026-08-29', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', updated: '2026-08-29', changeFrequency: 'yearly', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';
  return LOCALES.flatMap((locale) =>
    PAGES.map((p) => ({
      url: `${baseUrl}/${locale}${p.path}`,
      lastModified: new Date(p.updated),
      changeFrequency: p.changeFrequency,
      // English is the secondary locale: one step below Arabic on every page.
      priority: locale === 'ar' ? p.priority : Math.max(0.1, p.priority - 0.1),
    })),
  );
}
```

- [ ] **Step 4: Redirect the waitlist**

In `next.config.ts`, inside the exported config object (next to `images:`), add:

```ts
  async redirects() {
    return [
      // Signup is OPEN (gate-status: inviteOnly:false). The waitlist page still
      // said "بنجهّز الإطلاق" and promised 100 credits while the FAQ promised 25
      // with "no invites, no waiting" — three indexed surfaces, three stories.
      { source: '/:locale(ar|en)/waitlist', destination: '/:locale/signup', permanent: true },
    ];
  },
```

- [ ] **Step 5: Fix the referrals copy**

`messages/ar.json` → `referrals.gatedBody`: `"برنامج الإحالة بيتجهّز. لما يفتح هتلاقي رابطك هنا مع {credits} كريدت عن كل صديق يسجّل."`
`messages/en.json` → `referrals.gatedBody`: `"The referral programme is being set up. When it opens, your link will be here with {credits} credits for every friend who signs up."`

- [ ] **Step 6: Register + run + commit**

`package.json`: `"test:sitemap": "npx tsx scripts/tests/sitemap.test.ts"`, append to `prebuild`.

Run: `npx tsx scripts/tests/sitemap.test.ts` → `[sitemap] 15 checks passed`
Run: `npx tsc --noEmit && npm run lint && npx tsx scripts/check-invariants.ts` → clean.

```bash
git add app/sitemap.ts next.config.ts messages scripts/tests/sitemap.test.ts package.json
git commit -m "fix(seo): the sitemap matches an open signup; /waitlist 301s to /signup

gate-status returns inviteOnly:false, yet the sitemap sent organic visitors
to /waitlist at 0.9, omitted /signup and /contact, listed /login, and
stamped every URL with the build time. Hand-kept lastModified per page,
a permanent redirect for the waitlist, and referrals copy that no longer
claims invite-only. Gate: test:sitemap.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: A sentence that says what PyraSuite is, the Arabic head term in the Arabic body, the cursor out of the H1, and an English page for an English searcher

**Files:**
- Modify: `components/landing/HeroSection.tsx:112-128`
- Modify: `messages/ar.json`, `messages/en.json` (`landing.hero.*`)
- Create: `scripts/tests/landing-copy.test.ts`
- Modify: `package.json`

**Why:** In 1,215 visible Arabic words, "الذكاء الاصطناعي" appears once (the `<title>`), "الإمارات" 0, and no sentence says what PyraSuite is; the H1 contains a typewriter cursor glyph `|`. `/en` has "UAE" 0, "clinic" 0, "PyraSuite is" 0.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/landing-copy.test.ts`:

```ts
/**
 * Proof the landing copy says what the product is, in the words people search.
 *
 *   npx tsx scripts/tests/landing-copy.test.ts
 *
 * Measured 2026-09-01 on the live /ar (1,215 visible words): "الذكاء الاصطناعي"
 * once (the <title>), "الإمارات" 0, "منصة تسويق" 0, no definition sentence; the
 * H1 carried the typewriter cursor "|" as text. /en: "UAE" 0, "clinic" 0.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}
const ROOT = join(__dirname, '..', '..');
const ar = JSON.parse(readFileSync(join(ROOT, 'messages/ar.json'), 'utf8')).landing.hero;
const en = JSON.parse(readFileSync(join(ROOT, 'messages/en.json'), 'utf8')).landing.hero;
const hero = readFileSync(join(ROOT, 'components/landing/HeroSection.tsx'), 'utf8');

check('ar definition exists', typeof ar.definition === 'string' && ar.definition.length > 60);
check('ar definition names the product', /PyraSuite/.test(ar.definition));
check('ar definition carries the head term', /الذكاء الاصطناعي/.test(ar.definition));
check('ar definition names the market', /الإمارات/.test(ar.definition) && /الخليج/.test(ar.definition));
check('ar definition names a customer type', /مطاعم|مطعم/.test(ar.definition));
check('en definition exists', typeof en.definition === 'string' && en.definition.length > 60);
check('en definition says "PyraSuite is"', /PyraSuite is/.test(en.definition));
check('en definition names the market', /UAE/.test(en.definition) && /Gulf/.test(en.definition));
check('en definition names customer types', /restaurant/.test(en.definition) && /clinic/.test(en.definition));
check('en H1 targets the English searcher', /AI marketing/i.test(en.titleLine1), en.titleLine1);
check('hero renders the definition', /hero\.definition/.test(hero));
check('no cursor glyph as H1 text', !/>\s*\|\s*<\/span>/.test(hero));
check('cursor is CSS content, not text', /after:content-\['\|'\]/.test(hero));

if (failures) { console.log(`\n[landing-copy] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[landing-copy] ${checks} checks passed`);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/tests/landing-copy.test.ts` → FAIL (no `definition`, cursor as text).

- [ ] **Step 3: The copy**

`messages/ar.json` → `landing.hero`: add
`"definition": "PyraSuite (بايرا سويت) منصة تسويق بالذكاء الاصطناعي للمطاعم والمتاجر والعيادات في الإمارات والخليج: تكتب فكرتك بالعربي، وبايرا تطلّعها صور منتجات وبوستات وخطة تسويق وتعليق صوتي — 9 استوديوهات باشتراك واحد."`

`messages/en.json` → `landing.hero`: add
`"definition": "PyraSuite is an AI marketing studio for restaurants, shops and clinics in the UAE and the Gulf: type your idea, and Pyra turns it into product photos, posts, a marketing plan and a voiceover — nine studios, one subscription, Arabic-native output."`
and change `"titleLine1": "Say it in Arabic..."` to `"titleLine1": "AI marketing for the Gulf —"` (the typewriter words that follow — "An image that sells", "A campaign that ignites"… — read naturally after it).

- [ ] **Step 4: The hero**

In `components/landing/HeroSection.tsx`:

1. Delete the line `<span className="text-primary-500 animate-pulse">|</span>` (line ~121).
2. On the `<span>` that wraps the `AnimatePresence` typewriter word (the element whose closing `</span>` sits just above the deleted line), append these classes: `after:content-['|'] after:text-primary-500 after:animate-pulse after:ms-1`.
3. Directly after `</motion.h1>` insert:

```tsx
            <p className="text-base sm:text-lg text-[var(--color-text-secondary)] max-w-2xl mb-6 mx-auto lg:mx-0 leading-relaxed">
              {t('hero.definition')}
            </p>
```

(Plain `<p>`, no motion: it must be in the server HTML unchanged.)

- [ ] **Step 5: Register + run + commit**

`package.json`: `"test:landing-copy": "npx tsx scripts/tests/landing-copy.test.ts"`, append to `prebuild`.

Run: `npx tsx scripts/tests/landing-copy.test.ts` → `[landing-copy] 13 checks passed`
Run: `npx tsc --noEmit && npm run lint && npx tsx scripts/check-invariants.ts` → clean (msg-parity: both locales gained `definition`).

```bash
git add components/landing/HeroSection.tsx messages scripts/tests/landing-copy.test.ts package.json
git commit -m "feat(seo): say what PyraSuite is, in the words people search

The Arabic landing had 'الذكاء الاصطناعي' once (the title), 'الإمارات' never,
and no sentence defining the product; the H1 carried the typewriter cursor
as text. One definition paragraph under the H1 in both locales, the cursor
as CSS content, and an English H1 that targets an English searcher.
Gate: test:landing-copy.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: llms.txt and security.txt

**Files:**
- Create: `public/llms.txt`, `public/.well-known/security.txt`
- Modify: `scripts/tests/robots.test.ts` (two more checks)

**Why:** `/llms.txt` and `/.well-known/security.txt` both 404. The middleware matcher `/((?!_next|.*\..*).*)` excludes dotted paths, so both serve without auth.

- [ ] **Step 1: Extend the robots test**

Append to `scripts/tests/robots.test.ts` (before the summary):

```ts
const llms = join(ROOT, 'public', 'llms.txt');
check('public/llms.txt exists', existsSync(llms));
if (existsSync(llms)) {
  const body = require('node:fs').readFileSync(llms, 'utf8');
  check('llms.txt names the product and its definition', /^# PyraSuite/m.test(body) && /AI marketing/.test(body));
  check('llms.txt has the Arabic definition too', /منصة تسويق بالذكاء الاصطناعي/.test(body));
  check('llms.txt links pricing', /\/pricing/.test(body));
  check('llms.txt names no model vendor', !/gemini|openai|flux|elevenlabs/i.test(body));
}
const sec = join(ROOT, 'public', '.well-known', 'security.txt');
check('security.txt exists', existsSync(sec));
if (existsSync(sec)) {
  const body = require('node:fs').readFileSync(sec, 'utf8');
  check('security.txt has Contact and Expires', /^Contact: /m.test(body) && /^Expires: /m.test(body));
}
```

Run it → FAIL (files missing).

- [ ] **Step 2: Write the files**

`public/llms.txt`:

```
# PyraSuite

> PyraSuite (بايرا سويت) is an AI marketing studio for restaurants, shops and clinics in the UAE and the Gulf. Type your idea in Arabic; Pyra — the platform's engine — turns it into product photos, posts with captions, a marketing plan, a competitor analysis and a voiceover in your dialect. Nine studios, one subscription, a transparent credit system.

> PyraSuite (بايرا سويت) منصة تسويق بالذكاء الاصطناعي للمطاعم والمتاجر والعيادات في الإمارات والخليج. تكتب فكرتك بالعربي، وبايرا — محرك المنصة — تطلّعها صور منتجات، وبوستات بكابشناتها، وخطة تسويق، وتحليل منافسين، وتعليق صوتي بلهجتك. 9 استوديوهات باشتراك واحد ونظام كريدت شفاف.

## What it does (the nine studios)

- Image Creator — ad-grade images from a sentence, correct Arabic text on the image, platform-sized canvases.
- Product Photography — one phone photo of your product, six angles in a chosen set (white studio, food, luxury…), marketplace-white presets for Amazon.ae and noon.
- Campaign Planner — nine posts with captions in your dialect (Saudi, Emirati, Egyptian, Gulf, formal), with images.
- Marketing Plan — a 30/60/90-day plan with objectives, channels, calendar and budget.
- Storyboard — nine scenes for a video ad.
- Competitor Analysis — SWOT, positioning and KPIs for your market.
- Voiceover — Arabic voiceover in Gulf and other dialects.
- Image Edit — retouch your own product photo: white background, remove props, add Arabic text.
- Prompt Builder — turns a rough idea into a precise brief.

## Pricing

- Free: 25 credits, no credit card. Starter $12/mo. Pro $29/mo. Business $59/mo. Agency $149/mo.
- Every action has a published credit cost: https://pyrasuite.pyramedia.cloud/ar/pricing

## Links

- Home (Arabic): https://pyrasuite.pyramedia.cloud/ar
- Home (English): https://pyrasuite.pyramedia.cloud/en
- Pricing: https://pyrasuite.pyramedia.cloud/ar/pricing
- Sign up: https://pyrasuite.pyramedia.cloud/ar/signup
- Contact: https://pyrasuite.pyramedia.cloud/ar/contact
- Privacy: https://pyrasuite.pyramedia.cloud/ar/privacy
- Terms: https://pyrasuite.pyramedia.cloud/ar/terms

## Facts

- Arabic-first: the interface, the output and the dialects are Arabic; English is fully supported.
- Market: United Arab Emirates, Saudi Arabia, Kuwait, Qatar, Bahrain, Oman.
- Built by Pyramedia, Dubai.
```

> Prices: copy the five figures from `lib/stripe/plans.ts` at the moment of writing; if any differ from the line above, use the file's values.

`public/.well-known/security.txt`:

```
Contact: mailto:support@pyramedia.info
Contact: https://pyrasuite.pyramedia.cloud/en/contact
Expires: 2027-09-01T00:00:00.000Z
Preferred-Languages: ar, en
Canonical: https://pyrasuite.pyramedia.cloud/.well-known/security.txt
```

- [ ] **Step 3: Run + commit**

Run: `npx tsx scripts/tests/robots.test.ts` → `[robots] 25 checks passed`

```bash
git add public/llms.txt public/.well-known/security.txt scripts/tests/robots.test.ts
git commit -m "feat(geo): llms.txt and security.txt

A plain-text summary answer engines can ingest, in both languages, naming
no model vendor; and a security contact. Both served unauthenticated
because the middleware matcher excludes dotted paths.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: API hygiene — upload throttle, asset DELETE ownership, gate-status cache

**Files:**
- Modify: `app/api/upload/route.ts:8-20`
- Modify: `app/api/assets/[id]/route.ts:66-73`
- Modify: `app/api/public/gate-status/route.ts`
- Create: `scripts/tests/api-hygiene.test.ts`
- Modify: `package.json`

**Why:** `/api/upload` reads the body before any throttle — a disk-fill vector on the box that also hosts Postgres, and signup is open. Asset DELETE parses the storage path by hand from a customer-writable column instead of `ownedStoragePath()` which already exists. `gate-status` is a service-role query on every landing visit with no cache header.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/api-hygiene.test.ts`:

```ts
/**
 * Source-level proofs for three small API rules the 2026-09-01 audit rated high.
 *
 *   npx tsx scripts/tests/api-hygiene.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../lib/strip-comments';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}
const ROOT = join(__dirname, '..', '..');
const src = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

// upload: throttled BEFORE the body is read
const up = src('app/api/upload/route.ts');
const throttleAt = up.search(/consumeAttempt\(\s*`upload:/);
const bodyAt = up.indexOf('request.formData()');
check('upload throttles with consumeAttempt', throttleAt !== -1);
check('upload throttle runs before the body is read', throttleAt !== -1 && bodyAt !== -1 && throttleAt < bodyAt, `throttle@${throttleAt} body@${bodyAt}`);
check('upload returns 429 rate_limited', /rate_limited[\s\S]{0,80}429/.test(up));

// assets DELETE: ownership via the shared resolver, never an ad-hoc parse
const del = src('app/api/assets/[id]/route.ts');
check('assets DELETE uses ownedStoragePath', /ownedStoragePath\(/.test(del));
check('assets DELETE no longer splits the public-object marker by hand', !/split\('\/storage\/v1\/object\/public\/'\)/.test(del));

// gate-status: cached briefly
const gate = src('app/api/public/gate-status/route.ts');
check('gate-status sets a short shared cache', /s-maxage=30/.test(gate));

if (failures) { console.log(`\n[api-hygiene] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[api-hygiene] ${checks} checks passed`);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx tsx scripts/tests/api-hygiene.test.ts` → FAIL on all three.

- [ ] **Step 3: Upload throttle**

In `app/api/upload/route.ts` add `import { consumeAttempt } from '@/lib/throttle';` and, immediately after the auth check returns the user and BEFORE `await request.formData()`:

```ts
    // Throttled BEFORE the body is read. This route accepted an unbounded
    // multipart body from any signed-in customer with no rate limit at all —
    // a disk-fill vector on the one box that also hosts Postgres — and signup
    // is open. Fails CLOSED, like every other throttle in this repo.
    if (!(await consumeAttempt(`upload:${user.id}`, 20, 60))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }
```

- [ ] **Step 4: Asset DELETE ownership**

In `app/api/assets/[id]/route.ts` add `import { ownedStoragePath } from '@/lib/storage/export-source';` and replace the cleanup block:

```ts
    // Clean up the storage object (best-effort). The path is resolved by the
    // SAME rule the export route uses — origin, public-object marker, the
    // caller's own user-id folder — never parsed by hand from `assets.url`,
    // which is a customer-writable column.
    if (asset?.url) {
      const path = ownedStoragePath(asset.url, user.id);
      if (path) {
        try {
          await supabase.storage.from('assets').remove([path]);
        } catch { /* Storage cleanup is best-effort */ }
      }
    }
```

(`ownedStoragePath` validates the `/storage/v1/object/public/assets/` marker and returns the object path inside the `assets` bucket — `export-source.ts:37-54` — so `.from('assets').remove([path])` is exact.)

- [ ] **Step 5: gate-status cache**

In `app/api/public/gate-status/route.ts`, on the SUCCESS response only:

```ts
    return NextResponse.json(
      { inviteOnly: … },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    );
```

(keep the existing body expression; the failure branch stays uncached so a recovered gate is seen at once).

- [ ] **Step 6: Register + run + commit**

`package.json`: `"test:api-hygiene": "npx tsx scripts/tests/api-hygiene.test.ts"`, append to `prebuild`.

Run: `npx tsx scripts/tests/api-hygiene.test.ts` → `[api-hygiene] 6 checks passed`
Run: `npx tsc --noEmit && npm run lint && npx tsx scripts/check-invariants.ts` → clean.

```bash
git add app/api/upload/route.ts "app/api/assets/[id]/route.ts" app/api/public/gate-status/route.ts scripts/tests/api-hygiene.test.ts package.json
git commit -m "fix(api): throttle uploads before the body, resolve asset paths by the shared rule, cache gate-status

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Config hygiene — dead CSP hosts, poweredByHeader, image cache, font preload

**Files:**
- Modify: `next.config.ts` (CSP lines ~85-88, `images`, top-level)
- Modify: `app/fonts.ts:58`
- Create: `scripts/tests/config-hygiene.test.ts`
- Modify: `package.json`

**Why:** The live CSP allows `https://vercel.live` (never used), `fonts.googleapis.com`/`fonts.gstatic.com` (fonts are self-hosted), and `placehold.co` (dev mocks only). `X-Powered-By: Next.js` ships. `/_next/image` responses are `max-age=60`. All nine font files preload on both locales; Inter is unused on `/ar`.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/config-hygiene.test.ts`:

```ts
/**
 * Proof the dead allowlist hosts are gone and the cheap headers are set.
 *
 *   npx tsx scripts/tests/config-hygiene.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../lib/strip-comments';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean): void { checks++; if (!ok) { failures++; console.log(`FAIL  ${label}`); } }
const ROOT = join(__dirname, '..', '..');
const cfg = stripComments(readFileSync(join(ROOT, 'next.config.ts'), 'utf8'));
const fonts = stripComments(readFileSync(join(ROOT, 'app/fonts.ts'), 'utf8'));

check('no vercel.live in CSP', !/vercel\.live/.test(cfg));
check('no fonts.googleapis in CSP', !/fonts\.googleapis\.com/.test(cfg));
check('no fonts.gstatic in CSP', !/fonts\.gstatic\.com/.test(cfg));
check('placehold.co only under isDev in img-src', !/img-src[^`]*placehold\.co/.test(cfg) || /isDev\s*\?[^:]*placehold\.co/.test(cfg));
check('poweredByHeader: false', /poweredByHeader:\s*false/.test(cfg));
check('images.minimumCacheTTL is a year', /minimumCacheTTL:\s*31536000/.test(cfg));
check('images.formats includes avif', /formats:\s*\[\s*'image\/avif'/.test(cfg));
check('Inter is not preloaded (unused on /ar)', /Inter\(\{[\s\S]*?preload:\s*false/.test(fonts));

if (failures) { console.log(`\n[config-hygiene] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[config-hygiene] ${checks} checks passed`);
```

- [ ] **Step 2: Run it to verify it fails** → FAIL on all.

- [ ] **Step 3: Edit `next.config.ts`**

- Remove ` https://vercel.live` from `script-src`.
- `style-src 'self' 'unsafe-inline'` (drop `https://fonts.googleapis.com`).
- `font-src 'self'` (drop `https://fonts.gstatic.com`).
- In `img-src`, replace ` https://placehold.co` with `${isDev ? ' https://placehold.co' : ''}` (template-literal interpolation like `script-src` already does for `unsafe-eval`). Leave `remotePatterns` unchanged — `next/image` still needs it for dev mocks.
- Top-level: add `poweredByHeader: false,`.
- `images`: add `minimumCacheTTL: 31536000,` and `formats: ['image/avif', 'image/webp'],`.

- [ ] **Step 4: `app/fonts.ts`** — in the `Inter({ … })` options add `preload: false,` with the comment `// Latin body face; unused on /ar, the default locale. Loaded on demand.`

- [ ] **Step 5: Register + run + commit**

`package.json`: `"test:config-hygiene": …`, append to `prebuild`.

Run: `npx tsx scripts/tests/config-hygiene.test.ts` → 8 passed. Run `npm run test:analytics` → still passes (the five Meta hosts are untouched). `npx tsc --noEmit && npm run lint` → clean.

```bash
git add next.config.ts app/fonts.ts scripts/tests/config-hygiene.test.ts package.json
git commit -m "chore(config): drop dead CSP hosts, hide X-Powered-By, cache optimised images a year, stop preloading Inter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Real 404s — protected routes derived from the `(dashboard)` directory

**Files:**
- Create: `lib/routing/protected.ts`
- Modify: `middleware.ts:323-327`
- Create: `scripts/tests/protected-prefixes.test.ts`
- Modify: `package.json`

**Why:** Every unknown dotless URL (`/about`, `/ar/blog/x`, `/ar/nonexistent`) 307s to `/{locale}/login` — a soft-404 on the whole site. The middleware treats "not public" as "protected".

**Interfaces:**
- Produces: `PROTECTED_PREFIXES: readonly string[]` and `isProtectedPath(pathWithoutLocale: string): boolean` from `lib/routing/protected.ts`.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/protected-prefixes.test.ts`:

```ts
/**
 * Proof that protected routes are DERIVED from the (dashboard) directory —
 * never a hand-kept list — and that an unknown path is not "protected".
 *
 *   npx tsx scripts/tests/protected-prefixes.test.ts
 *
 * Measured 2026-09-01: /about, /ar/blog/x, /ar/nonexistent-xyz all 307'd to
 * /ar/login. A crawler probing /faq got the login form: a soft-404 on every
 * URL the site does not have. This repo already records what a hand-kept
 * filename list does (app/layout.tsx, 2026-08-24): it lies the day after.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PROTECTED_PREFIXES, isProtectedPath } from '../../lib/routing/protected';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}
const ROOT = join(__dirname, '..', '..');
const dir = join(ROOT, 'app', '[locale]', '(dashboard)');
const fromDisk = readdirSync(dir)
  .filter((e) => statSync(join(dir, e)).isDirectory())
  .map((e) => `/${e}`)
  .sort();
check('the list equals the (dashboard) directory listing', JSON.stringify([...PROTECTED_PREFIXES].sort()) === JSON.stringify(fromDisk), `\n  code: ${[...PROTECTED_PREFIXES].sort().join(' ')}\n  disk: ${fromDisk.join(' ')}`);
check('a scan that finds nothing FAILS', fromDisk.length >= 10, String(fromDisk.length));

for (const p of ['/dashboard', '/creator', '/creator/anything', '/billing', '/onboarding']) check(`${p} is protected`, isProtectedPath(p));
for (const p of ['/', '/pricing', '/about', '/blog/x', '/nonexistent-xyz', '/creators']) check(`${p} is NOT protected`, !isProtectedPath(p));

if (failures) { console.log(`\n[protected-prefixes] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[protected-prefixes] ${checks} checks passed`);
```

- [ ] **Step 2: Run it to verify it fails** → module not found.

- [ ] **Step 3: The module**

Create `lib/routing/protected.ts`:

```ts
/**
 * Which paths need a session.
 *
 * Exactly the route directories under app/[locale]/(dashboard)/ — nothing
 * else. This is a hand-written list, and scripts/tests/protected-prefixes.test.ts
 * fails the build the moment it disagrees with the directory listing, in either
 * direction; a new studio that is not added here is a build failure, not a
 * public page. (Reading the filesystem from middleware is not possible on the
 * edge runtime, which is why the test does it instead.)
 *
 * Before this, "not public" meant "protected", so every unknown URL on the
 * site 307'd to login instead of 404ing.
 */
export const PROTECTED_PREFIXES: readonly string[] = [
  '/analysis',
  '/assets',
  '/billing',
  '/brand-kit',
  '/campaign',
  '/creator',
  '/dashboard',
  '/edit',
  '/onboarding',
  '/photoshoot',
  '/plan',
  '/projects',
  '/prompt-builder',
  '/referrals',
  '/settings',
  '/storyboard',
  '/voiceover',
];

/** `pathWithoutLocale` is the path after stripLocale(): '/creator/x', '/pricing', '/'. */
export function isProtectedPath(pathWithoutLocale: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(`${p}/`));
}
```

- [ ] **Step 4: The middleware**

In `middleware.ts` import `{ isProtectedPath } from '@/lib/routing/protected'` (check how the file imports `routing` — use the same alias style) and replace:

```ts
  // Redirect non-logged-in users to login (protected pages only)
  if (!user) {
    const locale = localeOf(pathname) ?? routing.defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }
```

with:

```ts
  // Redirect non-logged-in users to login — for PROTECTED pages only. "Not
  // public" used to mean "protected", so /about, /faq and every mistyped URL
  // 307'd to the login form: a soft-404 on the whole site. An unknown path now
  // falls through to app/[locale]/not-found.tsx.
  if (!user && isProtectedPath(stripLocale(pathname))) {
    const locale = localeOf(pathname) ?? routing.defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }
```

(`stripLocale` — `middleware.ts:40-44` — returns `'/'` for a bare locale root and a leading-slash path otherwise; `isProtectedPath('/')` is false, so the landing stays public.)

- [ ] **Step 5: Register + run + commit**

`package.json`: `"test:protected-prefixes": …`, append to `prebuild`.

Run the test → 13 passed. `npx tsc --noEmit && npm run lint && npx tsx scripts/check-invariants.ts` → clean.

Then a real production build and a local check that the change holds (the audit's soft-404 was measured on production; prove it on the built app):

```bash
npm run build
```
Start it in the Browser pane via `.claude/launch.json` `pyrasuite-prod` (port 3001) and request `/ar/nonexistent-xyz`, `/about`, `/ar/creator`, `/ar/pricing`: expect **404, 404, 307→login, 200**.

```bash
git add lib/routing/protected.ts middleware.ts scripts/tests/protected-prefixes.test.ts package.json
git commit -m "fix(routing): unknown URLs 404 instead of redirecting to login

'Not public' meant 'protected', so /about, /faq and every mistyped URL
307'd to the login form — a soft-404 on the whole site. Protected prefixes
now live in lib/routing/protected.ts, and a gate fails the build if that
list ever disagrees with the (dashboard) directory listing.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: CI on every push, and a runner that reports every failing gate at once

**Files:**
- Create: `scripts/tests/run-all.ts`
- Create: `.github/workflows/gates.yml`
- Modify: `package.json` (`"gates"` script)

**Why:** No `.github/workflows`; the 23-link `&&` prebuild chain runs only on a local build and stops at the first failure. 161 commits in 30 days.

- [ ] **Step 1: The runner**

Create `scripts/tests/run-all.ts`:

```ts
/**
 * Runs every prebuild gate and reports ALL failures, not the first.
 *
 *   npm run gates
 *
 * `prebuild` is a 23-link && chain by design (the build must stop). This runner
 * is for humans and CI: it reads that chain from package.json so the two can
 * never list different gates, runs each, and prints one summary.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
const chain = pkg.scripts.prebuild ?? '';
const names = chain.split('&&').map((s) => s.trim().replace(/^npm run /, '')).filter(Boolean);
if (names.length === 0) { console.error('run-all: prebuild chain is empty — nothing to run'); process.exit(1); }

const failed: string[] = [];
const started = Date.now();
for (const name of names) {
  const t = Date.now();
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', name], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32' });
  const ok = r.status === 0;
  const tail = (r.stdout + r.stderr).trim().split('\n').slice(-1)[0] ?? '';
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(28)} ${String(Date.now() - t).padStart(6)} ms  ${tail}`);
  if (!ok) failed.push(name);
}
console.log(`\n${names.length - failed.length}/${names.length} gates passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
if (failed.length) { console.log(`FAILED: ${failed.join(', ')}`); process.exit(1); }
```

`package.json`: add `"gates": "npx tsx scripts/tests/run-all.ts"`.

Run: `npm run gates` → every gate `ok`, summary `N/N gates passed`.

- [ ] **Step 2: The workflow**

Create `.github/workflows/gates.yml`:

```yaml
name: gates
on:
  push:
    branches: [main]
  pull_request:
jobs:
  gates:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm run lint
      - run: npm run gates
        env:
          # Public values only. The gates read files; none needs a secret.
          NEXT_PUBLIC_APP_URL: https://pyrasuite.pyramedia.cloud
          NEXT_PUBLIC_SUPABASE_URL: https://pixoradb.pyramedia.cloud
```

- [ ] **Step 3: Commit**

```bash
git add scripts/tests/run-all.ts .github/workflows/gates.yml package.json
git commit -m "ci: run every gate on every push, and report all failures at once

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

> If the first CI run fails on a gate that needs a local file (`.env.local`) or a build artifact, do not weaken the gate: skip that one gate in `run-all.ts` when `process.env.CI` is set, with a comment naming why, and record it in CLAUDE.md.

---

### Task 11: Repo hygiene and the record

**Files:**
- Modify: `scripts/invariants-baseline.json` (regenerate)
- Create: `scripts/tests/invariants-doc.test.ts`
- Modify: `docs/INVARIANTS.md`, `CLAUDE.md`, `package.json`

- [ ] **Step 1: Refresh the baseline** — `npx tsx scripts/check-invariants.ts --update-baseline`, then `npx tsx scripts/check-invariants.ts` → `0 stale baseline entries`, 18 passed.

- [ ] **Step 2: A gate that keeps `docs/INVARIANTS.md` complete**

Create `scripts/tests/invariants-doc.test.ts`:

```ts
/** Every rule in check-invariants.ts has a `## <id>` section in docs/INVARIANTS.md. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = join(__dirname, '..', '..');
const ids = [...readFileSync(join(ROOT, 'scripts/check-invariants.ts'), 'utf8').matchAll(/^\s*id:\s*'([a-z0-9-]+)'/gm)].map((m) => m[1]);
const doc = readFileSync(join(ROOT, 'docs/INVARIANTS.md'), 'utf8');
const missing = ids.filter((id) => !new RegExp(`^##+\\s+\`?${id}\`?`, 'm').test(doc));
if (ids.length < 10) { console.log('[invariants-doc] FAIL: found fewer than 10 rule ids — the scan matched nothing'); process.exit(1); }
if (missing.length) { console.log(`[invariants-doc] ${missing.length} rule(s) undocumented: ${missing.join(', ')}`); process.exit(1); }
console.log(`[invariants-doc] ${ids.length} rules documented`);
```

Register `"test:invariants-doc"`, append to `prebuild`. Run it; add a `## working-identity-before-reserve` section to `docs/INVARIANTS.md` (what it asserts, why, how it was proved — from the 2026-09-01 CLAUDE.md entry) for any id it reports missing.

- [ ] **Step 3: CLAUDE.md corrections** (the audit refuted these):
- Invite gate row in "Shippable today": change to `✅ built · **OFF on production** — gate-status returns inviteOnly:false; signup is open (measured 2026-09-01)`.
- "Launch readiness → Still open": the "no healthcheck" bullet → `/api/health exists and does a real dependency check; the CONTAINER healthcheck in Coolify is still not enabled — point it at /api/health, not /.`
- "Project-as-context → Still open": the "extraction SUCCESS arm has never run" bullet → note the first live end-to-end run recorded at `app/api/brand-kits/extract/route.ts:39-45` (2026-08-28).
- Add a short section `### SEO + GEO quick wins — 2026-09-02` listing the eleven tasks, the new gates (`test:robots`, `test:alternates`, `test:schema`, `test:sitemap`, `test:landing-copy`, `test:api-hygiene`, `test:config-hygiene`, `test:protected-prefixes`, `test:invariants-doc`, `npm run gates`), and the new prebuild count. Update the Commands section accordingly.

- [ ] **Step 4: Full gate run + commit**

Run: `npm run gates && npm run build` → all green, `test:built-document` 62/62.

```bash
git add scripts/invariants-baseline.json scripts/tests/invariants-doc.test.ts docs/INVARIANTS.md CLAUDE.md package.json
git commit -m "docs: record the SEO/GEO round, refresh the baseline, gate INVARIANTS.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: After the founder deploys — re-measure production (do NOT skip)

Run only after `git push origin main` and a manual Coolify deploy. Every line below was FAIL or Warning on 2026-09-01; each must flip.

```bash
S=https://pyrasuite.pyramedia.cloud
curl -s $S/robots.txt | grep -c Disallow            # expect 38 (19 × 2 groups)
curl -s $S/robots.txt | grep -c GPTBot              # expect 1
for p in /ar /ar/contact /ar/privacy /ar/terms /ar/pricing; do curl -s $S$p | grep -o '<link rel="canonical" href="[^"]*"'; done   # each page-exact (INCLUDING /ar — it shipped with none once)
curl -sI $S/ar | grep -ci '^link:'                  # expect 0 (no HTTP hreflang channel)
curl -s $S/ar | grep -c '{credits}'                 # expect 0
curl -s $S/ar | grep -c 'حسابك بياخد'               # expect ≥1 (FAQ answer in HTML)
curl -s -o /dev/null -w '%{http_code}\n' $S/ar/nonexistent-xyz   # expect 404
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' $S/ar/waitlist   # expect 308 → /ar/signup
curl -s $S/sitemap.xml | grep -c '<loc>'            # expect 12, none containing /login or /waitlist
curl -s -o /dev/null -w '%{http_code}\n' $S/llms.txt   # expect 200
curl -sI $S/ar | grep -i x-powered-by               # expect nothing
curl -s $S/ar | grep -o '"sameAs":\[[^]]*\]'        # present (may be empty until the founder adds profiles)
```

Record the results in CLAUDE.md's new section. Anything that does not flip is a defect in this plan, not in production.

---

## Founder actions — not code, not in any task above

| Action | Where | Why it matters |
|---|---|---|
| Rotate `ADMIN_PASSWORD` to a ≥24-char random value, then trigger the deploy | Coolify → app service → env | The founder-acknowledged weakest credential guards the credit-minting panel |
| Enable the container health check on `/api/health`, 30 s, 3 retries | Coolify → app service → health check | Hung containers are detected; status becomes `running:healthy`; note `/` returns 307 and must not be used |
| Fill `SOCIAL_PROFILES` in `lib/seo/profiles.ts` with the profiles you actually own | one commit | Until then `sameAs` is empty by design |
| Decide AED display on pricing ("≈ 44 د.إ / شهر") | product | `درهم` appears 0 times on the Arabic pricing page |
| Put a CDN with edge TLS in front (Cloudflare) | infra | TLS handshake 0.3–0.5 s from the Gulf to Kuala Lumpur on every connection |
| Product Hunt / G2 / LinkedIn company page with the same definition sentence | marketing | Zero third-party corroboration of the entity today |

## Out of scope (separate plans)

- Public `/studios/[slug]`, `/use-cases/[slug]`, `/compare/[slug]` content pages — the largest SEO lever, multi-day, needs real output images curated.
- Email verification at signup + lifecycle mail.
- A second image-edit adapter (`/v1/images/edits`).
- `withStudio()` — the studio-route preamble.
- Landing bundle diet (server components for the 13 landing sections).
