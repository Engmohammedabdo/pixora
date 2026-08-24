'use client';

import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, routing, usePathname } from '@/i18n/routing';

/**
 * The public-facing language switch.
 *
 * Until this component existed, the ONLY way to change language anywhere in the
 * product was `components/layout/TopBar.tsx` and the settings page — both of
 * which live under `app/[locale]/(dashboard)/`, i.e. behind the login. Every
 * logged-out surface (the landing page, /pricing, /waitlist, /contact, /terms,
 * /privacy and all four auth pages) shipped with no switch at all, so a visitor
 * who landed on `/ar` — the default locale, and the URL a launch announcement
 * points at — could only reach the 863 translated English keys by hand-editing
 * the address bar.
 *
 * TWO THINGS THIS DOES DIFFERENTLY FROM TopBar, both because it renders in front
 * of the login rather than behind it:
 *
 * 1. It is an ANCHOR, not a `router.replace()` button. TopBar's button leaves no
 *    href in the HTML, which is harmless in an authenticated shell no crawler
 *    ever sees — and wrong here. `/en` is currently reachable from `/ar` only via
 *    the sitemap: there is no in-page path to it for a crawler OR for a person
 *    who wants to middle-click it. A real `<a href="/en/...">` fixes both, works
 *    with JavaScript disabled, and carries `hrefLang` for search engines.
 *
 * 2. It preserves the QUERY STRING. `usePathname()` from `@/i18n/routing` returns
 *    the path with the locale prefix already stripped and the query dropped, so
 *    the obvious `<Link href={pathname}>` would send someone on
 *    `/ar/signup?invite=XYZ` to `/en/signup` with no token — and the invite gate
 *    is live, so that signup is then REFUSED. `?ref=` (referrals) would be lost
 *    the same way. See app/[locale]/(auth)/signup/page.tsx:33,41.
 *
 * WHY THE QUERY IS READ IN AN EFFECT and not from `useSearchParams()`: that hook
 * forces any statically prerendered page containing it to bail out to
 * client-side rendering (or fail the build asking for a Suspense boundary), and
 * `app/[locale]/layout.tsx:24` deliberately enumerates locales precisely to keep
 * the marketing pages prerendered. Reading `window.location.search` after mount
 * costs nothing at build time and keeps a real href in the prerendered HTML.
 * The boundary that buys: the href tracks the query as of the last navigation,
 * not a query mutated in place by client-side code afterwards. Every case that
 * actually matters (an invite link, a referral link, `?error=` set by a redirect)
 * arrives as a navigation, so it is covered.
 *
 * The language NAMES come from the message files rather than being written here,
 * because `no-arabic-literals-in-tsx` fails the build on a new Arabic string in
 * source — TopBar.tsx:141 has one only because it predates the rule and sits in
 * scripts/invariants-baseline.json.
 */

interface LocaleSwitcherProps {
  /**
   * 'button' — a bordered control sized to sit beside nav actions.
   * 'link'   — plain text, for a footer or legal row.
   */
  variant?: 'button' | 'link';
  className?: string;
  /** Called on click, so a mobile menu can close itself. */
  onNavigate?: () => void;
}

const VARIANT_CLASS: Record<'button' | 'link', string> = {
  button:
    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ' +
    'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] ' +
    'hover:bg-[var(--color-surface-2)] transition-colors',
  link:
    'inline-flex items-center gap-1.5 text-sm rounded-md ' +
    'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] ' +
    'hover:underline transition-colors',
};

const FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

export function LocaleSwitcher({
  variant = 'button',
  className = '',
  onNavigate,
}: LocaleSwitcherProps): React.ReactElement {
  const t = useTranslations('localeSwitcher');
  const current = useLocale();
  const pathname = usePathname();
  const [query, setQuery] = useState<Record<string, string>>({});

  useEffect(() => {
    setQuery(Object.fromEntries(new URLSearchParams(window.location.search)));
  }, [pathname]);

  // Derived from routing.locales rather than a hardcoded ar<->en flip, so adding
  // a third locale to i18n/routing.ts surfaces it here instead of silently
  // leaving it unreachable — which is the exact failure this component exists
  // to fix, one level up.
  const targets = routing.locales.filter((locale) => locale !== current);

  return (
    <>
      {targets.map((locale) => {
        const name = t(`names.${locale}`);
        return (
          <Link
            key={locale}
            href={{ pathname, query }}
            locale={locale}
            hrefLang={locale}
            lang={locale}
            onClick={onNavigate}
            aria-label={`${t('label')}: ${name}`}
            className={`${VARIANT_CLASS[variant]} ${FOCUS_CLASS} ${className}`}
          >
            <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
            {name}
          </Link>
        );
      })}
    </>
  );
}
