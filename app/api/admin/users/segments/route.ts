import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';
import type { UserSegment } from '@/lib/admin/engagement';

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

  const [{ data: profiles }, { data: recentGens }, { data: prevGens }] = await Promise.all([
    supabase.from('profiles').select('id, plan_id, stripe_subscription_id, created_at'),
    supabase.from('generations').select('user_id').gte('created_at', thirtyDaysAgo),
    supabase.from('generations').select('user_id').gte('created_at', prevMonthStart).lte('created_at', prevMonthEnd),
  ]);

  const allUsers = profiles || [];

  // Count generations per user (this month)
  const gensByUser: Record<string, number> = {};
  for (const g of (recentGens || [])) {
    const uid = g.user_id as string;
    gensByUser[uid] = (gensByUser[uid] || 0) + 1;
  }

  // Count generations per user (previous month)
  const prevGensByUser: Record<string, number> = {};
  for (const g of (prevGens || [])) {
    const uid = g.user_id as string;
    prevGensByUser[uid] = (prevGensByUser[uid] || 0) + 1;
  }

  // Classify each user
  const segments: Record<UserSegment, string[]> = {
    vip: [],
    power_user: [],
    active: [],
    low_activity: [],
    dormant: [],
    at_risk: [],
    new: [],
    free_only: [],
  };

  for (const user of allUsers) {
    const uid = user.id;
    const genCount = gensByUser[uid] || 0;
    const prevGenCount = prevGensByUser[uid] || 0;
    const daysSinceSignup = Math.floor((now.getTime() - new Date(user.created_at).getTime()) / 86400000);
    const isPaying = user.plan_id !== 'free' && user.stripe_subscription_id;

    // VIP: business or agency
    if (user.plan_id === 'business' || user.plan_id === 'agency') {
      segments.vip.push(uid);
    }
    // New: signed up < 7 days
    else if (daysSinceSignup < 7) {
      segments.new.push(uid);
    }
    // At risk: paying + activity dropped > 50%
    else if (isPaying && prevGenCount >= 4 && genCount < prevGenCount * 0.5) {
      segments.at_risk.push(uid);
    }
    // Power user: >= 20 gens/month
    else if (genCount >= 20) {
      segments.power_user.push(uid);
    }
    // Active: 5-19 gens/month
    else if (genCount >= 5) {
      segments.active.push(uid);
    }
    // Low activity: 1-4 gens/month
    else if (genCount >= 1) {
      segments.low_activity.push(uid);
    }
    // Free only: free plan, > 30 days, never upgraded
    else if (user.plan_id === 'free' && daysSinceSignup > 30 && !user.stripe_subscription_id) {
      segments.free_only.push(uid);
    }
    // Dormant: 0 gens in 30 days
    else {
      segments.dormant.push(uid);
    }
  }

  const counts: Record<UserSegment, number> = {} as Record<UserSegment, number>;
  for (const [key, users] of Object.entries(segments)) {
    counts[key as UserSegment] = users.length;
  }

  return NextResponse.json({
    success: true,
    data: {
      counts,
      totalUsers: allUsers.length,
    },
  });
}
