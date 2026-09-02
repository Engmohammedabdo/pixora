/**
 * Proof the sitemap matches the product's real state: signup is OPEN.
 *
 *   npx tsx scripts/tests/sitemap.test.ts
 *
 * Measured 2026-09-01: gate-status returned inviteOnly:false while the sitemap
 * still sent organic visitors to /waitlist at priority 0.9, omitted /signup and
 * /contact, listed /login, and stamped every URL with build-time lastModified.
 *
 * On /signup, this test asserts the OPPOSITE of what the plan asked for, and the
 * reason is measured rather than argued: a92eac0 put
 * `robots: { index: false }` on app/[locale]/(auth)/layout.tsx, which covers
 * /signup, and scripts/tests/alternates.test.ts:79 gates that. A sitemap entry
 * for a noindex URL is not a neutral extra line — Search Console reports it as
 * "Submitted URL marked 'noindex'" and the crawl is spent on a page that can
 * never rank. So the two are checked TOGETHER here: whichever way a future
 * change moves signup, both halves have to move at once.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../lib/strip-comments';
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

// The other half of the signup rule: the sitemap may only omit it while the auth
// layout is the thing making it unindexable.
const authLayout = readFileSync(join(ROOT, 'app/[locale]/(auth)/layout.tsx'), 'utf8');
check('/signup is declared noindex by the auth layout', /index:\s*false/.test(authLayout));

for (const l of ['ar', 'en']) {
  check(`/${l}/signup NOT listed — it is noindex`, !urls.includes(`/${l}/signup`), urls.join(' '));
  check(`/${l}/contact listed`, urls.includes(`/${l}/contact`));
  check(`/${l}/pricing listed`, urls.includes(`/${l}/pricing`));
  check(`/${l} listed`, urls.includes(`/${l}`));
}
// Comment-stripped, per this repo's own rule (scripts/lib/strip-comments.ts):
// app/sitemap.ts explains in prose why it does NOT use `new Date()`, and a raw
// file scan is satisfied by that sentence — it would fail the correct file and
// pass a broken one whose comment happened not to quote the call.
check(
  'sitemap source does not stamp build time as lastModified',
  !/new Date\(\)/.test(stripComments(readFileSync(join(ROOT, 'app/sitemap.ts'), 'utf8'))),
);
const cfg = stripComments(readFileSync(join(ROOT, 'next.config.ts'), 'utf8'));
check('waitlist redirects permanently to signup', /waitlist[\s\S]{0,200}signup[\s\S]{0,120}permanent:\s*true/.test(cfg));
for (const f of ['ar', 'en']) {
  const m = JSON.parse(readFileSync(join(ROOT, `messages/${f}.json`), 'utf8'));
  const body: string = m.referrals?.gatedBody ?? '';
  check(`${f} referrals.gatedBody no longer claims invite-only`, !/بالدعوة فقط|invite-only|invite only/i.test(body), body);
}

if (failures) { console.log(`\n[sitemap] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[sitemap] ${checks} checks passed`);
