import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const url = new URL(request.url);
  const tab = url.searchParams.get('tab');

  // Fetch user profile
  const { data: user, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !user) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  // Fetch tab-specific data
  if (tab === 'generations') {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    const { data, count } = await supabase
      .from('generations')
      .select('id, studio, model, status, credits_used, created_at, error', { count: 'exact' })
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return NextResponse.json({
      success: true,
      data: { user, tabData: data || [], pagination: { page, limit, total: count || 0 } },
    });
  }

  if (tab === 'transactions') {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    const { data, count } = await supabase
      .from('credit_transactions')
      .select('id, amount, type, description, balance_after, created_at', { count: 'exact' })
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return NextResponse.json({
      success: true,
      data: { user, tabData: data || [], pagination: { page, limit, total: count || 0 } },
    });
  }

  if (tab === 'brand_kits') {
    const { data } = await supabase
      .from('brand_kits')
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false });

    return NextResponse.json({ success: true, data: { user, tabData: data || [] } });
  }

  if (tab === 'assets') {
    const { data } = await supabase
      .from('assets')
      .select('*')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json({ success: true, data: { user, tabData: data || [] } });
  }

  // Default: fetch stats
  const [genCount, transCount, brandKitCount, assetCount] = await Promise.all([
    supabase.from('generations').select('*', { count: 'exact', head: true }).eq('user_id', id),
    supabase.from('credit_transactions').select('*', { count: 'exact', head: true }).eq('user_id', id),
    supabase.from('brand_kits').select('*', { count: 'exact', head: true }).eq('user_id', id),
    supabase.from('assets').select('*', { count: 'exact', head: true }).eq('user_id', id),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      ...user,
      stats: {
        generations: genCount.count || 0,
        transactions: transCount.count || 0,
        brandKits: brandKitCount.count || 0,
        assets: assetCount.count || 0,
      },
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();

  const allowedFields = ['plan_id', 'banned', 'ban_reason', 'name'];
  const updates: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
  }

  // Handle ban/unban logic
  if (updates.banned === true) {
    updates.banned_at = new Date().toISOString();
  }
  if (updates.banned === false) {
    updates.banned_at = null;
    updates.ban_reason = null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const action = updates.banned === true ? 'user_ban' : updates.banned === false ? 'user_unban' : 'user_update';
  await logAdminAction(action, 'user', id, updates, getClientIP(request));

  return NextResponse.json({ success: true, data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase.auth.admin.deleteUser(id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  await logAdminAction('user_delete', 'user', id, null, getClientIP(request));

  return NextResponse.json({ success: true });
}
