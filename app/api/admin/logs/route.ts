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

  const tab = url.searchParams.get('tab') || 'admin';
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const action = url.searchParams.get('action');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = (page - 1) * limit;

  if (tab === 'admin') {
    let query = supabase
      .from('admin_logs')
      .select('*', { count: 'exact' });

    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    if (action) query = query.eq('action', action);

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const [{ data, count }, { data: actionTypes }] = await Promise.all([
      query,
      supabase.from('admin_logs').select('action').limit(200),
    ]);

    const uniqueActions = [...new Set(actionTypes?.map(a => a.action as string) || [])].sort();

    return NextResponse.json({
      success: true,
      data: data || [],
      actionTypes: uniqueActions,
      pagination: { page, limit, total: count || 0 },
    });
  }

  if (tab === 'errors') {
    let query = supabase
      .from('generations')
      .select('id, studio, model, error, input, created_at, user_id, profiles(name, email)', { count: 'exact' })
      .eq('status', 'failed');

    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, count } = await query;

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: { page, limit, total: count || 0 },
    });
  }

  return NextResponse.json({ success: false, error: 'Invalid tab' }, { status: 400 });
}
