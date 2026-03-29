import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import '../globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Pixora — منصة التسويق بالذكاء الاصطناعي',
    template: '%s | Pixora',
  },
  description: 'المنصة العربية الأولى للتسويق بالذكاء الاصطناعي — 9 استوديوهات، نماذج AI متعددة، واجهة عربية.',
  keywords: ['تسويق', 'ذكاء اصطناعي', 'AI marketing', 'Pixora', 'حملات تسويقية', 'تصميم', 'صور AI'],
  authors: [{ name: 'Pixora' }],
  openGraph: {
    type: 'website',
    siteName: 'Pixora',
    title: 'Pixora — منصة التسويق بالذكاء الاصطناعي',
    description: 'حوّل أي فكرة لحملة تسويقية احترافية في دقائق — 9 استوديوهات AI، واجهة عربية، نظام كريدت شفاف.',
    locale: 'ar_SA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pixora — AI Marketing Platform',
    description: 'المنصة العربية الأولى للتسويق بالذكاء الاصطناعي',
  },
  robots: {
    index: true,
    follow: true,
  },
};

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

  const messages = (await import(`../../messages/${locale}.json`)).default;
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
