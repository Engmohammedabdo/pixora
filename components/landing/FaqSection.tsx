'use client';

import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { faqParams } from '@/lib/landing/faq-params';

const FAQ_PARAMS = faqParams();

const FAQ_KEYS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export function FaqSection(): React.ReactElement {
  const t = useTranslations('landing');

  return (
    <section id="faq" className="scroll-mt-20 py-20 px-6">
      <div className="mx-auto max-w-3xl">
        <h2 className="mb-4 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          {t('faq.title')}
        </h2>
        <p className="mb-12 text-center text-[var(--color-text-secondary)]">
          {t('faq.subtitle')}
        </p>

        <div className="space-y-3">
          {FAQ_KEYS.map((num) => {
            return (
              <details
                key={num}
                className="group rounded-xl border border-[color-mix(in_srgb,var(--color-border)_50%,transparent)] overflow-hidden"
              >
                <summary className="list-none cursor-pointer w-full flex items-center justify-between p-5 text-start hover:bg-[color-mix(in_srgb,var(--color-surface-2)_50%,transparent)] transition-colors">
                  <span className="font-medium text-[var(--color-text-primary)]">{t(`faq.q${num}`)}</span>
                  <ChevronDown className="h-5 w-5 shrink-0 ms-4 text-[var(--color-text-muted)] transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-5 pb-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {/* `credits` is passed to EVERY answer; next-intl ignores a param an
                      answer does not reference. PLANS.free is the one source. */}
                  {/*
                    a2 is the pricing answer, and it is also PUBLISHED as
                    JSON-LD FAQPage — so a number typed into it reaches answer
                    engines, not just readers. It stated the campaign's 12 as
                    the only price while the route reserves 3 for the text-only
                    path; both bands now come from the module the route imports.
                  */}
                  {t(`faq.a${num}`, FAQ_PARAMS)}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
