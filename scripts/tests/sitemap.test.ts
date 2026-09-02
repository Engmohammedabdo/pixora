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
 *
 * The same rule applies to the redirect: /waitlist 308s to /signup, so no UI
 * surface may still link there. Missed once already — the invite wall's only
 * exit pointed at /waitlist, i.e. back at the wall.
 */
import { readFileSync, readdirSync } from 'node:fs';
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
const redirectsWaitlist = /waitlist[\s\S]{0,200}signup[\s\S]{0,120}permanent:\s*true/.test(cfg);
check('waitlist redirects permanently to signup', redirectsWaitlist);

// The redirect and the UI have to move TOGETHER, and this is the half that was
// missed: /waitlist now 308s to /signup, and /signup with the gate on IS the
// invite wall — whose only forward action was a link to /waitlist. That is a
// closed loop with no way to leave an address, and it is not unreachable code:
// app/api/public/gate-status/route.ts fails CLOSED by design, so one unreadable
// gate read turns the wall on. A 308 is cached by the browser, so the loop would
// outlive any later revert of next.config.ts for everyone who hit it once.
//
// Comment-stripped, per this repo's own rule: several files discuss /waitlist in
// prose, and a raw scan would fail the correct tree.
const LINK_TO_WAITLIST = /(?:href\s*=\s*\{?\s*|(?:push|replace|redirect)\s*\(\s*)['"`]\/waitlist\b/;
function tsFilesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : tsFilesUnder(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}
const uiSources = [...tsFilesUnder(join(ROOT, 'app')), ...tsFilesUnder(join(ROOT, 'components'))];
const linkingToWaitlist = uiSources
  .filter((f) => LINK_TO_WAITLIST.test(stripComments(readFileSync(f, 'utf8'))))
  .map((f) => f.slice(ROOT.length + 1));
check(
  'no UI surface links to /waitlist while /waitlist redirects away',
  // `uiSources.length` is part of the rule: a walk that finds no files would
  // otherwise certify a tree it never read.
  uiSources.length > 0 && (!redirectsWaitlist || linkingToWaitlist.length === 0),
  `${uiSources.length} files scanned; linking: ${linkingToWaitlist.join(' ') || 'none'}`,
);

for (const f of ['ar', 'en']) {
  const m = JSON.parse(readFileSync(join(ROOT, `messages/${f}.json`), 'utf8'));
  const body: string = m.referrals?.gatedBody ?? '';
  check(`${f} referrals.gatedBody no longer claims invite-only`, !/بالدعوة فقط|invite-only|invite only/i.test(body), body);
}

if (failures) { console.log(`\n[sitemap] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[sitemap] ${checks} checks passed`);
