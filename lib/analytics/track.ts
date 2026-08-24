import { createServiceRoleClient } from '@/lib/supabase/server';
import { clientIdFromCookie, sendGa4Event, sessionIdFromCookie } from './ga4';
import { GA_SESSION_COOKIE } from './config';
import type { EventName, EventParams } from './events';

/**
 * The single place an event is recorded. Fans out to both sinks.
 *
 *   public.user_events  — our own timeline. Joinable to credits, generations and
 *                         invoices; survives ad blockers; readable by SQL.
 *   GA4                 — acquisition, funnels, attribution, campaign ROI.
 *
 * ── WHY SERVICE ROLE, WHICH CLAUDE.md OTHERWISE RESTRICTS ──────────────────
 * CLAUDE.md limits service_role to "webhooks and admin operations". This is a
 * third use, and it is forced rather than chosen: migration 022 enabled RLS on
 * `user_events`, revoked ALL from anon and authenticated, and added no policy —
 * measured on the live database, `service_role` is the only grantee. So the nine
 * studio routes, which execute as `authenticated`, physically cannot write here.
 *
 * That lockdown is worth keeping. The alternative — granting INSERT to
 * `authenticated` — would let any customer forge arbitrary events straight over
 * PostgREST, and every number on the admin dashboard is computed from these rows.
 * Forged analytics look exactly like real analytics, which is what makes them
 * worse than absent ones.
 *
 * The safety contract is therefore the same one lib/credits/deduct.ts states:
 * **`userId` must come from the verified session, never from request input.**
 * POST /api/events enforces this by ignoring any user id in the body entirely.
 *
 * ── WHY NOTHING HERE THROWS ────────────────────────────────────────────────
 * These calls sit inside paid request paths. A analytics outage must never become
 * a failed generation the customer is refunded for, so every failure is caught and
 * logged. The rule is: we would rather lose an event than a customer's work.
 */

interface TrackOptions {
  /** From the verified session. Never from request input. */
  userId: string;
  name: EventName;
  params?: EventParams;
}

export interface GaIds {
  clientId: string | null;
  sessionId: string | null;
}

/**
 * Reads the browser's GA identifiers out of the request cookies.
 *
 * MUST be awaited inside the request's async context — `cookies()` resolves
 * through AsyncLocalStorage, so it works when this chain starts in a route
 * handler even if the caller never awaits the result. Outside a request (a
 * script, a cron job) it throws, which is caught here and reported as "no ids":
 * the user_events write still happens, only the GA4 join is lost.
 */
export async function readGaIds(): Promise<GaIds> {
  try {
    const { cookies } = await import('next/headers');
    const jar = await cookies();
    return {
      clientId: clientIdFromCookie(jar.get('_ga')?.value),
      sessionId: sessionIdFromCookie(jar.get(GA_SESSION_COOKIE)?.value),
    };
  } catch {
    return { clientId: null, sessionId: null };
  }
}

async function writeUserEvent(userId: string, name: EventName, params: EventParams): Promise<void> {
  try {
    const supabase = await createServiceRoleClient();
    const { error } = await supabase.from('user_events').insert({
      user_id: userId,
      event_type: name,
      metadata: params as Record<string, unknown>,
    });
    if (error) {
      console.warn(`[analytics] user_events insert failed for ${name}: ${error.message}`);
    }
  } catch (err) {
    console.warn(`[analytics] user_events insert threw for ${name}:`, (err as Error).message);
  }
}

/**
 * Awaitable form. Use where delivery matters more than latency — the Stripe
 * webhook, where the event IS the revenue record and the request is Stripe's,
 * not a customer's.
 */
export async function trackEventNow(opts: TrackOptions): Promise<void> {
  const { userId, name, params = {} } = opts;
  if (!userId) return;

  const ids = await readGaIds();
  await Promise.allSettled([
    writeUserEvent(userId, name, params),
    sendGa4Event({ ...ids, userId, name, params }),
  ]);
}

/**
 * Fire-and-forget. Use in customer request paths, where adding even a fast round
 * trip to every generation is a real cost and losing an occasional event is not.
 *
 * Call as `void trackEvent({...})` — deliberately returns void so that an
 * accidental `await` cannot reintroduce the latency this exists to avoid.
 */
export function trackEvent(opts: TrackOptions): void {
  void trackEventNow(opts).catch((err: unknown) => {
    console.warn('[analytics] trackEvent failed:', (err as Error).message);
  });
}

/**
 * Record an event whose GA identifiers the caller already resolved.
 *
 * Two callers need this, for opposite reasons:
 *   POST /api/events — a browser request, so readGaIds() would work, but the
 *     route has already read the jar and reusing it avoids a second parse.
 *   the Stripe webhook — THE request is Stripe's, not the customer's. There are
 *     no _ga cookies on it at all, so the ids must have been captured at checkout
 *     and carried through Stripe metadata. Without that, sendGa4Event() drops the
 *     purchase for want of a client id and the sale is attributed to nobody.
 */
export async function trackEventWithIds(
  userId: string,
  name: EventName,
  params: EventParams,
  ids: GaIds
): Promise<void> {
  await Promise.allSettled([
    writeUserEvent(userId, name, params),
    sendGa4Event({ ...ids, userId, name, params }),
  ]);
}
