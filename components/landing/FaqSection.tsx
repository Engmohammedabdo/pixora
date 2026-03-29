'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    question: 'كيف يشتغل نظام الكريدت؟',
    answer:
      'كل عملية تستهلك كريدت حسب نوعها. صورة 1080p = 1 كريدت، حملة كاملة = 12 كريدت. تبدأ مجاناً بـ 25 كريدت.',
  },
  {
    question: 'هل أقدر أجرب قبل ما أدفع؟',
    answer:
      'طبعاً! الخطة المجانية تعطيك 25 كريدت شهرياً — كافية تجرب كل الاستوديوهات.',
  },
  {
    question: 'إيش الفرق بين النماذج؟',
    answer:
      'Gemini = الأسرع، GPT = الأعلى جودة، Flux = الأكثر إبداعية. تقدر تختار حسب احتياجك.',
  },
  {
    question: 'هل الكريدت تنتهي؟',
    answer:
      'كريدت الاشتراك تتجدد شهرياً. كريدت الشحن صالحة لمدة 12 شهر.',
  },
  {
    question: 'هل أقدر ألغي اشتراكي؟',
    answer:
      'نعم، في أي وقت من صفحة الفواتير. ما فيه عقود أو التزامات.',
  },
  {
    question: 'هل المنصة تدعم الإنجليزي؟',
    answer:
      'نعم! واجهة المنصة متوفرة بالعربية والإنجليزية مع دعم كامل لـ RTL و LTR.',
  },
  {
    question: 'كيف أشارك المحتوى مع فريقي؟',
    answer:
      'خطة Business وأعلى تدعم فريق حتى 20 عضو مع كريدت مشترك وإدارة صلاحيات.',
  },
];

export function FaqSection(): React.ReactElement {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section id="faq" className="py-20 px-6">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-12 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          أسئلة شائعة
        </h2>

        <div className="space-y-3">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="rounded-xl border border-[var(--color-border)]/50 overflow-hidden"
              >
                <button
                  onClick={() => toggle(index)}
                  className="w-full flex items-center justify-between p-5 text-start hover:bg-[var(--color-surface-2)]/50 transition-colors"
                >
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {faq.question}
                  </span>
                  <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.3 }}
                    className="shrink-0 ms-4"
                  >
                    <ChevronDown className="h-5 w-5 text-[var(--color-text-muted)]" />
                  </motion.div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
