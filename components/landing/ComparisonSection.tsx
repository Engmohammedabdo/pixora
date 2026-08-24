'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Check, X, Minus } from 'lucide-react';
import { fadeInUp } from '@/lib/animations';

/**
 * "Why not just use ChatGPT or Nano Banana?" — answered on the only axis where
 * the answer is true.
 *
 * ── THE ONE RULE THIS SECTION IS BUILT AROUND ──────────────────────────────
 * NOT A SINGLE CLAIM HERE IS ABOUT IMAGE QUALITY, and that is deliberate rather
 * than modest. Nano Banana is Google's Gemini Flash Image, and GPT Image is
 * OpenAI's — both are engines `lib/ai/router.ts` routes to. A page claiming our
 * images beat Nano Banana would be claiming we beat one of our own providers:
 * false, and falsifiable by anyone who reads a network tab.
 *
 * So every row compares the WORKFLOW, where the difference is real and provable
 * from this repo: they return an image, we return a campaign, a plan, an
 * analysis, a storyboard, a voiceover and a file library, from a sentence typed
 * in dialect. `comparison.note` says the quiet part out loud — the engine is not
 * the difference — which turns the strongest objection to this section into its
 * opening argument.
 *
 * ── EVERY CELL IS CHECKED AGAINST THE CODEBASE ─────────────────────────────
 * `brandkit` says colours and voice, NOT the logo: `lib/ai/` has zero references
 * to a logo, and CLAUDE.md records that as a known gap. Writing "your logo" here
 * would be the exact class of claim the July 2026 audit was called to clean up.
 *
 * Competitor cells use three states, not two. A bare ✗ on a row a competitor
 * partly covers reads as dishonest to anyone who has used the tool, and one such
 * row discredits the other seven. `partial` is worth more than a cross.
 *
 * NO COMPETITOR PRICES. They move, this page is cached for an hour, and a stale
 * price beside a competitor's name is the one factual error in a comparison
 * table that is genuinely worth avoiding.
 */

/**
 * The PyraSuite column's tint and rules, in one place so the header and the eight
 * body cells cannot drift apart.
 *
 * It sits SECOND — right after the feature label, before both competitors — and
 * that is a mobile decision, not a stylistic one. The table is 640px wide inside a
 * horizontally scrolling wrapper; measured at a 414px viewport, a reader sees the
 * feature column and roughly one more. With our column last, the one column this
 * section exists to show was the one column a phone never displayed until the
 * reader thought to swipe. Borders on both sides because it is now flanked.
 */
const HIGHLIGHT =
  'border-s border-e border-[color-mix(in_srgb,var(--color-brand)_25%,transparent)] bg-[color-mix(in_srgb,var(--color-brand)_8%,transparent)]';

type Support = 'yes' | 'partial' | 'no';

interface Row {
  key: string;
  chatgpt: Support;
  nano: Support;
}

/**
 * Nano Banana is an image model and nothing else, so its `no` cells are a
 * statement of scope, not a criticism — the copy in `messages/*.json` says so.
 */
const ROWS: Row[] = [
  { key: 'brief', chatgpt: 'partial', nano: 'partial' },
  { key: 'campaign', chatgpt: 'no', nano: 'no' },
  { key: 'plan', chatgpt: 'partial', nano: 'no' },
  { key: 'analysis', chatgpt: 'partial', nano: 'no' },
  { key: 'brandkit', chatgpt: 'partial', nano: 'partial' },
  { key: 'product', chatgpt: 'partial', nano: 'partial' },
  { key: 'voiceover', chatgpt: 'partial', nano: 'no' },
  { key: 'library', chatgpt: 'no', nano: 'no' },
];

function SupportMark({ state }: { state: Support }): React.ReactElement {
  if (state === 'yes') {
    return <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />;
  }
  if (state === 'partial') {
    return <Minus className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />;
  }
  return <X className="h-4 w-4 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />;
}

export function ComparisonSection(): React.ReactElement {
  const t = useTranslations('landing.comparison');
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="scroll-mt-20 py-20 px-6">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-3 text-center font-cairo text-3xl font-bold leading-[1.4] text-[var(--color-text-primary)]">
          {t('title')}
        </h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-[var(--color-text-secondary)]">
          {t('subtitle')}
        </p>

        <motion.div
          ref={ref}
          variants={fadeInUp}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          className="overflow-x-auto rounded-2xl border border-[color-mix(in_srgb,var(--color-border)_50%,transparent)]"
        >
          <table className="w-full min-w-[640px] border-collapse text-start">
            <caption className="sr-only">{t('tableCaption')}</caption>
            <thead>
              <tr className="border-b border-[color-mix(in_srgb,var(--color-border)_50%,transparent)] bg-[var(--color-surface-2)]">
                <th scope="col" className="p-4 text-start text-sm font-semibold text-[var(--color-text-primary)]">
                  {t('cols.feature')}
                </th>
                <th scope="col" className={`${HIGHLIGHT} p-4 text-start text-sm font-bold text-[var(--color-brand)]`}>
                  {t('cols.pyra')}
                </th>
                <th scope="col" className="p-4 text-start text-sm font-medium text-[var(--color-text-secondary)]">
                  {t('cols.chatgpt')}
                </th>
                <th scope="col" className="p-4 text-start text-sm font-medium text-[var(--color-text-secondary)]">
                  {t('cols.nano')}
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-[color-mix(in_srgb,var(--color-border)_30%,transparent)] last:border-0"
                >
                  <th
                    scope="row"
                    className="p-4 text-start text-sm font-medium leading-relaxed text-[var(--color-text-primary)]"
                  >
                    {t(`rows.${row.key}.label`)}
                  </th>
                  <td className={`${HIGHLIGHT} p-4 align-top`}>
                    <div className="flex items-start gap-2">
                      <SupportMark state="yes" />
                      <span className="text-xs font-medium leading-relaxed text-[var(--color-text-primary)]">
                        {t(`rows.${row.key}.pyra`)}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 align-top">
                    <div className="flex items-start gap-2">
                      <SupportMark state={row.chatgpt} />
                      <span className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                        {t(`rows.${row.key}.chatgpt`)}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 align-top">
                    <div className="flex items-start gap-2">
                      <SupportMark state={row.nano} />
                      <span className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
                        {t(`rows.${row.key}.nano`)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        {/* The objection, answered before it is raised. */}
        <p className="mx-auto mt-6 max-w-2xl text-center text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {t('note')}
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-center text-xs leading-relaxed text-[var(--color-text-muted)]">
          {t('disclaimer')}
        </p>
      </div>
    </section>
  );
}
