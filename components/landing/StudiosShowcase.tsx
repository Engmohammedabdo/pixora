'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
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
    name: 'منشئ الصور',
    description: 'صور تسويقية احترافية من وصف نصي',
    credits: '1-4 credits',
    iconBg: 'bg-purple-100 dark:bg-purple-900/30',
    iconColor: 'text-purple-600 dark:text-purple-400',
  },
  {
    icon: Camera,
    name: 'تصوير المنتجات',
    description: 'تصوير منتجات بـ 6 زوايا مختلفة',
    credits: '2-8',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    icon: LayoutGrid,
    name: 'مخطط الحملات',
    description: 'حملة كاملة 9 منشورات بضغطة',
    credits: '12',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
  },
  {
    icon: Map,
    name: 'الخطة التسويقية',
    description: 'خطة 30/60/90 يوم مع تقويم محتوى',
    credits: '5',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    icon: Film,
    name: 'ستوري بورد',
    description: 'ستوري بورد فيديو 9 مشاهد',
    credits: '14',
    iconBg: 'bg-rose-100 dark:bg-rose-900/30',
    iconColor: 'text-rose-600 dark:text-rose-400',
  },
  {
    icon: BarChart3,
    name: 'التحليل التسويقي',
    description: 'تحليل SWOT + شخصيات + منافسين',
    credits: '3',
    iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
    iconColor: 'text-cyan-600 dark:text-cyan-400',
  },
  {
    icon: Mic,
    name: 'التعليق الصوتي',
    description: 'صوت احترافي بلهجتك المفضلة',
    credits: '1/30s',
    iconBg: 'bg-orange-100 dark:bg-orange-900/30',
    iconColor: 'text-orange-600 dark:text-orange-400',
  },
  {
    icon: Pencil,
    name: 'تعديل الصور',
    description: 'تعديل بالذكاء الاصطناعي',
    credits: '1',
    iconBg: 'bg-pink-100 dark:bg-pink-900/30',
    iconColor: 'text-pink-600 dark:text-pink-400',
  },
  {
    icon: Lightbulb,
    name: 'مساعد البرومبت',
    description: 'حوّل وصفك لبرومبت احترافي — مجاناً',
    credits: 'مجاني',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
  },
];

export function StudiosShowcase(): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="studios" className="py-20 px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-3 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          9 استوديوهات متخصصة في منصة واحدة
        </h2>
        <p className="mb-12 text-center text-[var(--color-text-secondary)]">
          من الفكرة للتنفيذ — كل شي تحتاجه لتسويق احترافي
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
                key={studio.name}
                variants={fadeInUp}
                whileHover={{
                  y: -6,
                  boxShadow: '0 20px 40px rgba(99,102,241,0.15)',
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
              >
                {/* Credit badge */}
                <Badge
                  variant={studio.credits === 'مجاني' ? 'success' : 'secondary'}
                  className="absolute end-4 top-4"
                >
                  {studio.credits}
                </Badge>

                <div className="flex flex-row items-start gap-4">
                  {/* Icon */}
                  <div className={`rounded-xl p-3 ${studio.iconBg}`}>
                    <Icon className={`h-6 w-6 ${studio.iconColor}`} />
                  </div>

                  {/* Text */}
                  <div className="flex-1 pe-12">
                    <h3 className="mb-1 font-semibold text-[var(--color-text-primary)]">
                      {studio.name}
                    </h3>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      {studio.description}
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
