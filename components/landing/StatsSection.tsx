'use client';

import { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { staggerContainer, fadeInUp } from '@/lib/animations';
import { PLANS } from '@/lib/stripe/plans';

/*
 * The second stat was the literal 25 — the free plan's monthly allowance — while
 * the hero forty pixels up advertises the 100-credit launch gift. One offer
 * stated as two numbers reads to a visitor as a discount, not a bonus, and it
 * was the single most expensive contradiction on the acquisition surface.
 *
 * It now carries the GIFT, and takes it from BETA_CREDITS rather than a literal.
 * That constant already has a live test (`npm run test:beta-credits`) asserting
 * the number this page PROMISES equals the number the database GRANTS — so the
 * figure here can no longer drift from the one the customer actually receives.
 */
const STATS = [
  { value: 9, suffixKey: null, labelKey: 'stats.stat1Label' },
  // Was BETA_CREDITS (the 100-credit invite grant). With the gate open nobody
  // redeems an invite, so the honest figure is what a new free account holds —
  // read from PLANS rather than typed, for the same reason BETA_CREDITS was.
  { value: PLANS.free.credits, suffixKey: null, labelKey: 'stats.stat2Label' },
  { value: 5, suffixKey: null, labelKey: 'stats.stat3Label' },
  { value: 10, suffixKey: 'stats.stat4Suffix', labelKey: 'stats.stat4Label' },
] as const;

function AnimatedCounter({ target, suffix, inView }: { target: number; suffix: string; inView: boolean }) {
  // Starts at the REAL number, not 0.
  //
  // Starting at 0 meant the server-rendered HTML said "0 استوديو متخصص · 0 كريدت
  // مجاناً · 0 باقات" — which is what search engines index, what a link preview
  // scrapes, and what anyone sees before hydration on a slow connection. It also
  // contradicted the "9 استوديوهات" two sections above it. The count-up is a
  // flourish; it must not be the only path to a truthful number.
  const [count, setCount] = useState(target);
  const primed = useRef(false);

  // Drop to 0 BEFORE the first client paint, not when the section scrolls into
  // view. Zeroing inside the inView effect would show the real number, then
  // visibly snap backwards to 0 and count up again — a glitch the old code did
  // not have. A layout effect runs before paint, so the client starts at 0 and
  // the server still sends the truthful number. Guarded for SSR, where
  // useLayoutEffect does not run and would warn.
  const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
  useIsomorphicLayoutEffect(() => {
    if (primed.current) return;
    primed.current = true;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setCount(0);
  }, []);

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
