import { NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { consumeAttempt } from '@/lib/throttle';
import { isClientReportable, type EventParams } from '@/lib/analytics/events';
import { readGaIds, trackEventWithIds } from '@/lib/analytics/track';

/**
 * The ONE way a browser is allowed to report an event.
 *
 * ── WHY THIS ROUTE IS SO NARROW ────────────────────────────────────────────
 * `user_events` is what the admin dashboard computes its numbers from, and GA4 is
 * what the business reads to decide where money goes. Forged rows in either look
 * exactly like real ones — there is no later pass that can tell them apart. So
 * the surface is kept to the smallest thing that cannot be turned into a lie:
 *
 *   1. The subject is the VERIFIED session's user. Any user id in the body is
 *      ignored, not validated — there is nothing to validate it against that the
 *      sender could not also forge.
 *   2. Only names on CLIENT_REPORTABLE are accepted. `purchase` and
 *      `generation_completed` are witnessed by the server and are rejected here,
 *      so no customer can POST themselves revenue or free completions.
 *   3. Params are bounded — count, key length, value length — because they land
 *      in a JSONB column and an unbounded write is a storage bill with an author
 *      who is not us.
 *
 * ── WHY IT IS THROTTLED, GIVEN IT IS ALREADY AUTHENTICATED ─────────────────
 * Authentication says who, never how often. A signed-in customer looping this
 * endpoint would flood their own timeline and skew every per-user engagement
 * figure the admin panel derives. `consumeAttempt` is migration 039's atomic
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING`, the same one the studios use, so
 * concurrent calls serialise instead of racing past the cap.
 */

const MAX_PARAMS = 12;
const MAX_KEY_LEN = 40;
const MAX_VALUE_LEN = 200;

const InputSchema = z.object({
  name: z.string().min(1).max(60),
  params: z
    .record(
      z.string().min(1).max(MAX_KEY_LEN),
      z.union([z.string().max(MAX_VALUE_LEN), z.number(), z.boolean()])
    )
    .optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = InputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'invalid_event' }, { status: 400 });
    }

    const { name, params = {} } = parsed.data;

    // A name the server owns is not a validation slip — it is someone trying to
    // write revenue. Answered the same as any other bad name so the response
    // cannot be used to enumerate which events exist.
    if (!isClientReportable(name)) {
      return NextResponse.json({ success: false, error: 'invalid_event' }, { status: 400 });
    }

    if (Object.keys(params).length > MAX_PARAMS) {
      return NextResponse.json({ success: false, error: 'invalid_event' }, { status: 400 });
    }

    // 30 events per minute per user: far above anything the UI produces (signup
    // fires two, once), far below anything that could bloat the table.
    let allowed: boolean;
    try {
      allowed = await consumeAttempt(`events:${user.id}`, 30, 1);
    } catch (e: unknown) {
      // Fails CLOSED, the rule migration 039 established. Losing an analytics
      // event during a database blip costs a row; opening the cap costs the
      // integrity of every number computed from this table.
      console.error(`[events] throttle unavailable for ${user.id}; denying: ${String(e)}`);
      allowed = false;
    }
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    // Awaited, unlike the studio paths: this request exists only to record the
    // event, so there is no customer work for it to delay.
    await trackEventWithIds(user.id, name, params as EventParams, await readGaIds());

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[events] failed:', error);
    return NextResponse.json({ success: false, error: 'event_failed' }, { status: 500 });
  }
}
