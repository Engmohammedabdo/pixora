import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { LifeBuoy, CreditCard, Bug, UserCog } from 'lucide-react';
import { ContactForm } from '@/components/landing/ContactForm';
import { Footer } from '@/components/landing/Footer';
import { routing } from '@/i18n/routing';
import { publicAlternates, publicOpenGraph } from '@/lib/seo/alternates';

export function generateStaticParams(): { locale: string }[] {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contact' });
  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: publicAlternates(locale, '/contact'),
    openGraph: publicOpenGraph(locale, { title: t('title'), description: t('subtitle'), path: '/contact' }),
  };
}

/**
 * The support channel.
 *
 * Public, because the people most likely to need it are the ones who cannot sign in
 * — which today includes anyone who forgets a password, since Supabase Auth has no
 * mailer configured.
 *
 * Messages are stored in the database, not emailed. There is no email provider set
 * up, and a contact form that silently fails to send is worse than none at all: the
 * customer believes they have been heard. The founder reads them at /admin/support.
 */
export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'contact' });

  const reasons = [
    { icon: CreditCard, key: 'billing' },
    { icon: Bug, key: 'bug' },
    { icon: UserCog, key: 'account' },
  ] as const;

  return (
    <>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)]">
            <LifeBuoy className="h-7 w-7 text-[var(--color-brand)]" />
          </div>
          <h1 className="mb-3 text-3xl font-bold font-cairo">{t('title')}</h1>
          <p className="text-[var(--color-text-secondary)]">{t('subtitle')}</p>
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {reasons.map(({ icon: Icon, key }) => (
            <div key={key} className="rounded-lg border border-[var(--color-border)] p-4">
              <Icon className="mb-2 h-5 w-5 text-[var(--color-brand)]" />
              <p className="text-sm font-medium">{t(`topics.${key}`)}</p>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{t(`hints.${key}`)}</p>
            </div>
          ))}
        </div>

        <ContactForm />
      </main>
      <Footer />
    </>
  );
}
