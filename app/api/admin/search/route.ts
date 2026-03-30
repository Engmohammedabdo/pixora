import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '5'), 10);

  if (!q || q.length < 2) {
    return NextResponse.json({ success: true, data: { users: [], generations: [], transactions: [], logs: [] } });
  }

  const supabase = createAdminClient();

  const [usersRes, gensRes, txRes, logsRes] = await Promise.all([
    // Users: search by name or email
    supabase
      .from('profiles')
      .select('id, name, email, plan_id, avatar_url')
      .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(limit),

    // Generations: search by studio or model, or by ID prefix
    supabase
      .from('generations')
      .select('id, studio, model, status, created_at, user_id')
      .or(`studio.ilike.%${q}%,model.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(limit),

    // Transactions: search by description
    supabase
      .from('credit_transactions')
      .select('id, amount, type, description, created_at, user_id')
      .ilike('description', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(limit),

    // Admin logs: search by action
    supabase
      .from('admin_logs')
      .select('id, action, target_type, target_id, created_at')
      .ilike('action', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      users: (usersRes.data || []).map(u => ({
        id: u.id,
        title: u.name || 'Unnamed',
        subtitle: u.email,
        badge: u.plan_id,
        href: `/admin/users/${u.id}`,
      })),
      generations: (gensRes.data || []).map(g => ({
        id: g.id,
        title: `${g.studio} — ${g.model}`,
        subtitle: `Status: ${g.status}`,
        href: `/admin/generations`,
      })),
      transactions: (txRes.data || []).map(t => ({
        id: t.id,
        title: `${(t.amount as number) > 0 ? '+' : ''}${t.amount} credits`,
        subtitle: (t.description as string) || t.type,
        href: `/admin/transactions`,
      })),
      logs: (logsRes.data || []).map(l => ({
        id: l.id,
        title: l.action as string,
        subtitle: `${l.target_type || ''}:${(l.target_id as string)?.substring(0, 8) || ''}`,
        href: `/admin/logs`,
      })),
    },
  });
}
