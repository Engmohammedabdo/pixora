import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkKeyedRateLimit, getRequestIp } from '@/lib/rate-limit';

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
    if (!(await checkKeyedRateLimit(`waitlist:${ip}`, 5, 60_000))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    const db = await createServiceRoleClient();
    const { error } = await db.rpc('join_waitlist', {
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

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'invalid_email' }, { status: 400 });
    }
    console.error('Waitlist error:', error);
    return NextResponse.json({ success: false, error: 'join_failed' }, { status: 500 });
  }
}
