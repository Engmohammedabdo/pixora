import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Sparkles, Rocket, Gift, MessageSquareHeart } from 'lucide-react';
import { WaitlistForm } from '@/components/landing/WaitlistForm';
import { Footer } from '@/components/landing/Footer';
import { routing } from '@/i18n/routing';

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

  const perks = [
    { icon: Rocket, title: t('earlyAccess'), body: t('earlyAccessBody') },
    { icon: Gift, title: t('bonusCredits'), body: t('bonusCreditsBody') },
    { icon: MessageSquareHeart, title: t('shapeIt'), body: t('shapeItBody') },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-20">
        <div className="flex w-full max-w-2xl flex-col items-center gap-8 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-4 py-1.5 text-sm font-medium text-primary-700 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
            <Sparkles className="h-4 w-4" />
            {t('badge')}
          </span>

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

          <div className="flex w-full justify-center">
            <WaitlistForm source="waitlist-page" />
          </div>

          <ul className="mt-6 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
            {perks.map((perk) => (
              <li
                key={perk.title}
                className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-center"
              >
                <perk.icon className="h-5 w-5 text-primary-500" />
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">{perk.title}</p>
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
