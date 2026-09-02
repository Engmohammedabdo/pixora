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

export function publicOpenGraph(
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
  };
}
