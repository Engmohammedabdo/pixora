'use client';

import { useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/routing';
import { useTranslations, useLocale } from 'next-intl';
import { Coins, Sparkles, Lock } from 'lucide-react';
import { getPlan, getMaxResolution } from '@/lib/stripe/plans';
import { UnlockButton } from '@/components/shared/UnlockButton';

type PromptVariant = 'insufficient_credits' | 'feature_locked' | 'resolution_locked';

interface UpgradePromptProps {
  open: boolean;
  onClose: () => void;
  variant: PromptVariant;
  currentPlan?: string;
  requiredCredits?: number;
  availableCredits?: number;
  requiredPlan?: string;
  feature?: string;
}

export function UpgradePrompt({
  open,
  onClose,
  variant,
  currentPlan = 'free',
  requiredCredits,
  availableCredits,
  requiredPlan,
  feature,
}: UpgradePromptProps): React.ReactElement {
  const t = useTranslations('upgrade');
  const locale = useLocale();

  // currentPlan/requiredPlan arrive as raw plan ids ('free', 'pro', ...) — the
  // same id stored in profiles.plan_id — not display names. lib/stripe/plans.ts
  // is the existing source of truth for a localized display name (see how
  // billing/page.tsx picks nameAr/name by locale); resolve through it instead
  // of ever putting the bare id in front of the user.
  const planDisplayName = useCallback(
    (planId: string): string => {
      const plan = getPlan(planId);
      return locale === 'ar' ? plan.nameAr : plan.name;
    },
    [locale]
  );

  const content: Record<PromptVariant, { icon: React.ReactNode; title: string; description: string }> = {
    insufficient_credits: {
      icon: <Coins className="h-10 w-10 text-[var(--color-warning)]" />,
      title: t('insufficientCredits'),
      description: t('insufficientCreditsDescription', { required: requiredCredits ?? 0, available: availableCredits ?? 0 }),
    },
    feature_locked: {
      icon: <Lock className="h-10 w-10 text-[var(--color-brand)]" />,
      title: t('featureLocked'),
      description: t('featureLockedDescription', { feature: feature || '', plan: planDisplayName(requiredPlan || 'pro') }),
    },
    resolution_locked: {
      icon: <Sparkles className="h-10 w-10 text-[var(--color-brand)]" />,
      title: t('resolutionLocked'),
      // Read from the plan, not `currentPlan === 'free' ? '1080p' : '2K'`. That
      // ternary was right only by coincidence (free was 1080p, starter 2K, and
      // pro+ never reach this variant) and Entry was the first plan it lied to:
      // an Entry customer would have been told their ceiling is 2K.
      description: t('resolutionLockedDescription', { plan: planDisplayName(currentPlan), maxRes: getMaxResolution(currentPlan) }),
    },
  };

  const { icon, title, description } = content[variant];

  // A free account that runs out has no plan to top up — it has one to start.
  const offerEntry = variant === 'insufficient_credits' && getPlan(currentPlan).price === 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader className="items-center">
          {icon}
          <DialogTitle className="mt-2">{title}</DialogTitle>
          <DialogDescription className="mt-1">{description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-2 mt-2">
          <Badge variant="outline">{t('yourPlan')} {planDisplayName(currentPlan)}</Badge>
          {requiredCredits != null && requiredCredits > 0 && availableCredits !== undefined && (
            <Badge variant="secondary">
              {t('creditsRatio', { available: availableCredits, required: requiredCredits })}
            </Badge>
          )}
        </div>

        <div className="flex flex-col gap-2 mt-4">
          {offerEntry ? (
            <UnlockButton label="long" size="default" className="h-auto whitespace-normal py-2" />
          ) : (
            <Button asChild>
              <Link href="/billing">
                <Sparkles className="h-4 w-4 me-2" />
                {variant === 'insufficient_credits' ? t('topUpCredits') : t('upgradePlan')}
              </Link>
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>{t('later')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
