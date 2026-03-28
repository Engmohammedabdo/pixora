'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Coins } from 'lucide-react';

interface CreditCostProps {
  cost: number;
  className?: string;
}

export function CreditCost({ cost, className }: CreditCostProps): React.ReactElement {
  const t = useTranslations('credits');

  if (cost === 0) {
    return (
      <Badge variant="success" className={className}>
        Free
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={className}>
      <Coins className="h-3 w-3 me-1" />
      {cost} {t('cost')}
    </Badge>
  );
}
