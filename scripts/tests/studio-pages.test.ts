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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../lib/strip-comments';
import sitemap from '../../app/sitemap';
import { STUDIO_CATALOGUE, STUDIO_SLUGS, getStudio, type StudioSlug } from '../../lib/studios/catalogue';
import { getExample } from '../../lib/studios/examples';
import { CREDIT_COSTS } from '../../lib/credits/costs';
import { campaignCostBands } from '../../lib/credits/campaign-cost';
import { studioCostLabel } from '../../lib/studios/cost-label';
import { getVoiceoverConfig } from '../../lib/credits/voiceover-costs';
import { ENVIRONMENT_PRESETS } from '../../lib/ai/prompts/photoshoot';
import { RETRIEVABLE_STUDIOS } from '../../lib/studios/text-output';
import {
  SAMPLE_EXTENT,
  TEXT_DELIVERABLE_SLUGS,
  sampleNoteKey,
  type TextDeliverableSlug,
} from '../../components/studios/public/DeliverableSample';
import { buildLlmsTxt } from '../../lib/seo/llms';

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

// The scan reads EVERY namespace under `studios`, not the nine slugs.
//
// Its first version looped `STUDIO_SLUGS` and therefore never opened
// `studios.shared` — the namespace that publishes the index page's H1, its
// subtitle, the cost labels and the CTA, i.e. copy on ten public pages rather
// than fragments. Measured, not reasoned about: setting
// `studios.shared.indexSubtitle` to a sentence carrying a hardcoded 99-credit
// price left this file reporting all checks passed. §6's seconds rule already
// walked `Object.entries(studios)`, so the two rules in one file disagreed
// about their own scope, and the weaker one guarded the price.
//
// Stated on what the file HAS rather than on a list of names, and then the
// coverage itself is asserted — a future edit that narrows the walk back to
// the nine fails HERE instead of going quiet.
for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
  const studioMsgs = (msgs as Record<string, Record<string, Record<string, string>>>).studios ?? {};
  const scanned: string[] = [];
  for (const [ns, entries] of Object.entries(studioMsgs)) {
    scanned.push(ns);
    const joined = Object.values(entries).filter((v) => typeof v === 'string').join(' ');
    check(`${locale}: studios.${ns} copy states no credit number`, !CREDIT_NUMBER.test(joined), (joined.match(CREDIT_NUMBER) ?? [''])[0]);
  }
  // Coverage is asserted on what the walk above ACTUALLY VISITED, never on the
  // keys of the file — a rule stated against the file would be satisfied by a
  // `studios.shared` that exists and is never opened, which is exactly the
  // defect. `shared` is named explicitly because it is the one namespace with
  // no slug to carry it in.
  for (const ns of [...STUDIO_SLUGS, 'shared']) {
    check(`${locale}: the credit scan opened studios.${ns}`, scanned.includes(ns), scanned.join(' '));
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

// ── 5b. A cost shape may not hide a cheaper path ───────────────────────────
// campaign shipped as `costShape: 'flat'`, so its badge read "12 credits" on
// four public pages — while app/api/studios/campaign/route.ts reserves
// `input.generateImages ? full : text` and the text band is 3. The same page's
// own FAQ told the visitor the images are optional and that they "pay for the
// text half alone", and never named that figure. Section 5 could not see it:
// `costKey` was a real key and the number it published was a real price.
//
// The rule is stated on the RENDERED badge, not on the shape name: for every
// studio, both ENDS of the price range its own code can charge must appear in
// the string the page shows. That is what makes reverting campaign to 'flat'
// fail here — the badge would carry 12 and not 3 — rather than a rule saying
// "campaign must not be flat", which the next two-band studio would walk past.
//
// The bands are read from the modules that charge, never typed: image
// resolutions from CREDIT_COSTS, the campaign split from the same
// campaignCostBands() the route reserves with, the voiceover rates from
// getVoiceoverConfig(). The ONE literal is photoshoot's floor, for the reason
// lib/studios/cost-label.ts already records: SHOT_COSTS lives inside
// app/api/studios/photoshoot/route.ts and a route module cannot export it.
const campaignBands = campaignCostBands();
check('the campaign price really is two DIFFERENT bands', campaignBands.text !== campaignBands.full && campaignBands.text > 0, `${campaignBands.text} / ${campaignBands.full}`);
check('the campaign split is the reservation arithmetic itself', campaignBands.text === Math.max(1, campaignBands.full - campaignBands.posts * campaignBands.perImage), String(campaignBands.text));

// The route must READ that module rather than keep a second copy of the split.
// Comment-stripped, this repo's rule: the route documents the decomposition in
// prose, so a raw scan would be satisfied by the comment alone.
const campaignRouteSrc = stripComments(readFileSync(join(ROOT, 'app/api/studios/campaign/route.ts'), 'utf8'));
check('the campaign route reserves from campaignCostBands()', campaignRouteSrc.includes('campaignCostBands()'), 'no campaignCostBands() in the comment-stripped route');
check('the campaign route keeps no second copy of the split', !/fullCost\s*-\s*EXPECTED_POSTS/.test(campaignRouteSrc));

// The five plan ids, declared here because BOTH this section and section 6's
// seconds rule read the voiceover table per plan. Two copies of this list is
// two answers to "which plans does the product have".
const PLAN_IDS = ['free', 'starter', 'pro', 'business', 'agency'] as const;

const PRICE_BANDS: Record<StudioSlug, readonly number[]> = {
  creator: Object.values(CREDIT_COSTS.image),
  photoshoot: [2, CREDIT_COSTS.photoshoot],
  edit: [CREDIT_COSTS.edit],
  campaign: [campaignBands.text, campaignBands.full],
  plan: [CREDIT_COSTS.plan],
  analysis: [CREDIT_COSTS.analysis],
  storyboard: [CREDIT_COSTS.storyboard],
  voiceover: PLAN_IDS.map((p) => getVoiceoverConfig(p).creditsPerUnit),
  'prompt-builder': [CREDIT_COSTS.prompt],
};

// Enough ICU to read the two COMPOSED band strings — `{name}` and
// `{name, plural, one {# credit} other {# credits}}` — down to the number they
// carry. It is a digit reader, not a renderer: the plural branch's words are
// discarded, because what is asserted is that the FIGURE reaches the badge. It
// proves itself on both message files' real forms first, so a form it cannot
// read fails HERE instead of quietly reading as a badge with no number in it —
// which is the exact shape of the defect this section exists for.
function fillIcu(msg: string, values: Record<string, number>): string {
  return msg.replace(/\{(\w+)(?:,\s*plural,(?:[^{}]|\{[^{}]*\})*)?\}/g, (whole, name: string) =>
    (name in values ? String(values[name]) : whole));
}
for (const [msg, want] of [
  ['{a} credits', '7 credits'],
  ['{a, plural, one {# credit} other {# credits}} · {b}', '7 · 9'],
  ['{a} كريدت · {b} كريدت', '7 كريدت · 9 كريدت'],
  ['{unknown} stays', '{unknown} stays'],
] as const) {
  const got = fillIcu(msg, { a: 7, b: 9 });
  check(`the ICU reader turns ${JSON.stringify(msg)} into ${JSON.stringify(want)}`, got === want, got);
}

// A figure "appears" only as a whole number: a bare `includes('3')` is
// satisfied by the 3 inside "13", which is exactly the false pass that would
// let a single-band badge certify itself.
function statesFigure(label: string, n: number): boolean {
  return new RegExp(`(?<![\\d٠-٩۰-۹])${n}(?![\\d٠-٩۰-۹])`).test(label);
}
check('the figure reader does NOT read 3 out of "13 credits"', !statesFigure('13 credits', 3));
check('the figure reader DOES read 3 out of "3 credits"', statesFigure('3 credits', 3));

for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
  const shared = (msgs as Record<string, Record<string, Record<string, string>>>).studios?.shared ?? {};
  const vFree = getVoiceoverConfig('free');
  const vPaid = getVoiceoverConfig('pro');
  const perDurationFilled = fillIcu(shared.perDuration ?? '', {
    freeCredits: vFree.creditsPerUnit, freeSeconds: vFree.unitSeconds,
    paidCredits: vPaid.creditsPerUnit, paidSeconds: vPaid.unitSeconds,
  });
  const perCampaignFilled = fillIcu(shared.perCampaign ?? '', {
    textCredits: campaignBands.text, fullCredits: campaignBands.full,
  });
  // Every placeholder was fed. A composed line still carrying `{` names a value
  // the CALLER does not pass — a badge rendering a literal `{fullCredits}`,
  // which is the class that shipped a literal `{credits}` eleven times on the
  // live Arabic landing page.
  check(`${locale}: studios.shared.perDuration has no unfed placeholder`, perDurationFilled.length > 0 && !perDurationFilled.includes('{'), perDurationFilled);
  check(`${locale}: studios.shared.perCampaign has no unfed placeholder`, perCampaignFilled.length > 0 && !perCampaignFilled.includes('{'), perCampaignFilled);

  const costLabels = {
    unit: shared.creditUnit ?? '',
    free: shared.freeLabel ?? '',
    perImage: shared.perImage ?? '',
    perShoot: shared.perShoot ?? '',
    perDuration: perDurationFilled,
    perCampaign: perCampaignFilled,
  };

  let bandChecks = 0;
  for (const slug of STUDIO_SLUGS) {
    const bands = PRICE_BANDS[slug];
    const label = studioCostLabel(slug, costLabels);
    const lo = Math.min(...bands);
    const hi = Math.max(...bands);
    check(`${locale}: ${slug} renders a non-empty cost badge`, label.trim().length > 0);
    // prompt-builder is the one studio whose price is 0, and "0 credits" is a
    // worse thing to publish than the word Free. Its shape is asserted instead,
    // so the exemption is a rule rather than a hole.
    if (STUDIO_CATALOGUE[slug].costShape === 'free') {
      check(`${locale}: ${slug} publishes the free label, and its price really is 0`, lo === 0 && hi === 0 && label === costLabels.free, `${lo}-${hi} "${label}"`);
      continue;
    }
    bandChecks++;
    check(`${locale}: ${slug}'s badge states its CHEAPEST price (${lo})`, statesFigure(label, lo), label);
    check(`${locale}: ${slug}'s badge states its DEAREST price (${hi})`, statesFigure(label, hi), label);
    check(`${locale}: ${slug} is not published as one flat number while it can charge ${lo} or ${hi}`, lo === hi || STUDIO_CATALOGUE[slug].costShape !== 'flat', STUDIO_CATALOGUE[slug].costShape);
  }
  check(`${locale}: the band scan visited every studio but the free one`, bandChecks === STUDIO_SLUGS.length - 1, String(bandChecks));
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

// The other direction. The index calls itself the hub of the nine, and the nine
// linked to two siblings each and to nothing above them — so `backToStudios`
// sat in both locales with zero readers while the graph stayed one-directional.
// Both arms, because either alone passes the state that shipped: a component
// that links up while no page passes it a label renders nothing, and a page
// that passes a label to a component with no link is the dead string again.
const relatedSrc = stripComments(readFileSync(join(ROOT, 'components/studios/public/StudioRelated.tsx'), 'utf8'));
check('the related section links UP to the index', relatedSrc.includes('href="/studios"'), 'no href="/studios" in the comment-stripped source');
const studioPageSrc = stripComments(readFileSync(join(ROOT, 'app/[locale]/(landing)/studios/[slug]/page.tsx'), 'utf8'));
check('the studio page reads studios.shared.backToStudios', studioPageSrc.includes("s('backToStudios')"), "no s('backToStudios') in the comment-stripped source");
for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
  const back = (msgs as Record<string, Record<string, Record<string, string>>>).studios?.shared?.backToStudios;
  check(`${locale}: studios.shared.backToStudios is a non-empty string`, typeof back === 'string' && back.trim().length > 0);
}

// ── 9. The index page carries its own copy, in both locales ────────────────
for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
  const shared = (msgs as Record<string, Record<string, Record<string, string>>>).studios?.shared ?? {};
  for (const k of ['indexTitle', 'indexSubtitle', 'indexMetaTitle', 'indexMetaDescription']) {
    const v = shared[k];
    check(`${locale}: studios.shared.${k} is a non-empty string`, typeof v === 'string' && v.trim().length > 0);
  }
}

// -- 10. /llms.txt names every studio page ---------------------------------
// The one file this site publishes for answer engines. The 2026-09-03 live
// audit measured its `## Links` block at seven URLs -- /ar, /en, /ar/pricing,
// /ar/signup, /ar/contact, /ar/privacy, /ar/terms -- and NOT ONE studio page,
// while sitemap.xml carried twenty. It described "the nine studios" in prose
// and gave a URL for none of them: twenty pages built for answer engines,
// invisible to the file that exists to point answer engines at content.
//
// It is generated from STUDIO_SLUGS now (lib/seo/llms.ts), so this gate is not
// what makes it correct -- it is what makes a REGRESSION loud. Drop one slug
// from the generated block and this fails; that is how it was proved.
const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';
const llms = buildLlmsTxt();
// URLs are matched EXACTLY, from a parsed set. `includes()` cannot be used here:
// `${APP}/ar/studios` is a prefix of `${APP}/ar/studios/creator`, so a substring
// test for the index would pass on a file listing only the nine children -- a
// check satisfied by the very state it exists to detect.
const llmsUrls = new Set(llms.match(/https?:\/\/[^\s)]+/g) ?? []);
check('a scan that finds nothing FAILS', llmsUrls.size >= 20, `${llmsUrls.size} urls in llms.txt`);
for (const slug of STUDIO_SLUGS) {
  for (const locale of ['ar', 'en'] as const) {
    const url = `${APP}/${locale}/studios/${slug}`;
    check(`llms.txt names ${locale}/studios/${slug}`, llmsUrls.has(url), url);
  }
}
for (const locale of ['ar', 'en'] as const) {
  check(`llms.txt names the ${locale} studios index`, llmsUrls.has(`${APP}/${locale}/studios`));
}
// The catalogue's other half of the rule: a page for a studio that does not
// ship is the worst possible organic landing, and llms.txt is read by machines
// that will follow what it lists.
check('llms.txt names no page for the unbuilt video studio', !llmsUrls.has(`${APP}/ar/studios/video`) && !llmsUrls.has(`${APP}/en/studios/video`));
check('llms.txt still carries the pricing page', llmsUrls.has(`${APP}/ar/pricing`));

// -- 11. The header links somewhere from EVERY page ------------------------
// Measured live 2026-09-03 on all 20 studio pages: `href="#studios"` present,
// `id="studios"` absent -- including in the flight payload, so nothing rendered
// the target client-side either. A bare fragment resolves inside the current
// document and does nothing; it does not fall back to the landing page. The nav
// item labelled "Studios" was inert ON THE STUDIOS PAGES. Same for #features,
// and the same on /pricing, /privacy and /terms, which predate this round.
const navSrc = stripComments(readFileSync(join(ROOT, 'components/landing/NavBar.tsx'), 'utf8'));
const navHrefs = [...navSrc.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
check('NAV_LINKS was found at all (a scan matching nothing FAILS)', navHrefs.length >= 3, navHrefs.join(' ') || 'none found');
for (const href of navHrefs) {
  check(`the header link ${href} is not a bare in-page fragment`, !href.startsWith('#'), href);
}
check('the header points at the studios index', navHrefs.includes('/studios'), navHrefs.join(' '));
// The only route home from the header. It was a <span>, so a visitor arriving
// from search on /ar/studios/creator had no way back to /ar without scrolling
// past the whole page to the footer -- while that page's own BreadcrumbList
// declared the locale root as position 1.
check('the wordmark is a link to the locale root', /<Link\s+href="\/"/.test(navSrc), 'no <Link href="/"> in the comment-stripped source');
// -- 10. Every public studio image declares its slot in PIXELS ---------------
// `sizes` is the ONLY input to which srcset candidate a browser downloads, and
// the fallback entry -- the one with no media condition -- is what every
// desktop viewport uses. Both components shipped with a bare `vw` there
// (`50vw` / `45vw`) while the slot stops growing at the 1024px container: at a
// 1920 viewport that asks for 960px and 864px for boxes measured in a real
// Chrome at 478 and 454, so a DPR-1 browser fetched the w=1080 candidate --
// 4.04x the pixels, 252,889 B against 139,133 B on /ar/studios/creator alone.
//
// The rule is stated on the FALLBACK entry, not on "contains a px anywhere":
// the broken value `(max-width: 640px) 100vw, 50vw` would satisfy the loose
// form the moment anyone put a `(max-width: 1024px) 480px` clause in front of
// it, and the entry that actually decides the download would be untouched.
// A scan that matches no `sizes` at all FAILS -- the rule
// mock-from-schema.test.ts:246 states -- so deleting the attribute cannot
// certify the component.
const PUBLIC_IMAGE_COMPONENTS = ['components/studios/public/StudioExamples.tsx', 'components/studios/public/BeforeAfter.tsx'];
let sizesSeen = 0;
for (const rel of PUBLIC_IMAGE_COMPONENTS) {
  const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
  const found = [...src.matchAll(/sizes="([^"]+)"/g)].map((m) => m[1]);
  check(`${rel} declares at least one sizes`, found.length > 0);
  for (const value of found) {
    sizesSeen++;
    const fallback = value.split(',').map((part) => part.trim()).at(-1) ?? '';
    check(`${rel}: the fallback sizes entry is a px slot, not a vw fraction`, /^[0-9]+px$/.test(fallback), `fallback was "${fallback}" in "${value}"`);
  }
}
check('the sizes scan matched something', sizesSeen >= 3, String(sizesSeen));

// ── 10. A sample block states its LANGUAGE, not just its direction ─────────
// Measured on production 2026-09-03: every cross-language sample set `dir` and
// none set `lang`, so /ar/studios/plan served an entirely English media plan
// inside <html lang="ar"> and /en/studios/voiceover served an Arabic script
// inside <html lang="en"> — WCAG 2.1 SC 3.1.2 (Language of Parts) on five live
// pages, and the block-level twin of the two-<html> defect this repo already
// paid for once. The components had the language in hand and dropped it.
//
// The rule is stated on the DIRECTORY, not on a list of filenames: a filename
// list is what app/layout.tsx once carried while claiming to be a rule.
const PUBLIC_COMPONENT_DIR = 'components/studios/public';
const publicComponents = readdirSync(join(ROOT, PUBLIC_COMPONENT_DIR)).filter((f) => f.endsWith('.tsx'));
check('the public studio components are still where this rule looks', publicComponents.length >= 8, publicComponents.join(' '));

let dirTagsSeen = 0;
for (const file of publicComponents) {
  const rel = `${PUBLIC_COMPONENT_DIR}/${file}`;
  const source = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
  // Opening tags only. A tag here never contains '>' inside an attribute, and
  // the comment stripper has already removed the prose that discusses `dir`.
  for (const tag of source.match(/<[a-zA-Z][^>]*>/g) ?? []) {
    if (!/\bdir=/.test(tag)) continue;
    dirTagsSeen++;
    check(`${rel}: a tag that sets dir also sets lang`, /\blang=/.test(tag), tag.replace(/\s+/g, ' ').slice(0, 120));
  }
}
// A scan that matched nothing would certify an empty tree — the rule
// mock-from-schema.test.ts:247 states. Four literal pairs ship today: the two
// provenance lines, the prompt-builder <code>, the prompt-builder brief, the
// Arabic tip span and the voiceover transcript.
check('the dir/lang scan actually matched tags', dirTagsSeen >= 4, String(dirTagsSeen));

// The sample's direction may not sit on a container that also holds the page's
// own chrome. Measured live at 1265px before this fix: /en/studios/storyboard
// numbered its scenes 1,2,3 running right-to-left and /en/studios/analysis
// mirrored the SWOT quadrants, because one `dir` on the section wrapper also
// governed the English headings, the column headers and the grid order.
const deliverableSrc = stripComments(readFileSync(join(ROOT, 'components/studios/public/DeliverableSample.tsx'), 'utf8'));
check('DeliverableSample sets no computed dir on a wrapper', !/\bdir=\{/.test(deliverableSrc), (deliverableSrc.match(/\bdir=\{[^}]*\}/g) ?? []).join(' '));
check('the sample section wrapper carries no direction at all', /<div className="mt-6">/.test(deliverableSrc));
// …and the pair the leaves receive is produced together, so neither half can be
// set without the other.
const sampleTextBody = deliverableSrc.match(/function sampleText\([^)]*\)[^{]*\{([\s\S]*?)\n\}/)?.[1] ?? '';
check('sampleText() is still there to be checked', sampleTextBody.includes('return'), sampleTextBody.slice(0, 80));
for (const line of sampleTextBody.split('\n')) {
  if (!/\bdir:/.test(line)) continue;
  check('sampleText returns dir and lang together', /\blang:/.test(line), line.trim());
}
// The leaves are where it lands. Below this count the fix has been undone by
// deletion rather than by moving the attribute back up.
const spreadCount = (deliverableSrc.match(/\{\.\.\.text\}/g) ?? []).length;
check('the sample language reaches the leaves', spreadCount >= 8, String(spreadCount));

// -- 12. A page may not publish ONE environment's shot list as the product's -
// /studios/photoshoot shipped white_studio's six recipe names -- front hero,
// three-quarter, overhead flat lay, macro detail, side profile, elevated -- in
// its definition AND its first FAQ answer, in both locales and inside the
// FAQPage JSON-LD, in the same sentence that sells seven environments. Six of
// the seven return completely different frames (lib/ai/prompts/photoshoot.ts:
// luxury :363-393, food :151-181, urban :310-340 ...), and photoshoot.ts:57-63
// records that the single global list was ABANDONED in v2.0 precisely because
// it contradicted the environments. The page republished it -- and all four of
// its example images come from luxury runs (scripts/live/studio-cases.ts:642,
// :737), so it showed one environment's frames under another's list.
//
// The rule is the one lib/studios/cost-label.ts states for prices: a fact the
// code owns is read from the code, never typed into a translation. There is no
// place a shot list can go in copy and stay true, so no shot name may appear in
// any of it.
const SHOT_NAMES = Object.values(ENVIRONMENT_PRESETS).flatMap((preset) => preset.shots.map((shot) => shot.name));
check('the preset scan found all seven environments', Object.keys(ENVIRONMENT_PRESETS).length === 7, String(Object.keys(ENVIRONMENT_PRESETS).length));
check('the preset scan found six shots per environment', SHOT_NAMES.length === 42, String(SHOT_NAMES.length));
check('every environment carries six shots of its own', Object.values(ENVIRONMENT_PRESETS).every((preset) => preset.shots.length === 6));

// The seven the route accepts and the seven that carry recipes are the same
// seven. A slug the route offers with no preset silently serves white_studio
// (photoshoot.ts's `|| ENVIRONMENT_PRESETS.white_studio`), which is the defect
// above arriving from the other direction.
const photoshootRouteSrc = stripComments(readFileSync(join(ROOT, 'app/api/studios/photoshoot/route.ts'), 'utf8'));
const routeEnvs = (photoshootRouteSrc.match(/environment:\s*z\.enum\(\[([^\]]+)\]\)/) ?? [])[1] ?? '';
const routeEnvList = [...routeEnvs.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
check('the route enum was actually read', routeEnvList.length === 7, routeEnvList.join(' ') || 'no z.enum found');
check('the route offers exactly the environments that have recipes', JSON.stringify([...routeEnvList].sort()) === JSON.stringify(Object.keys(ENVIRONMENT_PRESETS).sort()), routeEnvList.join(' '));

// The detector proves itself on the sentence that actually shipped, before it
// is trusted -- the rule sections 3 and 6 already state. Matching is
// case-insensitive because the page wrote the names in lower case while the
// presets capitalise them, which is exactly how a re-paste would return.
const SHIPPED_SHOT_LIST = 'each with its own camera, composition and styling: front hero, three-quarter, overhead flat lay, macro detail, side profile and elevated, in whichever of seven ready-made environments you pick';
check('the shot-name detector CATCHES the list that shipped', SHOT_NAMES.some((n) => SHIPPED_SHOT_LIST.toLowerCase().includes(n.toLowerCase())), 'the 2026-09-02 photoshoot definition was not caught');
check('the shot-name detector PASSES ordinary copy', !SHOT_NAMES.some((n) => 'one photo of your product, six frames, seven environments'.toLowerCase().includes(n.toLowerCase())));

for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
  const studios = (msgs as Record<string, Record<string, Record<string, string>>>).studios ?? {};
  const joined = Object.values(studios)
    .flatMap((entries) => Object.values(entries).filter((v) => typeof v === 'string'))
    .join(' ')
    .toLowerCase();
  check(`${locale}: the shot-name scan read some copy`, joined.length > 1000, String(joined.length));
  for (const name of SHOT_NAMES) {
    check(`${locale}: no translation carries the shot name "${name}"`, !joined.includes(name.toLowerCase()), name);
  }
}

// The English arm above is EXACT and, on Arabic, VACUOUS: `SHOT_NAMES` holds 42
// English identifiers, and an Arabic translation can never contain one -- so
// all 42 `ar: no translation carries the shot name "X"` checks are true for a
// reason that has nothing to do with Arabic copy. Measured: restoring the
// sentence that actually shipped on 2026-09-02 --
// «كل لقطة بكاميرا وتكوين وتنسيق مختلفين — أمامية، ثلاثة أرباع، من فوق، ماكرو على
// التفاصيل، جانبية، ومرفوعة» -- to `ar.studios.photoshoot.definition` left the
// whole file GREEN. That is the discipline this very file states at :79 applied
// to one locale and skipped for the locale the product is built for, and the
// third member of the family CLAUDE.md already logs (the Arabic-dead credit
// detector, the SEO round's unsatisfiable `[^:]*` host pattern).
//
// Arabic angle names cannot be derived from ENVIRONMENT_PRESETS -- the presets
// are English and nothing translates them -- so the vocabulary is written out
// here, and, exactly like sections 3 and 6, it PROVES ITSELF on a corpus before
// it is trusted. The rule is on the ENUMERATION rather than on any single term,
// because «من فوق» and «جانبية» are ordinary Arabic that honest copy may use;
// three or more of them in one string is a shot list, which is the thing that
// can never be true for more than one of the seven environments.
const AR_SHOT_TERMS = ['أمامية', 'ثلاثة أرباع', 'من فوق', 'ماكرو', 'جانبية', 'مرفوعة'];
const AR_ENUMERATION_MIN = 3;
const arShotTermsIn = (text: string): string[] => AR_SHOT_TERMS.filter((t) => text.includes(t));
const carriesArShotList = (text: string): boolean => arShotTermsIn(text).length >= AR_ENUMERATION_MIN;

// The sentence that shipped, byte-for-byte from the 2026-09-03 audit's live
// fetch. Every term is asserted to appear in it, so a typo in the list above
// fails HERE rather than quietly shrinking the vocabulary the scan looks for.
const SHIPPED_AR_SHOT_LIST = 'كل لقطة بكاميرا وتكوين وتنسيق مختلفين — أمامية، ثلاثة أرباع، من فوق، ماكرو على التفاصيل، جانبية، ومرفوعة';
for (const term of AR_SHOT_TERMS) {
  check(`the Arabic shot vocabulary term ${JSON.stringify(term)} is one that shipped`, SHIPPED_AR_SHOT_LIST.includes(term), term);
}
const AR_MUST_MATCH = [
  // (a) the live 2026-09-02 definition, and the FAQ answer that repeated it.
  SHIPPED_AR_SHOT_LIST,
  'كل لقطة من الست ليها كاميرا وتكوين وتنسيق مكتوبين — أمامية، ثلاثة أرباع، من فوق، ماكرو على التفاصيل، جانبية، ومرفوعة.',
  // A shortened re-paste is the same defect with fewer words, so the threshold
  // has to catch three terms, not only all six.
  'بتديك زوايا أمامية وجانبية ومن فوق',
];
const AR_MUST_NOT_MATCH = [
  // (b) the copy that replaced it -- read from the shipped file, not retyped,
  // so this arm tracks what is actually published.
  ((ar as Record<string, Record<string, Record<string, string>>>).studios?.photoshoot?.definition ?? ''),
  ((ar as Record<string, Record<string, Record<string, string>>>).studios?.photoshoot?.a1 ?? ''),
  // …and the shape the corrected copy is allowed to take: counts, not angles.
  'ست لقطات في سبع بيئات جاهزة، وكل بيئة ليها الست لقطات بتوعها هي.',
  'صورة واحدة لمنتجك وترجعلك ست لقطات، كل واحدة بزاوية وإضاءة مكتوبين للبيئة اللي اخترتها.',
];
for (const s of AR_MUST_MATCH) {
  check(`the Arabic shot-list detector CATCHES ${JSON.stringify(s.slice(0, 42))}`, carriesArShotList(s), `${arShotTermsIn(s).length} terms`);
}
for (const s of AR_MUST_NOT_MATCH) {
  check(`the Arabic shot-list detector PASSES ${JSON.stringify(s.slice(0, 42))}`, s.length > 0 && !carriesArShotList(s), `${arShotTermsIn(s).join(' ')}`);
}

// The scan itself runs per STRING, never on a joined blob: three unrelated keys
// each using one ordinary word would sum to an enumeration that nobody wrote.
{
  const studios = (ar as Record<string, Record<string, Record<string, string>>>).studios ?? {};
  let arStrings = 0;
  for (const [ns, entries] of Object.entries(studios)) {
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value !== 'string') continue;
      arStrings++;
      check(`ar: studios.${ns}.${key} carries no shot-angle enumeration`, !carriesArShotList(value), arShotTermsIn(value).join(' '));
    }
  }
  check('the Arabic shot-list scan actually read the copy', arStrings > 100, String(arStrings));
}

// The copy that replaced the list still says SEVEN environments, and that is
// the one thing about the list it may state. Bound to the preset count, so an
// eighth environment fails here instead of leaving both locales quietly wrong
// on a public page.
for (const [locale, msgs, word] of [['ar', ar, 'سبع'], ['en', en, 'seven']] as const) {
  const ps = (msgs as Record<string, Record<string, Record<string, string>>>).studios?.photoshoot ?? {};
  const text = Object.values(ps).filter((v) => typeof v === 'string').join(' ').toLowerCase();
  check(`${locale}: the photoshoot copy names the environment count, and the product has ${Object.keys(ENVIRONMENT_PRESETS).length}`, Object.keys(ENVIRONMENT_PRESETS).length === 7 && text.includes(word), word);
}

// -- 13. The voiceover rewrite claim is gated the way the product gates it --
// The definition and FAQ a1 stated the dialect rewrite unconditionally --
// "Pyra does not read your script back as typed" -- on the page whose own CTA
// sells the FREE plan, where lib/ai/tts-router.ts returns the submitted script
// untouched on its very first statement. The two facts the corrected copy
// leans on are asserted here, so the sentence and the router cannot drift:
//   (a) a dialect other than formal is only reachable on a plan that rewrites;
//   (b) formal has no dialect rewrite on ANY plan.
const ttsSrc = stripComments(readFileSync(join(ROOT, 'lib/ai/tts-router.ts'), 'utf8'));
check('the router still returns early when the plan cannot rewrite', /if\s*\(!config\.enhanceEnabled\)/.test(ttsSrc), 'no !config.enhanceEnabled guard in the comment-stripped router');
check('the router still carries no dialect prompt for formal', /formal:\s*''/.test(ttsSrc), "no empty formal: '' in DIALECT_PROMPTS");

let dialectPlans = 0;
for (const planId of PLAN_IDS) {
  const c = getVoiceoverConfig(planId);
  const offersDialect = c.dialectsAvailable.some((d) => d !== 'formal');
  if (offersDialect) dialectPlans++;
  // (a). If a plan can offer a real dialect it must be able to rewrite, or the
  // corrected sentence is false again on that plan.
  check(`voiceover: ${planId} offering a dialect implies it can rewrite`, !offersDialect || c.enhanceEnabled, `dialects=${c.dialectsAvailable.join(',')} enhance=${String(c.enhanceEnabled)}`);
}
check('some plan offers a dialect other than formal', dialectPlans >= 1, String(dialectPlans));
check('the free plan offers formal only, and cannot rewrite', getVoiceoverConfig('free').dialectsAvailable.join(',') === 'formal' && !getVoiceoverConfig('free').enhanceEnabled);
check('starter is the first plan that opens a dialect, as the copy says', getVoiceoverConfig('starter').dialectsAvailable.includes('saudi') && getVoiceoverConfig('starter').enhanceEnabled);

// The sentence itself. A rewrite claim must carry its condition IN THE SAME
// STRING: both of these are lifted whole into the JSON-LD (WebPage.description
// and FAQPage acceptedAnswer.text), so a qualification living in a neighbouring
// key does not travel with them.
const REWRITE_CONDITION = { ar: 'غير الفصحى', en: 'other than Formal Arabic' } as const;
for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
  const vo = (msgs as Record<string, Record<string, Record<string, string>>>).studios?.voiceover ?? {};
  let claims = 0;
  for (const key of ['definition', 'a1'] as const) {
    const value = vo[key] ?? '';
    // Arabic states the verb as bit3eed seyagha / e3adet seyagha; the stem is
    // the shared part, so one test covers both forms.
    const claimed = locale === 'ar' ? value.includes('صياغ') : value.toLowerCase().includes('rewrite');
    if (!claimed) continue;
    claims++;
    check(`${locale}: studios.voiceover.${key} states the rewrite WITH its condition`, value.includes(REWRITE_CONDITION[locale]), value.slice(0, 80));
  }
  check(`${locale}: the rewrite scan found the claim it guards`, claims > 0, 'neither definition nor a1 mentions the rewrite');
}

// -- 14. The note under a text sample matches what that page actually does --
// `studios.shared.sampleNote` makes two claims -- the page shows an excerpt,
// and the full version is in the account -- and both were false on
// /studios/prompt-builder alone: DeliverableSample renders its three prompts,
// styles and tips in full, and lib/studios/text-output.ts's RETRIEVABLE_STUDIOS
// excludes prompt-builder, so GET /api/generations never returns one. A shared
// string true for three pages and false for the fourth is not a copy nit; it is
// this repo's most-repeated defect class, published in the shipped bytes.
const SAMPLE_FILES: Record<TextDeliverableSlug, unknown> = {
  plan: JSON.parse(readFileSync(join(ROOT, 'public/examples/studios/deliverable-plan.json'), 'utf8')),
  analysis: JSON.parse(readFileSync(join(ROOT, 'public/examples/studios/deliverable-analysis.json'), 'utf8')),
  storyboard: JSON.parse(readFileSync(join(ROOT, 'public/examples/studios/deliverable-storyboard.json'), 'utf8')),
  'prompt-builder': JSON.parse(readFileSync(join(ROOT, 'public/examples/studios/deliverable-prompt-builder.json'), 'utf8')),
};
// What each renderer provably leaves out, measured against the shipped file --
// never taken from SAMPLE_EXTENT, which is the thing being checked. Each
// expression mirrors one renderer in DeliverableSample.tsx: PlanSample renders
// three of the file's five sections and two of four weeks, AnalysisSample two
// of five sections, StoryboardSample three of nine scenes, and
// PromptBuilderSample maps every entry with no slice at all.
const DROPS_SOMETHING: Record<TextDeliverableSlug, (file: never) => boolean> = {
  plan: ((f: { data: Record<string, unknown[]> }) => f.data.calendar.length > 2 || Object.keys(f.data).length > 3),
  analysis: ((f: { data: Record<string, unknown> }) => Object.keys(f.data).length > 2),
  storyboard: ((f: { data: unknown[] }) => f.data.length > 3),
  'prompt-builder': (() => false),
} as unknown as Record<TextDeliverableSlug, (file: never) => boolean>;

const sampleComponentSrc = stripComments(readFileSync(join(ROOT, 'components/studios/public/DeliverableSample.tsx'), 'utf8'));
const promptBuilderRenderer = sampleComponentSrc.slice(sampleComponentSrc.indexOf('function PromptBuilderSample'), sampleComponentSrc.indexOf('const SAMPLES'));
check('the prompt-builder renderer was located', promptBuilderRenderer.includes('PROMPT_BUILDER.data.map('), 'PromptBuilderSample not found in the comment-stripped source');
check('the prompt-builder renderer shortens nothing', promptBuilderRenderer.length > 0 && !promptBuilderRenderer.includes('.slice('), 'a .slice() appeared in PromptBuilderSample while SAMPLE_EXTENT says it renders in full');

// The file arm alone is not the protection SAMPLE_EXTENT's header claimed.
// DROPS_SOMETHING is a hand-written mirror of each renderer evaluated against
// the sample FILE, so it moves when the file moves and NEVER when the renderer
// moves: deleting `.slice(0, 3)` from `StoryboardSample` renders all nine
// scenes under a note that says «مختصر عشان الصفحة» / "Shortened for the page",
// with every gate green. So the RENDERER is read too, in both the forms it can
// shorten in -- the two forms the header names -- and the reader is proved on
// fabricated sources before it is trusted, the rule sections 3, 6 and 12 state.
//
// Both arms are kept because each catches what the other cannot: the file arm
// catches a sample file that shrinks until the renderer's slice drops nothing,
// the renderer arm catches a renderer that stops dropping.
/**
 * Does this renderer truncate a list? `PlanSample` (`calendar.slice(0, 2)` of
 * four weeks) and `StoryboardSample` (`.slice(0, 3)` of nine scenes) do.
 */
function rendererSlices(src: string): boolean {
  return /\.slice\(\s*0\s*,\s*\d+\s*\)/.test(src);
}
/**
 * Does this renderer never read some top-level section of the file at all?
 * That is the OTHER way to shorten, and the only one `AnalysisSample` uses —
 * a reader that understood only `.slice()` would certify analysis as `full`.
 * Not applicable to a renderer whose file `data` is an array.
 */
function rendererDropsSections(src: string, file: unknown): boolean {
  const data = (file as { data: unknown }).data;
  if (Array.isArray(data)) return false;
  const destructured = /const\s*\{([^}]*)\}\s*=\s*[A-Z_]+\.data;/.exec(src);
  const read = destructured ? destructured[1].split(',').map((s) => s.trim()) : [];
  return Object.keys(data as Record<string, unknown>).some((key) => !read.includes(key) && !src.includes(`.data.${key}`));
}
// Proved on fabricated sources before either is trusted, the rule sections 3, 6
// and 12 state — a reader that returns `true` for everything would certify the
// whole table and see nothing.
check('the renderer reader SEES a truncating renderer', rendererSlices('STORYBOARD.data.slice(0, 3).map('));
check('the renderer reader SEES an untruncated one', !rendererSlices('STORYBOARD.data.map('));
check('the renderer reader SEES a section-dropping renderer', rendererDropsSections('const { swot, kpis } = ANALYSIS.data;', SAMPLE_FILES.analysis));
check('the renderer reader SEES one that reads every section', !rendererDropsSections('const { swot, personas, competitors, roadmap, kpis } = ANALYSIS.data;', SAMPLE_FILES.analysis));
check('the renderer reader claims no sections of an array file', !rendererDropsSections('PROMPT_BUILDER.data.map(', SAMPLE_FILES['prompt-builder']));

// WHICH way each renderer shortens, pinned. `SAMPLE_EXTENT`'s header documents
// each of these by name, so a renderer that stops doing what the header says it
// does fails here rather than leaving the header describing a page that no
// longer exists — the defect class this whole file is a gate against.
const RENDERER_SHORTENING: Record<TextDeliverableSlug, { marker: string; slices: boolean; dropsSections: boolean }> = {
  plan: { marker: 'function PlanSample', slices: true, dropsSections: true },
  analysis: { marker: 'function AnalysisSample', slices: false, dropsSections: true },
  storyboard: { marker: 'function StoryboardSample', slices: true, dropsSections: false },
  'prompt-builder': { marker: 'function PromptBuilderSample', slices: false, dropsSections: false },
};
const RENDERER_ORDER: TextDeliverableSlug[] = ['plan', 'analysis', 'storyboard', 'prompt-builder'];
RENDERER_ORDER.forEach((slug, index) => {
  const { marker, slices, dropsSections } = RENDERER_SHORTENING[slug];
  const start = sampleComponentSrc.indexOf(marker);
  const endMarker = index + 1 < RENDERER_ORDER.length ? RENDERER_SHORTENING[RENDERER_ORDER[index + 1]].marker : 'const SAMPLES';
  const end = sampleComponentSrc.indexOf(endMarker, start + 1);
  const src = start >= 0 && end > start ? sampleComponentSrc.slice(start, end) : '';
  check(`${slug}: its renderer was actually located`, src.length > 100, `${marker} -> ${src.length} chars`);
  if (src.length === 0) return;
  check(`${slug}: the renderer truncates exactly where SAMPLE_EXTENT's header says`, rendererSlices(src) === slices, `slices=${String(rendererSlices(src))} expected=${String(slices)}`);
  check(`${slug}: the renderer drops sections exactly where SAMPLE_EXTENT's header says`, rendererDropsSections(src, SAMPLE_FILES[slug]) === dropsSections, `dropsSections=${String(rendererDropsSections(src, SAMPLE_FILES[slug]))} expected=${String(dropsSections)}`);
  // …and the two roll up to the value the page reads.
  check(`${slug}: SAMPLE_EXTENT agrees with what the RENDERER renders`, (SAMPLE_EXTENT[slug] === 'excerpt') === (slices || dropsSections), `${SAMPLE_EXTENT[slug]} vs shortens=${String(slices || dropsSections)}`);
});

let sampleNoteChecks = 0;
for (const slug of TEXT_DELIVERABLE_SLUGS) {
  sampleNoteChecks++;
  const extent = SAMPLE_EXTENT[slug];
  const drops = (DROPS_SOMETHING[slug] as unknown as (file: unknown) => boolean)(SAMPLE_FILES[slug]);
  check(`${slug}: SAMPLE_EXTENT agrees with the shipped sample file`, (extent === 'excerpt') === drops, `${extent} vs drops=${String(drops)}`);
  const retrievable = (RETRIEVABLE_STUDIOS as readonly string[]).includes(slug);
  // There is no honest note for a page showing an excerpt of something the
  // customer cannot reopen, so that combination FAILS here rather than picking
  // the less-wrong string.
  check(`${slug}: an excerpt is only shown for a studio the customer can reopen`, extent === 'full' || retrievable, `extent=${extent} retrievable=${String(retrievable)}`);
  const key = sampleNoteKey(slug);
  check(`${slug}: the note claiming an account copy is used only where one exists`, (key === 'sampleNote') === retrievable, key);
  check(`${slug}: the note claiming the whole output is used only where the page shows it`, (key === 'sampleNoteFull') === (extent === 'full'), key);
}
check('the sample-note scan covered every text studio', sampleNoteChecks === 4, String(sampleNoteChecks));
check('prompt-builder does NOT print the account-retrieval note', sampleNoteKey('prompt-builder') === 'sampleNoteFull');

// Both notes exist in both locales -- a page choosing a key with no message
// renders the key itself.
for (const [locale, msgs] of [['ar', ar], ['en', en]] as const) {
  const shared = (msgs as Record<string, Record<string, Record<string, string>>>).studios?.shared ?? {};
  for (const k of ['sampleNote', 'sampleNoteFull']) {
    check(`${locale}: studios.shared.${k} is a non-empty string`, typeof shared[k] === 'string' && shared[k].trim().length > 0);
  }
}
// And the page still ASKS. Reverting to one shared note is a one-word edit in
// the page, invisible to every check above.
check('the studio page picks its sample note per studio', studioPageSrc.includes('sampleNoteKey(studioSlug)'), 'no sampleNoteKey(studioSlug) in the comment-stripped page source');

// ── 11. The public surface does not speak two dialects ─────────────────────
// The 2026-09-03 live audit measured the `studios` namespace against `landing`
// and found the two using disjoint marker sets: ZERO of the Gulf markers
// `landing` uses, and ten Egyptian-only ones `landing` never uses. The sharpest
// instance was one click wide — the landing card for the prompt-builder read
// "مو عارف توصف؟" and the page it links to opened "مش عارف توصف؟". Commit
// 85b8606 closed it by hand and did NOT add this gate, on the reasoning that
// this file was a moving target that day; the exact marker it removed then
// passed all 33 gates untouched, which is the definition of a fix with nothing
// holding it.
//
// THE RULE, in two directions, because one alone is satisfiable by the defect:
//   (a) SUBSET — a dialect marker may appear in `studios` only if `landing`
//       already uses it. This fires the moment أيوه / بيضا / تاني / كام /
//       مفيش / حاجة comes back into a studio page.
//   (b) NOT DISJOINT, PER BUCKET — the Gulf markers `landing` uses may not all
//       be absent from `studios`, and neither may the Egyptian ones. (a) alone
//       is silent on the audit's actual headline: a `studios` written entirely
//       in the Egyptian half of `landing`'s vocabulary is a strict subset and
//       still reads as a different product.
//
// Arabic only. Dialect is not a property `messages/en.json` has, and asserting
// it there would be a check that cannot fail.
//
// THE VOCABULARY IS NOT "COLLOQUIAL WORDS" — it is words whose counterpart in
// the other dialect is a different word (أيوه/إي, إزاي/كيف, عايز/تبي,
// دلوقتي/الحين, كام/كم, حاجة/شي, تاني/ثاني, مفيش/مافيه). `عشان` is deliberately
// NOT in it: its Gulf form is `عشان`, so it marks nothing. Measured over
// messages/ar.json — 15 occurrences in 14 strings across nine namespaces: 7 in
// `studios`, 8 in auth, brandKit, studio, edit, billing, waitlist,
// paymentFailed and contact, and **0 in `landing`**. It is the app's own voice
// everywhere, not a register a studio page imported — and 85b8606's message
// listed it among the markers left alone "because `landing` uses them too",
// which is the one thing `landing` does not do with it. Counting it here would
// fail this rule on a namespace split that does not exist.
const DIALECT_PREFIXES = ['', 'و', 'ف', 'ب', 'ل', 'وب'] as const;
const DIALECT_SUFFIXES = ['', 'ه', 'ها', 'هم'] as const;
const GULF_MARKERS = ['ليش', 'إيش', 'ايش', 'تبي', 'تبين', 'أبي', 'مو', 'الحين', 'شلون'] as const;
const EGYPTIAN_MARKERS = ['أيوه', 'ايوه', 'إزاي', 'ازاي', 'دلوقتي', 'عايز', 'عايزة', 'حاجة', 'حاجات', 'كام', 'مفيش', 'بجد', 'تاني', 'بيضا', 'ده', 'دي', 'دول', 'لأ'] as const;

// Matched on WHOLE TOKENS, never as substrings, and that is the whole design.
// The audit's own count reported أبي×5 and وش×9 inside `أبيض` and `السوشال` —
// a substring detector on Arabic reports the product's marketplace copy as a
// dialect. Tokens are split on anything that is not a letter, then compared
// against the marker with the clitics Arabic actually attaches (و/ف/ب/ل and the
// object pronouns), which is what makes `تبيه` a hit and `بيضاء` not one.
function isDialectToken(token: string, marker: string): boolean {
  for (const prefix of DIALECT_PREFIXES) {
    for (const suffix of DIALECT_SUFFIXES) {
      if (token === prefix + marker + suffix) return true;
    }
  }
  return false;
}
function dialectMarkersIn(texts: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const text of texts) {
    for (const token of text.split(/[^\p{L}]+/u)) {
      if (!token) continue;
      for (const marker of [...GULF_MARKERS, ...EGYPTIAN_MARKERS]) {
        if (isDialectToken(token, marker)) found.add(marker);
      }
    }
  }
  return found;
}

// The detector proves itself before it is trusted — the rule this file already
// states for the credit detector, which shipped DEAD on Arabic for exactly the
// reason a plausible-looking regex can.
const DIALECT_MUST_MATCH: ReadonlyArray<readonly [string, string]> = [
  ['أيوه، وده أهم شي في القائمة', 'أيوه'],
  ['التوليد بكام؟', 'كام'],
  ['خلفية بيضا من غير إكسسوار', 'بيضا'],
  ['جرّب تاني بعد شوية', 'تاني'],
  ['اكتب اللي تبيه بالظبط', 'تبي'],
  ['ودي أهم حاجة', 'حاجة'],
  ['مفيش رسوم مخفية', 'مفيش'],
  ['مو عارف توصف؟', 'مو'],
];
const DIALECT_MUST_NOT_MATCH: ReadonlyArray<readonly [string, string]> = [
  ['خلفية بيضاء متصلة من غير خط أفق', 'بيضا'],
  ['بيئة استوديو أبيض', 'أبي'],
  ['شارك على السوشال', 'وش'],
  ['الموقع بتاعك', 'مو'],
  ['الفيديو كامل', 'كام'],
  ['بايرا موجودة', 'مو'],
];
for (const [text, marker] of DIALECT_MUST_MATCH) {
  check(`the dialect detector CATCHES ${JSON.stringify(marker)} in ${JSON.stringify(text)}`, dialectMarkersIn([text]).has(marker));
}
for (const [text, marker] of DIALECT_MUST_NOT_MATCH) {
  check(`the dialect detector PASSES ${JSON.stringify(text)} for ${JSON.stringify(marker)}`, !dialectMarkersIn([text]).has(marker));
}

function arabicStringsUnder(node: unknown, acc: string[] = []): string[] {
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) arabicStringsUnder(value, acc);
  }
  return acc;
}
const arNamespaces = ar as unknown as Record<string, unknown>;
const landingCopy = arabicStringsUnder(arNamespaces.landing);
const studiosNamespaces = (arNamespaces.studios ?? {}) as Record<string, unknown>;
const scannedDialectNs: string[] = [];
const studiosCopy: string[] = [];
for (const [ns, entries] of Object.entries(studiosNamespaces)) {
  scannedDialectNs.push(ns);
  arabicStringsUnder(entries, studiosCopy);
}
// A scan that matched nothing certifies nothing. Both sides are asserted to
// have found real copy AND real markers before either comparison is believed.
check('the dialect scan read the landing copy', landingCopy.length >= 50, `${landingCopy.length} strings`);
check('the dialect scan read the studios copy', studiosCopy.length >= 50, `${studiosCopy.length} strings`);
for (const ns of [...STUDIO_SLUGS, 'shared']) {
  check(`the dialect scan opened studios.${ns}`, scannedDialectNs.includes(ns), scannedDialectNs.join(' '));
}
const landingMarkers = dialectMarkersIn(landingCopy);
const studiosMarkers = dialectMarkersIn(studiosCopy);
check('the dialect detector found markers in the landing copy', landingMarkers.size > 0);
check('the dialect detector found markers in the studios copy', studiosMarkers.size > 0);

// (a) SUBSET.
for (const marker of studiosMarkers) {
  check(
    `the studio pages' ${marker} is a marker the landing page uses too`,
    landingMarkers.has(marker),
    `${marker} appears in studios and never in landing — landing uses [${[...landingMarkers].join(' ')}]`,
  );
}
// (b) NOT DISJOINT, per bucket.
for (const [bucket, vocabulary] of [['gulf', GULF_MARKERS], ['egyptian', EGYPTIAN_MARKERS]] as const) {
  const shared = [...studiosMarkers].filter((m) => (vocabulary as readonly string[]).includes(m) && landingMarkers.has(m));
  const inLanding = [...landingMarkers].filter((m) => (vocabulary as readonly string[]).includes(m));
  check(
    `the two namespaces are not disjoint in their ${bucket} markers`,
    inLanding.length === 0 || shared.length > 0,
    `landing uses [${inLanding.join(' ')}] and studios uses none of them`,
  );
}

if (failures) { console.log(`\n[studio-pages] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[studio-pages] ${checks} checks passed`);
