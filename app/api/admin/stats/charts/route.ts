import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

function getLast30Days(): string[] {
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }
  return days;
}

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const chart = searchParams.get('chart');

  if (!chart || !['signups', 'revenue', 'generations', 'models'].includes(chart)) {
    return NextResponse.json(
      { success: false, error: 'Invalid chart type. Use: signups, revenue, generations, models' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  if (chart === 'signups') {
    const days = getLast7Days();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

    const { data } = await supabase
      .from('profiles')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString());

    const byDay: Record<string, number> = {};
    data?.forEach((p) => {
      const day = (p.created_at as string).split('T')[0];
      byDay[day] = (byDay[day] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      data: days.map((date) => ({ date, count: byDay[date] || 0 })),
    });
  }

  if (chart === 'revenue') {
    const days = getLast30Days();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

    const { data } = await supabase
      .from('credit_transactions')
      .select('amount, created_at')
      .in('type', ['subscription', 'topup'])
      .gt('amount', 0)
      .gte('created_at', thirtyDaysAgo.toISOString());

    const byDay: Record<string, number> = {};
    data?.forEach((t) => {
      const day = (t.created_at as string).split('T')[0];
      byDay[day] = (byDay[day] || 0) + (t.amount as number);
    });

    return NextResponse.json({
      success: true,
      data: days.map((date) => ({ date, total: byDay[date] || 0 })),
    });
  }

  if (chart === 'generations') {
    const days = getLast7Days();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

    const { data } = await supabase
      .from('generations')
      .select('studio, created_at')
      .gte('created_at', sevenDaysAgo.toISOString());

    // Collect unique studios
    const studios = new Set<string>();
    const byDayStudio: Record<string, Record<string, number>> = {};

    data?.forEach((g) => {
      const day = (g.created_at as string).split('T')[0];
      const studio = g.studio as string;
      studios.add(studio);
      if (!byDayStudio[day]) byDayStudio[day] = {};
      byDayStudio[day][studio] = (byDayStudio[day][studio] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      data: days.map((date) => ({
        date,
        ...Object.fromEntries([...studios].map((s) => [s, byDayStudio[date]?.[s] || 0])),
      })),
      studios: [...studios],
    });
  }

  // models
  const { data } = await supabase
    .from('generations')
    .select('model');

  const byModel: Record<string, number> = {};
  data?.forEach((g) => {
    const model = (g.model as string) || 'unknown';
    byModel[model] = (byModel[model] || 0) + 1;
  });

  return NextResponse.json({
    success: true,
    data: Object.entries(byModel).map(([name, value]) => ({ name, value })),
  });
}
