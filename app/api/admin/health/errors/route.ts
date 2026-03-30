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

  const { data: failedGens } = await supabase
    .from('generations')
    .select('studio, model, error, created_at')
    .eq('status', 'failed')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  const { data: allGens } = await supabase
    .from('generations')
    .select('created_at')
    .gte('created_at', since);

  const errors = failedGens || [];
  const total = allGens || [];

  // Error count by day
  const errorsByDay: Record<string, { errors: number; total: number }> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const dayStr = d.toISOString().split('T')[0];
    errorsByDay[dayStr] = { errors: 0, total: 0 };
  }

  for (const g of total) {
    const day = (g.created_at as string).split('T')[0];
    if (errorsByDay[day]) errorsByDay[day].total++;
  }

  for (const e of errors) {
    const day = (e.created_at as string).split('T')[0];
    if (errorsByDay[day]) errorsByDay[day].errors++;
  }

  const dailyTrend = Object.entries(errorsByDay).map(([date, data]) => ({
    date,
    errors: data.errors,
    total: data.total,
    errorRate: data.total > 0 ? parseFloat(((data.errors / data.total) * 100).toFixed(1)) : 0,
  }));

  // Breakdown by studio
  const byStudio: Record<string, number> = {};
  for (const e of errors) {
    const s = e.studio as string;
    byStudio[s] = (byStudio[s] || 0) + 1;
  }

  // Breakdown by model
  const byModel: Record<string, number> = {};
  for (const e of errors) {
    const m = e.model as string;
    byModel[m] = (byModel[m] || 0) + 1;
  }

  // Top 10 recurring error messages
  const errorMsgCounts: Record<string, { count: number; studio: string; lastSeen: string }> = {};
  for (const e of errors) {
    const msg = (e.error as string) || 'Unknown error';
    const truncated = msg.substring(0, 150);
    if (!errorMsgCounts[truncated]) {
      errorMsgCounts[truncated] = { count: 0, studio: e.studio as string, lastSeen: e.created_at as string };
    }
    errorMsgCounts[truncated].count++;
    if ((e.created_at as string) > errorMsgCounts[truncated].lastSeen) {
      errorMsgCounts[truncated].lastSeen = e.created_at as string;
      errorMsgCounts[truncated].studio = e.studio as string;
    }
  }

  const topErrors = Object.entries(errorMsgCounts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([message, data]) => ({ message, ...data }));

  // Trend direction: compare last 7d error rate vs previous 7d
  const last7 = dailyTrend.slice(-7);
  const prev7 = dailyTrend.slice(-14, -7);
  const last7Rate = last7.reduce((s, d) => s + d.errors, 0) / Math.max(last7.reduce((s, d) => s + d.total, 0), 1) * 100;
  const prev7Rate = prev7.reduce((s, d) => s + d.errors, 0) / Math.max(prev7.reduce((s, d) => s + d.total, 0), 1) * 100;
  const trendDirection = last7Rate < prev7Rate ? 'improving' : last7Rate > prev7Rate ? 'worsening' : 'stable';

  return NextResponse.json({
    success: true,
    data: {
      dailyTrend,
      byStudio: Object.entries(byStudio).map(([studio, count]) => ({ studio, count })).sort((a, b) => b.count - a.count),
      byModel: Object.entries(byModel).map(([model, count]) => ({ model, count })).sort((a, b) => b.count - a.count),
      topErrors,
      totalErrors: errors.length,
      trendDirection,
      currentErrorRate: parseFloat(last7Rate.toFixed(1)),
      previousErrorRate: parseFloat(prev7Rate.toFixed(1)),
    },
  });
}
