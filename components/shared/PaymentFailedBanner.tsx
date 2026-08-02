'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useCredits } from '@/hooks/useCredits';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

/**
 * The reader that `profiles.payment_failed` never had.
 *
 * The webhook has set that flag on every failed charge since it was written, and
 * nothing anywhere consulted it — so a customer whose card declined experienced
 * exactly zero in-app change. Stripe retried quietly for ~3 weeks and then the
 * account was downgraded, from the customer's point of view, for no reason.
 *
 * There is no transactional email in this product yet, so this banner plus Stripe's
 * own dunning emails (Dashboard-configured) are the whole notification path. That
 * makes it the difference between involuntary churn the customer could have fixed
 * in one click and involuntary churn they never saw coming.
 *
 * No `poll` here on purpose: the dashboard layout owns the single 30s timer, and
 * this reads the same shared React Query entry.
 */
export function PaymentFailedBanner(): React.ReactElement | null {
  const { paymentFailed } = useCredits();
  const t = useTranslations('paymentFailed');
  const locale = useLocale();
  const [loading, setLoading] = useState(false);

  if (!paymentFailed) return null;

  const openPortal = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
        return;
      }
      toast.error(t('portalError'));
    } catch {
      toast.error(t('portalError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">{t('message')}</span>
      <button
        type="button"
        onClick={openPortal}
        disabled={loading}
        className="font-medium hover:underline disabled:opacity-60"
      >
        {t('updatePayment')}
      </button>
    </div>
  );
}
