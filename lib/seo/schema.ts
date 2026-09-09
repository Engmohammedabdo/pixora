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
import { AREA_SERVED, ORGANIZATION_ALTERNATE_NAMES, SOCIAL_PROFILES } from '@/lib/seo/profiles';
import { faqParams } from '@/lib/landing/faq-params';
import arMessages from '@/messages/ar.json';
import enMessages from '@/messages/en.json';

// Exported 2026-09-09 for lib/seo/segment-schema.ts. A second copy of the origin
// is how two page families end up publishing two different canonical hosts.
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pyrasuite.pyramedia.cloud';

// The landing page's FaqSection (components/landing/FaqSection.tsx) renders a
// fixed set of 8 questions from the `landing.faq.q1..q8` / `a1..a8` keys —
// reading the same translated strings here (rather than a second hardcoded
// copy) is what keeps this schema from drifting out of sync with what's
// actually on the page.
const FAQ_COUNT = 8;

/**
 * The @id of each site-wide entity, minted ONCE.
 *
 * Every studio page's WebPage node points at these three by @id instead of
 * restating the entities (see lib/seo/studio-schema.ts for why that is the
 * deliberate shape). Until 2026-09-03 the pointers were hand-typed string
 * literals in that other file — byte-identical to these, and byte-identical by
 * nothing but care. A rename here would have left twenty pages referencing ids
 * nothing anywhere mints, which is the difference between a reference an engine
 * resolves site-wide and one that resolves nowhere at all.
 *
 * They are fragment ids on the bare origin, NOT on `/{locale}`: one entity, one
 * identifier, whichever locale an engine happened to fetch.
 */
export const ENTITY_IDS = {
  organization: `${APP_URL}/#organization`,
  website: `${APP_URL}/#website`,
  software: `${APP_URL}/#software`,
} as const;

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
  alternateName: string[];
  url: string;
  logo: string;
  description: string;
  sameAs: string[];
  areaServed: string[];
  contactPoint: { '@type': 'ContactPoint'; contactType: 'customer support'; url: string; availableLanguage: string[] };
}

interface SchemaOrgWebSite {
  '@type': 'WebSite';
  '@id': string;
  url: string;
  name: string;
  inLanguage: string[];
  publisher: { '@id': string };
}

interface SchemaOrgSoftwareApplication {
  '@type': 'SoftwareApplication';
  '@id': string;
  name: string;
  alternateName: string[];
  description: string;
  applicationCategory: 'BusinessApplication';
  applicationSubCategory: 'MarketingApplication';
  operatingSystem: 'Web';
  url: string;
  inLanguage: string[];
  isAccessibleForFree: true;
  featureList: string[];
  publisher: { '@id': string };
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

// The nine studios as the product names them: landing.studios.s1Name..s9Name,
// the same strings the landing page renders, so the schema cannot list a
// studio the page does not.
const STUDIO_FEATURES: Record<'ar' | 'en', string[]> = {
  ar: Array.from({ length: 9 }, (_, i) => (arMessages.landing.studios as Record<string, string>)[`s${i + 1}Name`]),
  en: Array.from({ length: 9 }, (_, i) => (enMessages.landing.studios as Record<string, string>)[`s${i + 1}Name`]),
};

export function buildOrganizationSchema(locale: string): SchemaOrgOrganization {
  const og = OG_CONTENT[toOgLocale(locale)];
  return {
    '@type': 'Organization',
    '@id': ENTITY_IDS.organization,
    name: 'PyraSuite',
    alternateName: [...ORGANIZATION_ALTERNATE_NAMES],
    // ONE url under ONE @id. It was `/{locale}`, so the same entity claimed two
    // different homepages depending on which page an engine fetched.
    url: APP_URL,
    // A real square icon, not the 1200x630 OpenGraph image.
    logo: `${APP_URL}/icon-512.png`,
    description: og.description,
    sameAs: [...SOCIAL_PROFILES],
    areaServed: [...AREA_SERVED],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      url: `${APP_URL}/${locale}/contact`,
      availableLanguage: ['ar', 'en'],
    },
  };
}

export function buildWebSiteSchema(locale: string): SchemaOrgWebSite {
  return {
    '@type': 'WebSite',
    '@id': ENTITY_IDS.website,
    url: `${APP_URL}/${locale}`,
    name: 'PyraSuite',
    inLanguage: ['ar', 'en'],
    publisher: { '@id': ENTITY_IDS.organization },
  };
}

export function buildSoftwareApplicationSchema(locale: string): SchemaOrgSoftwareApplication {
  const og = OG_CONTENT[toOgLocale(locale)];
  const isAr = locale === 'ar';
  return {
    '@type': 'SoftwareApplication',
    '@id': ENTITY_IDS.software,
    // The bare product name. The tagline lived here and became the entity's
    // name in every engine that read it.
    name: 'PyraSuite',
    alternateName: [...ORGANIZATION_ALTERNATE_NAMES],
    description: og.description,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'MarketingApplication',
    operatingSystem: 'Web',
    url: `${APP_URL}/${locale}`,
    inLanguage: ['ar', 'en'],
    isAccessibleForFree: true,
    featureList: STUDIO_FEATURES[isAr ? 'ar' : 'en'],
    publisher: { '@id': ENTITY_IDS.organization },
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

/**
 * Substitute every `{key}` this project defines for the landing FAQ, then refuse
 * to return a string that still carries one.
 *
 * The throw is the point. `next-intl` raises on an unknown ICU argument, so the
 * HTML reader fails loudly; this hand-rolled replace has no such behaviour and
 * would happily emit `{campaignFull}` into structured data, where nobody looks
 * until an answer engine quotes it back. `scripts/tests/schema.test.ts` calls
 * this for every question in both locales, so a message edit that adds a
 * placeholder without adding its value fails the BUILD rather than shipping.
 */
export function substituteFaqParams(text: string): string {
  let out = text;
  for (const [key, value] of Object.entries(faqParams())) {
    out = out.replaceAll(`{${key}}`, String(value));
  }
  const leftover = out.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/);
  if (leftover) {
    throw new Error(
      `landing FAQ carries an unsubstituted placeholder ${leftover[0]} — add it to lib/landing/faq-params.ts`
    );
  }
  return out;
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
        // The same params the FaqSection passes — from ONE module, so the two
        // substitution mechanisms over these strings cannot diverge. Reading
        // the raw message shipped the literal "{credits}" to every engine that
        // read the schema; substituting only that one placeholder would ship
        // the next one the same way.
        text: substituteFaqParams(faq[`a${n}`]),
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
  '@graph': [SchemaOrgOrganization, SchemaOrgWebSite, SchemaOrgSoftwareApplication, SchemaOrgFaqPage];
} {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildOrganizationSchema(locale),
      buildWebSiteSchema(locale),
      buildSoftwareApplicationSchema(locale),
      buildFaqSchema(locale),
    ],
  };
}
