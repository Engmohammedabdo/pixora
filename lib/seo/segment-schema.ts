import { APP_URL, ENTITY_IDS } from '@/lib/seo/schema';

/**
 * The @graph for one segment page.
 *
 * Mirrors `buildStudioSchema()` deliberately, node for node, so the two public
 * page families are legible to an engine as the same site rather than as two
 * sites: BreadcrumbList to place the page, WebPage to describe it, FAQPage
 * because the questions a restaurant owner asks are the questions an answer
 * engine gets asked.
 *
 * ── ONE `<script>`, ONE `@graph` ───────────────────────────────────────────
 * A single block, like the studio pages. CLAUDE.md records the instrument trap
 * this creates and it applies here too: a prerendered document matches
 * `application/ld+json` TWICE — once as the real `<script>` element and once as
 * a JSON *string* inside the `self.__next_f` flight payload. Count elements and
 * parse them. Do not "fix" a 2 into a 1 by emitting a second block, which would
 * hand a crawler two graphs to reconcile.
 *
 * ── WHY `about` POINTS AT THE SOFTWARE AND NOT AT A `Service` NODE ──────────
 * A segment page is still a page about the product, aimed at an audience — not a
 * separate offering with its own price. `audience` carries the segment; inventing
 * a `Service` node would assert a commercial entity that has no price, no terms
 * and no page of its own, which is the kind of unbacked structured data the
 * `test:schema` gate exists to keep out.
 */
export function buildSegmentSchema(
  locale: string,
  slug: string,
  name: string,
  description: string,
  audience: string,
  faq: readonly { q: string; a: string }[],
): Record<string, unknown> {
  const url = `${APP_URL}/${locale}/for/${slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'PyraSuite', item: `${APP_URL}/${locale}` },
          { '@type': 'ListItem', position: 2, name, item: url },
        ],
      },
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name,
        description,
        inLanguage: locale,
        isPartOf: { '@id': ENTITY_IDS.website },
        about: { '@id': ENTITY_IDS.software },
        publisher: { '@id': ENTITY_IDS.organization },
        audience: { '@type': 'BusinessAudience', name: audience },
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
