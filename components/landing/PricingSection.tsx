'use client';

import { useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { PLANS, ANNUAL_PLANS } from '@/lib/stripe/plans';
import { estimateImagesFromCredits } from '@/lib/credits/costs';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { staggerContainer, fadeInUp } from '@/lib/animations';

export default function PricingSection() {
  const t = useTranslations('landing');
  const locale = useLocale();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section id="pricing" className="py-20 px-6">
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-4 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          {t('pricing.title')}
        </h2>
        <p className="mb-8 text-center text-[var(--color-text-secondary)]">
          {t('pricing.subtitle')}
        </p>

        {/* Monthly / Annual toggle */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <span
            className={cn(
              'text-sm font-medium',
              !isAnnual ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'
            )}
          >
            {t('pricing.monthly')}
          </span>
          <button
            onClick={() => setIsAnnual(!isAnnual)}
            className={cn(
              'relative w-14 h-7 rounded-full transition-colors',
              isAnnual ? 'bg-primary-500' : 'bg-surface-2'
            )}
          >
            <div
              className={cn(
                'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all',
                isAnnual ? 'end-0.5' : 'start-0.5'
              )}
            />
          </button>
          <span
            className={cn(
              'text-sm font-medium',
              isAnnual ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'
            )}
          >
            {t('pricing.annual')}
            <Badge variant="secondary" className="ms-1.5 text-[9px] text-green-600 dark:text-green-400">
              {t('pricing.saveBadge')}
            </Badge>
          </span>
        </div>

        <motion.div
          ref={ref}
          variants={staggerContainer}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-5"
        >
          {Object.values(PLANS).map((plan) => {
            const isPro = plan.id === 'pro';
            const annualInfo = isAnnual && ANNUAL_PLANS[plan.id] ? ANNUAL_PLANS[plan.id] : null;
            const displayPrice = annualInfo ? annualInfo.annualMonthly : plan.price;
            // Sourced from next-intl (messages/*.json → landing.pricing.features), not
            // plan.features/plan.featuresAr — those are hardcoded bilingual literals in
            // lib/stripe/plans.ts that bypass the project's i18n convention entirely.
            const features = t.raw(`pricing.features.${plan.id}`) as string[];
            return (
              <motion.div
                key={plan.id}
                variants={fadeInUp}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className={`relative rounded-2xl border p-6 bg-[var(--color-surface)] flex flex-col ${
                  isPro
                    ? 'border-primary-500 shadow-[0_0_30px_rgba(99,102,241,0.2)]'
                    : 'border-[var(--color-border)]/50'
                }`}
              >
                {isPro && (
                  <motion.div
                    className="absolute -top-3 start-1/2 -translate-x-1/2 rtl:translate-x-1/2"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Badge variant="default">{t('pricing.popular')}</Badge>
                  </motion.div>
                )}

                <h3 className="text-lg font-semibold text-center text-[var(--color-text-primary)] mb-4">
                  {locale === 'ar' ? plan.nameAr : plan.name}
                </h3>

                <div className="text-center mb-4">
                  <span className="text-4xl font-bold text-[var(--color-text-primary)]">
                    ${displayPrice}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      {t('pricing.perMonth')}
                    </span>
                  )}
                </div>

                <p className="text-center text-sm font-medium text-primary-600 dark:text-primary-400 mb-1">
                  {t('pricing.credits', { count: plan.credits.toLocaleString() })}
                </p>
                <p className="text-center text-xs text-[var(--color-text-secondary)] mb-6">
                  {t('pricing.approxImages', { count: estimateImagesFromCredits(plan.credits) })}
                </p>

                <ul className="flex-1 space-y-3 mb-6">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
                      <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary-500" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button
                  variant={isPro ? 'default' : 'outline'}
                  className="w-full"
                  asChild
                >
                  <Link href="/signup">
                    {plan.price === 0 ? t('pricing.startFree') : t('pricing.subscribe')}
                  </Link>
                </Button>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
