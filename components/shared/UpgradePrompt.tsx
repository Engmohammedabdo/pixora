'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/routing';
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
  const content: Record<PromptVariant, { icon: React.ReactNode; title: string; description: string }> = {
    insufficient_credits: {
      icon: <Coins className="h-10 w-10 text-[var(--color-warning)]" />,
      title: 'رصيدك غير كافي',
      description: `تحتاج ${requiredCredits} كريدت لكن عندك ${availableCredits} فقط. اشحن كريدت أو ترقّى لخطة أعلى.`,
    },
    feature_locked: {
      icon: <Lock className="h-10 w-10 text-primary-500" />,
      title: 'هذه الميزة غير متاحة',
      description: `${feature || 'هذه الميزة'} متاحة في خطة ${requiredPlan || 'Pro'} وأعلى. ترقّى للاستفادة.`,
    },
    resolution_locked: {
      icon: <Sparkles className="h-10 w-10 text-primary-500" />,
      title: 'دقة أعلى تحتاج ترقية',
      description: `خطة ${currentPlan} تدعم حتى ${currentPlan === 'free' ? '1080p' : '2K'} فقط. ترقّى لدقة 4K.`,
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
          <Badge variant="outline">خطتك: {currentPlan}</Badge>
          {requiredCredits && availableCredits !== undefined && (
            <Badge variant="secondary">
              {availableCredits} / {requiredCredits} كريدت
            </Badge>
          )}
        </div>

        <div className="flex flex-col gap-2 mt-4">
          <Button asChild>
            <Link href="/billing">
              <Sparkles className="h-4 w-4 me-2" />
              {variant === 'insufficient_credits' ? 'شحن كريدت' : 'ترقية الخطة'}
            </Link>
          </Button>
          <Button variant="ghost" onClick={onClose}>لاحقاً</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
