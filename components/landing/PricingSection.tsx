'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { PLANS } from '@/lib/stripe/plans';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { staggerContainer, fadeInUp } from '@/lib/animations';

export default function PricingSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="pricing" className="py-20 px-6">
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-4 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          أسعار شفافة — بدون مفاجآت
        </h2>
        <p className="mb-12 text-center text-[var(--color-text-secondary)]">
          ابدأ مجاناً وترقّى على حسب احتياجك
        </p>

        <motion.div
          ref={ref}
          variants={staggerContainer}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5"
        >
          {Object.values(PLANS).map((plan) => {
            const isPro = plan.id === 'pro';
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
                    <Badge variant="default">الأكثر شعبية</Badge>
                  </motion.div>
                )}

                <h3 className="text-lg font-semibold text-center text-[var(--color-text-primary)] mb-4">
                  {plan.nameAr}
                </h3>

                <div className="text-center mb-4">
                  <span className="text-4xl font-bold text-[var(--color-text-primary)]">
                    ${plan.price}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-sm text-[var(--color-text-secondary)]">/شهر</span>
                  )}
                </div>

                <p className="text-center text-sm font-medium text-primary-600 dark:text-primary-400 mb-6">
                  {plan.credits.toLocaleString()} كريدت
                </p>

                <ul className="flex-1 space-y-3 mb-6">
                  {plan.featuresAr.map((feature) => (
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
                    {plan.price === 0 ? 'ابدأ مجاناً' : 'اشترك الآن'}
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
