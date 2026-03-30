import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/*/dashboard/',
          '/*/onboarding/',
          '/*/settings/',
          '/*/billing/',
          '/*/assets/',
          '/*/brand-kit/',
          '/*/creator/',
          '/*/photoshoot/',
          '/*/campaign/',
          '/*/plan/',
          '/*/storyboard/',
          '/*/analysis/',
          '/*/voiceover/',
          '/*/edit/',
          '/*/prompt-builder/',
          '/*/team/',
          '/*/projects/',
          '/*/portfolio/',
          '/*/community/',
          '/*/referrals/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
