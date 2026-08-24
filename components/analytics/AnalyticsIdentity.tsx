'use client';

import { useEffect, useRef } from 'react';
import { useUser } from '@/hooks/useUser';

/**
 * Attaches WHO to the GA4 session: a stable user id, plus the two user
 * properties every product question turns out to need — which plan they are on
 * and which language they use.
 *
 * ── WHERE THIS IS MOUNTED, AND THE BUILD THAT DECIDED IT ───────────────────
 * app/[locale]/(dashboard)/layout.tsx — the authenticated tree only.
 *
 * It was first put in app/[locale]/layout.tsx, to cover both locales the way
 * <GoogleAnalytics /> does. Measured against the production build, that broke the
 * two pages the product can least afford to lose:
 *
 *   .next/server/app/ar.html   2 <html> start tags, and NO GA tag at all
 *   .next/server/app/en.html   2 <html> start tags
 *
 * i.e. the Arabic landing page — the URL a launch announcement points at — shipped
 * with no analytics whatsoever, and both landing pages regressed the exact
 * two-document defect app/layout.tsx exists to document. The other 60 prerendered
 * artifacts were unaffected, which is what makes this shape so easy to miss: the
 * build exits 0, tsc and eslint are clean, and all 15 invariants pass.
 *
 * Reverting the layout edit alone restored both pages to one <html> and a present
 * GA tag, so the cause is not in doubt. It is not worth chasing further, because
 * the authenticated tree is where this belongs on the merits: a logged-out
 * marketing page has no user id and no plan to report, so mounting an auth-reading
 * component there bought nothing and put a Supabase client on every public page.
 *
 * ── WHY A CLIENT COMPONENT AND NOT THE LAYOUT ──────────────────────────────
 * The obvious version reads the profile in app/[locale]/layout.tsx and passes the
 * plan into the tag. That would be wrong here: touching auth in the root layout
 * calls cookies(), which opts the whole segment out of static rendering, and
 * app/[locale]/layout.tsx:16-25 records deliberately paying a cost to keep 129
 * pages prerendered. One analytics dimension is not worth turning the marketing
 * site dynamic.
 *
 * useUser() is free here instead of cheap: it is a shared React Query entry
 * already mounted by ~18 components on an authenticated page (see the comment in
 * hooks/useUser.ts), so this adds no request. On a logged-out marketing page the
 * query resolves to null and this renders nothing and sets nothing.
 *
 * ── WHAT YOU MUST DO IN GA4 FOR THESE TO BE VISIBLE ────────────────────────
 * `plan` and `app_locale` are collected the moment this ships, but a custom
 * user property does NOT appear in any report until it is registered at
 * GA4 -> Admin -> Custom definitions -> User-scoped custom dimensions.
 * Unregistered, it is still stored and still queryable from BigQuery and the Data
 * API — it is simply absent from the UI, which reads as "the tag is broken".
 *
 * `user_id` needs no registration and is what joins a visitor's phone session to
 * their laptop one. It is a Supabase UUID: an opaque identifier we already hold,
 * never an email or anything else that would put personal data in GA4.
 *
 * ── WHY `set` AND NOT A SECOND `config` ────────────────────────────────────
 * Re-running gtag('config', ID, {user_id}) fires ANOTHER page_view, so every
 * authenticated page load would be counted twice. gtag('set', ...) applies to
 * every subsequent event and sends none of its own.
 */

type GtagFn = (command: string, ...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

export function AnalyticsIdentity(): null {
  const { user, profile } = useUser();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const locale =
      typeof window !== 'undefined' ? window.location.pathname.split('/')[1] || 'ar' : 'ar';
    const plan = profile?.plan_id || 'free';

    // The identity is stable for the whole session, and useUser() re-renders on
    // every cache touch. Without this guard the same three values would be
    // re-sent on each one — harmless to GA4, but it makes the dataLayer
    // impossible to read when something does go wrong.
    const fingerprint = `${user.id}|${plan}|${locale}`;
    if (lastSent.current === fingerprint) return;

    // The tag is absent in development and for anyone running a blocker. That is
    // the normal case, not an error — there is nothing to warn about.
    if (typeof window.gtag !== 'function') return;

    lastSent.current = fingerprint;
    window.gtag('set', { user_id: user.id });
    window.gtag('set', 'user_properties', { plan, app_locale: locale });
  }, [user, profile]);

  return null;
}
