'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Coins, Sparkles, Lock } from 'lucide-react';

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

  const content: Record<PromptVariant, { icon: React.ReactNode; title: string; description: string }> = {
    insufficient_credits: {
      icon: <Coins className="h-10 w-10 text-[var(--color-warning)]" />,
      title: t('insufficientCredits'),
      description: t('insufficientCreditsDescription', { required: requiredCredits ?? 0, available: availableCredits ?? 0 }),
    },
    feature_locked: {
      icon: <Lock className="h-10 w-10 text-primary-500" />,
      title: t('featureLocked'),
      description: t('featureLockedDescription', { feature: feature || '', plan: requiredPlan || 'Pro' }),
    },
    resolution_locked: {
      icon: <Sparkles className="h-10 w-10 text-primary-500" />,
      title: t('resolutionLocked'),
      description: t('resolutionLockedDescription', { plan: currentPlan, maxRes: currentPlan === 'free' ? '1080p' : '2K' }),
    },
  };

  const { icon, title, description } = content[variant];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader className="items-center">
          {icon}
          <DialogTitle className="mt-2">{title}</DialogTitle>
          <DialogDescription className="mt-1">{description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-2 mt-2">
          <Badge variant="outline">{t('yourPlan')} {currentPlan}</Badge>
          {requiredCredits && availableCredits !== undefined && (
            <Badge variant="secondary">
              {availableCredits} / {requiredCredits} credits
            </Badge>
          )}
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <Button asChild>
            <Link href="/billing">
              <Sparkles className="h-4 w-4 me-2" />
              {variant === 'insufficient_credits' ? t('topUpCredits') : t('upgradePlan')}
            </Link>
          </Button>
          <Button variant="ghost" onClick={onClose}>{t('later')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
