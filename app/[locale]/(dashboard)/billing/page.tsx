'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser } from '@/hooks/useUser';
import { useCreditsStore } from '@/store/credits';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PlanCard } from '@/components/billing/PlanCard';
import { TopupCard } from '@/components/billing/TopupCard';
import { TransactionTable } from '@/components/billing/TransactionTable';
import { PLANS, TOPUPS, getPlan } from '@/lib/stripe/plans';
import { Separator } from '@/components/ui/separator';
import { Check, CreditCard, Coins, Sparkles, ExternalLink } from 'lucide-react';

export default function BillingPage(): React.ReactElement {
  const { profile } = useUser();
  const { balance } = useCreditsStore();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  const success = searchParams.get('success');
  const currentPlanId = profile?.plan_id || 'free';
  const currentPlan = getPlan(currentPlanId);
  const creditPercentage = Math.min((balance / currentPlan.credits) * 100, 100);

  const handleSubscribe = async (planId: string): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (data.success && data.data.url) {
        window.location.href = data.data.url;
      }
    } catch { /* */ } finally { setLoading(false); }
  };

  const handleTopup = async (topupId: string): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/create-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topupId }),
      });
      const data = await res.json();
      if (data.success && data.data.url) {
        window.location.href = data.data.url;
      }
    } catch { /* */ } finally { setLoading(false); }
  };

  const handleManageSubscription = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.data.url) {
        window.location.href = data.data.url;
      }
    } catch { /* */ } finally { setLoading(false); }
  };

  return (
    <div className="p-6 space-y-10 max-w-6xl mx-auto">
      {/* Success Banner */}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          <Check className="h-5 w-5" />
          <span>تمت العملية بنجاح! تم تحديث حسابك.</span>
        </div>
      )}

      {/* ═══════════ SECTION 1: Current Plan ═══════════ */}
      <section>
        <h1 className="text-2xl font-bold font-cairo mb-4">الفواتير والاشتراك</h1>
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="h-5 w-5 text-primary-500" />
                  <h2 className="text-lg font-semibold">خطتك الحالية</h2>
                  <Badge variant="default">{currentPlan.nameAr}</Badge>
                </div>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  {currentPlan.credits.toLocaleString()} كريدت/شهر — دقة {currentPlan.resolution}
                </p>
              </div>
              <div className="flex gap-2">
                {currentPlanId !== 'free' && (
                  <Button variant="outline" size="sm" onClick={handleManageSubscription} disabled={loading} className="gap-1">
                    <ExternalLink className="h-3 w-3" />
                    إدارة الاشتراك
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
                  رصيد الكريدت
                </span>
                <span className="font-bold text-primary-600">{balance} / {currentPlan.credits}</span>
              </div>
              <Progress value={creditPercentage} className="h-2.5" />
              {profile?.credits_reset_date && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  يُجدد في: {new Date(profile.credits_reset_date).toLocaleDateString('ar-SA', { month: 'long', day: 'numeric' })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ═══════════ SECTION 2: Plans Comparison ═══════════ */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-primary-500" />
          <h2 className="text-xl font-bold font-cairo">الخطط والأسعار</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Object.values(PLANS).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrentPlan={currentPlanId === plan.id}
              onSelect={handleSubscribe}
              loading={loading}
              locale="ar"
            />
          ))}
        </div>
      </section>

      {/* ═══════════ SECTION 3: Top-ups ═══════════ */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Coins className="h-5 w-5 text-primary-500" />
          <h2 className="text-xl font-bold font-cairo">شحن كريدت</h2>
        </div>
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">كريدت إضافي لا ينتهي (صالح لمدة 12 شهر)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Object.values(TOPUPS).map((topup) => (
            <TopupCard
              key={topup.id}
              topup={topup}
              onSelect={handleTopup}
              loading={loading}
              isBestValue={topup.id === 'large'}
            />
          ))}
        </div>
      </section>

      {/* ═══════════ SECTION 4: Transaction History ═══════════ */}
      <section>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">سجل المعاملات</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionTable />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
