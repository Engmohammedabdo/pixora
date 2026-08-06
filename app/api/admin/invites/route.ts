import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';

/**
 * The founder's control surface for the invite gate.
 *
 * Without this, every invitation is hand-written SQL — which is how a cohort of
 * twenty becomes a cohort of the three people you had the patience to type out.
 *
 * Everything routes through the service-role RPCs in migration 035. The gate itself
 * lives in a BEFORE INSERT trigger on auth.users; nothing here can weaken it.
 */

interface WaitlistRow {
  id: string;
  email: string;
  name: string | null;
  segment: string | null;
  source: string | null;
  locale: string | null;
  invited_at: string | null;
  invite_token: string | null;
  redeemed_at: string | null;
  created_at: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') || 'all';
  const search = url.searchParams.get('search') || '';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

  let query = supabase
    .from('waitlist')
    .select('id, email, name, segment, source, locale, invited_at, invite_token, redeemed_at, created_at',
      { count: 'exact' });

  // Filtering happens in SQL, never on a client-collected list of ids. A "invite
  // everyone shown" button built from the rendered page would invite one page of
  // rows and silently skip the rest.
  if (filter === 'waiting') query = query.is('invite_token', null);
  if (filter === 'invited') query = query.not('invite_token', 'is', null).is('redeemed_at', null);
  if (filter === 'joined') query = query.not('redeemed_at', 'is', null);
  if (search) query = query.ilike('email', `%${search}%`);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[admin/invites] list failed:', error.message);
    return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
  }

  const { data: status } = await supabase.rpc('invite_gate_status');

  return NextResponse.json({
    success: true,
    data: { rows: (data ?? []) as WaitlistRow[], total: count ?? 0, status },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const emails: unknown = body?.emails;

  if (!Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ success: false, error: 'no_emails' }, { status: 400 });
  }
  // A cap, so a mis-click on "invite all" cannot open the doors wider than intended
  // in one request. Inviting more is a second, deliberate click.
  if (emails.length > 100) {
    return NextResponse.json({ success: false, error: 'too_many' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const results: Array<{ email: string; token?: string; error?: string; reissued?: boolean }> = [];

  for (const raw of emails) {
    if (typeof raw !== 'string') continue;
    const { data, error } = await supabase.rpc('issue_invite', {
      p_email: raw,
      p_invited_by: 'admin',
    });

    if (error) {
      results.push({ email: raw, error: error.message });
      continue;
    }
    const r = data as { success: boolean; error?: string; email?: string; token?: string; reissued?: boolean };
    results.push(r.success
      ? { email: r.email ?? raw, token: r.token, reissued: r.reissued }
      : { email: raw, error: r.error });
  }

  const issued = results.filter((r) => r.token).length;

  // logAdminAction never throws and never reports failure, so this is best-effort
  // by construction. Granting access to a paid product deserves a record; do not
  // treat its presence as a guarantee.
  await logAdminAction(
    'invites.issue',
    'waitlist',
    null,
    { requested: emails.length, issued },
    getClientIP(request)
  );

  return NextResponse.json({ success: true, data: { results, issued } });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (!(await verifyAdminSession(request))) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email : null;
  if (!email) {
    return NextResponse.json({ success: false, error: 'no_email' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('revoke_invite', { p_email: email });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const r = data as { success: boolean; revoked: number };
  await logAdminAction(
    'invites.revoke',
    'waitlist',
    email,
    { revoked: r.revoked },
    getClientIP(request)
  );

  // revoked === 0 means the invite was already redeemed — the account exists and
  // taking the token back would not remove it. Say so rather than reporting success.
  return NextResponse.json({
    success: r.success,
    error: r.success ? undefined : 'already_redeemed_or_not_found',
  });
}
