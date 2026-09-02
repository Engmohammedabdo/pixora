import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { NavBar } from '@/components/landing/NavBar';
import { Footer } from '@/components/landing/Footer';
import { JsonLd } from '@/components/seo/JsonLd';
import { routing } from '@/i18n/routing';
import { publicAlternates, publicOpenGraph } from '@/lib/seo/alternates';
import { buildStudioSchema } from '@/lib/seo/studio-schema';
import { STUDIO_SLUGS, getStudio, type StudioSlug } from '@/lib/studios/catalogue';
import { getExamples } from '@/lib/studios/examples';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { PLANS } from '@/lib/stripe/plans';
import { StudioHero } from '@/components/studios/public/StudioHero';
import { StudioExamples } from '@/components/studios/public/StudioExamples';
import { BeforeAfter } from '@/components/studios/public/BeforeAfter';
import { StudioSteps } from '@/components/studios/public/StudioSteps';
import { StudioFaq } from '@/components/studios/public/StudioFaq';
import { StudioCta } from '@/components/studios/public/StudioCta';
import { StudioRelated } from '@/components/studios/public/StudioRelated';

/**
 * One public page per shipped studio, both locales, from lib/studios/catalogue.ts.
 *
 * A SERVER component with no client island of its own. The landing page ships
 * 265 kB of gzipped JS because all thirteen of its sections are client
 * components; the entire job of this page is to be HTML a crawler and an answer
 * engine can read, so the only client code it pulls is the shared NavBar.
 *
 * The slug list is the catalogue's, never a second copy — the whole reason the
 * catalogue exists. `video` is absent from it deliberately, so /studios/video
 * falls through generateStaticParams to notFound() and 404s.
 */
export function generateStaticParams(): { locale: string; slug: string }[] {
  return routing.locales.flatMap((locale) => STUDIO_SLUGS.map((slug) => ({ locale, slug })));
}

/**
 * The credit figure a page shows, built from lib/credits/costs.ts and never
 * from a translation. A price in a string is how the published number and the
 * charge drift apart — the reason the admin per-studio price knob was deleted.
 *
 * The one literal here is the photoshoot floor. `SHOT_COSTS` lives inside the
 * route (`app/api/studios/photoshoot/route.ts:29` — `{1:2, 3:4, 6:8}`) and is
 * not exported, so the floor cannot be imported; the ceiling is
 * `CREDIT_COSTS.photoshoot` and is. `landing.studios.s2Credits` already
 * publishes the same "2-8" range, so this agrees with what the product says
 * today rather than inventing a second figure.
 */
function costValue(
  slug: StudioSlug,
  unit: string,
  free: string,
  perImage: string,
  perShoot: string,
  perDuration: string,
): string {
  const entry = getStudio(slug);
  if (!entry) return '';
  switch (entry.costShape) {
    case 'free':
      return free;
    case 'imageRange':
      return `${CREDIT_COSTS.image['1080p']}–${CREDIT_COSTS.image['4K']} ${unit} · ${perImage}`;
    case 'shotRange':
      return `2–${CREDIT_COSTS.photoshoot} ${unit} · ${perShoot}`;
    case 'perDuration':
      return `${CREDIT_COSTS.voiceover}+ ${unit} · ${perDuration}`;
    case 'flat':
    default:
      return `${CREDIT_COSTS[entry.costKey] as number} ${unit}`;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!getStudio(slug)) return {};
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: `studios.${slug}` });
  const title = t('metaTitle');
  const description = t('metaDescription');
  return {
    title,
    description,
    alternates: publicAlternates(locale, `/studios/${slug}`),
    openGraph: publicOpenGraph(locale, { title, description, path: `/studios/${slug}` }),
  };
}

export default async function StudioPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<React.ReactElement> {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const entry = getStudio(slug);
  if (!entry) notFound();

  const t = await getTranslations({ locale, namespace: `studios.${entry.slug}` });
  const s = await getTranslations({ locale, namespace: 'studios.shared' });
  const loc = locale === 'en' ? 'en' : 'ar';

  const faq = [1, 2, 3].map((n) => ({ q: t(`q${n}`), a: t(`a${n}`) }));
  const cost = costValue(
    entry.slug,
    s('creditUnit'),
    s('freeLabel'),
    s('perImage'),
    s('perShoot'),
    s('perDuration'),
  );

  // The edit studio's page IS the pair — the same product, from the photo a
  // customer has to the one a marketplace accepts. Two tiles side by side in
  // the ordinary grid say nothing; the ordering and the arrow are the argument.
  //
  // Falls back to the grid when the manifest does not carry exactly the two,
  // rather than rendering nothing: StudioExamples returns null on an empty
  // list, so a stricter guard here would make the ONE studio whose whole page
  // is its images lose them silently.
  const examples = getExamples(entry.examples);
  const pair = entry.slug === 'edit' && examples.length === 2 ? examples : null;

  const related: { slug: string; name: string; tagline: string }[] = [];
  for (const r of entry.related) {
    const rt = await getTranslations({ locale, namespace: `studios.${r}` });
    related.push({ slug: r, name: rt('name'), tagline: rt('tagline') });
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <JsonLd
        data={buildStudioSchema(locale, entry.slug, t('name'), t('definition'), faq, s('indexTitle'))}
      />
      <NavBar />
      <main>
        <StudioHero
          name={t('name')}
          tagline={t('tagline')}
          definition={t('definition')}
          costLabel={s('costLabel')}
          costValue={cost}
        />
        {pair ? (
          <BeforeAfter
            title={s('examplesTitle')}
            note={s('examplesNote')}
            beforeLabel={s('beforeLabel')}
            afterLabel={s('afterLabel')}
            locale={loc}
            before={pair[0]}
            after={pair[1]}
          />
        ) : (
          <StudioExamples
            title={s('examplesTitle')}
            note={s('examplesNote')}
            locale={loc}
            examples={examples}
          />
        )}
        <StudioSteps title={s('howItWorks')} steps={[t('step1'), t('step2'), t('step3')]} />
        <StudioFaq title={s('faqTitle')} items={faq} />
        <StudioCta
          title={s('ctaTitle')}
          body={s('ctaBody', { credits: PLANS.free.credits })}
          button={s('ctaButton')}
          pricing={s('seePricing')}
        />
        <StudioRelated title={s('relatedTitle')} items={related} />
      </main>
      <Footer />
    </div>
  );
}
