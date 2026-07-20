import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

const STUDIO_LINKS = [
  { key: 'studio1', href: '/#studios' },
  { key: 'studio2', href: '/#studios' },
  { key: 'studio3', href: '/#studios' },
  { key: 'studio4', href: '/#studios' },
] as const;

const SUPPORT_LINKS = [
  { key: 'pricing', href: '/pricing' },
  { key: 'faq', href: '/#faq' },
] as const;

const LEGAL_LINKS = [
  { key: 'privacy', href: '/privacy' },
  { key: 'terms', href: '/terms' },
] as const;

export function Footer(): React.ReactElement {
  const t = useTranslations('landing');

  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] py-12 px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Column 1: Brand */}
          <div>
            <h3 className="text-lg font-bold font-cairo text-[var(--color-text-primary)] mb-1">
              PyraSuite
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-2">
              {t('footer.tagline1')}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              {t('footer.tagline2')}
            </p>
          </div>

          {/* Column 2: Studios */}
          <div>
            <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
              {t('footer.studiosTitle')}
            </h4>
            <ul className="space-y-2">
              {STUDIO_LINKS.map((link) => (
                <li key={link.key}>
                  <Link
                    href={link.href}
                    className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    {t(`footer.${link.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Support */}
          <div>
            <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
              {t('footer.supportTitle')}
            </h4>
            <ul className="space-y-2">
              {SUPPORT_LINKS.map((link) => (
                <li key={link.key}>
                  <Link
                    href={link.href}
                    className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    {t(`footer.${link.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Legal */}
          <div>
            <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
              {t('footer.legalTitle')}
            </h4>
            <ul className="space-y-2">
              {LEGAL_LINKS.map((link) => (
                <li key={link.key}>
                  <Link
                    href={link.href}
                    className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    {t(`footer.${link.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[var(--color-border)] pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            {t('footer.copyright')}
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            {t('footer.poweredBy')}
          </p>
        </div>
      </div>
    </footer>
  );
}
