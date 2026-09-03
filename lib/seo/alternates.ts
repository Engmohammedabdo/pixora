import type { Metadata } from 'next';

/**
 * The ONE place a public page's canonical, hreflang and OpenGraph identity
 * come from.
 *
 * Before this, the root layout stamped `canonical = /{locale}` on EVERY page as
 * a "site-wide default", so six public pages told Google they were duplicates
 * of the landing page; next-intl separately emitted an HTTP Link header whose
 * x-default was "/" (a 307). A helper both the canonical and the OG derive from
 * is how the two stop disagreeing.
 *
 * `path` is '' for the locale root, or '/pricing'-style for an inner page.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';
const LOCALES = ['ar', 'en'] as const;
type Locale = (typeof LOCALES)[number];

function normalise(path: string): string {
  if (!path || path === '/') return '';
  return path.startsWith('/') ? path : `/${path}`;
}

function toLocale(locale: string): Locale {
  return locale === 'en' ? 'en' : 'ar';
}

export function publicAlternates(
  locale: string,
  path: string,
): { canonical: string; languages: Record<Locale | 'x-default', string> } {
  const p = normalise(path);
  return {
    canonical: `${APP_URL}/${toLocale(locale)}${p}`,
    languages: {
      ar: `${APP_URL}/ar${p}`,
      en: `${APP_URL}/en${p}`,
      // Arabic is the product's first language and the default locale; a
      // visitor whose language matches neither lands on the Arabic page.
      'x-default': `${APP_URL}/ar${p}`,
    },
  };
}

/** OG locale tags. ar_AE, not ar_SA: the company and its first customers are in the UAE. */
const OG_LOCALE: Record<Locale, string> = { ar: 'ar_AE', en: 'en_US' };

/**
 * The site's one OpenGraph image, rendered by app/[locale]/opengraph-image.tsx
 * and served at /{locale}/opengraph-image. That file imports `size` and `alt`
 * from HERE so the dimensions a page advertises and the pixels it serves cannot
 * drift apart.
 *
 * Why a page has to name it at all: Next merges `openGraph` shallowly. A
 * page-level `openGraph` object REPLACES the [locale] segment's wholesale,
 * file-based images included — measured 2026-09-02 on a production build, where
 * every inner page that emitted its own openGraph shipped with NO og:image (and
 * therefore no twitter:image, which Next derives from it) while the landing
 * page, which inherits the segment's, had one. A helper that omits `images`
 * cannot deliver the "real OpenGraph on inner pages" it exists for.
 */
export const OG_IMAGE = {
  size: { width: 1200, height: 630 },
  // `alt` is a static export in the file-based convention (it cannot branch on
  // the locale the way the image function can), so one English string.
  alt: 'PyraSuite — AI Marketing Platform',
} as const;

function buildOpenGraph(
  locale: string,
  o: { title: string; description: string; path: string },
): NonNullable<Metadata['openGraph']> {
  const l = toLocale(locale);
  const other = l === 'ar' ? 'en' : 'ar';
  return {
    type: 'website',
    siteName: 'PyraSuite',
    title: o.title,
    description: o.description,
    url: `${APP_URL}/${l}${normalise(o.path)}`,
    locale: OG_LOCALE[l],
    alternateLocale: [OG_LOCALE[other]],
    images: [
      {
        url: `${APP_URL}/${l}/opengraph-image`,
        width: OG_IMAGE.size.width,
        height: OG_IMAGE.size.height,
        alt: OG_IMAGE.alt,
      },
    ],
  };
}

/**
 * The two social channels of one page, produced by ONE call.
 *
 * Why they are not two exported helpers a caller spreads separately: Next
 * merges `twitter` exactly as shallowly as `openGraph` — a page-level object
 * replaces the [locale] segment's wholesale, and a page that sets NEITHER
 * inherits the segment's, which is the landing page's own title and
 * description. Measured 2026-09-03 on production: all 20 studio pages, plus
 * /contact, /privacy, /terms and /pricing, carried a page-exact og:title and
 * the site-wide twitter:title — "PyraSuite — AI Marketing Platform" on ten
 * English URLs and its Arabic twin on ten more. X reads twitter:* when it is
 * present and only falls back to og:* when it is absent, so present-but-wrong
 * is worse than absent: every share of the highest-intent product URLs in the
 * product rendered the generic homepage card.
 *
 * The old shape (`openGraph: publicOpenGraph(...)`) let a caller supply one
 * channel and forget the other — the drift-between-copies class this repo
 * keeps paying for. This returns both keys, so a page cannot have an og
 * identity without the matching twitter one. `buildOpenGraph` is deliberately
 * NOT exported for the same reason.
 *
 * `images` is deliberately absent from the twitter block: Next fills
 * twitter:image from openGraph.images whenever `twitter` has no `images` key
 * of its own (next/dist/lib/metadata/resolve-metadata.js postProcessMetadata),
 * so the file-based OG route already resolves and twitter:image:alt stays the
 * static OG_IMAGE.alt the image route actually renders. Naming images here
 * would pin a second copy of that URL.
 */
export function publicSocial(
  locale: string,
  o: { title: string; description: string; path: string },
): { openGraph: NonNullable<Metadata['openGraph']>; twitter: NonNullable<Metadata['twitter']> } {
  return {
    openGraph: buildOpenGraph(locale, o),
    twitter: {
      // The segment's block is REPLACED, not merged into, so the card type has
      // to be restated here or every one of these pages drops to `summary`.
      card: 'summary_large_image',
      title: o.title,
      description: o.description,
    },
  };
}
