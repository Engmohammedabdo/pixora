import type { Metadata } from 'next';
import { fontVariables } from '@/app/fonts';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { DirectionProvider } from '@radix-ui/react-direction';
import { routing } from '@/i18n/routing';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { MetaPixel } from '@/components/analytics/MetaPixel';
import { PageViewTracker } from '@/components/analytics/PageViewTracker';
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

// The three loader calls that stood here moved to app/fonts.ts on 2026-08-24,
// unchanged. They are needed by three documents now, not one: this file no
// longer supplies the <html> for /admin/* or for the top-level 404, because it
// never did — it only appeared to, via a merge that discarded everything except
// `class`. See app/fonts.ts and the note in app/layout.tsx.

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
    // No site-wide canonical here. The locale-root default that stood in this
    // block told Google six public pages were duplicates of the landing page;
    // every public page now derives its own from lib/seo/alternates.ts.
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
      url: `${APP_URL}/${locale}`,
      locale: isAr ? 'ar_AE' : 'en_US',
      alternateLocale: [isAr ? 'en_US' : 'ar_AE'],
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
      className={fontVariables}
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
        {/* Outside the provider tree on purpose — they need no locale, no theme
            and no query client, and keeping them last means the tags can never
            delay hydration of the app itself. PageViewTracker and MetaPixel
            read only usePathname — no auth, no query client — which is what
            makes them safe to mount HERE, unlike AnalyticsIdentity (see the
            2026-08-25 two-<html> regression in CLAUDE.md for what mounting the
            wrong component in this layout did). Verified by test:built-document. */}
        <GoogleAnalytics />
        <MetaPixel />
        <PageViewTracker />
      </body>
    </html>
  );
}
