'use client';

import { useTranslations } from 'next-intl';
import { useCreditsStore } from '@/store/credits';
import { useUser } from '@/hooks/useUser';
import { getPlan } from '@/lib/stripe/plans';
import { Link } from '@/i18n/routing';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Coins, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreditsWidgetProps {
  maxCredits?: number;
  className?: string;
}

export function CreditsWidget({ maxCredits, className }: CreditsWidgetProps): React.ReactElement {
  const t = useTranslations('credits');
  const { balance, loading } = useCreditsStore();
  const { profile } = useUser();
  const planCredits = getPlan(profile?.plan_id || 'free').credits;
  const effectiveMax = maxCredits ?? planCredits;

  const percentage = Math.min((balance / effectiveMax) * 100, 100);
  const isLow = percentage < 20;

  if (loading) {
    return (
      <div className={cn('rounded-lg border p-4 space-y-3', className)}>
        <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
        <div className="h-2 w-full animate-pulse rounded bg-surface-2" />
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border p-4 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className={cn('h-5 w-5', isLow ? 'text-[var(--color-warning)]' : 'text-primary-500')} />
          <span className="text-sm font-medium">{t('balance')}</span>
        </div>
        <span className={cn('text-lg font-bold', isLow ? 'text-[var(--color-warning)]' : 'text-primary-600')}>
          {balance}
        </span>
      </div>

      <Progress value={percentage} className="h-2" />

      <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
        <span>{balance} {t('remaining')}</span>
        {isLow && (
          <div className="flex items-center gap-1 text-[var(--color-warning)]">
            <AlertTriangle className="h-3 w-3" />
            <span>{t('insufficient')}</span>
          </div>
        )}
      </div>

      <Button asChild size="sm" variant={isLow ? 'default' : 'outline'} className="w-full">
        <Link href="/billing">{t('topUp')}</Link>
      </Button>
    </div>
  );
}
