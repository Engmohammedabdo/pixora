'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Layers, Globe, Coins, Zap } from 'lucide-react';
import { staggerContainer, fadeInUp } from '@/lib/animations';

const pillars = [
  {
    icon: Layers,
    title: '9 استوديوهات، اشتراك واحد',
    description:
      'بدل ما تدفع لـ 5 أدوات مختلفة — كل شي هنا: صور، حملات، خطط، تحليلات، صوت، وتعديل. Pyra AI تدير كل شي ورا الكواليس.',
  },
  {
    icon: Globe,
    title: 'عربي من الألف للياء',
    description:
      'مش ترجمة. مش تعريب. مبنية بالعربي من أول سطر كود. تفهم لهجتك، تكتب بأسلوبك، وتطلع محتوى ما يبان إنه AI.',
  },
  {
    icon: Coins,
    title: 'ادفع على قد ما تستخدم',
    description:
      'نظام كريدت شفاف — تعرف التكلفة قبل ما تضغط. صورة = 1 كريدت، حملة كاملة = 12. بدون مفاجآت ولا رسوم مخفية.',
  },
  {
    icon: Zap,
    title: 'من الفكرة للنشر بدقائق',
    description:
      'اكتب فكرتك بسطر واحد — Pyra AI تحوّلها لحملة جاهزة بصور وكابشنز وهاشتاقات. شغل أسبوع كامل ينخلص بـ 10 دقائق.',
  },
];

export function ValuePillars(): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="features" className="py-20 px-6">
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-4 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          ليش PyraSuite؟
        </h2>
        <p className="mb-12 text-center text-[var(--color-text-secondary)] max-w-xl mx-auto">
          لأنك تستاهل أداة مصممة لك — مش مترجمة لك
        </p>

        <motion.div
          ref={ref}
          variants={staggerContainer}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
        >
          {pillars.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <motion.div
                key={pillar.title}
                variants={fadeInUp}
                whileHover={{ y: -5, transition: { duration: 0.2 } }}
                className="rounded-2xl border border-[var(--color-border)]/50 bg-[var(--color-surface)]/80 p-6 backdrop-blur-sm"
              >
                <div className="mb-4 w-fit rounded-xl bg-primary-50 p-3 dark:bg-primary-900/30">
                  <Icon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-[var(--color-text-primary)]">
                  {pillar.title}
                </h3>
                <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {pillar.description}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}
