import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';

/**
 * THE FIRST READER OF `public.user_events`.
 *
 * The table was created by migration 018 and written by nothing until 2026-08-25.
 * It has been written since — the rows are confirmed arriving — and read by
 * NOTHING: before this route, `grep "from('user_events')"` across `app/` and
 * `lib/` returned exactly one hit, the INSERT in `lib/analytics/track.ts`. Sixteen
 * admin pages and twenty-eight admin API routes, none of them touching it, while
 * `app/api/events/route.ts` carried a comment claiming the admin dashboard
 * computes from this table. This route makes that comment true.
 *
 * ── THE ONE NUMBER ─────────────────────────────────────────────────────────
 * `returningUsers`: how many distinct people, excluding the founder's own test
 * account, completed a generation on TWO DIFFERENT CALENDAR DAYS in the window.
 *
 * Not signups — that measures the pitch. Not pageviews — GA4 has still never been
 * observed in a real browser, so they are unreadable today. Not revenue — too
 * lagging to steer by. A second day, unprompted, is the only cheap signal that
 * the product did something a human wanted twice.
 *
 * ── WHY THE DAY BUCKET IS A DUBAI DAY, NOT A UTC ONE ───────────────────────
 * `created_at` is timestamptz, and `.slice(0, 10)` of its ISO string is a UTC
 * date, whose midnight falls at 04:00 in Dubai. The first version bucketed there
 * and wrote the caveat into the payload. So one working night, say 02:00 and
 * 05:00 Dubai time, landed on two UTC days and counted that customer as
 * RETURNING. That inflated the one number this route exists for, in the
 * optimistic direction, which is the dangerous one. `dubaiDay()` shifts by +4h
 * before slicing. GST has no daylight saving, so a fixed offset is exact rather
 * than an approximation, and it needs no migration and no time-zone database.
 *
 * ── WHY THE SERVICE-ROLE CLIENT ────────────────────────────────────────────
 * Migration 022 enabled RLS on `user_events`, revoked ALL from `anon` and
 * `authenticated`, and added no policy. Nothing but the service role can read it,
 * and that lockdown is worth keeping: a customer who could INSERT here could
 * forge the rows every admin number is computed from.
 */

/** The e2e account. Its runs are the harness's, not a customer's, and counting
 *  them would make the one number that matters read non-zero on day one. */
const EXCLUDED_USER_IDS = ['b215522f-f572-4203-8544-115e38af0466'];

/**
 * The columns are `event_type` and `metadata` — read off the INSERT in
 * lib/analytics/track.ts, not recalled. This route's first draft used
 * `event_name`/`params`, which are the GA4 wire names the same module also
 * speaks; the table uses the other pair. That would have compiled, queried
 * successfully and returned zeros forever — a dashboard reporting "no activation"
 * for a product that had it. Third instance of this class in one day: copy the
 * writer, never remember it.
 */
interface EventRow {
  user_id: string | null;
  event_type: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

/** GST is UTC+4 all year, with no daylight saving. */
const DUBAI_OFFSET_MS = 4 * 3_600_000;

/** The Dubai calendar date (YYYY-MM-DD) of a timestamptz — see the header. */
function dubaiDay(createdAt: string): string {
  return new Date(Date.parse(createdAt) + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days') || '30', 10) || 30, 1), 90);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('user_events')
    .select('user_id, event_type, created_at, metadata')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50_000);

  if (error) {
    // Fails LOUD. A dashboard that renders zeros on a failed read is worse than
    // one that renders nothing: zero is a finding, and this would fake it.
    return NextResponse.json({ success: false, error: 'query_failed', detail: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as EventRow[];
  const real = rows.filter((r) => r.user_id && !EXCLUDED_USER_IDS.includes(r.user_id));

  // ── 1. Signups per day — PEOPLE, not rows ───────────────────────────────
  // Distinct user_id, per Dubai day and in the total. Nothing makes `sign_up`
  // once-per-user at write time: POST /api/events accepts it from any signed-in
  // session up to its 30-a-minute throttle (app/api/events/route.ts:81), so a
  // retried client report is a second row. Counting rows counted EVENTS under a
  // card labelled "Sign-ups", which anyone reads as people. The per-day sets can
  // sum past the total if one person's rows straddle a midnight; the total is
  // the number to quote.
  const signupUsersByDay = new Map<string, Set<string>>();
  const signupUsers = new Set<string>();
  for (const r of real) {
    if (r.event_type !== 'sign_up' || !r.user_id) continue;
    signupUsers.add(r.user_id);
    const d = dubaiDay(r.created_at);
    if (!signupUsersByDay.has(d)) signupUsersByDay.set(d, new Set());
    signupUsersByDay.get(d)!.add(r.user_id);
  }

  // ── 2. generation_started by studio ─────────────────────────────────────
  const byStudio = new Map<string, number>();
  for (const r of real) {
    if (r.event_type !== 'generation_started') continue;
    const studio = typeof r.metadata?.studio === 'string' ? r.metadata.studio : 'unknown';
    byStudio.set(studio, (byStudio.get(studio) ?? 0) + 1);
  }

  // ── 3. THE NUMBER: distinct users completing on 2+ distinct days ────────
  const daysByUser = new Map<string, Set<string>>();
  const studiosByUser = new Map<string, Set<string>>();
  for (const r of real) {
    if (r.event_type !== 'generation_completed' || !r.user_id) continue;
    if (!daysByUser.has(r.user_id)) daysByUser.set(r.user_id, new Set());
    daysByUser.get(r.user_id)!.add(dubaiDay(r.created_at));
    const studio = typeof r.metadata?.studio === 'string' ? r.metadata.studio : null;
    if (studio) {
      if (!studiosByUser.has(r.user_id)) studiosByUser.set(r.user_id, new Set());
      studiosByUser.get(r.user_id)!.add(studio);
    }
  }
  const returningUserIds = [...daysByUser.entries()].filter(([, d]) => d.size >= 2).map(([u]) => u);
  // The free read on the same query, and the one that separates a TOOL from a
  // PLATFORM: did the people who came back use a SECOND studio?
  const returningWithTwoStudios = returningUserIds.filter((u) => (studiosByUser.get(u)?.size ?? 0) >= 2).length;

  return NextResponse.json({
    success: true,
    data: {
      windowDays: days,
      since,
      dayBucket: 'Days are Dubai calendar days (GST, UTC+4, no daylight saving): a run at 02:00 and one at 05:00 Dubai time are the same day. Sign-ups count distinct people, not event rows.',
      excludedUserIds: EXCLUDED_USER_IDS,
      eventsScanned: rows.length,
      eventsCounted: real.length,
      /** THE 30-DAY NUMBER. Target 5. */
      returningUsers: returningUserIds.length,
      returningUsersUsingTwoStudios: returningWithTwoStudios,
      activeUsers: daysByUser.size,
      signups: [...signupUsersByDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, users]) => ({ date, count: users.size })),
      startedByStudio: [...byStudio.entries()].sort((a, b) => b[1] - a[1]).map(([studio, count]) => ({ studio, count })),
      totals: {
        // Distinct PEOPLE — see section 1. Every other total here is a row count
        // by design: a generation IS an event.
        sign_up: signupUsers.size,
        generation_started: real.filter((r) => r.event_type === 'generation_started').length,
        generation_completed: real.filter((r) => r.event_type === 'generation_completed').length,
        generation_failed: real.filter((r) => r.event_type === 'generation_failed').length,
        insufficient_credits: real.filter((r) => r.event_type === 'insufficient_credits').length,
        purchase: real.filter((r) => r.event_type === 'purchase').length,
      },
    },
  });
}
