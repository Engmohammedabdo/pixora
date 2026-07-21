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
    // /privacy and /terms live under app/[locale]/(landing)/ (moved out of the
    // dashboard route group — benchmark gap 15/38): middleware.ts publicPaths
    // whitelists both and isPublicPath() strips the locale prefix before
    // matching, so an unauthenticated request reaches the page with no
    // redirect. They now render with the public NavBar/Footer chrome, not the
    // authenticated dashboard sidebar/topbar.
    { url: `${baseUrl}/ar/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/en/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/ar/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${baseUrl}/en/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
