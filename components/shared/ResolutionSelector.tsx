'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { getMaxResolution } from '@/lib/stripe/plans';
import { useUser } from '@/hooks/useUser';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { Coins, Lock } from 'lucide-react';
import type { Resolution } from '@/types/studios';

interface ResolutionSelectorProps {
  value: Resolution;
  onChange: (resolution: Resolution) => void;
  className?: string;
}

const resolutions: { id: Resolution; label: string }[] = [
  { id: '1080p', label: '1080p' },
  { id: '2K', label: '2K' },
  { id: '4K', label: '4K' },
];

// Same order the server enforces in app/api/studios/creator/route.ts — kept
// here rather than imported since that route belongs to a concurrent session.
const RESOLUTION_ORDER: Resolution[] = ['1080p', '2K', '4K'];

export function ResolutionSelector({ value, onChange, className }: ResolutionSelectorProps): React.ReactElement {
  const t = useTranslations('credits');
  const { profile } = useUser();
  const planId = profile?.plan_id ?? 'free';
  // free -> 1080p, starter -> 2K, pro/business/agency -> 4K (lib/stripe/plans.ts).
  const maxResIndex = RESOLUTION_ORDER.indexOf(getMaxResolution(planId));
  const [showUpgrade, setShowUpgrade] = useState(false);

  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-sm font-medium">{t('resolutionLabel')}</label>
      <div className="grid grid-cols-3 gap-2">
        {resolutions.map((res) => {
          // A free/starter user would otherwise pick 4K, wait through the whole
          // generation, and only then learn the server rejects it (403
          // resolution_not_available). Locking it here — same limits the route
          // enforces — surfaces the upgrade path before any credits are spent.
          const isLocked = RESOLUTION_ORDER.indexOf(res.id) > maxResIndex;
          return (
            <button
              key={res.id}
              type="button"
              onClick={() => (isLocked ? setShowUpgrade(true) : onChange(res.id))}
              aria-pressed={value === res.id}
              aria-disabled={isLocked}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
                isLocked && 'opacity-50',
                value === res.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                  : 'border-[var(--color-border)] hover:border-primary-300 hover:bg-surface-2'
              )}
            >
              <span className="flex items-center gap-1 font-medium">
                {res.label}
                {isLocked && <Lock className="h-3 w-3 shrink-0" />}
              </span>
              <span className="flex items-center gap-0.5 text-[11px] text-[var(--color-text-muted)]">
                <Coins className="h-3 w-3 shrink-0" />
                {CREDIT_COSTS.image[res.id]} {t('cost')}
              </span>
            </button>
          );
        })}
      </div>
      <UpgradePrompt
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        variant="resolution_locked"
        currentPlan={planId}
      />
    </div>
  );
}
