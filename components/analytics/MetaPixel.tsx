import Script from 'next/script';
import { META_PIXEL_ID } from '@/lib/analytics/meta-config';

/**
 * Meta Pixel (fbevents.js) — the browser half of the Meta setup.
 *
 * ── DIVISION OF LABOUR WITH THE CONVERSIONS API ─────────────────────────────
 * The pixel owns what only the browser witnesses: PageView on load and on every
 * SPA navigation, plus planting the `_fbp`/`_fbc` cookies that give the
 * server-side events their match quality. Everything the business trusts —
 * Purchase, CompleteRegistration — is sent by the SERVER via
 * lib/analytics/meta-capi.ts, for the same reason those events are
 * server-witnessed in GA4: the purchase settles in a Stripe webhook the browser
 * never sees, and a client-reportable purchase is free revenue for anyone with
 * a devtools console. Do not add fbq('track', 'Purchase') here —
 * test:analytics fails on it.
 *
 * ── WHY THIS IS A SERVER COMPONENT, LIKE GoogleAnalytics ────────────────────
 * The first version was a client component (it also owned the SPA PageView via
 * usePathname), and the built ar.html then carried no fbevents reference at
 * all — the bootstrap lived only in the layout's JS chunk. As a server
 * component the bootstrap ships in the prerendered document itself (in the
 * flight payload — note next/script `afterInteractive` NEVER emits an
 * executable <script> in SSR HTML, for the GA tag either; both tags are
 * injected by the client runtime after hydration, and the document shows a
 * preload link + the payload). What the refactor actually buys: the pixel is
 * verifiable in the bytes that ship, the noscript fallback is real server
 * HTML, and the architecture matches GA exactly — the SPA half lives in
 * PageViewTracker.tsx, which already owns that job for the other tag.
 *
 * ── THIS COMPONENT DEPENDS ON THE CSP, AND FAILS SILENTLY WITHOUT IT ────────
 * Same failure class as GoogleAnalytics.tsx. FIVE directives in
 * next.config.ts are load-bearing:
 *
 *   script-src   https://connect.facebook.net  — the fbevents.js loader below
 *   img-src      https://www.facebook.com      — the /tr beacon + noscript img
 *   connect-src  https://www.facebook.com      — fbevents' fetch/XHR reporting
 *   form-action  https://www.facebook.com      — the transport fbevents ACTUALLY
 *   frame-src    https://www.facebook.com        used, measured in a real browser:
 *                                                a form POST into a facebook.com
 *                                                iframe, with no img/XHR fallback
 *                                                firing when it was blocked
 *
 * The last two are not in Meta's usual allowlist trio; with only the first
 * three, fbevents LOADED, planted `_fbp`, and then every PageView delivery
 * was refused by `form-action 'self'` — visible only in the browser console.
 * Drop any one and the pixel reads as "no traffic", indistinguishable from
 * launch-day quiet. test:analytics asserts all five against next.config.ts.
 *
 * ── DO NOT PRE-CREATE THE fbq STUB ANYWHERE ELSE ────────────────────────────
 * The official bootstrap begins `if (f.fbq) return` — its guard against double
 * injection. A foreign stub created before it runs (say, by a tracker effect
 * trying to queue an early call) makes the bootstrap bail WITHOUT ever loading
 * fbevents.js, and every queued call waits forever. That is why
 * PageViewTracker calls `window.fbq?.()` optionally instead of shimming: a
 * navigation that races the bootstrap loses one PageView; a shim would lose
 * the entire pixel.
 *
 * ── MOUNTING AND ENVIRONMENTS ───────────────────────────────────────────────
 * Mounted from app/[locale]/layout.tsx beside GoogleAnalytics, so it covers
 * every customer-facing page in both locales and never the admin panel. Like
 * the GA tag it is production-only: a localhost PageView lands in the same
 * Events Manager as a real customer's. Set NEXT_PUBLIC_META_PIXEL_ID in
 * .env.local (preferably to a throwaway pixel) to test locally.
 */
export function MetaPixel(): React.ReactElement | null {
  const enabled =
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);

  if (!enabled) return null;

  return (
    <>
      <Script id="meta-pixel-init" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          className="hidden"
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
