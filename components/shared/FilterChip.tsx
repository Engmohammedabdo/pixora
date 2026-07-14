'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface FilterChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected: boolean;
}

/** Shared filter-pill button used by PromptHistory / PromptTemplateLibrary. */
export function FilterChip({ selected, className, type = 'button', ...props }: FilterChipProps): React.ReactElement {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'rounded-full px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
        selected
          ? 'bg-primary-500 text-white'
          : 'bg-surface-2 text-[var(--color-text-secondary)] hover:bg-surface-2/80',
        className
      )}
      {...props}
    />
  );
}
