'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Store, Users, MapPin, Palette, Megaphone, Check } from 'lucide-react';
import { staggerContainer, fadeInUp } from '@/lib/animations';

/**
 * "Pyra knows your business" — the one thing this product does that a general
 * image generator cannot.
 *
 * ── WHY THIS SECTION EXISTS AT ALL ─────────────────────────────────────────
 * Until 2026-08-25, `grep -rn "project" lib/ai/prompts/*.ts` returned 0. A
 * shawarma shop in Dubai and a SaaS startup in Riyadh produced a BYTE-IDENTICAL
 * prompt for the same studio. The product asked for the customer's business
 * three separate times across three forms and carried the answer nowhere.
 *
 * That is fixed, and it is the single most valuable thing the product gained.
 * It was also completely invisible on this page — the landing page still sold
 * "nine studios" and "Arabic", which is what every competitor says.
 *
 * ── WHY IT IS ITS OWN SECTION AND NOT A FIFTH PILLAR ───────────────────────
 * `ValuePillars` is `lg:grid-cols-4` and full; a fifth card orphans on a wide
 * screen. More importantly the pillars are one-line claims, and this one needs
 * to show BOTH halves — what you hand over once, and where it comes back — or
 * it reads as another "personalised!" claim nobody believes.
 *
 * Placed directly after `HowItWorks` on purpose. The reader has just been told
 * the whole product is three steps; the immediate objection is "then how would
 * it know anything about MY business?" This answers that in the same scroll,
 * before the examples arrive to prove it.
 *
 * ── HONESTY CONSTRAINT ─────────────────────────────────────────────────────
 * Everything claimed here is live and verified. Two adjacent features were
 * deliberately LEFT OFF this page:
 *   - reading your brand off your website URL, which returns 503 in production
 *     today because the n8n credential is not set;
 *   - Arabic text inside generated images, which renders the requested string
 *     correctly but also paints invented garbled text elsewhere in the frame.
 * Both are real work that shipped, and neither is ready to be promised to a
 * stranger. This repo's catalogue is mostly claims that outlived their feature.
 */

const FACTS = [
  { key: 'industry', icon: Store },
  { key: 'audience', icon: Users },
  { key: 'city', icon: MapPin },
  { key: 'brand', icon: Palette },
  { key: 'voice', icon: Megaphone },
] as const;

const OUTCOME_KEYS = ['o1', 'o2', 'o3', 'o4'] as const;

export function KnowsYourBusiness(): React.ReactElement {
  const t = useTranslations('landing.knows');
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="bg-[var(--color-bg)] px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <span className="mb-4 inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-sm font-medium text-[var(--color-text-secondary)]">
            {t('badge')}
          </span>
          {/* leading-[1.4], not leading-tight: text-3xl ships a line-height of 1
              and Arabic does not survive that — the alif/lam ascenders collide
              with the descenders of the line above. Same fix as the waitlist h1. */}
          <h2 className="mb-3 font-cairo text-3xl font-bold leading-[1.4] text-[var(--color-text-primary)]">
            {t('title')}
          </h2>
          <p className="leading-relaxed text-[var(--color-text-secondary)]">{t('subtitle')}</p>
        </div>

        <motion.div
          ref={ref}
          variants={staggerContainer}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 gap-6 md:grid-cols-2"
        >
          {/* Left: what the customer hands over, once. */}
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
          >
            <p className="mb-1 text-sm font-semibold text-[var(--color-text-primary)]">
              {t('onceTitle')}
            </p>
            <p className="mb-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {t('onceBody')}
            </p>

            <ul className="flex flex-wrap gap-2">
              {FACTS.map(({ key, icon: Icon }) => (
                <li
                  key={key}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm text-[var(--color-text-primary)]"
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary-500" aria-hidden="true" />
                  {t(`facts.${key}`)}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Right: where it comes back. Without this half the left half is just
              another signup form asking for more information. */}
          <motion.div
            variants={fadeInUp}
            className="rounded-2xl border border-[color-mix(in_srgb,var(--color-brand)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-brand)_6%,transparent)] p-6"
          >
            <p className="mb-1 text-sm font-semibold text-[var(--color-text-primary)]">
              {t('everyTitle')}
            </p>
            <p className="mb-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              {t('everyBody')}
            </p>

            <ul className="flex flex-col gap-3">
              {OUTCOME_KEYS.map((key) => (
                <li key={key} className="flex items-start gap-2.5">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-brand)]"
                    aria-hidden="true"
                  />
                  <span className="text-sm leading-relaxed text-[var(--color-text-primary)]">
                    {t(`outcomes.${key}`)}
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-[var(--color-text-muted)]">
          {t('footnote')}
        </p>
      </div>
    </section>
  );
}
