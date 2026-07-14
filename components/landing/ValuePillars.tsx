'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Layers, Globe, Coins, Zap } from 'lucide-react';
import { staggerContainer, fadeInUp } from '@/lib/animations';

const PILLARS = [
  { icon: Layers, titleKey: 'p1Title', descKey: 'p1Desc' },
  { icon: Globe, titleKey: 'p2Title', descKey: 'p2Desc' },
  { icon: Coins, titleKey: 'p3Title', descKey: 'p3Desc' },
  { icon: Zap, titleKey: 'p4Title', descKey: 'p4Desc' },
] as const;

export function ValuePillars(): React.ReactElement {
  const t = useTranslations('landing');
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="features" className="py-20 px-6">
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-4 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          {t('pillars.title')}
        </h2>
        <p className="mb-12 text-center text-[var(--color-text-secondary)] max-w-xl mx-auto">
          {t('pillars.subtitle')}
        </p>

        <motion.div
          ref={ref}
          variants={staggerContainer}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <motion.div
                key={pillar.titleKey}
                variants={fadeInUp}
                whileHover={{ y: -5, transition: { duration: 0.2 } }}
                className="rounded-2xl border border-[var(--color-border)]/50 bg-[var(--color-surface)]/80 p-6 backdrop-blur-sm"
              >
                <div className="mb-4 w-fit rounded-xl bg-primary-50 p-3 dark:bg-primary-900/30">
                  <Icon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)]">
                  {t(`pillars.${pillar.titleKey}`)}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {t(`pillars.${pillar.descKey}`)}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
