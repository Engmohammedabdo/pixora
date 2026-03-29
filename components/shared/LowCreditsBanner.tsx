'use client';

import { Link } from '@/i18n/routing';
import { useCreditsStore } from '@/store/credits';
import { AlertTriangle, XCircle, Coins } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LowCreditsBanner(): React.ReactElement | null {
  const { balance, loading } = useCreditsStore();

  if (loading || balance > 5) return null;

  const isEmpty = balance <= 0;

  return (
    <div className={cn(
      'flex items-center gap-2 px-4 py-2 text-sm',
      isEmpty
        ? 'bg-red-50 border-b border-red-200 text-red-700'
        : 'bg-amber-50 border-b border-amber-200 text-amber-700'
    )}>
      {isEmpty ? <XCircle className="h-4 w-4 flex-shrink-0" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0" />}
      <span className="flex-1">
        {isEmpty
          ? 'رصيدك 0 كريدت — لا يمكنك التوليد حتى تشحن.'
          : `رصيدك منخفض (${balance} كريدت متبقي).`}
      </span>
      <Link href="/billing" className="flex items-center gap-1 font-medium hover:underline">
        <Coins className="h-3 w-3" />
        {isEmpty ? 'اشحن الآن' : 'شحن كريدت'}
      </Link>
    </div>
  );
}
