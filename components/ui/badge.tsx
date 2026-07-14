import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary-500 text-white',
        secondary: 'border-transparent bg-surface-2 text-[var(--color-text-primary)]',
        destructive: 'border-transparent bg-[var(--color-error)] text-white',
        outline: 'text-[var(--color-text-primary)]',
        success: 'border-transparent bg-[var(--color-success)] text-white',
        warning: 'border-transparent bg-[var(--color-warning)] text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps): React.ReactElement {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
