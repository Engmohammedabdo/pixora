'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { fadeIn } from '@/lib/animations';

const NAV_LINKS = [
  { key: 'features', href: '#features' },
  { key: 'studios', href: '#studios' },
  { key: 'pricing', href: '#pricing' },
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
      className={`sticky top-0 z-header bg-[var(--color-surface)]/70 backdrop-blur-xl transition-[border-color] duration-300 ${
        scrolled ? 'border-b border-[var(--color-surface-2)]' : 'border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        {/* Logo */}
        <span className="text-2xl font-bold text-primary-600 font-cairo">PyraSuite</span>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors ${NAV_LINK_FOCUS}`}
            >
              {t(`nav.${link.key}`)}
            </a>
          ))}
        </div>

        {/* Desktop auth buttons */}
        <div className="hidden md:flex items-center gap-3">
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
            className="md:hidden overflow-hidden border-t border-[var(--color-surface-2)] bg-[var(--color-surface)]/95 backdrop-blur-xl"
          >
            <div className="px-4 py-4 space-y-3">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`block text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors py-2 ${NAV_LINK_FOCUS}`}
                >
                  {t(`nav.${link.key}`)}
                </a>
              ))}
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
