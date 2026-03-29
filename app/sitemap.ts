import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pixora.ai';

  return [
    { url: `${baseUrl}/ar`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: `${baseUrl}/en`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${baseUrl}/ar/login`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/ar/signup`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/en/login`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/en/signup`, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
