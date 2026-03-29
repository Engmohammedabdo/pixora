'use client';
import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QualityRatingProps {
  generationId?: string;
  onRate?: (rating: number) => void;
}

export function QualityRating({ generationId, onRate }: QualityRatingProps): React.ReactElement {
  const [rating, setRating] = useState<number | null>(null);

  const handleRate = (value: number): void => {
    setRating(value);
    onRate?.(value);
    // In production: POST to /api/generations/{id}/rate
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--color-text-muted)]">كيف النتيجة؟</span>
      <button onClick={() => handleRate(5)} className={cn('p-1.5 rounded-lg transition-colors', rating === 5 ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'hover:bg-surface-2 text-[var(--color-text-muted)]')}>
        <ThumbsUp className="h-4 w-4" />
      </button>
      <button onClick={() => handleRate(1)} className={cn('p-1.5 rounded-lg transition-colors', rating === 1 ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'hover:bg-surface-2 text-[var(--color-text-muted)]')}>
        <ThumbsDown className="h-4 w-4" />
      </button>
      {rating && <span className="text-xs text-[var(--color-success)]">شكراً!</span>}
    </div>
  );
}
