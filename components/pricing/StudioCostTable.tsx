import { useTranslations } from 'next-intl';
import {
  Image as PhotoIcon,
  Camera,
  LayoutGrid,
  Map,
  Film,
  BarChart3,
  Mic,
  Pencil,
  Lightbulb,
} from 'lucide-react';
import { CREDIT_COSTS, PHOTOSHOOT_SHOT_COSTS, PHOTOSHOOT_SHOT_OPTIONS } from '@/lib/credits/costs';
import { campaignCostBands } from '@/lib/credits/campaign-cost';
import { getVoiceoverConfig } from '@/lib/credits/voiceover-costs';

/**
 * The 9 shipped studios, in the same order as landing.studios (messages/*.json)
 * and components/layout/Sidebar.tsx, so names/icons never drift from what the
 * rest of the product calls them.
 *
 * `video` is deliberately excluded: CREDIT_COSTS.video exists as a reserved
 * cost for the "/video" studio, but that route is flagged `soon: true` in
 * Sidebar.tsx — it hasn't shipped, so publishing a price for it here would
 * be advertising a feature that doesn't exist yet.
 */
/**
 * ── WHY photoshoot AND campaign ARE NOT `flat` (2026-09-09) ────────────────
 *
 * Both rows read a real constant — `CREDIT_COSTS.photoshoot` (8) and
 * `.campaign` (12) — so nothing here was hardcoded. They were still wrong,
 * because those two constants are CEILINGS and this table's own subtitle
 * says "the actual cost of every generation":
 *
 *   photoshoot  app/api/studios/photoshoot/route.ts:29  SHOT_COSTS {1:2, 3:4, 6:8}
 *   campaign    app/api/studios/campaign/route.ts:131-132  reserves
 *               `input.generateImages ? full : text`, i.e. 12 or 3
 *
 * A visitor choosing one shot was quoted 4x what they are charged, and a
 * visitor who unticks "Generate All Images" — the cheaper path this very
 * page's FAQ advertises — was quoted 4x too.
 *
 * `lib/studios/cost-label.ts` already fixed exactly this for /studios/[slug]
 * and the /studios index, and documents the reasoning at length. This table
 * is the third public surface publishing these prices and was the one left
 * behind, so the two surfaces disagreed. The bands now come from the same
 * module the ROUTE imports (`campaignCostBands()`), never from a translation.
 *
 * Both figures and the per-shot breakdown come from `PHOTOSHOOT_SHOT_COSTS`,
 * which moved out of the route into lib/credits/costs.ts in the same change —
 * so no number in this cell, or in the ICU values it passes, is typed into a
 * translation. That matters twice over: it is the rule that let the admin
 * per-studio price knob be deleted, and `scripts/tests/studio-pages.test.ts`
 * now walks `pricingPage` too and fails a bare credit figure in any string.
 */
const SHOT_TIERS = PHOTOSHOOT_SHOT_OPTIONS.map((n) => ({ shots: n, cost: PHOTOSHOOT_SHOT_COSTS[n] }));
const PHOTOSHOOT_FLOOR = SHOT_TIERS[0].cost;

/**
 * Voiceover is billed per unit of TIME, and the unit itself changes with the
 * plan — lib/credits/voiceover-costs.ts bills free/starter at 1 credit per 15s
 * (OpenAI) and pro/business/agency at 3 per 20s (ElevenLabs). Both rates were
 * typed into `pricingPage.costTable.voiceoverNote`, i.e. a second copy of a
 * price, in the one table whose subtitle calls itself the actual cost. `starter`
 * and `pro` are the representative plans of the two provider bands, not a
 * hardcoded pair of numbers: change a rate in that module and this line follows.
 */
const BASIC_VOICE = getVoiceoverConfig('starter');
const PRO_VOICE = getVoiceoverConfig('pro');

const STUDIO_ROWS = [
  { key: 's1', icon: PhotoIcon, kind: 'image' as const },
  { key: 's2', icon: Camera, kind: 'shotRange' as const },
  { key: 's3', icon: LayoutGrid, kind: 'campaignBands' as const },
  { key: 's4', icon: Map, kind: 'flat' as const, cost: CREDIT_COSTS.plan },
  { key: 's5', icon: Film, kind: 'flat' as const, cost: CREDIT_COSTS.storyboard },
  { key: 's6', icon: BarChart3, kind: 'flat' as const, cost: CREDIT_COSTS.analysis },
  { key: 's7', icon: Mic, kind: 'voiceover' as const },
  { key: 's8', icon: Pencil, kind: 'flat' as const, cost: CREDIT_COSTS.edit },
  { key: 's9', icon: Lightbulb, kind: 'flat' as const, cost: CREDIT_COSTS.prompt },
] as const;

export function StudioCostTable(): React.ReactElement {
  const t = useTranslations('pricingPage.costTable');
  const tStudios = useTranslations('landing.studios');
  // The voiceover figure is COMPUTED, like the other rows. It was the typed
  // landing.studios.s7Credits — the last price in this table read from a translation.
  const tShared = useTranslations('studios.shared');
  const campaignBands = campaignCostBands();

  return (
    <section className="py-16 px-6">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-3 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          {t('title')}
        </h2>
        <p className="mb-10 text-center text-[var(--color-text-secondary)]">{t('subtitle')}</p>

        <div className="overflow-x-auto rounded-2xl border border-[color-mix(in_srgb,var(--color-border)_50%,transparent)]">
          <table className="w-full border-collapse text-start">
            <thead>
              <tr className="border-b border-[color-mix(in_srgb,var(--color-border)_50%,transparent)] bg-[var(--color-surface-2)]">
                <th className="p-4 text-start text-sm font-semibold text-[var(--color-text-primary)]">
                  {t('studioHeader')}
                </th>
                <th className="p-4 text-start text-sm font-semibold text-[var(--color-text-primary)]">
                  {t('costHeader')}
                </th>
              </tr>
            </thead>
            <tbody>
              {STUDIO_ROWS.map((row) => {
                const Icon = row.icon;
                return (
                  <tr key={row.key} className="border-b border-[color-mix(in_srgb,var(--color-border)_30%,transparent)] last:border-0">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)]">
                          <Icon className="h-4 w-4 text-[var(--color-brand)]" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[var(--color-text-primary)]">
                            {tStudios(`${row.key}Name`)}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {tStudios(`${row.key}Desc`)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 align-top">
                      {row.kind === 'image' && (
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-brand)]">
                            {CREDIT_COSTS.image['1080p']}–{CREDIT_COSTS.image['4K']} {t('creditUnit')}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">{t('imageNote')}</p>
                        </div>
                      )}
                      {row.kind === 'shotRange' && (
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-brand)]">
                            {PHOTOSHOOT_FLOOR}–{CREDIT_COSTS.photoshoot} {t('creditUnit')}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {t('shootNote', {
                              a: SHOT_TIERS[0].shots, aCost: SHOT_TIERS[0].cost,
                              b: SHOT_TIERS[1].shots, bCost: SHOT_TIERS[1].cost,
                              c: SHOT_TIERS[2].shots, cCost: SHOT_TIERS[2].cost,
                            })}
                          </p>
                        </div>
                      )}
                      {row.kind === 'campaignBands' && (
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-brand)]">
                            {campaignBands.text} {t('orLabel')} {campaignBands.full} {t('creditUnit')}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {t('campaignNote', {
                              text: campaignBands.text,
                              full: campaignBands.full,
                              posts: campaignBands.posts,
                            })}
                          </p>
                        </div>
                      )}
                      {row.kind === 'voiceover' && (
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-brand)]">
                            {tShared('perDurationShort', {
                              freeCredits: BASIC_VOICE.creditsPerUnit,
                              freeSeconds: BASIC_VOICE.unitSeconds,
                              paidCredits: PRO_VOICE.creditsPerUnit,
                              paidSeconds: PRO_VOICE.unitSeconds,
                            })}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {t('voiceoverNote', {
                              basicCredits: BASIC_VOICE.creditsPerUnit,
                              basicSeconds: BASIC_VOICE.unitSeconds,
                              proCredits: PRO_VOICE.creditsPerUnit,
                              proSeconds: PRO_VOICE.unitSeconds,
                            })}
                          </p>
                        </div>
                      )}
                      {row.kind === 'flat' && (
                        <p className="text-sm font-semibold text-[var(--color-brand)]">
                          {row.cost === 0 ? t('freeLabel') : t('creditsCount', { count: row.cost })}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
