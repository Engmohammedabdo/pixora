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
check('og type', 'type' in og ? og.type : undefined, 'website');
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
