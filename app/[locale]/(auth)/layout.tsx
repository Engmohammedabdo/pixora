import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { LocaleSwitcher } from '@/components/shared/LocaleSwitcher';

/**
 * Auth pages are per-visitor by nature — they read `useSearchParams()` (invite
 * codes, post-checkout redirects, error flags) and must never be served from a
 * prerendered HTML file. Declaring that here keeps them out of the static export
 * that `generateStaticParams()` in the parent [locale] layout now enables for the
 * public marketing pages. Without this, the build fails prerendering /en/signup.
 */
export const dynamic = 'force-dynamic';

interface AuthLayoutProps {
  children: React.ReactNode;
}

/**
 * These pages used to be a bare card floating on an empty background — no
 * wordmark, no navigation, nothing tying them to the product. That was survivable
 * while /signup was only reached from inside the site, but it is now a page
 * strangers land on directly: it is what the invite gate shows anyone who arrives
 * without an invite, and what a search result for the product leads to.
 *
 * An unbranded form asking for an email and a password, on a blank page, is the
 * shape of a phishing screen. The wordmark and the legal row are the cheapest way
 * to look like the company the visitor thinks they are dealing with.
 *
 * Deliberately quiet: no hero, no marketing. Someone here is trying to get in or
 * get help, and everything else is in the way.
 */
export default async function AuthLayout({ children }: AuthLayoutProps): Promise<React.ReactElement> {
  const t = await getTranslations('landing');

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <Link
          href="/"
          className="mb-8 rounded-md font-cairo text-2xl font-bold text-[var(--color-brand)] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          PyraSuite
        </Link>

        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      <footer className="px-4 pb-8">
        {/* Someone arriving here from an English invite email lands on /ar/signup,
            because ar is the default locale. Without this they had no way to switch
            except editing the URL — and doing that by hand drops the ?invite= token
            the live gate requires. LocaleSwitcher carries the query across. */}
        <div className="mb-4 flex justify-center">
          <LocaleSwitcher variant="link" />
        </div>

        <nav
          aria-label={t('footer.legalTitle')}
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[var(--color-text-muted)]"
        >
          <Link href="/contact" className="hover:text-[var(--color-text-secondary)] hover:underline">
            {t('footer.contact')}
          </Link>
          <Link href="/privacy" className="hover:text-[var(--color-text-secondary)] hover:underline">
            {t('footer.privacy')}
          </Link>
          <Link href="/terms" className="hover:text-[var(--color-text-secondary)] hover:underline">
            {t('footer.terms')}
          </Link>
        </nav>
      </footer>
    </div>
  );
}
