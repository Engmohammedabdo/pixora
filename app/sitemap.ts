import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';

  return [
    { url: `${baseUrl}/ar`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/en`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    // Public, unauthenticated route (middleware.ts publicPaths includes '/pricing') —
    // the per-action credit cost table that is the product's stated differentiator.
    { url: `${baseUrl}/ar/pricing`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/en/pricing`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/ar/login`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/ar/signup`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/en/login`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/en/signup`, changeFrequency: 'monthly', priority: 0.6 },
    // /privacy and /terms live under app/[locale]/(dashboard)/ but are exempt from
    // the auth redirect: middleware.ts publicPaths explicitly whitelists both, and
    // isPublicPath() strips the locale prefix before matching, so an unauthenticated
    // request reaches the page (verified: no redirect). They DO render inside the
    // authenticated dashboard chrome (sidebar/topbar) rather than a public layout —
    // a pre-existing cosmetic issue (benchmark gap 15/38), not an auth gate — so
    // sitemap inclusion is correct; the chrome mismatch is a separate follow-up.
    { url: `${baseUrl}/ar/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/en/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/ar/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/en/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
