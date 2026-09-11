'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { useCredits } from '@/hooks/useCredits';
import { UnlockButton } from '@/components/shared/UnlockButton';

/**
 * The button that sits beside a studio's disabled Generate when the balance is
 * short. One component instead of nine copies of the same `<Link>`.
 *
 * A free account has no plan to top up — it has a plan to START — so it gets the
 * one-click Entry checkout. Everyone else gets the billing page, where top-ups
 * and plan changes live. While the plan is still unknown the billing link is the
 * safe answer: it works for both.
 */
export function GetCreditsButton(): React.ReactElement {
  const t = useTranslations('credits');
  const { planId } = useCredits();

  if (planId === 'free') return <UnlockButton />;

  return (
    <Button asChild variant="default" size="sm">
      <Link href="/billing">{t('topUpShort')}</Link>
    </Button>
  );
}
