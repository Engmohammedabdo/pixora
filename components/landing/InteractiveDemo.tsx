'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { PLANS } from '@/lib/stripe/plans';

/**
 * "See what Pyra can do" — with the brief on one side and the result on the other.
 *
 * This section used to render four `placehold.co` squares: flat colour blocks with
 * ENGLISH text ("Specialty Coffee") burned in by a third-party image service, on the
 * landing page of a product whose whole pitch is that it is Arabic-first. It showed
 * nothing the product makes, in the wrong language, served from someone else's
 * domain.
 *
 * The images are now real, generated for this page and committed to `public/examples`
 * so they load from our own origin and cannot expire or change under us.
 *
 * The brief beside each one is the other half of the point. Briefs in this market
 * arrive as WhatsApp messages in dialect, not as filled-in forms — showing the
 * sentence a client would actually send is what makes "write it in Arabic" concrete.
 *
 * ── WHY THE PER-ITEM CREDIT PRICES ARE GONE ────────────────────────────────
 * Each deliverable used to carry its own credit pill, plus a summed "total" row.
 * Three reasons that was wrong HERE, none of which is a reason to hide prices:
 *
 *   1. This section is 4th on the page; `PricingSection` is 7th. A first-time
 *      visitor reads "12 credits" with nothing to measure it against, and an
 *      unanchored cost beside a deliverable does not read as cheap — it reads as
 *      metered, in the one section whose entire job is to create desire.
 *   2. `/pricing` already renders `StudioCostTable` — every studio, every price,
 *      from this same `CREDIT_COSTS`. The pills duplicated that table three
 *      sections early, minus the plan context that makes it legible.
 *   3. It buried the actual argument. The coffee brief totals 19 credits out of a
 *      200-credit Starter plan; that ratio is the persuasive fact, and "19 كريدت"
 *      does not convey it.
 *
 * So the deliverables stay — they are what makes the claim "one sentence → a
 * campaign, a plan AND this image" instead of "one sentence → this image" — and
 * the one number that survives is stated against the plan that pays for it.
 *
 * Both halves of that line still come from the modules checkout reads
 * (`CREDIT_COSTS`, `PLANS`), so the marketing page cannot quote a figure the
 * checkout disagrees with. Verified across all four briefs: 19, 21, 23 and 27
 * credits — every one under a seventh of a Starter month.
 */

interface Example {
  key: string;
  image: string;
  deliverables: { key: string; credits: number }[];
}

const EXAMPLES: Example[] = [
  // First, and deliberately. The other four are the categories a generic AI
  // tool would also list; a shawarma shop in Al Karama is the customer this
  // product was actually designed around, and it is the one brief on this page
  // a Gulf visitor recognises as their own rather than as a stock example.
  //
  // It is also the only one whose deliverables include the `food` photoshoot
  // environment added 2026-08-25 — six real food-photography recipes instead of
  // a white studio set that told the model "no props" and then asked for the
  // brand colour in the set dressing.
  {
    key: 'shawarma',
    image: '/examples/shawarma.jpg',
    deliverables: [
      { key: 'photoshoot', credits: CREDIT_COSTS.photoshoot },
      { key: 'campaign', credits: CREDIT_COSTS.campaign },
      { key: 'plan', credits: CREDIT_COSTS.plan },
    ],
  },
  {
    key: 'coffee',
    image: '/examples/coffee.jpg',
    deliverables: [
      { key: 'creator', credits: CREDIT_COSTS.image['2K'] },
      { key: 'campaign', credits: CREDIT_COSTS.campaign },
      { key: 'plan', credits: CREDIT_COSTS.plan },
    ],
  },
  {
    key: 'skincare',
    image: '/examples/skincare.jpg',
    deliverables: [
      { key: 'photoshoot', credits: CREDIT_COSTS.photoshoot },
      { key: 'campaign', credits: CREDIT_COSTS.campaign },
      { key: 'voiceover', credits: CREDIT_COSTS.voiceover },
    ],
  },
  {
    key: 'burger',
    image: '/examples/burger.jpg',
    deliverables: [
      { key: 'photoshoot', credits: CREDIT_COSTS.photoshoot },
      { key: 'campaign', credits: CREDIT_COSTS.campaign },
      { key: 'analysis', credits: CREDIT_COSTS.analysis },
    ],
  },
  {
    key: 'perfume',
    image: '/examples/perfume.jpg',
    deliverables: [
      { key: 'photoshoot', credits: CREDIT_COSTS.photoshoot },
      { key: 'storyboard', credits: CREDIT_COSTS.storyboard },
      { key: 'plan', credits: CREDIT_COSTS.plan },
    ],
  },
];

/**
 * The plan the credit total is measured against.
 *
 * Starter, not Free: Free is 25 credits, so every brief on this page would read as
 * most of the month and the line would argue against the product. Starter is also
 * the first paid tier, which is the decision this section is trying to move a
 * visitor toward.
 */
const ANCHOR_PLAN = PLANS.starter;

export function InteractiveDemo(): React.ReactElement {
  const t = useTranslations('landing');
  const locale = useLocale();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = EXAMPLES[activeIndex];
  const total = active.deliverables.reduce((sum, d) => sum + d.credits, 0);

  return (
    <section className="scroll-mt-20 bg-[var(--color-surface-2)] py-20 px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex justify-center">
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-sm font-medium text-[var(--color-text-secondary)]">
            {t('demo.badge')}
          </span>
        </div>
        <h2 className="mb-3 text-center font-cairo text-3xl font-bold leading-[1.4] text-[var(--color-text-primary)]">
          {t('demo.title')}
        </h2>
        <p className="mb-10 text-center text-[var(--color-text-secondary)]">
          {t('demo.subtitle')}
        </p>

        <div
          role="group"
          aria-label={t('demo.examplesAria')}
          className="mb-10 flex flex-wrap justify-center gap-3"
        >
          {EXAMPLES.map((example, index) => (
            <button
              key={example.key}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-pressed={index === activeIndex}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                index === activeIndex
                  ? 'border-transparent bg-primary-500 text-white'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] hover:border-primary-400 hover:text-[var(--color-text-primary)]'
              }`}
            >
              {t(`demo.examples.${example.key}.label`)}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={active.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="grid items-start gap-8 md:grid-cols-2"
          >
            {/* ── What the client said ──────────────────────────────────────
                A message bubble, because that is the real artefact: briefs here
                arrive over WhatsApp, in dialect, unpunctuated. `rounded-ss-sm`
                squares the start-side corner into a tail that stays correct in
                both text directions. */}
            <div>
              <p className="mb-3 text-sm font-medium text-[var(--color-text-muted)]">
                {t('demo.briefLabel')}
              </p>
              <div className="rounded-2xl rounded-ss-sm bg-[var(--color-surface)] p-6 shadow-sm ring-1 ring-[var(--color-border)]">
                <p className="font-cairo text-lg leading-[1.9] text-[var(--color-text-primary)] sm:text-xl">
                  {t(`demo.examples.${active.key}.brief`)}
                </p>
              </div>

              <ul className="mt-6 divide-y divide-[var(--color-border)] overflow-hidden rounded-2xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
                {active.deliverables.map((d) => (
                  <li key={d.key} className="flex items-center gap-3 px-5 py-3">
                    <Check className="h-4 w-4 flex-shrink-0 text-emerald-500" aria-hidden="true" />
                    <span className="text-sm leading-relaxed text-[var(--color-text-primary)]">
                      {t(`demo.deliverables.${d.key}`)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* The one number that survives, stated against the plan that buys it.
                  Every figure is passed as a STRING on purpose: locale `ar` has no
                  numberFormat override, so an ICU number argument renders as
                  Arabic-Indic digits (١٩) while /pricing — where this line sends the
                  reader — interpolates raw JSX and shows Latin (19). Same number, two
                  scripts, one page apart. A string passes through ICU untouched. */}
              <p className="mt-3 px-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {t('demo.valueAnchor', {
                  credits: String(total),
                  planCredits: String(ANCHOR_PLAN.credits),
                  planPrice: String(ANCHOR_PLAN.price),
                  planName: locale === 'ar' ? ANCHOR_PLAN.nameAr : ANCHOR_PLAN.name,
                })}
              </p>
            </div>

            {/* ── What came back ──────────────────────────────────────────── */}
            <div>
              <p className="mb-3 text-sm font-medium text-[var(--color-text-muted)]">
                {t('demo.outputLabel')}
              </p>
              <Image
                src={active.image}
                alt={t(`demo.examples.${active.key}.alt`)}
                width={1024}
                height={1024}
                sizes="(max-width: 768px) 100vw, 480px"
                className="aspect-square w-full rounded-2xl object-cover shadow-lg ring-1 ring-[var(--color-border)]"
                priority={activeIndex === 0}
              />
            </div>
          </motion.div>
        </AnimatePresence>

        <p className="mt-8 text-center text-sm text-[var(--color-text-muted)]">
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
    </section>
  );
}
