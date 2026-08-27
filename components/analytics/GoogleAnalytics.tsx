import Script from 'next/script';

/**
 * Google Analytics 4 (gtag.js).
 *
 * ── THIS COMPONENT DEPENDS ON THE CSP, AND FAILS SILENTLY WITHOUT IT ────────
 * The Content-Security-Policy in next.config.ts is an allowlist, and GA touches
 * three of its directives. If any one is dropped the browser refuses the request
 * and NOTHING is reported — no exception, no failed build, just an empty
 * property that looks exactly like "no traffic yet":
 *
 *   script-src   https://www.googletagmanager.com   — the gtag.js loader below
 *   connect-src  https://*.google-analytics.com     — the /g/collect beacons
 *   img-src      https://*.google-analytics.com     — the no-JS pixel fallback
 *
 * The inline bootstrap runs on `script-src 'unsafe-inline'`, which this app
 * already ships deliberately (see CLAUDE.md). If a nonce is ever introduced,
 * this <Script> needs one too.
 *
 * ── WHY IT IS NOT MOUNTED EVERYWHERE ───────────────────────────────────────
 * Mounted from app/[locale]/layout.tsx only, so it covers every customer-facing
 * page in both locales. app/admin/* owns a separate <html> and is `noindex,
 * nofollow` — it is an internal panel, and measuring the founder's own sessions
 * would inflate every engagement number in the property.
 *
 * ── WHY IT DOES NOT RUN IN DEVELOPMENT ─────────────────────────────────────
 * gtag has no notion of environments: a localhost pageview lands in the same
 * property as a real customer's and cannot be separated out afterwards. So the
 * tag is emitted only in production builds. To test the tag locally, set
 * NEXT_PUBLIC_GA_MEASUREMENT_ID in .env.local — preferably to a throwaway
 * property rather than the live one.
 *
 * NODE_ENV is set by Next itself and no environment variable can spoof it,
 * which is the same reasoning next.config.ts:55 uses for 'unsafe-eval'.
 *
 * SPA navigation: gtag `config` fires one page_view — the LANDING one — on
 * load, and that is the only page_view this component owns. Every subsequent
 * App Router navigation is reported by <PageViewTracker/>, mounted beside this
 * component. This used to lean on GA4's Enhanced Measurement history listener
 * instead, and the live property showed the failure mode that comment
 * predicted: landing pageviews only, no page depth (observed 2026-08-27).
 * CONSEQUENCE: Enhanced Measurement → "Page changes based on browser history
 * events" must now be OFF in the GA4 data stream, or every SPA navigation is
 * counted twice — once by its listener, once by ours.
 */
const MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-L45LDQPRKJ';

export function GoogleAnalytics(): React.ReactElement | null {
  const enabled =
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);

  if (!enabled) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${MEASUREMENT_ID}');`}
      </Script>
    </>
  );
}
