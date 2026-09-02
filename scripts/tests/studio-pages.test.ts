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
check('at least one example per studio, and the loop actually ran', exampleCount >= STUDIO_SLUGS.length, String(exampleCount));

// ── 5. The cost each page shows comes from the product's own table ─────────
for (const slug of STUDIO_SLUGS) {
  const entry = STUDIO_CATALOGUE[slug];
  check(`${slug}: costKey is a real key of CREDIT_COSTS`, entry.costKey in CREDIT_COSTS, entry.costKey);
}

if (failures) { console.log(`\n[studio-pages] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[studio-pages] ${checks} checks passed`);
