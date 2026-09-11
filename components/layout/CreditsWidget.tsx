'use client';

import { useTranslations } from 'next-intl';
import { useCredits } from '@/hooks/useCredits';
import { useUser } from '@/hooks/useUser';
import { getPlan } from '@/lib/stripe/plans';
import { entryOffer } from '@/lib/credits/offer';
import { Link } from '@/i18n/routing';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { UnlockButton } from '@/components/shared/UnlockButton';
import { Coins, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreditsWidgetProps {
  maxCredits?: number;
  className?: string;
}

export function CreditsWidget({ maxCredits, className }: CreditsWidgetProps): React.ReactElement {
  const t = useTranslations('credits');
  const { balance, status, refetch, planId: serverPlanId } = useCredits();
  const { profile } = useUser();
  // The server's plan first, for the reason billing/page.tsx gives: the cached
  // profile is read once and never invalidated when the webhook lands.
  const planId = serverPlanId ?? profile?.plan_id ?? 'free';
  const planCredits = getPlan(planId).credits;

  // A free account has no monthly allowance, so there is nothing to draw a bar
  // against. Measured before this guard: 0/0 is NaN, `NaN < 20` is false, so a
  // 0-credit account got a calm empty bar with every warning skipped — and at
  // the 5-credit trial, 5/0 is Infinity, clamped to 100: a FULL green bar,
  // beside a banner saying the opposite.
  const isFreeAccount = maxCredits === undefined && planCredits <= 0;
  const effectiveMax = maxCredits ?? planCredits;
  const percentage = effectiveMax > 0 ? Math.min((balance / effectiveMax) * 100, 100) : 0;
  const isLow = !isFreeAccount && percentage < 20;

  if (status === 'loading') {
    return (
      <div className={cn('rounded-lg border p-4 space-y-3 min-h-[150px]', className)}>
        <div className="flex items-center justify-between">
          <div className="h-5 w-24 animate-pulse rounded bg-surface-2" />
          <div className="h-6 w-12 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-2 w-full animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-20 animate-pulse rounded bg-surface-2" />
        <div className="h-9 w-full animate-pulse rounded bg-surface-2" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={cn('rounded-lg border p-4 space-y-3 min-h-[150px]', className)}>
        <div className="flex items-center gap-2 text-sm text-[var(--color-error)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{t('loadFailed')}</span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">{t('loadFailedHint')}</p>
        <Button size="sm" variant="outline" className="w-full" onClick={refetch}>
          <RefreshCw className="h-3 w-3 me-1" />
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (isFreeAccount) {
    const offer = entryOffer();
    return (
      <div className={cn('rounded-lg border p-4 space-y-3', className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-[var(--color-brand)]" />
            <span className="text-sm font-medium">{t('balance')}</span>
          </div>
          <span className="text-lg font-bold text-[var(--color-brand)]">{balance}</span>
        </div>
        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
          {t('freeAccountHint', { credits: offer.credits, price: offer.price })}
        </p>
        <UnlockButton className="w-full" />
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border p-4 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className={cn('h-5 w-5', isLow ? 'text-[var(--color-warning)]' : 'text-[var(--color-brand)]')} />
          <span className="text-sm font-medium">{t('balance')}</span>
        </div>
        <span className={cn('text-lg font-bold', isLow ? 'text-[var(--color-warning)]' : 'text-[var(--color-brand)]')}>
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
