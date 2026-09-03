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
import { publicAlternates, publicSocial, OG_IMAGE } from '../../lib/seo/alternates';

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

const social = publicSocial('ar', { title: 'T', description: 'D', path: '/pricing' });
const og = social.openGraph;
check('og url is page-exact', og.url, `${BASE}/ar/pricing`);
check('og locale is the UAE Arabic tag', og.locale, 'ar_AE');
check('og alternateLocale', og.alternateLocale, ['en_US']);
check('og siteName', og.siteName, 'PyraSuite');
check('og type', 'type' in og ? og.type : undefined, 'website');
check('og title passes through', og.title, 'T');
// Next merges openGraph SHALLOWLY: a page-level object replaces the segment's,
// file-based images included. Measured 2026-09-02: every inner page that used
// this helper shipped with NO og:image. So the helper must carry the image.
function firstImage(o: ReturnType<typeof publicSocial>['openGraph']): { url?: unknown; width?: unknown; height?: unknown; alt?: unknown } {
  const list = Array.isArray(o.images) ? o.images : [];
  const i = list[0];
  return typeof i === 'object' && i !== null && 'url' in i ? i : {};
}
check('og carries exactly one image', Array.isArray(og.images) ? og.images.length : 0, 1);
check('og image is the locale file-based route', firstImage(og).url, `${BASE}/ar/opengraph-image`);
check('og image width matches the rendered file', firstImage(og).width, OG_IMAGE.size.width);
check('og image height matches the rendered file', firstImage(og).height, OG_IMAGE.size.height);
check('og image alt matches the rendered file', firstImage(og).alt, OG_IMAGE.alt);
check('en og image follows the locale', firstImage(publicSocial('en', { title: 'T', description: 'D', path: '' }).openGraph).url, `${BASE}/en/opengraph-image`);

// ── the twitter channel ──
// Measured on production 2026-09-03: og:title was page-exact on all 20 studio
// pages while twitter:title held one of TWO site-wide values, because the
// helper returned `openGraph` only and Next carried the [locale] segment's
// `twitter` block through untouched. X prefers twitter:* when present, so the
// wrong card was the one that shipped. The two channels now come from one call.
const tw = social.twitter as { card?: unknown; title?: unknown; description?: unknown; images?: unknown };
check('twitter title is the PAGE title, not the site title', tw.title, 'T');
check('twitter description is the PAGE description', tw.description, 'D');
// A page-level `twitter` REPLACES the segment's rather than merging into it,
// so the card type has to be restated or these pages drop to `summary`.
check('twitter card is restated', tw.card, 'summary_large_image');
// Next fills twitter:image from openGraph.images only while `twitter` has no
// `images` key of its own. Naming one here would pin a second copy of the URL
// and of OG_IMAGE.alt.
check('twitter names no images (it inherits og:image)', 'images' in social.twitter, false);
const twEn = publicSocial('en', { title: 'X', description: 'Y', path: '/studios/creator' }).twitter as { title?: unknown };
check('twitter follows the page in en too', twEn.title, 'X');
// The file that RENDERS the image must read its size/alt from the same constant
// the pages advertise, or the two drift silently.
check('opengraph-image.tsx takes size from OG_IMAGE', /export const size = OG_IMAGE\.size/.test(src('app/[locale]/opengraph-image.tsx')), true);
check('opengraph-image.tsx takes alt from OG_IMAGE', /export const alt = OG_IMAGE\.alt/.test(src('app/[locale]/opengraph-image.tsx')), true);

// ── the wiring ──
check('root layout no longer sets a site-wide canonical', /alternates\s*:/.test(src('app/[locale]/layout.tsx')), false);
check('next-intl alternate Link header is off', /alternateLinks:\s*false/.test(src('i18n/routing.ts')), true);
for (const p of ['app/[locale]/pricing/page.tsx', 'app/[locale]/(landing)/contact/page.tsx', 'app/[locale]/(landing)/waitlist/page.tsx', 'app/[locale]/(landing)/privacy/page.tsx', 'app/[locale]/(landing)/terms/page.tsx', 'app/[locale]/(landing)/studios/page.tsx', 'app/[locale]/(landing)/studios/[slug]/page.tsx']) {
  check(`${p} uses publicAlternates`, /publicAlternates\(/.test(src(p)), true);
  // ...publicSocial() spreads BOTH channels. A caller that set only one is the
  // defect this file now pins, so the og-only helper is not exported at all.
  check(`${p} spreads publicSocial`, /\.\.\.publicSocial\(/.test(src(p)), true);
  check(`${p} sets no openGraph key of its own`, /openGraph\s*:/.test(src(p)), false);
  check(`${p} sets no twitter key of its own`, /\btwitter\s*:/.test(src(p)), false);
}
// The landing page — the URL a launch announcement points at — is the one page
// whose canonical the deleted layout block used to supply. It must name its own,
// and it must NOT emit its own openGraph: that would replace the segment's and
// lose the file-based og:image (see above). alternates only.
check('app/[locale]/page.tsx uses publicAlternates', /publicAlternates\(/.test(src('app/[locale]/page.tsx')), true);
check('app/[locale]/page.tsx does NOT call publicSocial (inherits the segment image and card)', /publicSocial\(/.test(src('app/[locale]/page.tsx')), false);
check('app/[locale]/page.tsx sets no openGraph of its own', /openGraph\s*:/.test(src('app/[locale]/page.tsx')), false);
// The og-only builder must stay module-private: an exported one is a caller's
// invitation to supply one channel and forget the other, which is exactly how
// twenty live URLs came to carry the landing page's X card.
const alternatesSrc = src('lib/seo/alternates.ts');
// Anchored on the builder that EXISTS, so this pair cannot certify an empty
// result the way a lone negative scan can.
check('the og-only builder is still there to be checked', /\bfunction buildOpenGraph\(/.test(alternatesSrc), true);
check('alternates.ts exports no og-only helper', /export\s+(?:function|const)\s+\w*OpenGraph\b/.test(alternatesSrc), false);
check('auth pages are noindex', /index:\s*false/.test(src('app/[locale]/(auth)/layout.tsx')), true);

if (failures) { console.log(`\n[alternates] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[alternates] ${checks} checks passed`);
