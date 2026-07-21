import type { Metadata } from 'next';
import { Cairo, Tajawal, Inter } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DirectionProvider } from '@radix-ui/react-direction';
import { routing } from '@/i18n/routing';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { OG_CONTENT } from '@/lib/seo/og-content';
import '../globals.css';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';

/**
 * Without this, `[locale]` is an unknown dynamic segment at build time, so Next
 * has nothing to prerender and every route stays `ƒ (Dynamic)` — `revalidate`
 * and `setRequestLocale()` alone are NOT enough, as the build output proved.
 * Enumerating the locales is what actually makes the public pages eligible for
 * static/ISR rendering.
 */
export function generateStaticParams(): { locale: string }[] {
  return routing.locales.map((locale) => ({ locale }));
}

// Self-hosted via next/font — fetched and served from our own origin at
// build time, so there is no runtime request to the Google Fonts CDN, and
// next/font auto-generates a size-adjusted fallback so there is no layout
// shift when the real face swaps in. Weights match the previous @import
// exactly so no typography regresses.
const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-cairo',
});

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-tajawal',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isAr = locale === 'ar';
  const og = isAr ? OG_CONTENT.ar : OG_CONTENT.en;

  return {
    metadataBase: new URL(APP_URL),
    title: {
      default: og.title,
      template: '%s | PyraSuite',
    },
    // Search engines had no signal at all for which URL is canonical or which
    // locale variant to serve — this is the site-wide default (locale root),
    // built from the locale segment alone since layout.tsx only receives
    // `params`, not the full pathname. Route-specific pages that define their
    // own `generateMetadata` (e.g. /pricing) override this with a page-exact
    // canonical; everything else inherits this locale-root default rather
    // than emitting no canonical tag at all.
    alternates: {
      canonical: `${APP_URL}/${locale}`,
      languages: {
        ar: `${APP_URL}/ar`,
        en: `${APP_URL}/en`,
        'x-default': `${APP_URL}/ar`,
      },
    },
    description: isAr
      // Was "نماذج AI متعددة" ("multiple AI models") — broke the Pyra persona rule in
      // CLAUDE.md (never name models to the user) on the very first sentence Google
      // shows. Now mirrors the English description's "transparent credit system" line.
      ? 'المنصة العربية الأولى للتسويق بالذكاء الاصطناعي — 9 استوديوهات بقوة بايرا 🦊، ونظام كريدت شفاف.'
      : 'Turn any idea into a complete marketing campaign in minutes — 9 AI studios powered by the Pyra AI engine, with a transparent credit system.',
    keywords: isAr
      ? ['تسويق', 'ذكاء اصطناعي', 'AI marketing', 'PyraSuite', 'حملات تسويقية', 'تصميم', 'صور AI']
      : ['AI marketing', 'PyraSuite', 'marketing campaigns', 'AI images', 'ad design', 'Pyra AI', 'Arabic marketing'],
    authors: [{ name: 'PyraSuite' }],
    openGraph: {
      type: 'website',
      siteName: 'PyraSuite',
      title: og.title,
      description: og.description,
      locale: isAr ? 'ar_SA' : 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: og.title,
      description: og.description,
    },
    robots: {
      index: true,
      follow: true,
    },
    manifest: '/manifest.json',
  };
}

interface RootLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function RootLayout({
  children,
  params,
}: RootLayoutProps): Promise<React.ReactElement> {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Registers the locale for this request in next-intl's request-scoped cache
  // BEFORE any descendant Server Component resolves translations without an
  // explicit locale (e.g. Footer.tsx, StudioCostTable.tsx, TopupGrid.tsx all
  // call `useTranslations()` server-side with no locale argument). Without
  // this, that lookup falls back to reading a `next/headers` header, and any
  // use of `headers()`/`cookies()` anywhere in a route's render tree forces
  // Next.js to fully opt the ENTIRE route out of static/ISR rendering — which
  // is exactly why public, non-personalized pages (landing, pricing) were
  // being rendered fresh on every single request in production. This call
  // makes those routes eligible for the `revalidate` caching they declare.
  // See https://next-intl.dev/docs/routing/setup#static-rendering
  setRequestLocale(locale);

  const messages = (await import(`../../messages/${locale}.json`)).default;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${cairo.variable} ${tajawal.variable} ${inter.variable}`}
    >
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <DirectionProvider dir={dir}>
            <ThemeProvider>
              <QueryProvider>
                {children}
                <ToastProvider />
              </QueryProvider>
            </ThemeProvider>
          </DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
