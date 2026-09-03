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
import { buildStructuredData, ENTITY_IDS } from '../../lib/seo/schema';
import { buildStudioSchema, buildStudioIndexSchema } from '../../lib/seo/studio-schema';
import { STUDIO_SLUGS } from '../../lib/studios/catalogue';
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

// ── the shared entity ids ──
// A studio page's WebPage node names three entities it does not define; the
// definitions live on /ar, /en and both /pricing pages. That cross-page
// reference is deliberate and lib/seo/studio-schema.ts's header records why.
// What is NOT acceptable is a reference to an id nothing anywhere mints, which
// is what a rename in either file used to produce silently: the two sides were
// hand-typed literals. They now share ENTITY_IDS, and this pins the join.
const minted = new Set(
  (['ar', 'en'] as const).flatMap((l) =>
    buildStructuredData(l)['@graph'].map((n) => (n as { '@id': string })['@id']),
  ),
);
check('the three shared ids are all minted by buildStructuredData', Object.values(ENTITY_IDS).every((id) => minted.has(id)), [...minted].join(' '));

function referencedIds(graph: unknown): string[] {
  // Every {'@id': x} that is a bare reference — an object with @id and nothing
  // else — as opposed to a node that DEFINES x.
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v !== 'object' || v === null) return;
    const keys = Object.keys(v as object);
    if (keys.length === 1 && keys[0] === '@id') { out.push((v as { '@id': string })['@id']); return; }
    Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(graph);
  return out;
}

const sampleFaq = [{ q: 'q', a: 'a' }] as const;
const studioGraphs: { label: string; graph: unknown }[] = [];
for (const locale of ['ar', 'en'] as const) {
  for (const slug of STUDIO_SLUGS) {
    studioGraphs.push({
      label: `${locale}/studios/${slug}`,
      graph: buildStudioSchema(locale, slug, 'Name', 'A definition.', sampleFaq, 'Studios')['@graph'],
    });
  }
  studioGraphs.push({
    label: `${locale}/studios`,
    graph: buildStudioIndexSchema(locale, 'Studios', 'D', STUDIO_SLUGS.map((slug) => ({ slug, name: 'N', tagline: 'T' })))['@graph'],
  });
}
// A scan that matched nothing would certify an empty result, so the count is
// asserted first: nine slugs plus the index, in two locales.
check('every shipped studio graph is covered', studioGraphs.length === (STUDIO_SLUGS.length + 1) * 2, String(studioGraphs.length));
for (const { label, graph } of studioGraphs) {
  const refs = referencedIds(graph);
  check(`${label}: references exactly the three shared entities`, JSON.stringify([...new Set(refs)].sort()) === JSON.stringify(Object.values(ENTITY_IDS).slice().sort()), refs.join(' '));
  check(`${label}: every referenced id is one buildStructuredData mints`, refs.every((id) => minted.has(id)), refs.filter((id) => !minted.has(id)).join(' '));
}
// The pointers must not be retyped anywhere: a literal '#organization' in the
// studio builder is how the two sides drifted apart in the first place.
check('studio-schema.ts retypes none of the entity ids', !/['`]\$\{APP_URL\}\/#/.test(src('lib/seo/studio-schema.ts')));

// The profiles file must exist even if empty — and must never carry a made-up URL.
check('SOCIAL_PROFILES is exported', Array.isArray(SOCIAL_PROFILES));

// FAQ answers must be in the server HTML: no conditional render on open state.
check('FaqSection renders answers unconditionally', !/\{isOpen\s*&&/.test(src('components/landing/FaqSection.tsx')));
check('FaqSection uses <details>', /<details/.test(src('components/landing/FaqSection.tsx')));

if (failures) { console.log(`\n[schema] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[schema] ${checks} checks passed`);
