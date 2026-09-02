import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NavBar } from '@/components/landing/NavBar';
import { Footer } from '@/components/landing/Footer';
import { Shield } from 'lucide-react';
import { getLegalDoc } from '@/lib/legal/policy';
import { publicAlternates, publicOpenGraph } from '@/lib/seo/alternates';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // These two pages carry hardcoded Arabic and read NO translations (their own
  // headers say so), so the metadata gets its own small namespace.
  const t = await getTranslations({ locale, namespace: 'seo.privacy' });
  const title = t('title');
  const description = t('description');
  return {
    title,
    description,
    alternates: publicAlternates(locale, '/privacy'),
    openGraph: publicOpenGraph(locale, { title, description, path: '/privacy' }),
  };
}

// Legal copy changes rarely and never per-visitor — see the landing page's
// `revalidate` note for why marketing-tier routes are cacheable. A day-long
// window is fine here since updates go through a deploy anyway.
export const revalidate = 86400;

/**
 * REWRITTEN 2026-08-29, for two reasons that were both measured.
 *
 * 1. THIS PAGE SERVED ARABIC ON /en. Every string was hardcoded Arabic with no
 *    `getTranslations` call anywhere in the file, so an English visitor — and an
 *    English-speaking ad reviewer — got a document they could not read.
 *
 * 2. IT DISCLOSED NO TRACKING AT ALL. Grep for cookie / كوكي / pixel / بكسل /
 *    analytics / Meta / Google over the old file returned ZERO matches, while
 *    `app/[locale]/layout.tsx` mounts GoogleAnalytics, MetaPixel and
 *    PageViewTracker on every landing view and the pixel plants `_fbp`/`_fbc`.
 *    A privacy policy that does not disclose live tracking is the specific thing
 *    a manual ad reviewer opens, and the penalty is a domain or ad-account flag
 *    that follows every future campaign — not a single rejected ad.
 *
 * The prose now lives in `lib/legal/policy.ts`; that module's header explains why
 * long-form legal text is a deliberate exception to this repo's i18n convention.
 */
export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);

  const doc = getLegalDoc(locale, 'privacy');

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <NavBar />
      <div className="p-6 max-w-3xl mx-auto space-y-6 pt-28">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary-500" />
          <h1 className="text-2xl font-bold font-cairo">{doc.title}</h1>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">{doc.updated}</p>
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">{doc.intro}</p>

        {doc.sections.map((section) => (
          <Card key={section.heading}>
            <CardHeader>
              <CardTitle className="text-base">{section.heading}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-relaxed space-y-2">
              {section.body.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardContent className="text-sm leading-relaxed pt-6">
            <p>
              {doc.contact.note}{' '}
              <Link href="/contact" className="text-[var(--color-link)] hover:underline">
                {doc.contact.linkLabel}
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
}
