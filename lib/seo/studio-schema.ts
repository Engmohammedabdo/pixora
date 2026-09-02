import type { StudioSlug } from '@/lib/studios/catalogue';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';

/**
 * The @graph for one studio page.
 *
 * BreadcrumbList so an engine can place the page in the site; FAQPage because
 * these are the questions a Gulf SME actually asks and the format answer
 * engines quote. Both nodes reference the site-wide Organization by @id rather
 * than restating it — lib/seo/schema.ts owns that entity, and the @id strings
 * here are byte-identical to the ones it mints (schema.ts:104,127,140).
 */
export function buildStudioSchema(
  locale: string,
  slug: StudioSlug,
  studioName: string,
  definition: string,
  faq: readonly { q: string; a: string }[],
  studiosLabel: string,
): Record<string, unknown> {
  const url = `${APP_URL}/${locale}/studios/${slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'PyraSuite', item: `${APP_URL}/${locale}` },
          { '@type': 'ListItem', position: 2, name: studiosLabel, item: `${APP_URL}/${locale}/studios` },
          { '@type': 'ListItem', position: 3, name: studioName, item: url },
        ],
      },
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: studioName,
        description: definition,
        inLanguage: locale,
        isPartOf: { '@id': `${APP_URL}/#website` },
        about: { '@id': `${APP_URL}/#software` },
        publisher: { '@id': `${APP_URL}/#organization` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };
}
