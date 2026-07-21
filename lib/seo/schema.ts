/**
 * JSON-LD structured data builders.
 *
 * Single source of truth so the landing page and the public pricing page
 * emit identical Organization/SoftwareApplication nodes rather than two
 * hand-rolled copies that drift. Prices come straight from `PLANS`
 * (lib/stripe/plans.ts) — never hardcoded here — so the schema can never
 * disagree with what Stripe actually charges.
 */
import { PLANS } from '@/lib/stripe/plans';
import { OG_CONTENT, type OgLocale } from '@/lib/seo/og-content';
import arMessages from '@/messages/ar.json';
import enMessages from '@/messages/en.json';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';

// The landing page's FaqSection (components/landing/FaqSection.tsx) renders a
// fixed set of 8 questions from the `landing.faq.q1..q8` / `a1..a8` keys —
// reading the same translated strings here (rather than a second hardcoded
// copy) is what keeps this schema from drifting out of sync with what's
// actually on the page.
const FAQ_COUNT = 8;

export function toOgLocale(locale: string): OgLocale {
  return locale === 'ar' ? 'ar' : 'en';
}

interface SchemaOrgOffer {
  '@type': 'Offer';
  name: string;
  price: string;
  priceCurrency: 'USD';
  url: string;
  category: string;
}

interface SchemaOrgOrganization {
  '@type': 'Organization';
  '@id': string;
  name: string;
  url: string;
  logo: string;
  description: string;
}

interface SchemaOrgSoftwareApplication {
  '@type': 'SoftwareApplication';
  '@id': string;
  name: string;
  description: string;
  applicationCategory: string;
  operatingSystem: string;
  url: string;
  offers: SchemaOrgOffer[];
}

interface SchemaOrgQuestion {
  '@type': 'Question';
  name: string;
  acceptedAnswer: {
    '@type': 'Answer';
    text: string;
  };
}

interface SchemaOrgFaqPage {
  '@type': 'FAQPage';
  '@id': string;
  mainEntity: SchemaOrgQuestion[];
}

export function buildOrganizationSchema(locale: string): SchemaOrgOrganization {
  const og = OG_CONTENT[toOgLocale(locale)];
  return {
    '@type': 'Organization',
    '@id': `${APP_URL}/#organization`,
    name: 'PyraSuite',
    url: `${APP_URL}/${locale}`,
    // Reuses the already-generated OG image route rather than a fabricated
    // logo file — there is no /public logo asset to point at honestly.
    logo: `${APP_URL}/${locale}/opengraph-image`,
    description: og.description,
  };
}

export function buildSoftwareApplicationSchema(locale: string): SchemaOrgSoftwareApplication {
  const og = OG_CONTENT[toOgLocale(locale)];
  const isAr = locale === 'ar';
  return {
    '@type': 'SoftwareApplication',
    '@id': `${APP_URL}/#software`,
    name: og.title,
    description: og.description,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: `${APP_URL}/${locale}`,
    // Prices are read live from PLANS — this can never drift from what
    // Stripe actually charges (see lib/stripe/plans.ts).
    offers: Object.values(PLANS).map((plan) => ({
      '@type': 'Offer' as const,
      name: isAr ? plan.nameAr : plan.name,
      price: plan.price.toString(),
      priceCurrency: 'USD' as const,
      url: `${APP_URL}/${locale}/pricing`,
      category: 'SaaS subscription',
    })),
  };
}

export function buildFaqSchema(locale: string): SchemaOrgFaqPage {
  // Cast rather than a second type declaration for the messages shape: these
  // are the same next-intl message files used everywhere else, and `faq.qN`/
  // `aN` are always plain strings.
  const messages = locale === 'ar' ? arMessages : enMessages;
  const faq = messages.landing.faq as Record<string, string>;

  const mainEntity: SchemaOrgQuestion[] = Array.from({ length: FAQ_COUNT }, (_, i) => {
    const n = i + 1;
    return {
      '@type': 'Question' as const,
      name: faq[`q${n}`],
      acceptedAnswer: {
        '@type': 'Answer' as const,
        text: faq[`a${n}`],
      },
    };
  });

  return {
    '@type': 'FAQPage',
    '@id': `${APP_URL}/${locale}/#faq`,
    mainEntity,
  };
}

export function buildStructuredData(locale: string): {
  '@context': 'https://schema.org';
  '@graph': [SchemaOrgOrganization, SchemaOrgSoftwareApplication, SchemaOrgFaqPage];
} {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildOrganizationSchema(locale),
      buildSoftwareApplicationSchema(locale),
      buildFaqSchema(locale),
    ],
  };
}
