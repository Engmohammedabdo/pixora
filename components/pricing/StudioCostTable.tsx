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
import { CREDIT_COSTS } from '@/lib/credits/costs';

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
const STUDIO_ROWS = [
  { key: 's1', icon: PhotoIcon, kind: 'image' as const },
  { key: 's2', icon: Camera, kind: 'flat' as const, cost: CREDIT_COSTS.photoshoot },
  { key: 's3', icon: LayoutGrid, kind: 'flat' as const, cost: CREDIT_COSTS.campaign },
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

  return (
    <section className="py-16 px-6">
      <div className="mx-auto max-w-4xl">
        <h2 className="mb-3 text-center font-cairo text-3xl font-bold text-[var(--color-text-primary)]">
          {t('title')}
        </h2>
        <p className="mb-10 text-center text-[var(--color-text-secondary)]">{t('subtitle')}</p>

        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]/50">
          <table className="w-full border-collapse text-start">
            <thead>
              <tr className="border-b border-[var(--color-border)]/50 bg-[var(--color-surface-2)]">
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
                  <tr key={row.key} className="border-b border-[var(--color-border)]/30 last:border-0">
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
                      {row.kind === 'voiceover' && (
                        <div>
                          <p className="text-sm font-semibold text-[var(--color-brand)]">
                            {tStudios('s7Credits')}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">{t('voiceoverNote')}</p>
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
