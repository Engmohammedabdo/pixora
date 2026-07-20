'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';

const EXAMPLES = [
  { labelKey: 'demo.ex1', image: 'https://placehold.co/600x600/6366F1/FFFFFF?text=Specialty+Coffee' },
  { labelKey: 'demo.ex2', image: 'https://placehold.co/600x600/06B6D4/FFFFFF?text=Skincare' },
  { labelKey: 'demo.ex3', image: 'https://placehold.co/600x600/F59E0B/FFFFFF?text=Burger+House' },
  { labelKey: 'demo.ex4', image: 'https://placehold.co/600x600/10B981/FFFFFF?text=Luxury+Perfume' },
] as const;

export function InteractiveDemo(): React.ReactElement {
  const t = useTranslations('landing');
  const [activeIndex, setActiveIndex] = useState(0);

  // This switcher previously ran a 600ms setTimeout and showed a spinner reading
  // "بايرا تشتغل…" while it waited. Nothing was being generated — the images are
  // pre-existing illustrative examples, which the badge and caption already say
  // plainly. Simulating generation work that is not happening is the one part of
  // this section that misled the visitor, so the delay and the spinner are gone
  // and switching is now instant. The honest framing in the copy stays.
  const handleSelect = (index: number): void => {
    if (index === activeIndex) return;
    setActiveIndex(index);
  };

  const active = EXAMPLES[activeIndex];

  return (
    <section className="py-20 px-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex justify-center">
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-sm font-medium text-[var(--color-text-secondary)]">
            {t('demo.badge')}
          </span>
        </div>
        <h2 className="mb-3 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          {t('demo.title')}
        </h2>
        <p className="mb-8 text-center text-[var(--color-text-secondary)]">
          {t('demo.subtitle')}
        </p>

        <div
          role="group"
          aria-label={t('demo.examplesAria')}
          className="mb-10 flex flex-wrap justify-center gap-3"
        >
          {EXAMPLES.map((example, index) => (
            <button
              key={example.labelKey}
              type="button"
              onClick={() => handleSelect(index)}
              aria-pressed={index === activeIndex}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                index === activeIndex
                  ? 'border-transparent bg-primary-500 text-white'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-primary-400 hover:text-[var(--color-text-primary)]'
              }`}
            >
              {t(example.labelKey)}
            </button>
          ))}
        </div>

        <div className="mx-auto max-w-md">
          <div className="relative aspect-square w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={active.labelKey}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25 }}
                className="absolute inset-0"
              >
                <Image
                  src={active.image}
                  alt={t(active.labelKey)}
                  width={600}
                  height={600}
                  className="h-full w-full rounded-2xl object-cover shadow-2xl"
                  unoptimized
                />
              </motion.div>
            </AnimatePresence>
          </div>

          <p className="mt-4 text-center text-sm text-[var(--color-text-muted)]">
            {t('demo.caption')}
          </p>

          <div className="mt-6 flex justify-center">
            <Button asChild className="gap-2 rounded-xl px-6">
              <Link href="/signup">
                <Sparkles className="h-4 w-4" />
                {t('demo.cta')}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
