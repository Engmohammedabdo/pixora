'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  balance_after: number | null;
  created_at: string;
}

const typeColors: Record<string, 'default' | 'secondary' | 'success' | 'destructive' | 'warning'> = {
  subscription: 'default',
  topup: 'success',
  usage: 'secondary',
  refund: 'warning',
  reset: 'destructive',
};

const typeKeys: Record<string, string> = {
  subscription: 'typeSubscription',
  topup: 'typeTopup',
  usage: 'typeUsage',
  refund: 'typeRefund',
  reset: 'typeReset',
};

export function TransactionTable(): React.ReactElement {
  const t = useTranslations('billing');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/credits/transactions?limit=20');
      const data = await res.json();
      if (data.success) setTransactions(data.data || []);
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  if (loading) {
    return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>;
  }

  if (transactions.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)] text-center py-8">{t('noTransactions')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[var(--color-text-muted)]">
            <th className="text-start py-2 px-3 font-medium">{t('date')}</th>
            <th className="text-start py-2 px-3 font-medium">{t('type')}</th>
            <th className="text-start py-2 px-3 font-medium">{t('description')}</th>
            <th className="text-end py-2 px-3 font-medium">{t('amount')}</th>
            <th className="text-end py-2 px-3 font-medium">{t('balanceAfter')}</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.id} className="border-b hover:bg-surface-2/50">
              <td className="py-2 px-3 text-xs">
                {new Date(tx.created_at).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </td>
              <td className="py-2 px-3">
                <Badge variant={typeColors[tx.type] || 'secondary'} className="text-[10px]">
                  {typeKeys[tx.type] ? t(typeKeys[tx.type]) : tx.type}
                </Badge>
              </td>
              <td className="py-2 px-3 text-xs max-w-[200px] truncate">{tx.description || '-'}</td>
              <td className={`py-2 px-3 text-end font-medium ${tx.amount > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {tx.amount > 0 ? '+' : ''}{tx.amount}
              </td>
              <td className="py-2 px-3 text-end text-xs text-[var(--color-text-muted)]">
                {tx.balance_after ?? '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
