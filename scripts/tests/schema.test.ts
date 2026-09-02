/**
 * Proof that the structured data is complete, true, and free of placeholders.
 *
 *   npx tsx scripts/tests/schema.test.ts
 *
 * Measured 2026-09-01: the FAQPage answer stating the free allowance shipped
 * the raw ICU placeholder "{credits}" — 11 occurrences in the live /ar — because
 * buildFaqSchema read the untranslated message. The Organization node had no
 * alternateName or sameAs, a 1200x630 OG image as its logo, and a url that
 * changed per locale under one @id.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildStructuredData } from '../../lib/seo/schema';
import { SOCIAL_PROFILES } from '../../lib/seo/profiles';
import { PLANS } from '../../lib/stripe/plans';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}
const ROOT = join(__dirname, '..', '..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';

for (const locale of ['ar', 'en'] as const) {
  const g = buildStructuredData(locale)['@graph'];
  const json = JSON.stringify(g);
  check(`${locale}: no ICU placeholder survives serialisation`, !/\{[a-zA-Z]+\}/.test(json), (json.match(/\{[a-zA-Z]+\}/g) || []).join(','));
  check(`${locale}: graph has 4 nodes`, g.length === 4, String(g.length));

  const org = g.find((n) => n['@type'] === 'Organization') as Record<string, unknown> | undefined;
  check(`${locale}: Organization present`, Boolean(org));
  check(`${locale}: Organization url is locale-independent`, org?.url === BASE, String(org?.url));
  check(`${locale}: Organization logo is the 512 icon`, String(org?.logo).endsWith('/icon-512.png'), String(org?.logo));
  const alt = org?.alternateName as string[] | undefined;
  check(`${locale}: alternateName carries the Arabic name`, Array.isArray(alt) && alt.includes('بايرا سويت'));
  check(`${locale}: sameAs is an array`, Array.isArray(org?.sameAs));
  check(`${locale}: every sameAs is https`, (org?.sameAs as string[]).every((u) => u.startsWith('https://')));
  check(`${locale}: areaServed names the UAE`, JSON.stringify(org?.areaServed).includes('AE'));

  const site = g.find((n) => n['@type'] === 'WebSite') as Record<string, unknown> | undefined;
  check(`${locale}: WebSite node present`, Boolean(site));
  check(`${locale}: WebSite inLanguage lists both`, JSON.stringify(site?.inLanguage) === JSON.stringify(['ar', 'en']));

  const app = g.find((n) => n['@type'] === 'SoftwareApplication') as Record<string, unknown> | undefined;
  check(`${locale}: SoftwareApplication name is the bare product name`, app?.name === 'PyraSuite', String(app?.name));
  check(`${locale}: SoftwareApplication isAccessibleForFree`, app?.isAccessibleForFree === true);
  check(`${locale}: featureList has 9 studios`, Array.isArray(app?.featureList) && (app!.featureList as string[]).length === 9);
  check(`${locale}: offers still read from PLANS`, (app?.offers as unknown[]).length === Object.keys(PLANS).length);

  const faq = g.find((n) => n['@type'] === 'FAQPage') as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] } | undefined;
  check(`${locale}: FAQ present`, Boolean(faq));
  const free = faq?.mainEntity.map((q) => q.acceptedAnswer.text).find((t) => t.includes(String(PLANS.free.credits)));
  check(`${locale}: the free-credit answer states the real number ${PLANS.free.credits}`, Boolean(free));
  check(`${locale}: first FAQ asks what PyraSuite is`, /PyraSuite/.test(faq?.mainEntity[0]?.name ?? ''), faq?.mainEntity[0]?.name);
}

// The profiles file must exist even if empty — and must never carry a made-up URL.
check('SOCIAL_PROFILES is exported', Array.isArray(SOCIAL_PROFILES));

// FAQ answers must be in the server HTML: no conditional render on open state.
check('FaqSection renders answers unconditionally', !/\{isOpen\s*&&/.test(src('components/landing/FaqSection.tsx')));
check('FaqSection uses <details>', /<details/.test(src('components/landing/FaqSection.tsx')));

if (failures) { console.log(`\n[schema] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[schema] ${checks} checks passed`);
