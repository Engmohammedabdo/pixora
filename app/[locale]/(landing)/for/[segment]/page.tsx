import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { NavBar } from '@/components/landing/NavBar';
import { Footer } from '@/components/landing/Footer';
import { JsonLd } from '@/components/seo/JsonLd';
import { routing } from '@/i18n/routing';
import { publicAlternates, publicSocial } from '@/lib/seo/alternates';
import { buildSegmentSchema } from '@/lib/seo/segment-schema';
// SEGMENTS is deliberately NOT re-exported from here. A Next.js page module may
// only export a fixed set of names, and `next build` rejects any other — a rule
// `tsc --noEmit` does not know, so it compiled clean and failed the build. The
// sitemap and the gate import the catalogue directly, which is the right
// dependency anyway: they depend on the LIST, not on the page that renders it.
import { SEGMENT_SLUGS, getSegment } from '@/lib/segments/catalogue';
import { getStudio } from '@/lib/studios/catalogue';
import { campaignCostBands } from '@/lib/credits/campaign-cost';
import { getExamples } from '@/lib/studios/examples';
import { entryOffer } from '@/lib/credits/offer';

/**
 * One public page per customer segment. `/[locale]/for/dubai-restaurants`.
 *
 * A SERVER component, the same rule and the same reason as the studio pages: the
 * entire job of this page is to be HTML a crawler and an answer engine can read.
 * The client boundaries it does carry are `NavBar` (framer-motion) and the
 * layout chain's providers — enumerated on the studio page rather than asserted,
 * and unchanged here.
 *
 * ── WHY THIS PAGE EXISTS ───────────────────────────────────────────────────
 * The nine studio pages answer "what does this tool do?". A shawarma shop owner
 * in Karama does not ask that; they ask "is this for me?". Until this route the
 * only page answering that was the landing page, which answers it for everyone
 * and therefore for no one. `docs/POSITIONING.md` takes the decision this page
 * renders.
 *
 * ── THE BODY IS A JOURNEY, NOT A FEATURE LIST ──────────────────────────────
 * photo -> nine posts -> captions -> a price the reader can act on. The three
 * studios come from the catalogue's `journey`, in order, and every credit figure
 * is computed from `lib/credits/costs.ts` — never typed into a translation, the
 * rule `scripts/tests/studio-pages.test.ts` enforces and that this page's own
 * gate repeats.
 *
 * The page closes on the offer: a first campaign free on the trial credits, then
 * the Entry plan — `PLANS.entry.credits` for `PLANS.entry.price` dollars, i.e.
 * eight complete nine-post Arabic campaigns a month at `campaignCostBands().text`
 * each. Until 2026-09-11 it closed on "25 free credits, no card"; the free month
 * became the $2 plan, and every figure is still read from code
 * (lib/credits/offer.ts), so the arithmetic in the copy cannot drift from the
 * arithmetic in the reservation. The captions were verified end to end on
 * production 2026-09-09 — see `.superpowers/dialect-proof/FINDING.md`.
 */
export function generateStaticParams(): { locale: string; segment: string }[] {
  return routing.locales.flatMap((locale) => SEGMENT_SLUGS.map((segment) => ({ locale, segment })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; segment: string }>;
}): Promise<Metadata> {
  const { locale, segment } = await params;
  if (!getSegment(segment)) return {};
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: `segments.${segment}` });
  const title = t('metaTitle');
  const description = t('metaDescription', segmentOfferParams());
  return {
    title,
    description,
    alternates: publicAlternates(locale, `/for/${segment}`),
    ...publicSocial(locale, { title, description, path: `/for/${segment}` }),
  };
}

const FAQ_KEYS = [1, 2, 3, 4] as const;

/** Every value the page's offer sentences interpolate — one object, see the call site. */
function segmentOfferParams(): Record<string, number> {
  const bands = campaignCostBands();
  const offer = entryOffer();
  return {
    text: bands.text,
    full: bands.full,
    posts: bands.posts,
    trial: offer.trial,
    price: offer.price,
    credits: offer.credits,
    campaigns: offer.campaigns,
  };
}

export default async function SegmentPage({
  params,
}: {
  params: Promise<{ locale: string; segment: string }>;
}): Promise<React.ReactElement> {
  const { locale, segment } = await params;
  const entry = getSegment(segment);
  // An unknown slug 404s rather than rendering an empty shell — the same
  // contract `/studios/[slug]` holds for `video`.
  if (!entry) notFound();
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: `segments.${segment}` });
  const tShared = await getTranslations({ locale, namespace: 'segments.shared' });
  const tStudios = await getTranslations({ locale, namespace: 'studios' });

  const examples = getExamples(entry.examples);
  // ONE set of values for every sentence on this page that quotes the offer —
  // the hero line, the price block and the FAQ (which also ships as JSON-LD).
  // Three call sites each spelling their own object is how one of them ends up
  // missing a key and rendering a literal `{price}`.
  const offerParams = segmentOfferParams();

  const faq = FAQ_KEYS.map((n) => ({ q: t(`q${n}`), a: t(`a${n}`, offerParams) }));

  return (
    <>
      <JsonLd data={buildSegmentSchema(locale, segment, t('name'), t('definition'), t('audience'), faq)} />
      <NavBar />
      <main className="pt-20">

        {/* ── The promise, in the reader's own words ───────────────────── */}
        <section className="px-6 pt-14 pb-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-4 inline-block rounded-full bg-[var(--color-surface-2)] px-4 py-1.5 text-sm font-medium text-[var(--color-brand)]">
              {t('eyebrow')}
            </p>
            <h1 className="font-cairo text-3xl font-bold leading-tight text-[var(--color-text-primary)] sm:text-4xl">
              {t('h1')}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-[var(--color-text-secondary)]">
              {t('definition')}
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/signup"
                className="rounded-xl bg-[var(--color-brand)] px-7 py-3 font-medium text-white transition-opacity hover:opacity-90"
              >
                {tShared('ctaPrimary')}
              </Link>
              <Link
                href={`/studios/${entry.frontDoor}`}
                className="rounded-xl border border-[var(--color-border)] px-7 py-3 font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-2)]"
              >
                {tShared('ctaSecondary')}
              </Link>
            </div>
            <p className="mt-4 text-sm text-[var(--color-text-muted)]">
              {tShared('freeLine', offerParams)}
            </p>
          </div>
        </section>

        {/* ── The journey ─────────────────────────────────────────────── */}
        <section className="px-6 py-14">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-3 text-center font-cairo text-2xl font-bold text-[var(--color-text-primary)]">
              {t('journeyTitle')}
            </h2>
            <p className="mb-10 text-center text-[var(--color-text-secondary)]">{t('journeySubtitle')}</p>
            <ol className="grid gap-4 sm:grid-cols-3">
              {entry.journey.map((slug, i) => {
                const studio = getStudio(slug);
                if (!studio) return null;
                return (
                  <li
                    key={slug}
                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
                  >
                    <span className="font-mono text-xs font-semibold text-[var(--color-text-muted)]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <h3 className="mt-2 font-cairo text-lg font-bold text-[var(--color-text-primary)]">
                      <Link href={`/studios/${slug}`} className="hover:text-[var(--color-brand)]">
                        {tStudios(`${slug}.name`)}
                      </Link>
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                      {t(`step${i + 1}`)}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ── Proof: real output from real runs ───────────────────────── */}
        {examples.length > 0 && (
          <section className="px-6 py-14">
            <div className="mx-auto max-w-4xl">
              <h2 className="mb-3 text-center font-cairo text-2xl font-bold text-[var(--color-text-primary)]">
                {t('proofTitle')}
              </h2>
              <p className="mb-10 text-center text-[var(--color-text-secondary)]">{tShared('proofNote')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {examples.map((ex) => (
                  <figure key={ex.id} className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
                    <Image
                      src={ex.file}
                      alt={ex.alt[locale === 'ar' ? 'ar' : 'en']}
                      width={ex.width}
                      height={ex.height}
                      // Ends in a px value, not a bare vw: the slot stops growing
                      // at the max-w-4xl container, and a trailing `50vw` asks a
                      // 1920 viewport for 960px of image to fill ~440. The gate in
                      // scripts/tests/studio-pages.test.ts states this rule on the
                      // FALLBACK entry, which is the one every desktop uses.
                      sizes="(max-width: 640px) 100vw, 440px"
                      className="h-auto w-full object-cover"
                    />
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── The price, decomposed ───────────────────────────────────── */}
        <section className="px-6 py-14">
          <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
            <h2 className="font-cairo text-2xl font-bold text-[var(--color-text-primary)]">
              {t('priceTitle')}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[var(--color-text-secondary)]">
              {tShared('priceBody', offerParams)}
            </p>
            <Link
              href="/signup"
              className="mt-7 inline-block rounded-xl bg-[var(--color-brand)] px-8 py-3 font-medium text-white transition-opacity hover:opacity-90"
            >
              {tShared('ctaPrimary')}
            </Link>
          </div>
        </section>

        {/* ── The questions an owner actually asks ────────────────────── */}
        <section className="px-6 py-14">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-8 text-center font-cairo text-2xl font-bold text-[var(--color-text-primary)]">
              {t('faqTitle')}
            </h2>
            <div className="space-y-4">
              {faq.map((f) => (
                <div key={f.q} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  {/* Not a <details>: the answers must be in the HTML a
                      non-JS fetch sees. The landing FAQ shipped answers that
                      only rendered when open, so every answer engine read none
                      of them — recorded in CLAUDE.md's SEO round. */}
                  <h3 className="font-semibold text-[var(--color-text-primary)]">{f.q}</h3>
                  <p className="mt-2 leading-relaxed text-[var(--color-text-secondary)]">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Talk to a human ─────────────────────────────────────────── */}
        <section className="px-6 pb-20 pt-4">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[var(--color-text-secondary)]">{tShared('contactLead')}</p>
            {/* /contact stores to support_messages and is read at /admin/support.
                Nothing new is built for this page's "talk to us" path. */}
            <Link
              href="/contact"
              className="mt-4 inline-block rounded-xl border border-[var(--color-border)] px-7 py-3 font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-2)]"
            >
              {tShared('contactCta')}
            </Link>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}
