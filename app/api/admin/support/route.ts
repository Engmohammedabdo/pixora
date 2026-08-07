import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'new';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 300);

  let query = supabase
    .from('support_messages')
    .select('id, user_id, email, name, topic, message, locale, plan_id, credits, page_url, status, admin_note, handled_at, created_at',
      { count: 'exact' });

  if (status !== 'all') query = query.eq('status', status);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[admin/support] list failed:', error.message);
    return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
  }

  // The unread count drives the sidebar badge, so it must be the real total for
  // `new` — not the length of this page of results.
  const { count: newCount } = await supabase
    .from('support_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'new');

  return NextResponse.json({
    success: true,
    data: { rows: data ?? [], total: count ?? 0, newCount: newCount ?? 0 },
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : null;
  const status = body?.status === 'handled' || body?.status === 'new' ? body.status : null;
  const note = typeof body?.note === 'string' ? body.note.slice(0, 2000) : null;

  if (!id || !status) {
    return NextResponse.json({ success: false, error: 'invalid_input' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('resolve_support_message', {
    p_id: id,
    p_status: status,
    p_note: note,
  });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  await logAdminAction('support.resolve', 'support_messages', id, { status }, getClientIP(request));

  return NextResponse.json({ success: (data as { success: boolean }).success });
}
