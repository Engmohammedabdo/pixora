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
import { stripComments } from '../lib/strip-comments';
import sitemap from '../../app/sitemap';
import { STUDIO_CATALOGUE, STUDIO_SLUGS, getStudio } from '../../lib/studios/catalogue';
import { getExample } from '../../lib/studios/examples';
import { CREDIT_COSTS } from '../../lib/credits/costs';
import { getVoiceoverConfig } from '../../lib/credits/voiceover-costs';

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
//
// The FIRST version of this detector was `/\d+\s*(كريدت|credits?)\b/i`, and it
// could never fire on Arabic — the locale this product is for. Two independent
// causes, both measured rather than reasoned about:
//   (a) JS `\b` is ASCII-only. After the non-ASCII `ت` it demands a FOLLOWING
//       ASCII word character, so a space, a full stop or end-of-string all kill
//       the match — i.e. every real sentence. `"تكلفة 5 كريدت."` -> false.
//   (b) `\d` never matches Arabic-Indic digits, so `"٣ كريدت"` -> false.
// It is therefore unit-anchored (a negative lookahead for any letter or digit)
// rather than `\b`-anchored, and its digit class carries both Arabic-Indic
// ranges. `كريدت` is the spelling messages/ar.json actually uses — 18 bare
// occurrences plus `6 كريدت/شهر` — and it was the one that failed.
const CREDIT_NUMBER = /[\d٠-٩۰-۹]+\s*(?:الكريدت|كريديت|كريدت|credits?)(?![\p{L}\p{N}])/iu;

// The detector proves itself before it is trusted. A gate that passes on broken
// copy is worse than no gate, and this one shipped dead on the half of the
// product that matters — so a future edit that re-kills the Arabic arm fails
// HERE instead of going quiet.
const MUST_MATCH = [
  'حملة كاملة 9 بوستات = 12 كريدت من رصيدك.',
  'تكلفة 5 كريدت.',
  '٣ كريدت',
  '12 credits',
  '12 credit',
  '5 كريديت',
];
const MUST_NOT_MATCH = [
  'بكريدت واحد',
  'رصيد الكريدت',
  'a full campaign in one run',
  '9 بوستات جاهزة',
];
for (const s of MUST_MATCH) {
  check(`the credit detector CATCHES ${JSON.stringify(s)}`, CREDIT_NUMBER.test(s));
}
for (const s of MUST_NOT_MATCH) {
  check(`the credit detector PASSES ${JSON.stringify(s)}`, !CREDIT_NUMBER.test(s));
}

for (const slug of STUDIO_SLUGS) {
  for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
    const ns = (msgs as Record<string, Record<string, Record<string, string>>>).studios?.[slug];
    if (!ns) continue;
    const joined = Object.values(ns).join(' ');
    check(`${locale}: studios.${slug} copy states no credit number`, !CREDIT_NUMBER.test(joined), (joined.match(CREDIT_NUMBER) ?? [''])[0]);
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
// `examples.length` would make the assertion a tautology — every list would
// satisfy a rule built from itself.
//
// The check this replaces was labelled "at least one example per studio" and
// asserted a SUM: `exampleCount >= STUDIO_SLUGS.length`, i.e. 12 >= 9. Four
// studios carry all twelve examples and five carry none, so the sum had four
// units of slack. Measured: emptying `edit`'s examples removed six checks and
// left the failure count identical — and `edit` is the studio whose entire page
// IS its two images. A gate whose label promises "per studio" while its
// arithmetic asks "in total" is worse than no gate, because it is read as cover.
const IMAGE_STUDIOS: readonly string[] = ['creator', 'photoshoot', 'edit', 'campaign'];
for (const slug of STUDIO_SLUGS) {
  const n = STUDIO_CATALOGUE[slug].examples.length;
  const wantsImages = IMAGE_STUDIOS.includes(slug);
  check(
    `${slug}: ${wantsImages ? 'has at least one example image' : 'has no example ids — its sample is rendered by the page'}`,
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

// ── 6. No DURATION figure in the copy contradicts the voiceover table ──────
// The credit detector above guards prices and is blind to this: the voiceover
// badge shipped as "1+ credits · per 15 seconds" with the 15 typed into
// `studios.shared.perDuration`, and 15 is a SECONDS figure. It is the free and
// starter unit; pro, business and agency bill 3 credits per 20 seconds
// (lib/credits/voiceover-costs.ts), so the badge published one band's unit as
// if it were everyone's and the FAQ answer under it pointed at that line.
//
// Two rules, because either alone would have passed the defect:
//   (a) any seconds figure anywhere in `studios.*` must be a figure the plan
//       table actually publishes — a unit or a duration cap;
//   (b) the voiceover badge itself must state NO figure at all. 15 satisfies
//       (a) — it is a real unit — and was still wrong, because the failure was
//       publishing ONE band as universal. Only (b) catches that.
const PLAN_IDS = ['free', 'starter', 'pro', 'business', 'agency'] as const;
const PUBLISHABLE_SECONDS = new Set<number>();
for (const p of PLAN_IDS) {
  const c = getVoiceoverConfig(p);
  PUBLISHABLE_SECONDS.add(c.unitSeconds);
  PUBLISHABLE_SECONDS.add(c.maxDurationSeconds);
}
check('the voiceover table publishes more than one unit', new Set(PLAN_IDS.map((p) => getVoiceoverConfig(p).unitSeconds)).size > 1, [...PUBLISHABLE_SECONDS].join(' '));

// Arabic-Indic digits included for the same reason the credit detector carries
// them: `\d` matches neither range, and this product's copy is Arabic first.
const ARABIC_DIGITS = /[٠-٩۰-۹]/;
const ANY_DIGIT = /[\d٠-٩۰-۹]/;
const SECONDS_FIGURE = /([\d٠-٩۰-۹]+)\s*(?:ثانية|ثواني|seconds?)(?![\p{L}\p{N}])/giu;
function digitsToNumber(raw: string): number {
  return Number([...raw].map((ch) => (ARABIC_DIGITS.test(ch) ? String((ch.codePointAt(0) as number) & 0xf) : ch)).join(''));
}
// The detector proves itself before it is trusted — the rule section 3 states,
// and the reason its own first version was dead on Arabic.
for (const [s, want] of [['لكل 15 ثانية', 15], ['per 15 seconds', 15], ['٢٠ ثانية', 20], ['up to 600 seconds', 600], ['20 ثواني', 20]] as const) {
  const m = [...s.matchAll(SECONDS_FIGURE)];
  check(`the seconds detector reads ${JSON.stringify(s)} as ${want}`, m.length === 1 && digitsToNumber(m[0][1]) === want, m.map((x) => x[1]).join(','));
}
for (const s of ['نص دقيقة على المجانية', 'ثانية واحدة', 'ten minutes', 'secondary market']) {
  check(`the seconds detector PASSES ${JSON.stringify(s)}`, [...s.matchAll(SECONDS_FIGURE)].length === 0);
}

for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
  const studios = (msgs as Record<string, unknown>).studios as Record<string, Record<string, string>>;
  for (const [ns, entries] of Object.entries(studios)) {
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value !== 'string') continue;
      for (const m of value.matchAll(SECONDS_FIGURE)) {
        const n = digitsToNumber(m[1]);
        check(`${locale}: studios.${ns}.${key} states ${n} seconds, which the plan table publishes`, PUBLISHABLE_SECONDS.has(n), m[0]);
      }
    }
  }
  // (b). The badge's numbers arrive as ICU values from getVoiceoverConfig(), so
  // the string carries no digit of its own and names both bands.
  const perDuration = studios.shared?.perDuration ?? '';
  check(`${locale}: studios.shared.perDuration states no duration of its own`, perDuration.length > 0 && !ANY_DIGIT.test(perDuration), perDuration);
  for (const token of ['{freeCredits', '{freeSeconds', '{paidCredits', '{paidSeconds']) {
    check(`${locale}: studios.shared.perDuration carries ${token}}`, perDuration.includes(token), perDuration);
  }
}

// ── 7. Every page this branch builds is in the sitemap ─────────────────────
// A page Google cannot find is a page that does not exist for the purpose it
// was built for. The nine URLs and the index are generated from STUDIO_SLUGS in
// app/sitemap.ts — imported there, never listed a second time — so this asserts
// the generation actually happened rather than that someone typed nine lines.
const sitemapPaths = sitemap().map((e) => new URL(e.url).pathname);
for (const locale of ['ar', 'en'] as const) {
  check(`/${locale}/studios (the index) is in the sitemap`, sitemapPaths.includes(`/${locale}/studios`), sitemapPaths.join(' '));
  for (const slug of STUDIO_SLUGS) {
    check(`/${locale}/studios/${slug} is in the sitemap`, sitemapPaths.includes(`/${locale}/studios/${slug}`));
  }
}
// `video` is not built, so no surface may advertise it — the catalogue already
// omits it, and this is the second half of that rule at the surface a crawler
// reads first.
check('no /studios/video in the sitemap', !sitemapPaths.some((p) => p.endsWith('/studios/video')));
check('the sitemap lists each URL once', new Set(sitemapPaths).size === sitemapPaths.length, String(sitemapPaths.length));

// ── 8. The landing showcase links to the pages, and its nine are these nine ─
// Before this branch nothing on the site linked to a studio at all. The
// showcase is the only path in (there is no NavBar entry — a navigation
// decision, deliberately out of scope), so if these links go, the pages are
// orphans reachable only from the sitemap.
//
// Comment-stripped, per this repo's own rule: the file documents its own slug
// mapping in prose, and a raw scan would be satisfied by the comment alone —
// exactly the failure app/layout.tsx's false comment caused for months.
const showcase = stripComments(readFileSync(join(ROOT, 'components/landing/StudiosShowcase.tsx'), 'utf8'));
check('the showcase links each card to its own page', showcase.includes('href={`/studios/'), 'no href={`/studios/ in the comment-stripped source');

// Two independent arms, because either alone passes a real drift:
//   (a) the ENTRY count, marked by `nameKey:` — a tenth entry added with no
//       slug would leave the slug set unchanged and untouched by (b);
//   (b) the slug SET, exact — a renamed or duplicated slug leaves the count at
//       nine and is invisible to (a).
const showcaseEntries = [...showcase.matchAll(/nameKey:/g)].length;
check('the showcase holds exactly as many cards as the catalogue has studios', showcaseEntries === STUDIO_SLUGS.length, `${showcaseEntries} cards vs ${STUDIO_SLUGS.length} studios`);
const showcaseSlugs = [...showcase.matchAll(/slug:\s*'([a-z-]+)'/g)].map((m) => m[1]);
check('the showcase slugs are exactly the catalogue slugs', JSON.stringify([...showcaseSlugs].sort()) === JSON.stringify([...STUDIO_SLUGS].sort()), showcaseSlugs.join(' ') || 'none found');

// ── 9. The index page carries its own copy, in both locales ────────────────
for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
  const shared = (msgs as Record<string, Record<string, Record<string, string>>>).studios?.shared ?? {};
  for (const k of ['indexTitle', 'indexSubtitle', 'indexMetaTitle', 'indexMetaDescription']) {
    const v = shared[k];
    check(`${locale}: studios.shared.${k} is a non-empty string`, typeof v === 'string' && v.trim().length > 0);
  }
}

if (failures) { console.log(`\n[studio-pages] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[studio-pages] ${checks} checks passed`);
