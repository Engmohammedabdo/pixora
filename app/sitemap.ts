import type { MetadataRoute } from 'next';
import { STUDIO_SLUGS } from '@/lib/studios/catalogue';

/**
 * Only pages worth an organic landing. Auth forms are noindex (see
 * app/[locale]/(auth)/layout.tsx) and are not listed; /waitlist 301s to /signup
 * now that signup is open (next.config.ts redirects()).
 *
 * /signup is deliberately absent even though signup is now OPEN, and that is a
 * correction to the plan this file was written from: a92eac0 made every page
 * under (auth) `robots: { index: false }`, so listing /signup here would submit a
 * noindex URL to Google — a Search Console error, and crawl spent on a page that
 * cannot rank. The visitor still reaches it from the landing page and /pricing.
 * scripts/tests/sitemap.test.ts checks both halves of that rule together.
 *
 * `lastModified` is a hand-kept date per page, NOT `new Date()`: stamping every
 * URL with the build time told crawlers the privacy policy changed on every
 * deploy — a freshness signal that was always a lie.
 */
const LOCALES = ['ar', 'en'] as const;

interface SitemapPage {
  path: string;
  updated: string;
  changeFrequency: 'weekly' | 'monthly' | 'yearly';
  priority: number;
}

const PAGES: SitemapPage[] = [
  { path: '', updated: '2026-09-02', changeFrequency: 'weekly', priority: 1 },
  { path: '/pricing', updated: '2026-08-29', changeFrequency: 'monthly', priority: 0.9 },
  // The index of the nine, and then the nine. They are GENERATED from
  // STUDIO_SLUGS rather than listed: a tenth studio added to the catalogue
  // reaches the sitemap by existing, and a studio that is not in the catalogue
  // — `video` — cannot reach it at all. Nine hand-typed lines here is the
  // second copy of the list this whole branch exists to avoid, and the surface
  // where a stale copy costs the most: a 404 submitted to Google.
  { path: '/studios', updated: '2026-09-02', changeFrequency: 'monthly', priority: 0.8 },
  ...STUDIO_SLUGS.map(
    (slug): SitemapPage => ({
      path: `/studios/${slug}`,
      updated: '2026-09-02',
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
  ),
  { path: '/contact', updated: '2026-08-23', changeFrequency: 'yearly', priority: 0.5 },
  { path: '/privacy', updated: '2026-08-29', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', updated: '2026-08-29', changeFrequency: 'yearly', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';
  return LOCALES.flatMap((locale) =>
    PAGES.map((p) => ({
      url: `${baseUrl}/${locale}${p.path}`,
      lastModified: new Date(p.updated),
      changeFrequency: p.changeFrequency,
      // English is the secondary locale: one step below Arabic on every page.
      priority: locale === 'ar' ? p.priority : Math.max(0.1, p.priority - 0.1),
    })),
  );
}
