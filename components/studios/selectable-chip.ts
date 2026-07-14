/**
 * Shared selected/unselected classes for studio option chips.
 * Keeps the selected state readable in both light and dark themes
 * (bg-primary-50 is a static light hex, so dark: variants are required).
 */

export const selectedChipClasses =
  'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300';

export const unselectedChipClasses =
  'border-[var(--color-border)] hover:border-primary-300';
