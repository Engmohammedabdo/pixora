'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { LocaleSwitcher } from '@/components/shared/LocaleSwitcher';
import { Menu, X } from 'lucide-react';
import { fadeIn } from '@/lib/animations';

// EVERY entry here is a real destination from EVERY page. It was not: until
// 2026-09-03 `features` and `studios` were bare in-page fragments, and the
// comment that stood here said that was fine because "those sections only exist
// on the landing page". That was true when this component was landing-only. It
// stopped being true when app/[locale]/(landing)/studios/[slug]/page.tsx:4 and
// studios/page.tsx:3 started rendering <NavBar/> themselves: the live audit
// measured `href="#studios"` present and `id="studios"` absent on all 20 studio
// pages (and on /pricing, /privacy, /terms), so two of the three content links
// did NOTHING when clicked — including the one labelled "Studios", on the
// studios pages. A bare fragment resolves inside the CURRENT document; it does
// not fall back to the landing page.
//
//   features -> "/#features"  next-intl renders /ar#features: it scrolls on the
//               landing page and navigates there from anywhere else.
//   studios  -> "/studios"    A PRODUCT DECISION, taken here deliberately.
//               /studios is a real, indexable page whose entire subject is that
//               word — the hub of the nine, built 2026-09-02. Pointing the nav
//               item at it fixes the dead link and, in the same edit, the
//               "nothing outside the nine studio pages links to the index" gap
//               CLAUDE.md records as open. The cost is that on the landing page
//               this now navigates instead of scrolling to the showcase; the
//               showcase section keeps its #studios id and the footer still
//               links to it, and a destination that always works beats a scroll
//               that works on one page in twenty-six.
//   pricing  -> "/pricing"    unchanged: a real, linkable, indexable page with
//               the full per-action credit cost table, which the #pricing
//               anchor could never show without overwhelming the landing page.
//               The embedded PricingSection (#pricing) still lives there for
//               anyone scrolling past it organically.
const NAV_LINKS = [
  { key: 'features', href: '/#features' },
  { key: 'studios', href: '/studios' },
  { key: 'pricing', href: '/pricing' },
] as const;

const NAV_LINK_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md';

export function NavBar(): React.ReactElement {
  const t = useTranslations('landing');
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  return (
    <motion.nav
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className={`sticky top-0 z-header bg-[color-mix(in_srgb,var(--color-surface)_70%,transparent)] backdrop-blur-xl transition-[border-color] duration-300 ${
        scrolled ? 'border-b border-[var(--color-surface-2)]' : 'border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        {/* Wordmark. A LINK, not a <span>: it is the only route home from the
            header, and on a studio page the JSON-LD BreadcrumbList already
            declares position 1 as the locale root — a hierarchy the HTML did
            not implement on any of the 20 pages until this became an anchor. */}
        <Link href="/" className={`text-2xl font-bold text-[var(--color-brand)] font-cairo ${NAV_LINK_FOCUS}`}>
          PyraSuite
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors ${NAV_LINK_FOCUS}`}
            >
              {t(`nav.${link.key}`)}
            </Link>
          ))}
        </div>

        {/* Desktop auth buttons */}
        <div className="hidden md:flex items-center gap-3">
          <LocaleSwitcher />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">{t('nav.login')}</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/signup">{t('nav.signup')}</Link>
          </Button>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-lg hover:bg-[var(--color-surface-2)] transition-colors"
          aria-label={t('nav.menuLabel')}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden border-t border-[var(--color-surface-2)] bg-[color-mix(in_srgb,var(--color-surface)_95%,transparent)] backdrop-blur-xl"
          >
            <div className="px-4 py-4 space-y-3">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors py-2 ${NAV_LINK_FOCUS}`}
                >
                  {t(`nav.${link.key}`)}
                </Link>
              ))}
              <LocaleSwitcher
                variant="link"
                className="py-2"
                onNavigate={() => setMobileOpen(false)}
              />
              <div className="flex items-center gap-3 pt-2 border-t border-[var(--color-surface-2)]">
                <Button variant="ghost" size="sm" className="flex-1" asChild>
                  <Link href="/login">{t('nav.login')}</Link>
                </Button>
                <Button size="sm" className="flex-1" asChild>
                  <Link href="/signup">{t('nav.signup')}</Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
