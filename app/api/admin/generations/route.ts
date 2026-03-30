import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const url = new URL(request.url);

  const studio = url.searchParams.get('studio');
  const model = url.searchParams.get('model');
  const status = url.searchParams.get('status');
  const userId = url.searchParams.get('user_id');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const sort = url.searchParams.get('sort') || 'created_at';
  const order = url.searchParams.get('order') === 'asc';
  const offset = (page - 1) * limit;

  let query = supabase
    .from('generations')
    .select('id, studio, model, status, credits_used, error, created_at, input, output, user_id, profiles(name, email)', { count: 'exact' });

  if (studio) query = query.eq('studio', studio);
  if (model) query = query.eq('model', model);
  if (status) query = query.eq('status', status);
  if (userId) query = query.eq('user_id', userId);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const allowedSorts = ['created_at', 'studio', 'model', 'status', 'credits_used'];
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

export async function DELETE(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });
  }

  // Check generation exists
  const { data: existing } = await supabase
    .from('generations')
    .select('id')
    .eq('id', id)
    .single();

  if (!existing) {
    return NextResponse.json({ success: false, error: 'Generation not found' }, { status: 404 });
  }

  // Delete associated assets first
  await supabase.from('assets').delete().eq('generation_id', id);

  // Delete generation
  const { error } = await supabase.from('generations').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  await logAdminAction('generation_delete', 'generation', id, null, getClientIP(request));

  return NextResponse.json({ success: true });
}
