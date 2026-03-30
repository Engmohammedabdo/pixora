import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  const [
    totalUsers,
    newUsersToday,
    revenueResult,
    gensToday,
    failedToday,
    zeroCreditUsers,
    activeSubs,
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),

    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO),

    supabase.from('credit_transactions')
      .select('amount')
      .in('type', ['subscription', 'topup'])
      .gt('amount', 0)
      .gte('created_at', firstOfMonth),

    supabase.from('generations').select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO),

    supabase.from('generations').select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO)
      .eq('status', 'failed'),

    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .eq('credits_balance', 0)
      .eq('purchased_credits', 0),

    supabase.from('profiles').select('plan_id')
      .neq('plan_id', 'free'),
  ]);

  const revenueTotalCredits = revenueResult.data?.reduce((sum, t) => sum + (t.amount as number), 0) || 0;

  const subsByPlan: Record<string, number> = {};
  activeSubs.data?.forEach((p) => {
    const plan = p.plan_id as string;
    subsByPlan[plan] = (subsByPlan[plan] || 0) + 1;
  });

  const totalGens = gensToday.count || 0;
  const failedGens = failedToday.count || 0;
  const errorRate = totalGens > 0 ? ((failedGens / totalGens) * 100).toFixed(1) : '0.0';

  return NextResponse.json({
    success: true,
    data: {
      totalUsers: totalUsers.count || 0,
      newUsersToday: newUsersToday.count || 0,
      revenueThisMonth: revenueTotalCredits,
      generationsToday: totalGens,
      errorRate: parseFloat(errorRate),
      failedToday: failedGens,
      zeroCreditUsers: zeroCreditUsers.count || 0,
      activeSubscriptions: subsByPlan,
    },
  });
}
