'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { useTranslations } from 'next-intl';
import {
  Image,
  Camera,
  LayoutGrid,
  Map,
  Film,
  BarChart3,
  Mic,
  Pencil,
  Lightbulb,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { staggerContainer, fadeInUp } from '@/lib/animations';

const studios = [
  {
    icon: Image,
    nameKey: 'studios.s1Name',
    descKey: 'studios.s1Desc',
    creditsKey: 'studios.s1Credits',
    free: false,
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
  },
  {
    icon: Camera,
    nameKey: 'studios.s2Name',
    descKey: 'studios.s2Desc',
    creditsKey: 'studios.s2Credits',
    free: false,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    icon: LayoutGrid,
    nameKey: 'studios.s3Name',
    descKey: 'studios.s3Desc',
    creditsKey: 'studios.s3Credits',
    free: false,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  {
    icon: Map,
    nameKey: 'studios.s4Name',
    descKey: 'studios.s4Desc',
    creditsKey: 'studios.s4Credits',
    free: false,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    icon: Film,
    nameKey: 'studios.s5Name',
    descKey: 'studios.s5Desc',
    creditsKey: 'studios.s5Credits',
    free: false,
    iconBg: 'bg-rose-100 dark:bg-rose-900/30',
    iconColor: 'text-rose-600 dark:text-rose-400',
  },
  {
    icon: BarChart3,
    nameKey: 'studios.s6Name',
    descKey: 'studios.s6Desc',
    creditsKey: 'studios.s6Credits',
    free: false,
    iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
    iconColor: 'text-cyan-600 dark:text-cyan-400',
  },
  {
    icon: Mic,
    nameKey: 'studios.s7Name',
    descKey: 'studios.s7Desc',
    creditsKey: 'studios.s7Credits',
    free: false,
    iconBg: 'bg-orange-100 dark:bg-orange-900/30',
    iconColor: 'text-orange-600 dark:text-orange-400',
  },
  {
    icon: Pencil,
    nameKey: 'studios.s8Name',
    descKey: 'studios.s8Desc',
    creditsKey: 'studios.s8Credits',
    free: false,
    iconBg: 'bg-pink-100 dark:bg-pink-900/30',
    iconColor: 'text-pink-600 dark:text-pink-400',
  },
  {
    icon: Lightbulb,
    nameKey: 'studios.s9Name',
    descKey: 'studios.s9Desc',
    creditsKey: 'studios.s9Credits',
    free: true,
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
] as const;

export function StudiosShowcase(): React.ReactElement {
  const t = useTranslations('landing');
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="studios" className="py-20 px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-3 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          {t('studios.title')}
        </h2>
        <p className="mb-12 text-center text-[var(--color-text-secondary)] max-w-lg mx-auto">
          {t('studios.subtitle')}
        </p>

        <motion.div
          ref={ref}
          variants={staggerContainer}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {studios.map((studio) => {
            const Icon = studio.icon;
            return (
              <motion.div
                key={studio.nameKey}
                variants={fadeInUp}
                whileHover={{
                  y: -6,
                  boxShadow: '0 20px 40px rgba(99,102,241,0.15)',
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
              >
                <Badge
                  variant={studio.free ? 'success' : 'secondary'}
                  className="absolute end-4 top-4"
                >
                  {t(studio.creditsKey)}
                </Badge>

                <div className="flex flex-row items-start gap-4">
                  <div className={`rounded-xl p-3 ${studio.iconBg}`}>
                    <Icon className={`h-6 w-6 ${studio.iconColor}`} />
                  </div>
                  <div className="flex-1 pe-12">
                    <h3 className="mb-1 font-semibold text-[var(--color-text-primary)]">
                      {t(studio.nameKey)}
                    </h3>
                    <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                      {t(studio.descKey)}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
