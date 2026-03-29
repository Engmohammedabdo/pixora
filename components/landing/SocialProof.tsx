'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Star } from 'lucide-react';
import { staggerContainer, fadeInUp } from '@/lib/animations';

const TESTIMONIALS = [
  {
    quote: 'PyraSuite غيّر طريقة عملنا بالكامل. ننتج محتوى أسبوع كامل في ساعة واحدة.',
    name: 'سارة المهندي',
    role: 'مديرة تسويق — شركة تقنية',
    stars: 5,
  },
  {
    quote: 'أخيراً منصة تفهم العربي! المحتوى يطلع طبيعي ومش ترجمة.',
    name: 'خالد الحربي',
    role: 'صاحب وكالة تسويق',
    stars: 5,
  },
  {
    quote: 'نظام الكريدت واضح وعادل. أعرف بالضبط كم بصرف قبل ما أبدأ.',
    name: 'نورة العتيبي',
    role: 'فريلانسر — إدارة سوشال ميديا',
    stars: 5,
  },
];

export function SocialProof(): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="py-20 px-6 bg-[var(--color-surface)]">
      <div className="mx-auto max-w-7xl">
        {/* Trust message */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-3xl text-center text-[var(--color-text-secondary)] italic leading-relaxed mb-16"
        >
          بنية تحتية سحابية قوية تضمن سرعة الاستجابة واستقرار الأداء، مصممة لتلبية احتياجات وكالات التسويق، الشركات الناشئة، ورواد الأعمال.
        </motion.p>

        {/* Testimonial cards */}
        <motion.div
          ref={ref}
          variants={staggerContainer}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {TESTIMONIALS.map((testimonial) => (
            <motion.div
              key={testimonial.name}
              variants={fadeInUp}
              className="rounded-2xl border border-[var(--color-border)]/50 bg-[var(--color-surface)] p-6"
            >
              {/* Quote icon */}
              <span className="block text-4xl text-primary-200 dark:text-primary-800 mb-4 leading-none select-none">
                &ldquo;
              </span>

              <p className="text-[var(--color-text-primary)] leading-relaxed mb-6">
                {testimonial.quote}
              </p>

              {/* Star rating */}
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonial.stars }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-4 w-4 fill-amber-400 text-amber-400"
                  />
                ))}
              </div>

              {/* Separator */}
              <div className="border-t border-[var(--color-border)]/50 pt-4">
                <p className="font-semibold text-sm text-[var(--color-text-primary)]">
                  {testimonial.name}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {testimonial.role}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
