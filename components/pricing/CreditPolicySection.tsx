import { useTranslations } from 'next-intl';
import { Lock, RotateCcw, History, Split } from 'lucide-react';

/**
 * Documents real, verified behaviour (lib/credits/deduct.ts + every studio
 * route under app/api/studios/*): credits are reserved atomically when a
 * generation starts and refunded automatically — via the same refund_credits
 * RPC, writing a visible `credit_transactions` row — when that generation
 * fails, including a proportional refund for partial failures (e.g. a
 * photoshoot where only some shots render). No competitor in
 * docs/COMPETITIVE_BENCHMARK.md documents this on their pricing surface.
 */
const POINTS = [
  { key: 'point1', icon: Lock },
  { key: 'point2', icon: RotateCcw },
  { key: 'point3', icon: History },
  { key: 'point4', icon: Split },
] as const;

export function CreditPolicySection(): React.ReactElement {
  const t = useTranslations('pricingPage.creditPolicy');

  return (
    <section className="py-16 px-6">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-[var(--color-border)]/50 bg-[var(--color-surface)] p-6 sm:p-8">
          <h2 className="mb-6 text-center font-cairo text-2xl font-bold text-[var(--color-text-primary)]">
            {t('title')}
          </h2>

          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {POINTS.map(({ key, icon: Icon }) => (
              <li key={key} className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)]">
                  <Icon className="h-4 w-4 text-[var(--color-brand)]" />
                </div>
                <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {t(key)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
