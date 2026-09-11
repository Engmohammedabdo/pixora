'use client';

import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useCredits } from '@/hooks/useCredits';
import { AlertTriangle, XCircle, Coins, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { entryOffer } from '@/lib/credits/offer';
import { UnlockButton } from '@/components/shared/UnlockButton';

export function LowCreditsBanner(): React.ReactElement | null {
  const { balance, status, planId } = useCredits();
  const t = useTranslations('lowCredits');

  // Only assert "you are low" when we actually know the number.
  if (status !== 'ready' || balance > 5) return null;

  // A FREE account at a low balance is not in trouble — since 2026-09-11 it is
  // where every account starts: a few trial credits and no monthly allowance.
  // The red "you can't generate until you top up" was written for a subscriber
  // who ran out; said to a new customer it reads as an error on day one, and
  // "top up" names the wrong thing to buy. This names the plan and its price,
  // and the button goes straight to checkout.
  if (planId === 'free') {
    const offer = entryOffer();
    return (
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm bg-primary-50 dark:bg-primary-900/30 border-b border-primary-200 dark:border-primary-800 text-primary-800 dark:text-primary-200">
        <Sparkles className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1 min-w-0">
          {balance > 0
            ? t('freeTrial', { balance, price: offer.price })
            : t('freeEmpty', { credits: offer.credits, price: offer.price, campaigns: offer.campaigns })}
        </span>
        <UnlockButton size="sm" />
      </div>
    );
  }

  const isEmpty = balance <= 0;

  return (
    <div className={cn(
      'flex items-center gap-2 px-4 py-2 text-sm',
      isEmpty
        ? 'bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
        : 'bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
    )}>
      {isEmpty ? <XCircle className="h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
      <span className="flex-1">
        {isEmpty
          ? t('emptyBalance')
          : t('lowBalance', { balance })}
      </span>
      <Link href="/billing" className="flex items-center gap-1 font-medium hover:underline">
        <Coins className="h-3 w-3" />
        {isEmpty ? t('topUpNow') : t('topUpCredits')}
      </Link>
    </div>
  );
}
