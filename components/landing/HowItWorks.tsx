'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Pencil, Sparkles, Download } from 'lucide-react';
import { staggerContainer, fadeInUp } from '@/lib/animations';

const steps = [
  {
    number: 1,
    icon: Pencil,
    title: 'اكتب وصفك',
    description: 'صف ما تريده بالعربية أو الإنجليزية — المنصة تفهم الاثنين',
  },
  {
    number: 2,
    icon: Sparkles,
    title: 'اختر الاستوديو',
    description: '9 استوديوهات متخصصة — من صور المنتجات إلى الحملات الكاملة',
  },
  {
    number: 3,
    icon: Download,
    title: 'حمّل نتائجك',
    description: 'صور، PDF، حملات كاملة — جاهزة للنشر في ثواني',
  },
];

export function HowItWorks(): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="bg-[var(--color-surface)] py-20 px-6">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-16 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          كيف يعمل PyraSuite؟
        </h2>

        <motion.div
          ref={ref}
          variants={staggerContainer}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="flex flex-col items-center gap-8 md:flex-row md:items-start md:gap-0"
        >
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.number} className="flex flex-1 items-center md:flex-col">
                {/* Step content */}
                <div className="flex flex-col items-center text-center">
                  <motion.div variants={fadeInUp} className="flex flex-col items-center">
                    {/* Number badge */}
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-500 text-xl font-bold text-white">
                      {step.number}
                    </div>

                    {/* Icon */}
                    <div className="mb-4">
                      <Icon className="h-8 w-8 text-primary-600 dark:text-primary-400" />
                    </div>

                    {/* Title */}
                    <h3 className="mb-2 font-semibold text-[var(--color-text-primary)]">
                      {step.title}
                    </h3>

                    {/* Description */}
                    <p className="max-w-[200px] text-sm text-[var(--color-text-secondary)]">
                      {step.description}
                    </p>
                  </motion.div>
                </div>

                {/* Connector line (hidden on mobile and after last step) */}
                {index < steps.length - 1 && (
                  <div className="hidden flex-1 md:block">
                    <div className="mt-6 border-t-2 border-dashed border-[var(--color-border)]" />
                  </div>
                )}
              </div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
