'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';

const FAQ_KEYS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export function FaqSection(): React.ReactElement {
  const t = useTranslations('landing');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section id="faq" className="py-20 px-6">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-4 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          {t('faq.title')}
        </h2>
        <p className="mb-12 text-center text-[var(--color-text-secondary)]">
          {t('faq.subtitle')}
        </p>

        <div className="space-y-3">
          {FAQ_KEYS.map((num, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={num}
                className="rounded-xl border border-[var(--color-border)]/50 overflow-hidden"
              >
                <button
                  onClick={() => toggle(index)}
                  className="w-full flex items-center justify-between p-5 text-start hover:bg-[var(--color-surface-2)]/50 transition-colors"
                >
                  <span className="font-medium text-[var(--color-text-primary)]">
                    {t(`faq.q${num}`)}
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
                        {t(`faq.a${num}`)}
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
