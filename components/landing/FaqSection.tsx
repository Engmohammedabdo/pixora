'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    question: 'إيش هي Pyra AI؟',
    answer:
      'Pyra AI هو محرك الذكاء الاصطناعي اللي يدير كل الاستوديوهات التسعة في PyraSuite. هو اللي يفهم طلبك بالعربي ويحوّله لنتيجة احترافية — صور، حملات، خطط، تحليلات، وصوت.',
  },
  {
    question: 'كيف يشتغل نظام الكريدت؟',
    answer:
      'كل عملية لها تكلفة واضحة تشوفها قبل ما تضغط. صورة واحدة = 1 كريدت، حملة كاملة 9 بوستات = 12 كريدت. ما فيه مفاجآت. تبدأ بـ 25 كريدت مجاناً.',
  },
  {
    question: 'هل أقدر أجرب بدون ما أدفع؟',
    answer:
      'طبعاً! سجّل حساب مجاني وخذ 25 كريدت هدية — كافية تجرب كل الاستوديوهات التسعة وتشوف النتائج بنفسك.',
  },
  {
    question: 'هل Pyra AI تفهم العربي فعلاً؟',
    answer:
      'مش بس تفهم — مبنية بالعربي من الأساس. اكتب بالخليجي، المصري، الشامي، أو الفصحى. Pyra AI تفهم السياق وتطلع محتوى يبان طبيعي مش ترجمة.',
  },
  {
    question: 'هل الكريدت تنتهي؟',
    answer:
      'كريدت الاشتراك الشهري تتجدد كل شهر. كريدت الشحن (Top-up) صالحة لمدة 12 شهر — تشتريها وتستخدمها على كيفك.',
  },
  {
    question: 'إيش يصير لو خلصت الكريدت؟',
    answer:
      'تقدر تشحن كريدت إضافي بأي وقت بدون ما تغيّر باقتك. أو ترقّي لباقة أكبر — من صفحة الفواتير بضغطة.',
  },
  {
    question: 'هل أقدر ألغي اشتراكي؟',
    answer:
      'في أي وقت. بدون عقود، بدون التزامات، بدون أسئلة. ألغي من صفحة الفواتير وخلاص.',
  },
  {
    question: 'هل المنصة تدعم الإنجليزي؟',
    answer:
      'نعم — الواجهة متوفرة بالعربي والإنجليزي. بس القوة الحقيقية إن Pyra AI مصممة للعربي أول، مش ترجمة من الإنجليزي.',
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
        <h2 className="mb-4 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          أسئلة شائعة
        </h2>
        <p className="mb-12 text-center text-[var(--color-text-secondary)]">
          كل اللي تبي تعرفه قبل ما تبدأ
        </p>

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
