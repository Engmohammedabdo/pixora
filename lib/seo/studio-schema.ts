import type { StudioSlug } from '@/lib/studios/catalogue';
import { ENTITY_IDS } from '@/lib/seo/schema';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';

/**
 * The @graph for one studio page.
 *
 * BreadcrumbList so an engine can place the page in the site; FAQPage because
 * these are the questions a Gulf SME actually asks and the format answer
 * engines quote.
 *
 * -- WHAT REFERENCES WHAT, since this header used to say it wrong -----------
 * Neither of those two nodes references anything. It is the WebPage node — one
 * node — that carries THREE references: `isPartOf` -> #website, `about` ->
 * #software, `publisher` -> #organization. The old wording ("Both nodes
 * reference the site-wide Organization") named the wrong nodes and one of the
 * three entities, and it claimed the ids were byte-identical to schema.ts's by
 * having been typed that way. They now come from `ENTITY_IDS`, so being
 * identical is a fact rather than a promise.
 *
 * -- WHY THE ENTITY NODES ARE NOT COPIED ONTO THESE 20 PAGES ----------------
 * Measured 2026-09-03: every studio page's graph carries three references and
 * defines none of them; the definitions live on /ar, /en and both /pricing
 * pages. A parser reading ONE studio URL in isolation therefore resolves
 * publisher/about/isPartOf to nothing.
 *
 * Both alternatives were considered and this one was kept, deliberately:
 *
 *  - Dropping the references removes a real signal for the consolidators that
 *    DO resolve them. `{'@id': …}` is a legal JSON-LD node reference, the IRIs
 *    are dereferenceable, and Google follows @id across a site. Nothing here
 *    is false — it is merely incomplete for a single-document reader.
 *  - Copying `buildOrganizationSchema()`/`buildWebSiteSchema()`/
 *    `buildSoftwareApplicationSchema()` in would make each page self-contained
 *    AND would multiply an existing defect by ten: the WebSite and
 *    SoftwareApplication nodes still carry `url: ${APP_URL}/{locale}` under a
 *    shared @id (schema.ts:128 and :149), i.e. one entity claiming two
 *    homepages — the exact thing schema.ts:107-109 fixed for Organization and
 *    only Organization. Copying that onto twenty more URLs before fixing it
 *    would be the wrong order.
 *
 * So: references stay, the ids are shared rather than retyped, and no rich
 * result depends on the difference (BreadcrumbList is self-contained and
 * FAQPage needs only `mainEntity`).
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
        isPartOf: { '@id': ENTITY_IDS.website },
        about: { '@id': ENTITY_IDS.software },
        publisher: { '@id': ENTITY_IDS.organization },
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
        isPartOf: { '@id': ENTITY_IDS.website },
        about: { '@id': ENTITY_IDS.software },
        publisher: { '@id': ENTITY_IDS.organization },
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
