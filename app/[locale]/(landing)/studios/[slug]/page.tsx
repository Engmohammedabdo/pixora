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
import { getVoiceoverConfig } from '@/lib/credits/voiceover-costs';
import { PLANS } from '@/lib/stripe/plans';
import { StudioHero } from '@/components/studios/public/StudioHero';
import { StudioExamples } from '@/components/studios/public/StudioExamples';
import { BeforeAfter } from '@/components/studios/public/BeforeAfter';
import {
  DeliverableSample,
  hasDeliverableSample,
  type DeliverableLabels,
} from '@/components/studios/public/DeliverableSample';
import {
  AudioSample,
  isSampleDialect,
  VOICEOVER_SAMPLE,
} from '@/components/studios/public/AudioSample';
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
 *
 * ── WHY `perDuration` CARRIES NO NUMBER OF ITS OWN ─────────────────────────
 * Voiceover is the one studio whose UNIT is not universal. It shipped as
 * `${CREDIT_COSTS.voiceover}+ credits · per 15 seconds`, with the 15 typed into
 * a translation, and that is wrong for three of the five plans:
 * lib/credits/voiceover-costs.ts bills free and starter at 1 credit per 15s and
 * pro, business and agency at 3 per 20s. A 60-second Pro voiceover costs
 * ceil(60/20)*3 = 9 credits, which the "1+ · per 15 seconds" badge reads as
 * roughly 4. The product already publishes the correct split on the pricing
 * page (`pricing.voiceoverNote`), so the page contradicted the page it links to.
 *
 * Both bands now come from `getVoiceoverConfig()` and arrive as ICU values, so
 * the string states neither the unit nor the price and cannot drift from the
 * table that charges. The credit detector in scripts/tests/studio-pages.test.ts
 * could never have caught the old one: 15 is a SECONDS figure, not a credit
 * figure, so the gate that guards prices did not apply. It does now.
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
      // The whole line, both bands, already composed by the caller from
      // getVoiceoverConfig(). No `unit` and no leading figure: a single number
      // in front of a two-band price is what made the old badge read as one
      // universal rate.
      return perDuration;
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

  // Voiceover's two price bands, read from the table that actually charges.
  // 'free' and 'pro' are representatives, not the whole list: starter shares
  // free's unit and business and agency share pro's, which is why the copy
  // names the bands ("Free and Starter" / "Pro and above") and not five plans.
  const voiceoverFree = getVoiceoverConfig('free');
  const voiceoverPaid = getVoiceoverConfig('pro');

  const cost = costValue(
    entry.slug,
    s('creditUnit'),
    s('freeLabel'),
    s('perImage'),
    s('perShoot'),
    s('perDuration', {
      freeCredits: voiceoverFree.creditsPerUnit,
      freeSeconds: voiceoverFree.unitSeconds,
      paidCredits: voiceoverPaid.creditsPerUnit,
      paidSeconds: voiceoverPaid.unitSeconds,
    }),
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

  // plan, analysis, storyboard and prompt-builder produce TEXT, so their page
  // renders the real deliverable as HTML instead of a picture of one. Bound to
  // a local const rather than read off `entry` at the call site so the type
  // guard narrows the value that is actually passed down.
  const studioSlug: StudioSlug = entry.slug;

  // Every label the sample renderer prints, resolved here: the component takes
  // plain props and holds no translation hook, the same rule the other six
  // section components follow. Built unconditionally — it is 21 lookups against
  // an already-loaded namespace, and branching on it would put the question
  // "which studio is this?" in two places.
  const sampleLabels: DeliverableLabels = {
    objectives: s('sampleObjectives'),
    goal: s('sampleGoal'),
    kpi: s('sampleKpi'),
    target: s('sampleTarget'),
    channels: s('sampleChannels'),
    calendar: s('sampleCalendar'),
    week: s('sampleWeek'),
    swot: s('sampleSwot'),
    strengths: s('sampleStrengths'),
    weaknesses: s('sampleWeaknesses'),
    opportunities: s('sampleOpportunities'),
    threats: s('sampleThreats'),
    kpis: s('sampleKpis'),
    timeframe: s('sampleTimeframe'),
    scenes: s('sampleScenes'),
    scene: s('sampleScene'),
    camera: s('sampleCamera'),
    brief: s('sampleBrief'),
    prompts: s('samplePrompts'),
    style: s('sampleStyle'),
    tip: s('sampleTip'),
  };

  // The voiceover sample. Every value below is read from
  // public/examples/studios/voiceover-gulf-sample.json — the file the real run
  // wrote — and nothing about that run is typed into copy.
  //
  // The dialect LABEL comes from the studio's own `voiceover.dialects`
  // translations rather than from a second copy in this namespace, so the name
  // the public page gives the dialect is the name the studio gives it. An id
  // the product does not sell resolves to an empty label rather than to a
  // missing-message key rendered on a public page; the sample's is `gulf`.
  const audio =
    entry.slug === 'voiceover'
      ? await (async () => {
          const vo = await getTranslations({ locale, namespace: 'voiceover' });
          const dialect = isSampleDialect(VOICEOVER_SAMPLE.dialect)
            ? vo(`dialects.${VOICEOVER_SAMPLE.dialect}`)
            : '';
          // Which path actually served this file, from the run's own record —
          // never assumed from the plan. tts-router falls back to the standard
          // path whenever the premium one is unconfigured or fails, so a label
          // hardcoded to the premium one would eventually describe audio that
          // was not produced that way.
          //
          // The two labels are the studio's own badges — `voiceover.pyraVoice`
          // and `voiceover.pyraVoicePro`, minus the emoji — rather than a
          // quality claim written for this page. What the product calls the
          // path is what the public page may call it.
          const tier =
            VOICEOVER_SAMPLE.provider === 'elevenlabs'
              ? s('audioTierPremium')
              : s('audioTierStandard');
          return {
            src: VOICEOVER_SAMPLE.file,
            // `scriptAsWritten`, and the label under it says "the script we
            // sent" for the same reason: the route returns no rewritten text,
            // so the file's `scriptAsSpoken` is the submitted script too — while
            // its own reported duration proves a longer rewrite was what the
            // narrator actually read. AudioSample.tsx carries the arithmetic.
            transcript: VOICEOVER_SAMPLE.scriptAsWritten,
            meta: s('audioMeta', { dialect, tier }),
            provenance: `${VOICEOVER_SAMPLE.generatedOn.replace(/^https?:\/\//, '')} · ${VOICEOVER_SAMPLE.generatedAt.slice(0, 10)}`,
          };
        })()
      : null;

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
        {audio ? (
          <AudioSample
            title={s('sampleTitle')}
            note={s('audioNote')}
            src={audio.src}
            transcript={audio.transcript}
            transcriptLabel={s('transcriptLabel')}
            meta={audio.meta}
            provenance={audio.provenance}
          />
        ) : hasDeliverableSample(studioSlug) ? (
          <DeliverableSample
            title={s('sampleTitle')}
            note={s('sampleNote')}
            langNote={s('sampleLangNote')}
            locale={loc}
            slug={studioSlug}
            labels={sampleLabels}
          />
        ) : pair ? (
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
