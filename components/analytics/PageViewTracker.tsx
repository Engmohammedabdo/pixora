'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Owns the SPA half of page_view reporting.
 *
 * ── WHY THE CODE OWNS THIS, AND NOT A GA4 TOGGLE ───────────────────────────
 * This is an App Router app: after the first document load every navigation is
 * a client-side history change, and gtag's `config` fires exactly ONE
 * page_view — on that first load. The component used to lean on GA4's own
 * Enhanced Measurement history listener for everything after that, which is a
 * toggle in the GA4 admin UI that this repo can neither read nor set. The
 * observed result on the live property (2026-08-27): landing pageviews only,
 * no page depth at all — the exact failure mode the old comment predicted.
 *
 * A dependency on an invisible remote toggle whose OFF state looks like "no
 * traffic" is the same defect class as the CSP note in GoogleAnalytics.tsx:
 * silent, and indistinguishable from a healthy quiet property. So the code
 * reports its own navigations.
 *
 * ── DIVISION OF LABOUR (get this wrong and pageviews double or vanish) ─────
 *   - The LANDING page_view stays with `gtag('config', …)` in
 *     GoogleAnalytics.tsx. Its ordering is guaranteed — config always precedes
 *     it — while this component's first effect can run BEFORE the gtag shim
 *     exists, so claiming the landing here would sometimes lose it.
 *   - Every SUBSEQUENT navigation is reported here, and the first pathname is
 *     skipped (`initial` ref) precisely so the landing is never double-counted.
 *   - GA4 Admin → Data Streams → Enhanced Measurement → "Page changes based on
 *     browser history events" must be OFF. With it ON, its listener AND this
 *     component both fire on each navigation and every SPA pageview counts
 *     twice. Inverting the dependency was deliberate: the toggle mistakenly ON
 *     now shows up as inflation (visible in any report), where the toggle
 *     mistakenly OFF used to show up as absence (invisible).
 *
 * Pushes through a local shim identical to the gtag bootstrap — an
 * `arguments` object into `dataLayer`, which gtag.js drains on load — so a
 * navigation that races the tag's network load is queued, not lost. Pathname
 * only, deliberately: `useSearchParams()` would force a Suspense boundary and
 * risk the prerender regression test:built-document exists to catch, for the
 * sake of query-only transitions this product barely has.
 */
export function PageViewTracker(): null {
  const pathname = usePathname();
  const initial = useRef(true);

  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    // The same shim shape the inline bootstrap defines: gtag.js processes
    // `arguments` objects pushed to dataLayer, NOT plain arrays.
    window.dataLayer = window.dataLayer || [];
    function gtagPush(..._args: unknown[]): void {
      // eslint-disable-next-line prefer-rest-params
      (window.dataLayer as unknown[]).push(arguments);
    }
    gtagPush('event', 'page_view', {
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname]);

  return null;
}
