import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'pixoradb.pyramedia.cloud' },
      { protocol: 'https', hostname: 'oaidalleapiprodscus.blob.core.windows.net' },
      { protocol: 'https', hostname: 'replicate.delivery' },
      { protocol: 'https', hostname: 'placehold.co' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            // Supabase here is self-hosted at *.pyramedia.cloud. The *.supabase.co and
            // *.supabase.in wildcards that used to sit in img-src/media-src/connect-src
            // matched nothing we own, and were multi-tenant: anyone can register a free
            // project under either domain, so allow-listing them let an attacker host
            // content on an origin this app trusts — which is exactly how a generation
            // row could beacon an admin's browser. Do not re-add them.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'unsafe-eval' removed: it is a dev/HMR requirement, and the production
              // bundle was checked against this policy before shipping. 'unsafe-inline'
              // stays, and that is real remaining debt rather than an oversight — Next.js
              // App Router injects inline bootstrap scripts, and the nonce-based
              // alternative forces every one of this app's 133 prerendered pages to
              // render dynamically. Worth doing; not worth pretending is done.
              "script-src 'self' 'unsafe-inline' https://js.stripe.com https://vercel.live",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://oaidalleapiprodscus.blob.core.windows.net https://replicate.delivery https://*.pyramedia.cloud https://placehold.co",
              "media-src 'self' blob: https://*.pyramedia.cloud",
              "connect-src 'self' https://api.stripe.com https://api.openai.com https://generativelanguage.googleapis.com https://api.replicate.com https://api.elevenlabs.io https://*.pyramedia.cloud",
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
