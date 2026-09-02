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
// The guard span is bounded by `}` — the end of the ${...} interpolation — and
// NOT by `:`. A `[^:]*` span cannot reach any host it is meant to guard: every
// one of them is written `https://…`, and the scheme's own colon closes the
// span before `placehold.co` is ever seen. Measured against the real
// next.config.ts: `[^:]*` -> false, `[^}]*` -> true, for the same passing line.
check('placehold.co only under isDev in img-src', !/img-src[^`]*placehold\.co/.test(cfg) || /isDev\s*\?[^}]*placehold\.co/.test(cfg));
check('poweredByHeader: false', /poweredByHeader:\s*false/.test(cfg));
check('images.minimumCacheTTL is a year', /minimumCacheTTL:\s*31536000/.test(cfg));
check('images.formats includes avif', /formats:\s*\[\s*'image\/avif'/.test(cfg));
check('Inter is not preloaded (unused on /ar)', /Inter\(\{[\s\S]*?preload:\s*false/.test(fonts));

if (failures) { console.log(`\n[config-hygiene] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[config-hygiene] ${checks} checks passed`);
