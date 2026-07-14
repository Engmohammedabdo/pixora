'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QualityRatingProps {
  generationId?: string;
  onRate?: (rating: number) => void;
}

export function QualityRating({ generationId, onRate }: QualityRatingProps): React.ReactElement {
  const t = useTranslations('shared.qualityRating');
  const [rating, setRating] = useState<number | null>(null);

  const handleRate = (value: number): void => {
    setRating(value);
    onRate?.(value);
    // In production: POST to /api/generations/{id}/rate
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--color-text-muted)]">{t('question')}</span>
      <button
        type="button"
        onClick={() => handleRate(5)}
        aria-label={t('good')}
        aria-pressed={rating === 5}
        className={cn(
          'p-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          rating === 5
            ? 'bg-surface-2 text-[var(--color-success)] ring-1 ring-[var(--color-success)]'
            : 'hover:bg-surface-2 text-[var(--color-text-muted)]'
        )}
      >
        <ThumbsUp className="h-4 w-4" fill={rating === 5 ? 'currentColor' : 'none'} />
      </button>
      <button
        type="button"
        onClick={() => handleRate(1)}
        aria-label={t('bad')}
        aria-pressed={rating === 1}
        className={cn(
          'p-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
          rating === 1
            ? 'bg-surface-2 text-[var(--color-error)] ring-1 ring-[var(--color-error)]'
            : 'hover:bg-surface-2 text-[var(--color-text-muted)]'
        )}
      >
        <ThumbsDown className="h-4 w-4" fill={rating === 1 ? 'currentColor' : 'none'} />
      </button>
      {rating && <span className="text-xs text-[var(--color-success)]">{t('thanks')}</span>}
    </div>
  );
}
