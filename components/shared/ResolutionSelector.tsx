'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { Coins } from 'lucide-react';
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

export function ResolutionSelector({ value, onChange, className }: ResolutionSelectorProps): React.ReactElement {
  const t = useTranslations('credits');

  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-sm font-medium">Resolution</label>
      <div className="flex gap-2">
        {resolutions.map((res) => (
          <button
            key={res.id}
            type="button"
            onClick={() => onChange(res.id)}
            aria-pressed={value === res.id}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition-colors',
              value === res.id
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-[var(--color-border)] hover:border-primary-300'
            )}
          >
            <span className="font-medium">{res.label}</span>
            <span className="flex items-center gap-0.5 text-xs text-[var(--color-text-muted)]">
              <Coins className="h-3 w-3" />
              {CREDIT_COSTS.image[res.id]} {t('cost')}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
