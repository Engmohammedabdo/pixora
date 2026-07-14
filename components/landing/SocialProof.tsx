'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Rocket, Languages, LayoutGrid, type LucideIcon } from 'lucide-react';
import { staggerContainer, fadeInUp } from '@/lib/animations';

const VALUE_CARDS: { key: string; icon: LucideIcon }[] = [
  { key: 'card1', icon: Rocket },
  { key: 'card2', icon: Languages },
  { key: 'card3', icon: LayoutGrid },
];

export function SocialProof(): React.ReactElement {
  const t = useTranslations('landing');
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="py-20 px-6 bg-[var(--color-surface)]">
      <div className="mx-auto max-w-7xl">
        {/* Early adopters headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center mb-16"
        >
          <h2 className="mb-4 font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
            {t('social.title')}
          </h2>
          <p className="text-[var(--color-text-secondary)] leading-relaxed">
            {t('social.subtitle')}
          </p>
        </motion.div>

        {/* Value cards */}
        <motion.div
          ref={ref}
          variants={staggerContainer}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {VALUE_CARDS.map(({ key, icon: Icon }) => (
            <motion.div
              key={key}
              variants={fadeInUp}
              className="rounded-2xl border border-[var(--color-border)]/50 bg-[var(--color-surface)] p-6"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/40">
                <Icon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
              </div>

              <h3 className="font-semibold text-[var(--color-text-primary)] mb-2">
                {t(`social.${key}Title`)}
              </h3>

              <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {t(`social.${key}Desc`)}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Trust message */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center text-sm text-[var(--color-text-muted)] leading-relaxed mt-12"
        >
          {t('social.trust')}
        </motion.p>
      </div>
    </section>
  );
}
