'use client';

import { useEffect, useState, useCallback } from 'react';
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

const typeLabels: Record<string, string> = {
  subscription: 'اشتراك',
  topup: 'شحن',
  usage: 'استخدام',
  refund: 'استرداد',
  reset: 'إعادة ضبط',
};

export function TransactionTable(): React.ReactElement {
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
    return <p className="text-sm text-[var(--color-text-muted)] text-center py-8">لا توجد معاملات بعد</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[var(--color-text-muted)]">
            <th className="text-start py-2 px-3 font-medium">التاريخ</th>
            <th className="text-start py-2 px-3 font-medium">النوع</th>
            <th className="text-start py-2 px-3 font-medium">الوصف</th>
            <th className="text-end py-2 px-3 font-medium">الكمية</th>
            <th className="text-end py-2 px-3 font-medium">الرصيد</th>
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
                  {typeLabels[tx.type] || tx.type}
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
