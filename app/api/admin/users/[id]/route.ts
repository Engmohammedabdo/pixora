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

  // Revoke the session on the AUTH side too, not just in our own table.
  //
  // `profiles.banned` is a flag only our code reads. GoTrue knows nothing about
  // it, so before this the banned customer's refresh token stayed valid and kept
  // minting fresh access tokens indefinitely — the ban began whenever they next
  // chose to load an HTML page, which is to say never. Banning the user in GoTrue
  // makes the token grant itself refuse, so the ban outlives the access token
  // already in their browser rather than ending with the admin's patience.
  // GoTrue takes a DURATION, not a flag; 'none' is its documented way to lift one.
  //
  // Best effort ON PURPOSE. The profile row is already written by the time we get
  // here and every request of ours checks that row (middleware enforces it on both
  // the page and the /api/* branch), so failing the whole call would report "ban
  // failed" for a ban that IS in force everywhere our code looks. The outcome is
  // reported instead, so the admin knows whether the live session was killed now
  // or only the next middleware check will catch it.
  let sessionRevoked: boolean | null = null;
  let sessionRevokeError: string | null = null;
  if (updates.banned === true || updates.banned === false) {
    const { error: authError } = await supabase.auth.admin.updateUserById(id, {
      ban_duration: updates.banned === true ? '876000h' : 'none',
    });
    if (authError) {
      sessionRevokeError = authError.message;
      // Loud on purpose, and phrased as the operational consequence rather than
      // as the API call that failed: a `false` in this branch means a user the
      // admin believes is locked out is still holding a working session.
      console.error(
        `[admin/users] SESSION NOT REVOKED — user ${id} was ${updates.banned === true ? 'banned' : 'unbanned'} in profiles, ` +
        `but GoTrue refused the matching ${updates.banned === true ? 'ban' : 'unban'}: ${authError.message}. ` +
        `${updates.banned === true
          ? 'Their existing access token keeps working until it expires; only the middleware check stands in the way.'
          : 'They stay locked out of the auth layer despite the unban and must be released manually.'}`
      );
    }
    sessionRevoked = !authError;
  }

  const action = updates.banned === true ? 'user_ban' : updates.banned === false ? 'user_unban' : 'user_update';
  await logAdminAction(
    action,
    'user',
    id,
    {
      ...updates,
      ...(sessionRevoked === null ? {} : { session_revoked: sessionRevoked }),
      ...(sessionRevokeError === null ? {} : { session_revoke_error: sessionRevokeError }),
    },
    getClientIP(request)
  );

  // A half-applied ban is reported as a `warning` on an otherwise successful
  // response, not as a 500. The profile row IS written and every request of ours
  // enforces it, so the ban is real — but the admin is the only one who can decide
  // whether to retry or wait out the token, and they cannot decide what they were
  // never told. The shape is a code plus a ready-to-render message so the panel can
  // surface it without re-deriving the meaning of the flag.
  return NextResponse.json({
    success: true,
    data,
    ...(sessionRevoked === null ? {} : { sessionRevoked }),
    ...(sessionRevoked === false
      ? {
          warning: {
            code: 'session_revocation_failed',
            message: updates.banned === true
              ? 'Saved, but the sign-in session could not be revoked. This user stays blocked everywhere in the app, yet any access token already in their browser keeps working until it expires. Retry the ban to revoke it.'
              : 'Saved, but the sign-in block could not be lifted on the auth side. This user is unbanned in the app but may still be refused at sign-in. Retry the unban.',
            detail: sessionRevokeError,
          },
        }
      : {}),
  });
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
