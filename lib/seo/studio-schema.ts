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

/**
 * The @graph for the /studios index.
 *
 * An `ItemList` whose members are the nine studio pages, in catalogue order,
 * each as a `url` — the shape an engine reads as "this page is a list of those
 * pages", and the one internal-linking signal these nine had none of before
 * this branch. The list is BUILT FROM the caller's array, not from a second
 * copy of the nine, for the reason the catalogue exists at all.
 *
 * Two levels of breadcrumb, not three: this page IS level two.
 */
export function buildStudioIndexSchema(
  locale: string,
  title: string,
  description: string,
  items: readonly { slug: StudioSlug; name: string; tagline: string }[],
): Record<string, unknown> {
  const url = `${APP_URL}/${locale}/studios`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'PyraSuite', item: `${APP_URL}/${locale}` },
          { '@type': 'ListItem', position: 2, name: title, item: url },
        ],
      },
      {
        '@type': 'CollectionPage',
        '@id': url,
        url,
        name: title,
        description,
        inLanguage: locale,
        isPartOf: { '@id': `${APP_URL}/#website` },
        about: { '@id': `${APP_URL}/#software` },
        publisher: { '@id': `${APP_URL}/#organization` },
      },
      {
        '@type': 'ItemList',
        '@id': `${url}#list`,
        numberOfItems: items.length,
        itemListElement: items.map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: s.name,
          description: s.tagline,
          url: `${APP_URL}/${locale}/studios/${s.slug}`,
        })),
      },
    ],
  };
}
