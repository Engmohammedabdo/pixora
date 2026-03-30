import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const url = new URL(request.url);
  const days = Math.min(parseInt(url.searchParams.get('days') || '30'), 90);

  const since = new Date(Date.now() - days * 86400000).toISOString();

  // Get users who signed up in this period
  const { data: newUsers } = await supabase
    .from('profiles')
    .select('id, plan_id, stripe_subscription_id')
    .gte('created_at', since);

  const totalSignups = (newUsers || []).length;
  if (totalSignups === 0) {
    return NextResponse.json({
      success: true,
      data: {
        steps: [
          { name: 'Signup', count: 0, rate: 100 },
          { name: 'First Generation', count: 0, rate: 0 },
          { name: 'Repeat Generation (3+)', count: 0, rate: 0 },
          { name: 'Upgraded to Paid', count: 0, rate: 0 },
        ],
      },
    });
  }

  const userIds = (newUsers || []).map(u => u.id);

  // Get generation counts per user
  const { data: generations } = await supabase
    .from('generations')
    .select('user_id')
    .in('user_id', userIds);

  // Count generations per user
  const genCountByUser: Record<string, number> = {};
  for (const g of (generations || [])) {
    const uid = g.user_id as string;
    genCountByUser[uid] = (genCountByUser[uid] || 0) + 1;
  }

  const usersWithFirstGen = Object.keys(genCountByUser).length;
  const usersWithRepeatGen = Object.values(genCountByUser).filter(c => c >= 3).length;
  const usersUpgraded = (newUsers || []).filter(u => u.plan_id !== 'free' && u.stripe_subscription_id).length;

  const steps = [
    { name: 'Signup', count: totalSignups, rate: 100 },
    {
      name: 'First Generation',
      count: usersWithFirstGen,
      rate: parseFloat(((usersWithFirstGen / totalSignups) * 100).toFixed(1)),
    },
    {
      name: 'Repeat Generation (3+)',
      count: usersWithRepeatGen,
      rate: parseFloat(((usersWithRepeatGen / totalSignups) * 100).toFixed(1)),
    },
    {
      name: 'Upgraded to Paid',
      count: usersUpgraded,
      rate: parseFloat(((usersUpgraded / totalSignups) * 100).toFixed(1)),
    },
  ];

  return NextResponse.json({ success: true, data: { steps, period: days } });
}
