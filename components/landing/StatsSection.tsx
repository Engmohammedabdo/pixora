'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { staggerContainer, fadeInUp } from '@/lib/animations';

const STATS = [
  { value: 9, suffixKey: null, labelKey: 'stats.stat1Label' },
  { value: 25, suffixKey: null, labelKey: 'stats.stat2Label' },
  { value: 5, suffixKey: null, labelKey: 'stats.stat3Label' },
  { value: 10, suffixKey: 'stats.stat4Suffix', labelKey: 'stats.stat4Label' },
] as const;

function AnimatedCounter({ target, suffix, inView }: { target: number; suffix: string; inView: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;

    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setCount(target);
      return;
    }

    const duration = 2000;
    const startTime = performance.now();
    let frameId: number;

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) frameId = requestAnimationFrame(animate);
    }

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [inView, target]);

  return <>{count}{suffix}</>;
}

export default function StatsSection() {
  const t = useTranslations('landing');
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="bg-gradient-to-r from-primary-900 to-primary-800 dark:from-primary-950 dark:to-primary-900 py-16 px-6">
      <motion.div
        ref={ref}
        variants={staggerContainer}
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        className="mx-auto max-w-7xl grid grid-cols-2 lg:grid-cols-4 gap-8"
      >
        {STATS.map((stat) => (
          <motion.div
            key={stat.labelKey}
            variants={fadeInUp}
            className="text-center"
          >
            <div className="whitespace-nowrap text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-2">
              <AnimatedCounter
                target={stat.value}
                suffix={stat.suffixKey ? t(stat.suffixKey) : ''}
                inView={isInView}
              />
            </div>
            <div className="text-sm text-primary-200">{t(stat.labelKey)}</div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
