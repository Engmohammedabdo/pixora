import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** Next sets NODE_ENV itself; no environment variable can spoof it. */
const isDev = process.env.NODE_ENV !== 'production';

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
  async redirects() {
    return [
      // Signup is OPEN (gate-status: inviteOnly:false). The waitlist page still
      // said "بنجهّز الإطلاق" and promised 100 credits while the FAQ promised 25
      // with "no invites, no waiting" — three indexed surfaces, three stories.
      { source: '/:locale(ar|en)/waitlist', destination: '/:locale/signup', permanent: true },
    ];
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
              // 'unsafe-eval' is out of PRODUCTION and stays out — the production
              // bundle was checked against this policy before shipping.
              //
              // It is back in DEVELOPMENT because removing it there was a mistake
              // with an obvious symptom nobody looked for: Next's dev server serves
              // eval-based modules and source maps, so with the directive gone the
              // client bundle throws `EvalError` before hydration, React never
              // attaches, and every form on the site falls back to a native GET.
              // `npm run dev` produced a completely inert app. The original comment
              // even said "it is a dev/HMR requirement" — and then removed it
              // unconditionally anyway, which is the whole lesson: knowing a
              // constraint is not the same as encoding it.
              //
              // Keyed off NODE_ENV, which Next sets itself and no environment
              // variable can spoof (same reasoning as the webhook signature bypass).
              // The three googletagmanager/google-analytics entries below are
              // load-bearing for components/analytics/GoogleAnalytics.tsx. GA4
              // needs all three directives, and a missing one fails SILENTLY —
              // the browser refuses the request, nothing throws, and the
              // property just reads as "no traffic". If GA is ever removed,
              // remove these too; if analytics stops reporting, check here
              // FIRST, before assuming the tag is wrong.
              //
              // Note these are NOT the multi-tenant wildcards the comment above
              // warns about. Nobody can register a subdomain under
              // google-analytics.com or analytics.google.com — Google operates
              // every one — whereas *.supabase.co handed an origin to any
              // stranger with a free account. The wildcard is required because
              // GA4 routes collection regionally (region1.google-analytics.com
              // and friends), so the exact host is not known ahead of time.
              // The facebook entries are load-bearing for
              // components/analytics/MetaPixel.tsx, exactly as the Google ones
              // are for GoogleAnalytics.tsx: script-src loads fbevents.js from
              // connect.facebook.net; img-src, connect-src, form-action and
              // frame-src carry the /tr event delivery to www.facebook.com. A
              // missing one fails SILENTLY. form-action and frame-src are NOT
              // in Meta's usual allowlist trio and were added from MEASUREMENT,
              // not docs: on a production build in a real browser, fbevents
              // delivered the PageView as a form POST into a facebook.com
              // iframe, and the console showed both directives blocking it —
              // the img/XHR fallbacks never fired. All hosts are Meta-operated,
              // not multi-tenant — nobody can register a subdomain under
              // either. test:analytics asserts all five.
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://js.stripe.com https://vercel.live https://www.googletagmanager.com https://connect.facebook.net`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: blob: https://oaidalleapiprodscus.blob.core.windows.net https://replicate.delivery https://*.pyramedia.cloud https://placehold.co https://www.googletagmanager.com https://*.google-analytics.com https://www.facebook.com",
              "media-src 'self' blob: https://*.pyramedia.cloud",
              "connect-src 'self' https://api.stripe.com https://api.openai.com https://generativelanguage.googleapis.com https://api.replicate.com https://api.elevenlabs.io https://*.pyramedia.cloud https://www.googletagmanager.com https://*.google-analytics.com https://*.analytics.google.com https://www.facebook.com https://connect.facebook.net",
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.facebook.com",
              "object-src 'none'",
              "base-uri 'self'",
              // www.facebook.com here is for the pixel's form-POST transport
              // (see the note above). Widening form-action is normally the
              // directive to be most careful with — it is what stops an
              // injected <form> from exfiltrating credentials — but the added
              // action is one fixed Meta-operated origin, not a wildcard.
              "form-action 'self' https://www.facebook.com",
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
