import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';
import { PLANS } from '@/lib/stripe/plans';

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const url = new URL(request.url);
  const months = Math.min(parseInt(url.searchParams.get('months') || '12'), 24);

  // Get all subscription events for trend calculation
  const monthsAgo = new Date();
  monthsAgo.setMonth(monthsAgo.getMonth() - months);

  const [{ data: subEvents }, { data: profiles }] = await Promise.all([
    supabase.from('subscription_events')
      .select('user_id, event_type, from_plan, to_plan, created_at')
      .gte('created_at', monthsAgo.toISOString())
      .order('created_at', { ascending: true }),
    supabase.from('profiles')
      .select('id, plan_id, stripe_subscription_id, created_at'),
  ]);

  // Current MRR from active subscribers
  const activeProfiles = (profiles || []).filter(p => p.plan_id !== 'free' && p.stripe_subscription_id);
  let currentMrr = 0;
  const mrrByPlan: Record<string, { count: number; mrr: number }> = {};

  for (const p of activeProfiles) {
    const price = PLANS[p.plan_id]?.price || 0;
    currentMrr += price;
    if (!mrrByPlan[p.plan_id]) mrrByPlan[p.plan_id] = { count: 0, mrr: 0 };
    mrrByPlan[p.plan_id].count++;
    mrrByPlan[p.plan_id].mrr += price;
  }

  // Monthly MRR trend (approximate from subscription events)
  const mrrTrend: { month: string; mrr: number; newMrr: number; churnedMrr: number }[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);

    // Count subscribers who were active AT that month end
    // Approximate: users with plan_id != free who signed up before month end
    const subscribersAtMonth = (profiles || []).filter(p => {
      if (p.plan_id === 'free') return false;
      const created = new Date(p.created_at);
      return created <= monthEnd;
    });

    let monthMrr = 0;
    for (const p of subscribersAtMonth) {
      monthMrr += PLANS[p.plan_id]?.price || 0;
    }

    // New MRR this month (new subscriptions)
    const monthEvents = (subEvents || []).filter(e => {
      const eDate = new Date(e.created_at);
      return eDate.getMonth() === d.getMonth() && eDate.getFullYear() === d.getFullYear();
    });

    let newMrr = 0;
    let churnedMrr = 0;
    for (const e of monthEvents) {
      if (e.event_type === 'subscribe') {
        newMrr += PLANS[e.to_plan || 'starter']?.price || 0;
      } else if (e.event_type === 'cancel') {
        churnedMrr += PLANS[e.from_plan || 'starter']?.price || 0;
      }
    }

    mrrTrend.push({ month: monthStr, mrr: monthMrr, newMrr, churnedMrr });
  }

  // Growth rate
  const lastMonth = mrrTrend.length >= 2 ? mrrTrend[mrrTrend.length - 2].mrr : 0;
  const growthRate = lastMonth > 0
    ? (((currentMrr - lastMonth) / lastMonth) * 100).toFixed(1)
    : '0.0';

  return NextResponse.json({
    success: true,
    data: {
      currentMrr,
      arr: currentMrr * 12,
      mrrByPlan,
      mrrTrend,
      growthRate: parseFloat(growthRate),
      totalSubscribers: activeProfiles.length,
    },
  });
}
