'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight } from 'lucide-react';
import {
  fadeInUp,
  slideInRight,
  slideInLeft,
  staggerContainer,
} from '@/lib/animations';
import { PLANS } from '@/lib/stripe/plans';

const TYPEWRITER_WORD_KEYS = ['word1', 'word2', 'word3', 'word4', 'word5'] as const;

const FLOATING_CARDS = [
  {
    emoji: '🖼️',
    labelKey: 'card1',
    gradient: 'from-purple-500 to-pink-500',
    size: 'w-48 h-32',
    position: 'top-8 end-0',
    duration: 3,
  },
  {
    emoji: '📱',
    labelKey: 'card2',
    gradient: 'from-amber-500 to-orange-500',
    size: 'w-56 h-36',
    position: 'top-36 end-24',
    duration: 4,
  },
  {
    emoji: '📊',
    labelKey: 'card3',
    gradient: 'from-blue-500 to-cyan-500',
    size: 'w-44 h-28',
    position: 'top-64 end-4',
    duration: 5,
  },
] as const;

export function HeroSection(): React.ReactElement {
  const t = useTranslations('landing');
  const locale = useLocale();
  const [wordIndex, setWordIndex] = useState(0);

  // slideInLeft/Right use physical x offsets — mirror them per direction so the
  // text column always enters from its own side (right in RTL, left in LTR).
  const isRtl = locale === 'ar';
  const slideInTextSide = isRtl ? slideInRight : slideInLeft;
  const slideInVisualSide = isRtl ? slideInLeft : slideInRight;

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((prev) => (prev + 1) % TYPEWRITER_WORD_KEYS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative overflow-hidden min-h-[90vh] flex flex-col justify-center">
      {/* Background gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.10),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_80%,rgba(236,72,153,0.05),transparent)]" />
        <motion.div
          className="absolute top-20 start-10 w-72 h-72 rounded-full bg-primary-500/5 blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-20 end-10 w-96 h-96 rounded-full bg-accent-500/5 blur-3xl"
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 w-full">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* Text side */}
          <motion.div
            className="flex-1 text-center lg:text-start"
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.div variants={slideInTextSide}>
              <Badge variant="secondary" className="mb-6 gap-1.5 px-4 py-1.5 text-sm">
                <span>🦊</span>
                {t('hero.badge')}
              </Badge>
            </motion.div>

            <motion.h1
              variants={slideInTextSide}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold font-cairo leading-tight mb-6"
            >
              {t('hero.titleLine1')}
              <br />
              <span className="inline-block min-w-[16ch] bg-gradient-to-l from-primary-500 to-accent-500 bg-clip-text text-transparent after:content-['|'] after:text-[var(--color-brand)] after:animate-pulse after:ms-1">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={wordIndex}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                    className="inline-block"
                  >
                    {t(`hero.${TYPEWRITER_WORD_KEYS[wordIndex]}`)}
                  </motion.span>
                </AnimatePresence>
              </span>
            </motion.h1>

            <p className="text-base sm:text-lg text-[var(--color-text-secondary)] max-w-2xl mb-6 mx-auto lg:mx-0 leading-relaxed">
              {t('hero.definition')}
            </p>

            <motion.p
              variants={slideInTextSide}
              className="text-lg sm:text-xl text-[var(--color-text-secondary)] max-w-2xl mb-10 mx-auto lg:mx-0 leading-relaxed"
            >
              {t('hero.subtitle1')}
              <br className="hidden sm:block" />
              {t('hero.subtitle2')} <strong>{t('hero.subtitleStrong')}</strong>
            </motion.p>

            <motion.div
              variants={slideInTextSide}
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-4"
            >
              <Button size="lg" className="text-base px-8 gap-2" asChild>
                <Link href="/signup">
                  {t('hero.ctaPrimary')}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="text-base px-8" asChild>
                <a href="#studios">{t('hero.ctaSecondary')}</a>
              </Button>
            </motion.div>

            {/* The launch-gift pill that sat here is gone. It promised 100
                credits granted by `redeem_invite()`, and with the invite gate
                open there are no invites to redeem — a new account gets the
                free plan's own allowance instead. A promise the product cannot
                keep is a refund conversation, not a marketing line.

                The number below is read from PLANS.free rather than typed, so
                the copy cannot drift from what the account actually receives —
                the same rule `lib/credits/beta.ts` was written to enforce for
                the figure this replaces. */}

            <motion.p
              variants={slideInTextSide}
              className="text-xs text-[var(--color-text-muted)]"
            >
              {t('hero.microcopy', { credits: PLANS.free.credits })}
            </motion.p>
          </motion.div>

          {/*
            MOBILE PROOF — added 2026-08-29.

            The visual column below is `hidden lg:block`, so below 1024px the hero
            of an IMAGE-GENERATION product rendered no image at all, and the first
            real photograph on the page was in the SIXTH section. The Gulf Meta
            audience this page is bought for is overwhelmingly mobile, and the ad
            that delivers them is a picture — so the landing page opened by
            failing to answer the only question the ad had raised.

            A real generated output, not an illustration: `shawarma.jpg` is the
            deliberate lead example (see InteractiveDemo's header) and it is the
            same business the copy names two lines above. `priority` because this
            is the LCP element on mobile; explicit width/height so it reserves its
            box and cannot shift the CTA under the reader's thumb.
          */}
          <div className="lg:hidden w-full mt-8">
            <figure className="relative rounded-2xl overflow-hidden border border-[var(--color-surface-2)] shadow-xl">
              <Image
                src="/examples/shawarma.jpg"
                alt={t('hero.exampleAlt')}
                width={1024}
                height={1024}
                priority
                sizes="(max-width: 1024px) 100vw, 0px"
                className="w-full h-auto"
              />
              <figcaption className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-4 pt-8 pb-3">
                <span className="text-xs text-white/95 leading-relaxed">{t('hero.exampleCaption')}</span>
              </figcaption>
            </figure>
          </div>

          {/* Visual side — hidden on mobile (the block above covers <lg) */}
          <motion.div
            className="flex-1 hidden lg:block relative min-h-[400px]"
            variants={slideInVisualSide}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {FLOATING_CARDS.map((card, i) => (
              <motion.div
                key={i}
                className={`absolute ${card.position} ${card.size} rounded-2xl shadow-2xl border border-[var(--color-surface-2)] bg-[var(--color-surface)] overflow-hidden`}
                animate={{ y: [0, -15, 0] }}
                transition={{
                  duration: card.duration,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <div className={`h-3/4 bg-gradient-to-br ${card.gradient} opacity-80 flex items-center justify-center`}>
                  <span className="text-3xl">{card.emoji}</span>
                </div>
                <div className="px-3 py-2">
                  <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                    {t(`hero.${card.labelKey}`)}
                  </span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Stats bar */}
        <motion.div
          className="mt-16 flex justify-center"
          variants={fadeInUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <div className="inline-flex items-center gap-4 bg-[var(--color-surface-2)] rounded-full px-6 py-3">
            {[t('hero.stat1'), t('hero.stat2'), t('hero.stat3')].map((stat, i) => (
              <span key={i} className="flex items-center gap-4">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {stat}
                </span>
                {i < 2 && (
                  <span className="text-[var(--color-text-muted)]">·</span>
                )}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
