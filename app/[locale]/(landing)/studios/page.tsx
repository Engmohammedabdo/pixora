import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { NavBar } from '@/components/landing/NavBar';
import { Footer } from '@/components/landing/Footer';
import { JsonLd } from '@/components/seo/JsonLd';
import { Badge } from '@/components/ui/badge';
import { Link, routing } from '@/i18n/routing';
import { publicAlternates, publicOpenGraph } from '@/lib/seo/alternates';
import { buildStudioIndexSchema } from '@/lib/seo/studio-schema';
import { STUDIO_SLUGS, type StudioSlug } from '@/lib/studios/catalogue';
import { studioCostLabel } from '@/lib/studios/cost-label';
import { getVoiceoverConfig } from '@/lib/credits/voiceover-costs';
import { PLANS } from '@/lib/stripe/plans';
import { StudioCta } from '@/components/studios/public/StudioCta';

/**
 * The index of the nine.
 *
 * A SERVER component, like the nine pages under it: its whole job is to be HTML
 * a crawler and an answer engine can read. The only client code on it is the
 * shared NavBar and Footer.
 *
 * It exists for two separate reasons and would be worth building for either.
 * For a visitor it is the one page that answers "what does this thing actually
 * do, and what does each part cost" without a signup. For a crawler it is the
 * hub: the nine pages link to two siblings each (`catalogue.related`) but had
 * no page above them, so the set had no entry point except the sitemap and one
 * anchor on the landing page.
 *
 * The nine come from STUDIO_SLUGS in catalogue order — never a second list.
 * That is the whole reason the catalogue exists, and `video` is absent from it
 * deliberately (it is in types/studios.ts and CLAUDE.md's "Not built" table),
 * so no card here can advertise a studio the product does not have.
 */
export function generateStaticParams(): { locale: string }[] {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  setRequestLocale(locale);
  const s = await getTranslations({ locale, namespace: 'studios.shared' });
  const title = s('indexMetaTitle');
  const description = s('indexMetaDescription');
  return {
    title,
    description,
    alternates: publicAlternates(locale, '/studios'),
    openGraph: publicOpenGraph(locale, { title, description, path: '/studios' }),
  };
}

export default async function StudiosIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const s = await getTranslations({ locale, namespace: 'studios.shared' });

  // Voiceover's two price bands, read from the table that actually charges.
  // 'free' and 'pro' are representatives, not the whole list: starter shares
  // free's unit and business and agency share pro's, which is why the copy
  // names the bands and not five plans.
  const voiceoverFree = getVoiceoverConfig('free');
  const voiceoverPaid = getVoiceoverConfig('pro');
  const costLabels = {
    unit: s('creditUnit'),
    free: s('freeLabel'),
    perImage: s('perImage'),
    perShoot: s('perShoot'),
    perDuration: s('perDuration', {
      freeCredits: voiceoverFree.creditsPerUnit,
      freeSeconds: voiceoverFree.unitSeconds,
      paidCredits: voiceoverPaid.creditsPerUnit,
      paidSeconds: voiceoverPaid.unitSeconds,
    }),
  };

  // Resolved in one pass so the cards and the ItemList are built from the same
  // array: a JSON-LD list that names nine studios the page does not show is a
  // structured-data mismatch, and it is the kind that only a crawler ever sees.
  const studios: { slug: StudioSlug; name: string; tagline: string; cost: string }[] = [];
  for (const slug of STUDIO_SLUGS) {
    const t = await getTranslations({ locale, namespace: `studios.${slug}` });
    studios.push({
      slug,
      name: t('name'),
      tagline: t('tagline'),
      cost: studioCostLabel(slug, costLabels),
    });
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <JsonLd data={buildStudioIndexSchema(locale, s('indexTitle'), s('indexMetaDescription'), studios)} />
      <NavBar />
      <main>
        <header className="mx-auto max-w-3xl px-6 pt-16 pb-10 text-center">
          <h1 className="font-cairo text-3xl sm:text-4xl font-bold text-[var(--color-text-primary)]">
            {s('indexTitle')}
          </h1>
          <p className="mt-4 text-lg text-[var(--color-text-secondary)]">{s('indexSubtitle')}</p>
        </header>

        <div className="mx-auto max-w-6xl px-6">
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {studios.map((studio) => (
              <li key={studio.slug}>
                <Link
                  href={`/studios/${studio.slug}`}
                  className="flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  <h2 className="font-semibold text-[var(--color-text-primary)]">{studio.name}</h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                    {studio.tagline}
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-xs">
                    <span className="text-[var(--color-text-muted)]">{s('costLabel')}</span>
                    <Badge variant="secondary">{studio.cost}</Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <StudioCta
          title={s('ctaTitle')}
          body={s('ctaBody', { credits: PLANS.free.credits })}
          button={s('ctaButton')}
          pricing={s('seePricing')}
        />
      </main>
      <Footer />
    </div>
  );
}
