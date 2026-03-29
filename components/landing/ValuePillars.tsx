'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Layers, Globe, Coins, Zap } from 'lucide-react';
import { staggerContainer, fadeInUp } from '@/lib/animations';

const pillars = [
  {
    icon: Layers,
    title: 'قوة مجمعة، بدون تشتت',
    description:
      'لماذا تدفع لاشتراكات متعددة؟ PyraSuite يجمع أقوى نماذج الذكاء الاصطناعي التوليدي عالمياً في مكان واحد. من صياغة النصوص الإبداعية إلى توليد الصور عالية الدقة، كل ما تحتاجه لإطلاق حملتك متوفر عبر 9 استوديوهات عمل متخصصة.',
  },
  {
    icon: Globe,
    title: 'دعم عربي أصيل',
    description:
      'وداعاً للترجمات الركيكة وتنسيقات النصوص المعكوسة. تم بناء المنصة من الصفر لتفهم تعقيدات اللغة العربية وتدعم تنسيق (RTL) بشكل مثالي، لتنتج محتوى تسويقي يخاطب جمهورك المحلي بلهجته وثقافته.',
  },
  {
    icon: Coins,
    title: 'تسعير شفاف ومرن',
    description:
      'تحكم كامل بميزانيتك التسويقية. من خلال نظام أرصدة (Credits) واضح ومباشر، أنت تدفع فقط مقابل ما تستهلكه. لا رسوم خفية، مع مدفوعات آمنة وموثوقة.',
  },
  {
    icon: Zap,
    title: 'سرعة الإطلاق',
    description:
      'اختصر دورة إنتاج المحتوى من أيام إلى دقائق. أتمتة كاملة لسير العمل التسويقي تتيح لك الانتقال من مرحلة التخطيط إلى مرحلة التنفيذ والإطلاق بأعلى كفاءة ممكنة.',
  },
];

export function ValuePillars(): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="features" className="py-20 px-6">
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-12 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          لماذا PyraSuite؟
        </h2>

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
