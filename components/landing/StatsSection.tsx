'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { staggerContainer, fadeInUp } from '@/lib/animations';

const STATS = [
  { value: 9, label: 'استوديو متخصص' },
  { value: 3, label: 'نماذج ذكاء اصطناعي' },
  { value: 5, label: 'خطط اشتراك' },
  { value: 25, label: 'كريدت مجاناً' },
];

function AnimatedCounter({ target, inView }: { target: number; inView: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;

    const duration = 2000;
    const startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }, [inView, target]);

  return <>{count}+</>;
}

export default function StatsSection() {
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
            key={stat.label}
            variants={fadeInUp}
            className="text-center"
          >
            <div className="text-5xl font-bold text-white mb-2">
              <AnimatedCounter target={stat.value} inView={isInView} />
            </div>
            <div className="text-sm text-primary-200">{stat.label}</div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
