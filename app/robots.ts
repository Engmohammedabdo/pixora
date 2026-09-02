import type { MetadataRoute } from 'next';

/**
 * The ONE robots.txt. A static public/robots.txt shadowed this route from the
 * day it was written (Next serves public/ files over metadata routes of the
 * same name), so production carried three rules — none matching a localized
 * path — while these nineteen never shipped. scripts/tests/robots.test.ts
 * fails the build if the static file ever comes back.
 *
 * AI crawlers are listed by NAME so that allowing them is a decision on
 * record rather than an omission. They get exactly the * rules.
 */
const DISALLOW = [
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
  '/*/projects/',
  '/*/referrals/',
];

// Answer engines and their search crawlers. Bingbot is here because Copilot and
// ChatGPT search ride on Bing's index.
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Bingbot',
  'CCBot',
];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: DISALLOW },
      { userAgent: AI_CRAWLERS, allow: '/', disallow: DISALLOW },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
