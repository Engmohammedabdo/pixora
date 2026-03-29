'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanConfig } from '@/lib/stripe/plans';

interface PlanCardProps {
  plan: PlanConfig;
  isCurrentPlan: boolean;
  onSelect: (planId: string) => void;
  loading: boolean;
  locale: string;
}

export function PlanCard({ plan, isCurrentPlan, onSelect, loading, locale }: PlanCardProps): React.ReactElement {
  const isAr = locale === 'ar';
  const features = isAr ? plan.featuresAr : plan.features;
  const isFree = plan.id === 'free';
  const isPopular = plan.id === 'pro';

  return (
    <Card className={cn('relative flex flex-col', isPopular && 'border-primary-500 shadow-md', isCurrentPlan && 'ring-2 ring-primary-500')}>
      {isPopular && (
        <Badge className="absolute -top-2.5 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 px-3">
          {isAr ? 'الأكثر شعبية' : 'Most Popular'}
        </Badge>
      )}
      {isCurrentPlan && (
        <Badge variant="secondary" className="absolute -top-2.5 end-4 px-3">
          {isAr ? 'خطتك الحالية' : 'Current Plan'}
        </Badge>
      )}

      <CardHeader className="text-center pb-2">
        <CardTitle className="text-lg">{isAr ? plan.nameAr : plan.name}</CardTitle>
        <div className="mt-2">
          <span className="text-3xl font-bold">${plan.price}</span>
          {!isFree && <span className="text-sm text-[var(--color-text-muted)]">/{isAr ? 'شهر' : 'mo'}</span>}
        </div>
        <p className="text-sm text-primary-600 font-medium mt-1">
          {plan.credits.toLocaleString()} {isAr ? 'كريدت' : 'credits'}
        </p>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col">
        <ul className="space-y-2 flex-1 mb-4">
          {features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-[var(--color-success)] mt-0.5 flex-shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <Button
          className="w-full"
          variant={isCurrentPlan ? 'outline' : isPopular ? 'default' : 'outline'}
          disabled={isCurrentPlan || isFree || loading}
          onClick={() => onSelect(plan.id)}
        >
          {isCurrentPlan
            ? (isAr ? 'خطتك الحالية' : 'Current Plan')
            : isFree
              ? (isAr ? 'مجاني' : 'Free')
              : (isAr ? 'اشترك الآن' : 'Subscribe')}
        </Button>
      </CardContent>
    </Card>
  );
}
