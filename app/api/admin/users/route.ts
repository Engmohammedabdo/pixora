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

  const search = url.searchParams.get('search') || '';
  const plan = url.searchParams.get('plan') || '';
  const banned = url.searchParams.get('banned');
  const minCredits = url.searchParams.get('min_credits');
  const maxCredits = url.searchParams.get('max_credits');
  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const sort = url.searchParams.get('sort') || 'created_at';
  const order = url.searchParams.get('order') === 'asc';
  const offset = (page - 1) * limit;

  let query = supabase
    .from('profiles')
    .select('id, name, email, avatar_url, plan_id, credits_balance, purchased_credits, banned, created_at', { count: 'exact' });

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  if (plan) {
    query = query.eq('plan_id', plan);
  }

  if (banned === 'true') {
    query = query.eq('banned', true);
  } else if (banned === 'false') {
    query = query.eq('banned', false);
  }

  if (minCredits) {
    query = query.gte('credits_balance', parseInt(minCredits));
  }
  if (maxCredits) {
    query = query.lte('credits_balance', parseInt(maxCredits));
  }

  if (dateFrom) {
    query = query.gte('created_at', dateFrom);
  }
  if (dateTo) {
    query = query.lte('created_at', dateTo);
  }

  const allowedSorts = ['created_at', 'name', 'email', 'plan_id', 'credits_balance'];
  const sortField = allowedSorts.includes(sort) ? sort : 'created_at';

  query = query
    .order(sortField, { ascending: order })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: data || [],
    pagination: { page, limit, total: count || 0 },
  });
}
