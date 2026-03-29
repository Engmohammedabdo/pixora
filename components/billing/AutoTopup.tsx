'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TOPUPS } from '@/lib/stripe/plans';

export function AutoTopup(): React.ReactElement {
  const [enabled, setEnabled] = useState(false);
  const [selectedPack, setSelectedPack] = useState('small');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-amber-500" /> شحن تلقائي</CardTitle>
          <button onClick={() => setEnabled(!enabled)} className="text-primary-500">
            {enabled ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6 text-[var(--color-text-muted)]" />}
          </button>
        </div>
      </CardHeader>
      <CardContent className={cn('space-y-3', !enabled && 'opacity-50 pointer-events-none')}>
        <p className="text-xs text-[var(--color-text-secondary)]">شحن كريدت تلقائي لما رصيدك يوصل أقل من 10</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.values(TOPUPS).slice(0, 2).map((topup) => (
            <button key={topup.id} onClick={() => setSelectedPack(topup.id)}
              className={cn('rounded-lg border p-3 text-center transition-colors', selectedPack === topup.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-[var(--color-border)] hover:border-primary-300')}>
              <p className="text-lg font-bold">{topup.credits}</p>
              <p className="text-xs text-[var(--color-text-muted)]">${topup.price}</p>
            </button>
          ))}
        </div>
        <Button className="w-full" size="sm" disabled={!enabled}>{enabled ? 'تفعيل الشحن التلقائي' : 'فعّل أولاً'}</Button>
        <p className="text-[10px] text-[var(--color-text-muted)]">سيتم الخصم من بطاقتك المسجلة تلقائياً</p>
      </CardContent>
    </Card>
  );
}
