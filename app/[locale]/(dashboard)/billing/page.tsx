'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale, useFormatter } from 'next-intl';
import { useUser } from '@/hooks/useUser';
import { useCredits } from '@/hooks/useCredits';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PlanCard } from '@/components/billing/PlanCard';
import { TopupCard } from '@/components/billing/TopupCard';
import { TransactionTable } from '@/components/billing/TransactionTable';
import {PLANS, TOPUPS, getPlan} from '@/lib/stripe/plans';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { Check, CreditCard, Coins, Sparkles, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function BillingPage(): React.ReactElement {
  const t = useTranslations('billing');
  const tCredits = useTranslations('credits');
  const locale = useLocale();
  const format = useFormatter();
  const { profile } = useUser();
  const { balance, status: creditsStatus, planId: serverPlanId } = useCredits();
  const searchParams = useSearchParams();
  // Track WHICH card/action is loading so only the clicked one is disabled
  const [loading, setLoading] = useState<string | null>(null);

  const success = searchParams.get('success');
  const purchasedPlan = searchParams.get('plan');

  // Prefer the SERVER's plan over useUser's cached profile. That profile is read
  // once at mount and is never invalidated when the Stripe webhook lands, so a
  // customer returning from checkout could sit on a page that said "Free" — with a
  // green success banner above it and no Manage Subscription button — until they
  // thought to reload. `serverPlanId` rides the balance poll the layout already
  // runs, so the whole page heals itself within 30s.
  const currentPlanId = serverPlanId ?? profile?.plan_id ?? 'free';
  const currentPlan = getPlan(currentPlanId);

  // Stripe has taken the money but the webhook has not landed yet. Say that,
  // rather than claiming an activation that has not happened.
  const planPending = Boolean(success && purchasedPlan && currentPlanId !== purchasedPlan);

  // Anyone who has ever paid has a Stripe customer — including a top-up-only buyer
  // still on the free plan, and a churned subscriber. Gating this button on the
  // PLAN locked both of them out of their own receipts and payment history, which
  // is the only place either exists (there is no in-app invoice list).
  const hasBillingHistory = Boolean(profile?.stripe_customer_id);
  const creditPercentage =
    creditsStatus === 'ready' && currentPlan.credits > 0
      ? Math.min((balance / currentPlan.credits) * 100, 100)
      : 0;

  const handleSubscribe = async (planId: string): Promise<void> => {
    setLoading(planId);
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The locale travels with the request: `profiles.locale` is a dead column
        // that nothing ever writes, so the server cannot work this out on its own.
        body: JSON.stringify({ planId, locale }),
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
        return;
      }

      // An existing subscriber must change plan through the billing portal — a
      // second checkout would create a parallel subscription and bill them twice.
      // Say so and route them there, rather than showing a dead generic error.
      if (data.error === 'subscription_exists') {
        toast.error(t('alreadySubscribed'), {
          action: { label: t('manageSubscription'), onClick: () => void handleManageSubscription() },
        });
        return;
      }

      toast.error(t('checkoutError'));
    } catch {
      toast.error(t('networkError'));
    } finally { setLoading(null); }
  };

  const handleTopup = async (topupId: string): Promise<void> => {
    setLoading(topupId);
    try {
      const res = await fetch('/api/stripe/create-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topupId, locale }),
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        // NOT `data.error || t(...)`. These routes always populate `error`, so the
        // fallback never fired and an Arabic customer was shown the raw token
        // `checkout_failed` inside an RTL page.
        toast.error(t('checkoutError'));
      }
    } catch {
      toast.error(t('networkError'));
    } finally { setLoading(null); }
  };

  const handleManageSubscription = async (): Promise<void> => {
    setLoading('portal');
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else if (data.error === 'no_customer') {
        toast.error(t('noBillingHistory'));
      } else {
        toast.error(t('portalError'));
      }
    } catch {
      toast.error(t('networkError'));
    } finally { setLoading(null); }
  };

  return (
    <div className="p-6 space-y-10 max-w-6xl mx-auto">
      {/* Payment landed, plan not active yet — the webhook is still in flight. */}
      {planPending && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{t('pendingActivation')}</span>
        </div>
      )}

      {/* Success Banner */}
      {success && !planPending && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-300">
          <Check className="h-5 w-5" />
          <span>{t('successMessage')}</span>
        </div>
      )}

      {/* SECTION 1: Current Plan */}
      <section>
        <h1 className="text-2xl font-bold font-cairo mb-4">{t('title')}</h1>
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="h-5 w-5 text-primary-500" />
                  <h2 className="text-lg font-semibold">{t('currentPlan')}</h2>
                  <Badge variant="default">{locale === 'ar' ? currentPlan.nameAr : currentPlan.name}</Badge>
                </div>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {currentPlan.credits.toLocaleString()} {t('creditsPerMonth')} — {t('resolution')} {currentPlan.resolution}
                </p>
              </div>
              <div className="flex gap-2">
                {hasBillingHistory && (
                  <Button variant="outline" size="sm" onClick={handleManageSubscription} disabled={loading === 'portal'} className="gap-1">
                    <ExternalLink className="h-3 w-3" />
                    {currentPlanId !== 'free' ? t('manageSubscription') : t('billingAndReceipts')}
                  </Button>
                )}
              </div>
            </div>

            <Separator className="my-4" />

            {/* Credits Balance */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5">
                  <Coins className="h-4 w-4 text-primary-500" />
                  {t('creditBalance')}
                </span>
                <span className="font-bold text-[var(--color-brand)]">
                  {creditsStatus === 'ready' ? `${balance} / ${currentPlan.credits}` : tCredits('unavailable')}
                </span>
              </div>
              <Progress value={creditPercentage} className="h-2.5" />
              {profile?.credits_reset_date && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  {t('renewsAt')} {format.dateTime(new Date(profile.credits_reset_date), { month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* SECTION 2: Plans Comparison */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-primary-500" />
          <h2 className="text-xl font-bold font-cairo">{t('plansAndPricing')}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Object.values(PLANS).map((plan) => {
            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                isCurrentPlan={currentPlanId === plan.id}
                onSelect={handleSubscribe}
                // While a purchase is settling, every plan card is inert. Clicking
                // one in that window would open a second checkout for a customer
                // who has already paid.
                loading={loading === plan.id || planPending}
                locale={locale}
              />
            );
          })}
        </div>
      </section>

      {/* SECTION 3: Top-ups */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Coins className="h-5 w-5 text-primary-500" />
          <h2 className="text-xl font-bold font-cairo">{t('topUpCredits')}</h2>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">{t('topUpDescription')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.values(TOPUPS).map((topup) => (
            <TopupCard
              key={topup.id}
              topup={topup}
              onSelect={handleTopup}
              loading={loading === topup.id}
              isBestValue={topup.id === 'large'}
            />
          ))}
        </div>
      </section>

      {/* SECTION 4: Transaction History */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('transactionHistory')}</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionTable />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
