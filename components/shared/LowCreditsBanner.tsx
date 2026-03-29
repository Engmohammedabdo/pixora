'use client';

import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useCreditsStore } from '@/store/credits';
import { AlertTriangle, XCircle, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LowCreditsBanner(): React.ReactElement | null {
  const { balance, loading } = useCreditsStore();
  const t = useTranslations('lowCredits');

  if (loading || balance > 5) return null;

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
