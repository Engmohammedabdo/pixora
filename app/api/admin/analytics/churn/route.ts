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
  const months = Math.min(parseInt(url.searchParams.get('months') || '6'), 12);

  const monthsAgo = new Date();
  monthsAgo.setMonth(monthsAgo.getMonth() - months);

  const [{ data: subEvents }, { data: profiles }] = await Promise.all([
    supabase.from('subscription_events')
      .select('user_id, event_type, from_plan, to_plan, created_at')
      .gte('created_at', monthsAgo.toISOString())
      .order('created_at', { ascending: false }),
    supabase.from('profiles')
      .select('id, plan_id, stripe_subscription_id, created_at'),
  ]);

  const now = new Date();
  const currentPaying = (profiles || []).filter(p => p.plan_id !== 'free' && p.stripe_subscription_id).length;

  // Monthly churn data
  const churnTrend: { month: string; churnRate: number; churned: number; total: number; revenueChurned: number }[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const monthCancels = (subEvents || []).filter(e => {
      if (e.event_type !== 'cancel') return false;
      const eDate = new Date(e.created_at);
      return eDate.getMonth() === d.getMonth() && eDate.getFullYear() === d.getFullYear();
    });

    // Approximate paying users at start of month
    const payingAtStart = (profiles || []).filter(p => {
      if (p.plan_id === 'free' && !p.stripe_subscription_id) return false;
      return new Date(p.created_at) < d;
    }).length || 1;

    let revenueChurned = 0;
    for (const c of monthCancels) {
      revenueChurned += PLANS[c.from_plan || 'starter']?.price || 0;
    }

    const churnRate = payingAtStart > 0 ? (monthCancels.length / payingAtStart) * 100 : 0;

    churnTrend.push({
      month: monthStr,
      churnRate: parseFloat(churnRate.toFixed(1)),
      churned: monthCancels.length,
      total: payingAtStart,
      revenueChurned,
    });
  }

  // Churn by plan
  const churnByPlan: Record<string, number> = {};
  const recentCancels = (subEvents || []).filter(e => e.event_type === 'cancel');
  for (const c of recentCancels) {
    const plan = c.from_plan || 'unknown';
    churnByPlan[plan] = (churnByPlan[plan] || 0) + 1;
  }

  // Recent churned users (last 20)
  const recentChurnedUserIds = recentCancels.slice(0, 20).map(c => c.user_id);
  let churnedUsers: { id: string; name: string; email: string; plan: string; churned_at: string }[] = [];
  if (recentChurnedUserIds.length > 0) {
    const { data: users } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', recentChurnedUserIds);

    churnedUsers = recentCancels.slice(0, 20).map(c => {
      const user = (users || []).find(u => u.id === c.user_id);
      return {
        id: c.user_id as string,
        name: (user?.name as string) || 'Unknown',
        email: (user?.email as string) || '',
        plan: (c.from_plan as string) || 'unknown',
        churned_at: c.created_at as string,
      };
    });
  }

  // Current churn rate (this month)
  const currentMonth = churnTrend.length > 0 ? churnTrend[churnTrend.length - 1] : null;

  return NextResponse.json({
    success: true,
    data: {
      currentChurnRate: currentMonth?.churnRate || 0,
      currentPaying,
      churnTrend,
      churnByPlan,
      churnedUsers,
      totalChurned: recentCancels.length,
    },
  });
}
