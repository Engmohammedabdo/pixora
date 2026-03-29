'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Coins, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TopupConfig } from '@/lib/stripe/plans';

interface TopupCardProps {
  topup: TopupConfig;
  onSelect: (topupId: string) => void;
  loading: boolean;
  isBestValue?: boolean;
}

export function TopupCard({ topup, onSelect, loading, isBestValue }: TopupCardProps): React.ReactElement {
  return (
    <Card className={cn('relative', isBestValue && 'border-accent-500')}>
      {isBestValue && (
        <Badge className="absolute -top-2.5 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 bg-accent-500">
          أفضل قيمة
        </Badge>
      )}
      <CardContent className="p-4 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-primary-500" />
          <span className="text-2xl font-bold">{topup.credits.toLocaleString()}</span>
        </div>
        <span className="text-sm text-[var(--color-text-muted)]">كريدت</span>
        <div className="text-center">
          <p className="text-xl font-bold">${topup.price}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{topup.perCredit}/كريدت</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1"
          onClick={() => onSelect(topup.id)}
          disabled={loading}
        >
          <Zap className="h-3 w-3" />
          شراء
        </Button>
      </CardContent>
    </Card>
  );
}
