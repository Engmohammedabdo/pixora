'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { fadeIn } from '@/lib/animations';

const NAV_LINKS = [
  { label: 'المميزات', href: '#features' },
  { label: 'الاستوديوهات', href: '#studios' },
  { label: 'الأسعار', href: '#pricing' },
];

export function NavBar(): React.ReactElement {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.nav
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className={`sticky top-0 z-50 bg-[var(--color-surface)]/70 backdrop-blur-xl transition-[border-color] duration-300 ${
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
              className="text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop auth buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">تسجيل الدخول</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/signup">إنشاء حساب</Link>
          </Button>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-lg hover:bg-[var(--color-surface-2)] transition-colors"
          aria-label="القائمة"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="md:hidden border-t border-[var(--color-surface-2)] bg-[var(--color-surface)]/95 backdrop-blur-xl"
        >
          <div className="px-4 py-4 space-y-3">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors py-2"
              >
                {link.label}
              </a>
            ))}
            <div className="flex items-center gap-3 pt-2 border-t border-[var(--color-surface-2)]">
              <Button variant="ghost" size="sm" className="flex-1" asChild>
                <Link href="/login">تسجيل الدخول</Link>
              </Button>
              <Button size="sm" className="flex-1" asChild>
                <Link href="/signup">إنشاء حساب</Link>
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </motion.nav>
  );
}
