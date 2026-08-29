import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Sparkles, Rocket, Gift, MessageSquareHeart } from 'lucide-react';
import Image from 'next/image';
import { NavBar } from '@/components/landing/NavBar';
import { WaitlistForm } from '@/components/landing/WaitlistForm';
import { Footer } from '@/components/landing/Footer';
import { routing } from '@/i18n/routing';
import { BETA_CREDITS } from '@/lib/credits/beta';

export function generateStaticParams(): { locale: string }[] {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'waitlist' });
  return {
    title: t('title'),
    description: t('subtitle'),
    openGraph: { title: t('title'), description: t('subtitle') },
  };
}

/**
 * Pre-launch waitlist page.
 *
 * Deliberately separate from the main landing page rather than replacing it:
 * this one can go live today to start collecting an audience while the product
 * is finished, and it promises nothing the product cannot yet do. No pricing, no
 * "try it now", no feature claims that would need to be walked back.
 */
export default async function WaitlistPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('waitlist');

  // The gift is the only perk here with a number in it, and a number is the
  // only part of this page a visitor can act on arithmetic about. It carries
  // `credits` from lib/credits/beta.ts rather than a literal in the message
  // file, so lowering the grant cannot leave the promise stranded at the old
  // figure in two languages.
  const perks = [
    { icon: Rocket, title: t('earlyAccess'), body: t('earlyAccessBody') },
    {
      icon: Gift,
      title: t('bonusCredits', { credits: BETA_CREDITS }),
      body: t('bonusCreditsBody'),
      highlight: true,
    },
    { icon: MessageSquareHeart, title: t('shapeIt'), body: t('shapeItBody') },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      {/* A visitor an ad delivers straight here had NO way back to the story —
          no nav, no logo, no link to the examples or the pricing they are being
          asked to trust. The only exits were the form and the footer. */}
      <NavBar />
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-20 pt-32">
        <div className="flex w-full max-w-2xl flex-col items-center gap-8 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-4 py-1.5 text-sm font-medium text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t('badge')}
            </span>

            {/* Second badge rather than longer copy in the first one. "Coming
                soon" is a status and the gift is an offer; merging them makes
                the offer read as part of the disclaimer. Both are pills so the
                pair still scans as one row. */}
            <span className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--color-brand)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] px-4 py-1.5 text-sm font-semibold text-[var(--color-brand)]">
              <Gift className="h-4 w-4" aria-hidden="true" />
              {t('giftBadge', { credits: BETA_CREDITS })}
            </span>
          </div>

          <div className="flex flex-col gap-4">
            {/* leading-[1.45], not leading-tight. Tailwind's text-5xl carries its own
                line-height of 1, which collapsed this to a 48px line on a 48px font —
                measured on production. Latin text survives that; Arabic does not,
                because the diacritics and the tall alif/lam sit above the cap height
                and collide with the descenders of the line above. Verified on
                "اكتب فكرتك بالعربي، وبايرا تطلّعها حملة كاملة", where the shadda on
                تطلّعها touched the line below it. */}
            <h1 className="font-cairo text-3xl font-bold leading-[1.45] text-[var(--color-text-primary)] sm:text-5xl">
              {t('title')}
            </h1>
            <p className="mx-auto max-w-xl text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
              {t('subtitle')}
            </p>
          </div>

          {/*
            PROOF ABOVE THE FORM — added 2026-08-29.

            Measured on production: the complete set of <img> tags this page
            delivered was ONE — the Facebook tracking pixel. Every CTA on the
            site lands here, and an ad bought on a picture is the natural thing
            to point straight at it, so the most likely first screen of the whole
            funnel was a badge, a headline and an email box with nothing to
            believe. Asking for an address before showing anything is the
            expensive half of this page.

            One real output, the same shawarma business the landing copy names,
            so the example is continuous with the story rather than a stock
            flourish.
          */}
          <figure className="mx-auto w-full max-w-md">
            <div className="relative overflow-hidden rounded-2xl border border-[var(--color-surface-2)] shadow-xl">
              <Image
                src="/examples/shawarma.jpg"
                alt={t('proofAlt')}
                width={1024}
                height={1024}
                priority
                sizes="(max-width: 768px) 100vw, 448px"
                className="h-auto w-full"
              />
            </div>
            <figcaption className="mt-3 text-center text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {t('proofCaption')}
            </figcaption>
          </figure>

          <div className="flex w-full justify-center">
            <WaitlistForm source="waitlist-page" />
          </div>

          <ul className="mt-6 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
            {perks.map((perk) => (
              <li
                key={perk.title}
                className={
                  perk.highlight
                    ? 'flex flex-col items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--color-brand)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-brand)_8%,transparent)] px-4 py-5 text-center'
                    : 'flex flex-col items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-center'
                }
              >
                <perk.icon
                  className={perk.highlight ? 'h-5 w-5 text-[var(--color-brand)]' : 'h-5 w-5 text-primary-500'}
                  aria-hidden="true"
                />
                <p
                  className={
                    perk.highlight
                      ? 'text-sm font-bold text-[var(--color-brand)]'
                      : 'text-sm font-semibold text-[var(--color-text-primary)]'
                  }
                >
                  {perk.title}
                </p>
                <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">{perk.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <Footer />
    </div>
  );
}
