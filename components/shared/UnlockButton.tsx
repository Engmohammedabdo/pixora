'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { entryOffer } from '@/lib/credits/offer';

interface UnlockButtonProps {
  /** `short` fits beside a Generate button; `long` says what the $2 buys. */
  label?: 'short' | 'long';
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

/**
 * One click from "I cannot afford this" to Stripe's checkout for the Entry plan.
 *
 * Every place a free account runs out used to be a `<Link href="/billing">` — a
 * comparison grid of six cards where the one that mattered was neither first nor
 * highlighted, reached at the exact moment the customer wanted one image. This
 * posts straight to the same route the billing page uses and follows the URL.
 *
 * It never strands anyone: a failed checkout, an existing subscription (the route
 * answers 409 so nobody is billed twice) or a network error all land on
 * `/billing`, which can handle every one of those cases.
 */
export function UnlockButton({
  label = 'short',
  variant = 'default',
  size = 'sm',
  className,
}: UnlockButtonProps): React.ReactElement {
  const t = useTranslations('credits');
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const offer = entryOffer();

  const onClick = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'entry', locale }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string; data?: { url?: string } };
      if (data.success && data.data?.url) {
        // Leave `busy` set: the page is navigating away, and a second click
        // would open a second checkout session.
        window.location.href = data.data.url;
        return;
      }
      // Already subscribed: not an error the customer made, and /billing is
      // where their plan is managed. Everything else is a failed checkout.
      if (data.error !== 'subscription_exists') toast.error(t('unlockFailed'));
    } catch {
      toast.error(t('unlockFailed'));
    }
    setBusy(false);
    router.push('/billing');
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={busy}
      onClick={() => void onClick()}
    >
      {busy ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <Sparkles className="h-4 w-4 me-1" />}
      {label === 'long'
        ? t('unlockLong', { credits: offer.credits, price: offer.price })
        : t('unlockShort', { price: offer.price })}
    </Button>
  );
}
