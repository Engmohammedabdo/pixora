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

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();

  const [
    allProfiles,
    signupsThisMonth,
    signupsLastMonth,
    gensToday,
    gensWeek,
    gensMonth,
    gensLastMonth,
  ] = await Promise.all([
    supabase.from('profiles').select('plan_id, stripe_subscription_id, created_at'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', thisMonthStart),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', lastMonthStart).lte('created_at', lastMonthEnd),
    supabase.from('generations').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
    supabase.from('generations').select('user_id', { count: 'exact' }).gte('created_at', sevenDaysAgo),
    supabase.from('generations').select('user_id, created_at').gte('created_at', thisMonthStart),
    supabase.from('generations').select('user_id').gte('created_at', lastMonthStart).lte('created_at', lastMonthEnd),
  ]);

  const profiles = allProfiles.data || [];
  const payingUsers = profiles.filter(p => p.plan_id !== 'free' && p.stripe_subscription_id);
  const freeUsers = profiles.filter(p => p.plan_id === 'free');

  // MRR: sum of plan prices for active subscribers
  let mrr = 0;
  const mrrByPlan: Record<string, number> = {};
  for (const p of payingUsers) {
    const planPrice = (PLANS[p.plan_id]?.price || 0) * 100; // cents
    mrr += planPrice;
    mrrByPlan[p.plan_id] = (mrrByPlan[p.plan_id] || 0) + planPrice;
  }

  const arr = mrr * 12;
  const arpu = payingUsers.length > 0 ? mrr / payingUsers.length : 0;

  // Average lifetime estimate (months since signup for paying users)
  let totalLifetimeMonths = 0;
  for (const p of payingUsers) {
    const signupDate = new Date(p.created_at);
    const monthsSinceSignup = Math.max(1, Math.ceil((now.getTime() - signupDate.getTime()) / (30 * 86400000)));
    totalLifetimeMonths += monthsSinceSignup;
  }
  const avgLifetimeMonths = payingUsers.length > 0 ? totalLifetimeMonths / payingUsers.length : 1;
  const ltv = (arpu / 100) * avgLifetimeMonths; // in dollars

  // DAU / WAU / MAU
  const dauUsers = new Set<string>();
  const wauUsers = new Set<string>();
  const mauUsers = new Set<string>();

  // DAU from today's generations
  // (gensToday is head-only count, use gensMonth data for DAU)
  const thisMonthGens = gensMonth.data || [];
  const todayStr = todayStart.split('T')[0];
  for (const g of thisMonthGens) {
    const genDay = (g.created_at as string)?.split('T')[0];
    if (genDay === todayStr) dauUsers.add(g.user_id as string);
    mauUsers.add(g.user_id as string);
  }

  const weekGens = gensWeek.data || [];
  for (const g of weekGens) {
    wauUsers.add(g.user_id as string);
  }

  const dau = dauUsers.size;
  const wau = wauUsers.size;
  const mau = mauUsers.size;
  const dauMauRatio = mau > 0 ? ((dau / mau) * 100).toFixed(1) : '0.0';

  // Month-over-month changes
  const signupsChange = (signupsLastMonth.count || 0) > 0
    ? (((signupsThisMonth.count || 0) - (signupsLastMonth.count || 0)) / (signupsLastMonth.count || 1) * 100).toFixed(1)
    : '0.0';

  const lastMonthUniqueUsers = new Set((gensLastMonth.data || []).map(g => g.user_id as string)).size;
  const gensChangeUsers = lastMonthUniqueUsers > 0
    ? (((mau - lastMonthUniqueUsers) / lastMonthUniqueUsers) * 100).toFixed(1)
    : '0.0';

  return NextResponse.json({
    success: true,
    data: {
      mrr: mrr / 100,        // dollars
      arr: arr / 100,
      mrrByPlan: Object.fromEntries(Object.entries(mrrByPlan).map(([k, v]) => [k, v / 100])),
      totalUsers: profiles.length,
      payingUsers: payingUsers.length,
      freeUsers: freeUsers.length,
      arpu: arpu / 100,       // dollars
      ltv,
      dau,
      wau,
      mau,
      dauMauRatio: parseFloat(dauMauRatio),
      signupsThisMonth: signupsThisMonth.count || 0,
      signupsLastMonth: signupsLastMonth.count || 0,
      signupsChange: parseFloat(signupsChange),
      activeUsersChange: parseFloat(gensChangeUsers),
      generationsToday: gensToday.count || 0,
    },
  });
}
