'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { useCredits } from '@/hooks/useCredits';
import { entryOffer } from '@/lib/credits/offer';

interface UnlockButtonProps {
  /** `short` fits beside a Generate button; `long` says what the $2 buys. */
  label?: 'short' | 'long';
  variant?: 'default' | 'outline' | 'secondary';
  size?: 'sm' | 'default' | 'lg';
  className?: string;
}

/** Set when the customer lands back on Stripe's success URL for Entry. */
const SETTLING_KEY = 'pyrasuite-entry-settling';
/** Long enough for a slow webhook, short enough never to strand anyone. */
const SETTLING_MS = 10 * 60 * 1000;

/**
 * One click from "I cannot afford this" to Stripe's checkout for the Entry plan.
 *
 * Every place a free account runs out used to be a `<Link href="/billing">` — a
 * comparison grid where the card that mattered was neither first nor
 * highlighted, reached at the exact moment the customer wanted one image. This
 * posts straight to the route the billing page uses and follows the URL.
 *
 * It never strands anyone: a failed checkout, an existing subscription (409 so
 * nobody is billed twice) or a network error all land on `/billing`.
 *
 * ── WHILE A PAYMENT IS SETTLING ────────────────────────────────────────────
 * Stripe returns the customer before its webhook has necessarily reached us, so
 * for a few seconds the account is still `free` and this button would open a
 * SECOND $2 checkout — the create-checkout 409 cannot see a subscription the
 * webhook has not written yet. Two guards: the page remembers the success URL
 * (sessionStorage, cleared the moment the polled plan changes, capped at ten
 * minutes — the cancel URL never sets it, so an abandoned checkout is not
 * locked out), and create-checkout itself refuses while a completed Entry
 * session is settling (`checkout_pending`).
 */
export function UnlockButton({
  label = 'short',
  variant = 'default',
  size = 'sm',
  className,
}: UnlockButtonProps): React.ReactElement {
  const t = useTranslations('credits');
  const tBilling = useTranslations('billing');
  const locale = useLocale();
  const router = useRouter();
  const { planId } = useCredits();
  const [busy, setBusy] = useState(false);
  const [settling, setSettling] = useState(false);
  const offer = entryOffer();

  useEffect(() => {
    try {
      if (planId && planId !== 'free') {
        window.sessionStorage.removeItem(SETTLING_KEY);
        setSettling(false);
        return;
      }
      const q = new URLSearchParams(window.location.search);
      if (q.get('success') === 'true' && q.get('plan') === 'entry') {
        window.sessionStorage.setItem(SETTLING_KEY, String(Date.now()));
      }
      const since = Number(window.sessionStorage.getItem(SETTLING_KEY)) || 0;
      setSettling(since > 0 && Date.now() - since < SETTLING_MS);
    } catch {
      // Storage blocked: fall back to the server guard alone.
      setSettling(false);
    }
  }, [planId]);

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
      if (data.error === 'checkout_pending') toast.info(tBilling('pendingActivation'));
      // Already subscribed: not an error the customer made, and /billing is
      // where their plan is managed. Everything else is a failed checkout.
      else if (data.error !== 'subscription_exists') toast.error(t('unlockFailed'));
    } catch {
      toast.error(t('unlockFailed'));
    }
    setBusy(false);
    router.push('/billing');
  };

  if (settling) {
    return (
      <Button type="button" variant={variant} size={size} className={className} disabled>
        <Loader2 className="h-4 w-4 me-1 animate-spin" />
        {t('activating')}
      </Button>
    );
  }

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
