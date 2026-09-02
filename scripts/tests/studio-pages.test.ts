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

if (failures) { console.log(`\n[studio-pages] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[studio-pages] ${checks} checks passed`);
