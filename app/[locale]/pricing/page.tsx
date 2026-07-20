import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NavBar } from '@/components/landing/NavBar';
import { Footer } from '@/components/landing/Footer';
import { FaqSection } from '@/components/landing/FaqSection';
import PricingSection from '@/components/landing/PricingSection';
import { StudioCostTable } from '@/components/pricing/StudioCostTable';
import { TopupGrid } from '@/components/pricing/TopupGrid';
import { JsonLd } from '@/components/seo/JsonLd';
import { buildStructuredData } from '@/lib/seo/schema';
import { Badge } from '@/components/ui/badge';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricingPage.meta' });

  return {
    title: t('title'),
    description: t('description'),
    alternates: {
      canonical: `${APP_URL}/${locale}/pricing`,
      languages: {
        ar: `${APP_URL}/ar/pricing`,
        en: `${APP_URL}/en/pricing`,
      },
    },
    openGraph: {
      title: t('title'),
      description: t('description'),
      url: `${APP_URL}/${locale}/pricing`,
    },
  };
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pricingPage.hero' });
  const structuredData = buildStructuredData(locale);

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <JsonLd data={structuredData} />
      <NavBar />

      <section className="py-16 px-6 text-center">
        <div className="mx-auto max-w-2xl">
          <Badge variant="secondary" className="mb-4">
            {t('badge')}
          </Badge>
          <h1 className="mb-4 font-cairo text-4xl font-bold text-[var(--color-text-primary)]">
            {t('title')}
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)]">{t('subtitle')}</p>
          <p className="mt-3 text-sm text-[var(--color-brand)] font-medium">{t('refundNote')}</p>
        </div>
      </section>

      <PricingSection />
      <StudioCostTable />
      <TopupGrid />
      <FaqSection />
      <Footer />
    </div>
  );
}
