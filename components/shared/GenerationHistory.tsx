'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';

export interface HistoryItem {
  id: string;
  imageUrl?: string;
  studio: string;
  createdAt: string;
  creditsUsed: number;
}

interface GenerationHistoryProps {
  items: HistoryItem[];
  onSelect?: (item: HistoryItem) => void;
  className?: string;
}

export function GenerationHistory({ items, onSelect, className }: GenerationHistoryProps): React.ReactElement {
  const t = useTranslations('dashboard');

  if (items.length === 0) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-[var(--color-text-muted)]', className)}>
        <Clock className="h-4 w-4" />
        <span>{t('noGenerations')}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2 overflow-x-auto pb-1', className)}>
      {items.slice(0, 5).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect?.(item)}
          className="flex-shrink-0 group relative rounded-lg border overflow-hidden hover:ring-2 hover:ring-primary-500 transition-all"
        >
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="h-16 w-16 object-cover"
            />
          ) : (
            <div className="h-16 w-16 bg-surface-2 flex items-center justify-center text-xs text-[var(--color-text-muted)]">
              Text
            </div>
          )}
          <Badge
            variant="secondary"
            className="absolute bottom-0.5 start-0.5 text-[8px] px-1 py-0"
          >
            {item.creditsUsed}c
          </Badge>
        </button>
      ))}
    </div>
  );
}
