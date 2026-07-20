'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Coins } from 'lucide-react';
import { useCredits } from '@/hooks/useCredits';

interface CreditCostProps {
  cost: number;
  className?: string;
}

export function CreditCost({ cost, className }: CreditCostProps): React.ReactElement {
  const t = useTranslations('credits');
  const { balance, status } = useCredits();
  const known = status === 'ready';
  const short = known && cost > balance;

  if (cost === 0) {
    return (
      <Badge variant="success" className={className}>
        {t('free')}
      </Badge>
    );
  }

  return (
    <Badge variant={short ? 'destructive' : 'secondary'} className={className}>
      <Coins className="h-3 w-3 me-1 shrink-0" />
      {cost} {t('cost')}
      {/* Only assert a balance we actually have — a failed/loading read must
          never render as a silent "you have 0". */}
      {known && <span className="ms-1 opacity-80">· {t('youHave', { balance })}</span>}
      {short && <span className="ms-1 font-medium">· {t('notEnough')}</span>}
    </Badge>
  );
}
