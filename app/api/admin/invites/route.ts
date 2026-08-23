import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';
import { isEmailConfigured } from '@/lib/email/client';
import { sendInviteEmail } from '@/lib/email/send';

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

/**
 * `sent` is deliberately a separate axis from `error`.
 *
 * A row can be issued-and-mailed, issued-but-not-mailed, or not issued at all,
 * and the middle case is the dangerous one: the seat is open, the token is live,
 * and the person it belongs to has no idea. Collapsing it into a single boolean
 * is how "invited 30" comes to mean "30 rows changed" instead of "30 people were
 * told", which is the only meaning the founder cares about.
 */
type InviteResult = {
  email: string;
  token?: string;
  error?: string;
  reissued?: boolean;
  sent?: 'sent' | 'failed' | 'skipped';
  sendError?: string;
};

/** How many invites are in flight at once. */
const SEND_CONCURRENCY = 4;

/**
 * Mail every invite that was successfully minted, and record what happened to
 * each one on its own result row.
 *
 * Sends are awaited rather than fired into the background. The founder is
 * looking at the screen deciding whether to go and message these people by
 * hand; answering "issued" before the sends resolve would put the one fact they
 * need behind a log line on a server they are not reading. The batch is capped
 * at 100 upstream and runs `SEND_CONCURRENCY` at a time, so the wait is bounded
 * and the shared mail host is not opened up on a hundred connections at once.
 */
async function deliverInvites(
  supabase: ReturnType<typeof createAdminClient>,
  results: InviteResult[]
): Promise<void> {
  const pending = results.filter((r) => r.token);
  if (pending.length === 0) return;

  // Asked before any work, never per-address: an unconfigured mailer is a
  // property of the deployment, and discovering it 40 sends in would leave a
  // batch half-delivered with no way to tell which half.
  if (!isEmailConfigured()) {
    console.warn(`[admin/invites] ${pending.length} invite(s) issued but no mail backend is configured`);
    for (const r of pending) r.sent = 'skipped';
    return;
  }

  // Matched on the token, not the address. Tokens are exact and uniquely indexed;
  // addresses are stored as the customer typed them and compared case-insensitively
  // by `issue_invite`, so an `.in()` on lowercased mail silently misses the rows
  // that were capitalised at signup — and a missed row means the wrong language.
  const tokens = pending.map((r) => r.token!) as string[];
  const { data: rows } = await supabase
    .from('waitlist')
    .select('invite_token, locale')
    .in('invite_token', tokens);

  const localeByToken = new Map<string, string | null>(
    (rows ?? []).map((row) => [row.invite_token as string, row.locale as string | null])
  );

  // The number the email promises. Read from the same row the trigger reads at
  // redemption, so the message cannot claim 100 while the grant hands out 50.
  const { data: setting } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'invite_gate')
    .maybeSingle();
  const credits = Number((setting?.value as { beta_credits?: number } | null)?.beta_credits ?? 0);

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < pending.length) {
      const row = pending[cursor++];
      const result = await sendInviteEmail({
        email: row.email,
        token: row.token!,
        credits,
        locale: localeByToken.get(row.token!) ?? null,
      });

      if (result.status === 'sent') {
        row.sent = 'sent';
      } else if (result.status === 'skipped') {
        row.sent = 'skipped';
      } else {
        row.sent = 'failed';
        row.sendError = result.error;
        // The seat is open and its owner has not been told. This is the line to
        // grep for when someone says they never got their invite.
        console.error(`[admin/invites] INVITE ISSUED BUT NOT DELIVERED to ${row.email}: ${result.error}`);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(SEND_CONCURRENCY, pending.length) }, () => worker())
  );
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

  // Mailing is the default because an invite nobody receives is not an invite.
  // It stays overridable so the founder can still mint a link to hand over on
  // WhatsApp, which is how a good half of this market actually gets contacted.
  const notify = body?.notify !== false;

  const supabase = createAdminClient();
  const results: InviteResult[] = [];

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

  if (notify) await deliverInvites(supabase, results);

  // logAdminAction never throws and never reports failure, so this is best-effort
  // by construction. Granting access to a paid product deserves a record; do not
  // treat its presence as a guarantee.
  await logAdminAction(
    'invites.issue',
    'waitlist',
    null,
    { requested: emails.length, issued, sent: results.filter((r) => r.sent === 'sent').length },
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
