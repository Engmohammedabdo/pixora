import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkKeyedRateLimit, getRequestIp } from '@/lib/rate-limit';
import { sendWaitlistWelcomeEmail } from '@/lib/email/send';

const InputSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().max(80).optional(),
  segment: z.enum(['agency', 'store', 'freelancer', 'other']).optional(),
  source: z.string().trim().max(60).optional(),
  locale: z.string().trim().max(5).optional(),
  // Honeypot: a real person never fills a hidden field. Bots fill everything.
  // Deliberately NOT `.max(0)` — that would make Zod reject the request with a
  // validation error, telling the bot exactly which field caught it. Accept any
  // value here and let the silent discard below handle it.
  company: z.string().max(200).optional(),
});

/**
 * POST /api/waitlist — public pre-launch signup.
 *
 * Unauthenticated by design, so it is rate-limited by IP. Writes go through the
 * `join_waitlist` RPC (migration 026) rather than a table grant, so the public
 * key can neither read the list nor write columns it should not touch.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const input = InputSchema.parse(body);

    // Silently accept and discard bot submissions. Returning an error would tell
    // the bot what tripped it and invite a retry without the honeypot.
    if (input.company) {
      return NextResponse.json({ success: true });
    }

    const ip = getRequestIp(request);
    if (!(await checkKeyedRateLimit(`waitlist:${ip}`, 5, 1))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    const db = await createServiceRoleClient();
    const { data, error } = await db.rpc('join_waitlist', {
      p_email: input.email,
      p_name: input.name ?? null,
      p_segment: input.segment ?? null,
      p_source: input.source ?? null,
      p_locale: input.locale ?? 'ar',
    });

    if (error) {
      if (error.message?.includes('invalid_email')) {
        return NextResponse.json({ success: false, error: 'invalid_email' }, { status: 400 });
      }
      console.error('[waitlist] join failed:', error.message);
      return NextResponse.json({ success: false, error: 'join_failed' }, { status: 500 });
    }

    // Welcome mail on the FIRST signup only (migration 034 distinguishes the two).
    // Without that check, this endpoint would mail anyone whose address a stranger
    // typed into the form — the IP rate limit permits 5 a minute, which is a spam
    // cannon aimed at a third party, not a defence.
    //
    // The response below is byte-identical either way. `data` is visible only to
    // this server; leaking "already registered" to the browser would turn a public
    // form into an oracle for testing whether an address is on the list.
    if (data === 'created') {
      const mail = await sendWaitlistWelcomeEmail({
        email: input.email,
        name: input.name,
        locale: input.locale,
      });
      if (mail.status === 'failed') {
        // The signup itself is safely stored — that is the part that matters. A
        // failed confirmation must not report the signup as failed and invite a
        // retry that mails them twice.
        console.error(`[waitlist] stored, but welcome email failed: ${mail.error}`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'invalid_email' }, { status: 400 });
    }
    console.error('Waitlist error:', error);
    return NextResponse.json({ success: false, error: 'join_failed' }, { status: 500 });
  }
}
