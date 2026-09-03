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
function check(label: string, ok: boolean, detail = ''): void { checks++; if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `
        ${detail}` : ''}`); } }
const ROOT = join(__dirname, '..', '..');
const cfg = stripComments(readFileSync(join(ROOT, 'next.config.ts'), 'utf8'));
const fonts = stripComments(readFileSync(join(ROOT, 'app/fonts.ts'), 'utf8'));

check('no vercel.live in CSP', !/vercel\.live/.test(cfg));
check('no fonts.googleapis in CSP', !/fonts\.googleapis\.com/.test(cfg));
check('no fonts.gstatic in CSP', !/fonts\.gstatic\.com/.test(cfg));
// The guard span is bounded by `}` — the end of the ${...} interpolation — and
// NOT by `:`. A `[^:]*` span cannot reach any host it is meant to guard: every
// one of them is written `https://…`, and the scheme's own colon closes the
// span before `placehold.co` is ever seen. Measured against the real
// next.config.ts: `[^:]*` -> false, `[^}]*` -> true, for the same passing line.
check('placehold.co only under isDev in img-src', !/img-src[^`]*placehold\.co/.test(cfg) || /isDev\s*\?[^}]*placehold\.co/.test(cfg));
check('poweredByHeader: false', /poweredByHeader:\s*false/.test(cfg));
check('images.minimumCacheTTL is a year', /minimumCacheTTL:\s*31536000/.test(cfg));
check('images.formats includes avif', /formats:\s*\[\s*'image\/avif'/.test(cfg));
// ── FONT PRELOAD: STATED ON EVERY FAMILY, NOT ON ONE NAME ─────────────────
// This was `check('Inter is not preloaded', /Inter\(\{[\s\S]*?preload:\s*false/)`
// — one constructor, by name. The round that wrote it removed nine Inter
// preloads and left Cairo and Tajawal preloading 8 files / 121,264 bytes on
// every document on the origin, /en and /admin included, where more than half
// of it can never match a character. The gate written for exactly this class
// could not see two of the three families.
//
// So membership is DERIVED from the `next/font/google` import, and a family
// the expectation does not name FAILS rather than being skipped — the way the
// working-identity invariant takes its members from each route's own schema
// instead of a filename list. Adding a family, or widening a `subsets` array,
// now has to be a decision someone writes down here.
//
// `subsets` is the PRELOAD list, not the face list: next/font emits an
// @font-face for every subset Google publishes and preloads only these. Proof
// in the shipped bytes — Cairo declares ['arabic','latin'] and the production
// stylesheet carries a latin-ext Cairo face (5ec84f17416dda4d) that appears in
// no preload tag anywhere. app/fonts.ts states the reasoning per family.
const PRELOADED_SUBSETS: Record<string, readonly string[]> = {
  // /ar h1–h4 and the .font-cairo wordmark and every /en heading: display text.
  Cairo: ['arabic', 'latin'],
  // Applied by `[lang='ar']` alone, so the latin faces (30,084 B) can never
  // match a character on /en, and on /ar they carry digits, not the body copy.
  Tajawal: ['arabic'],
  // Latin body face; unused on /ar, the default locale. Loaded on demand.
  Inter: [],
};
const importLine = /import\s*\{([^}]+)\}\s*from\s*'next\/font\/google'/.exec(fonts);
check('app/fonts.ts imports from next/font/google', Boolean(importLine));
const families = (importLine?.[1] ?? '').split(',').map((f) => f.trim()).filter(Boolean);
check('the font-family scan matched something', families.length > 0, String(families.length));
check('every imported family has a stated preload expectation', JSON.stringify(families.slice().sort()) === JSON.stringify(Object.keys(PRELOADED_SUBSETS).sort()), families.join(' '));
for (const family of families) {
  // Sliced rather than matched: a RegExp built inside a template literal loses
  // every backslash the pattern needs, which is how the first version of this
  // block reported all three families unreadable while app/fonts.ts was fine.
  const open = fonts.indexOf(`${family}({`);
  const close = open < 0 ? -1 : fonts.indexOf('});', open);
  check(`${family}: its loader call is readable`, open >= 0 && close > open);
  if (open < 0 || close <= open) continue;
  const body = fonts.slice(open, close);
  const optedOut = /preload:\s*false/.test(body);
  const declared = [...(/subsets:\s*\[([^\]]*)\]/.exec(body)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  check(`${family}: declares subsets explicitly`, declared.length > 0, body.trim().slice(0, 60));
  const preloaded = optedOut ? [] : declared;
  const expected = PRELOADED_SUBSETS[family] ?? ['UNSTATED'];
  check(`${family}: preloads exactly the stated subsets`, JSON.stringify(preloaded.slice().sort()) === JSON.stringify(expected.slice().sort()), `preloads [${preloaded.join(' ')}], expected [${expected.join(' ')}]`);
}

if (failures) { console.log(`\n[config-hygiene] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[config-hygiene] ${checks} checks passed`);
