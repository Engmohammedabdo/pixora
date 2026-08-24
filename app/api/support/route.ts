import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { checkKeyedRateLimit, getRequestIp } from '@/lib/rate-limit';

/**
 * POST /api/support — the contact channel.
 *
 * Public on purpose. Someone who cannot sign in is one of the likeliest people to
 * need this, and right now that includes anyone who forgets a password, because
 * Supabase Auth has no SMTP configured. Requiring a session would close the channel
 * to exactly the people with the worst problem.
 *
 * The message is STORED, never merely emailed. With no email provider configured
 * (the current state) the founder reads /admin/support and nothing is lost. Email is
 * a notification on top, and its failure is logged rather than surfaced — a customer
 * must never be told their message failed when it is safely in the database.
 */

const InputSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().max(80).optional(),
  topic: z.enum(['billing', 'bug', 'account', 'other']),
  message: z.string().trim().min(10).max(4000),
  locale: z.string().trim().max(5).optional(),
  pageUrl: z.string().trim().max(500).optional(),
  // Honeypot. Deliberately NOT `.max(0)` — rejecting here would return a validation
  // error and tell a bot exactly which field caught it, which is the one thing a
  // honeypot must never do. Accept anything and discard silently below.
  company: z.string().max(200).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const input = InputSchema.parse(body);

    if (input.company) {
      return NextResponse.json({ success: true });
    }

    const ip = getRequestIp(request);
    // Lower than the waitlist's 5/min: a person writing in sends one message, maybe
    // two. Anything faster is a script, and each row here costs storage the founder
    // has to read through.
    if (!(await checkKeyedRateLimit(`support:${ip}`, 3, 1))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    // Attach the user when a session happens to exist, but never require one. The
    // id comes from the verified session, never from the request body — otherwise
    // anyone could file a ticket that appears to come from another account, with
    // that account's plan and balance attached to it.
    let userId: string | null = null;
    try {
      const supabase = await createServerClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // No session. Expected for a logged-out sender.
    }

    const db = await createServiceRoleClient();
    const { data, error } = await db.rpc('submit_support_message', {
      p_email: input.email,
      p_topic: input.topic,
      p_message: input.message,
      p_name: input.name ?? null,
      p_user_id: userId,
      p_locale: input.locale ?? 'ar',
      p_page_url: input.pageUrl ?? null,
    });

    if (error) {
      console.error('[support] submit failed:', error.message);
      return NextResponse.json({ success: false, error: 'submit_failed' }, { status: 500 });
    }

    const result = data as { success: boolean; error?: string; id?: string };
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error ?? 'submit_failed' }, { status: 400 });
    }

    // Stored. Everything past this point is best-effort and must not change the
    // response the customer sees.
    console.info(`[support] new ${input.topic} message ${result.id}${userId ? ` from user ${userId}` : ' (logged out)'}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const short = error.issues.some((i) => i.path.includes('message'));
      return NextResponse.json(
        { success: false, error: short ? 'message_too_short' : 'invalid_input' },
        { status: 400 }
      );
    }
    console.error('[support] error:', error);
    return NextResponse.json({ success: false, error: 'submit_failed' }, { status: 500 });
  }
}
