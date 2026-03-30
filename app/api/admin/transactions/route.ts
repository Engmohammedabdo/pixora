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

  const type = url.searchParams.get('type');
  const userId = url.searchParams.get('user_id');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const direction = url.searchParams.get('direction');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = (page - 1) * limit;

  // Main query with pagination
  let query = supabase
    .from('credit_transactions')
    .select('id, amount, type, description, balance_after, created_at, user_id, profiles(name, email)', { count: 'exact' });

  if (type) query = query.eq('type', type);
  if (userId) query = query.eq('user_id', userId);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  if (direction === 'positive') query = query.gt('amount', 0);
  if (direction === 'negative') query = query.lt('amount', 0);

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Summary query (no pagination, no direction filter for totals)
  let summaryQuery = supabase
    .from('credit_transactions')
    .select('amount');

  if (type) summaryQuery = summaryQuery.eq('type', type);
  if (userId) summaryQuery = summaryQuery.eq('user_id', userId);
  if (from) summaryQuery = summaryQuery.gte('created_at', from);
  if (to) summaryQuery = summaryQuery.lte('created_at', to);

  const [{ data, error, count }, { data: summaryData }] = await Promise.all([
    query,
    summaryQuery,
  ]);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const totalIn = summaryData?.filter(t => t.amount > 0).reduce((s, t) => s + (t.amount as number), 0) || 0;
  const totalOut = summaryData?.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount as number), 0) || 0;

  return NextResponse.json({
    success: true,
    data: data || [],
    summary: { totalIn, totalOut, net: totalIn - totalOut },
    pagination: { page, limit, total: count || 0 },
  });
}
