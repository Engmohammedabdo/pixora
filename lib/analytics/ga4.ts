import { GA_API_SECRET, GA_MEASUREMENT_ID, GA_SESSION_COOKIE } from './config';
import type { EventName, EventParams } from './events';

/**
 * Server -> GA4 over the Measurement Protocol.
 *
 * ── WHY THE SERVER SENDS AT ALL ────────────────────────────────────────────
 * The browser tag cannot see what it does not witness. A Stripe payment settles
 * in a webhook; a generation completes inside an API route; a refund happens
 * after the response was already returned. Reporting those from the client would
 * mean trusting the client with revenue — see CLIENT_REPORTABLE in events.ts.
 *
 * ── SESSION STITCHING, AND WHY IT IS NOT OPTIONAL ──────────────────────────
 * An MP event carrying only a fresh client_id starts its OWN session with source
 * `(direct)`. Do that for purchases and every sale is attributed to nobody: the
 * ad campaign that earned it keeps a click and loses the conversion. So both ids
 * are recovered from the cookies the browser tag already set, and the event joins
 * the session that is genuinely in progress.
 */

const ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const TIMEOUT_MS = 3000;

let warnedNoSecret = false;

/**
 * `_ga` holds the client id as the LAST TWO dot-separated fields:
 *   GA1.1.1234567890.1234567890  ->  1234567890.1234567890
 * The leading fields encode version and domain depth and vary (`GA1.1`, `GA1.2`,
 * `GA1.3` on multi-level domains), which is why this reads from the end rather
 * than at fixed indexes.
 */
export function clientIdFromCookie(gaCookie: string | undefined): string | null {
  if (!gaCookie) return null;
  const parts = gaCookie.split('.');
  if (parts.length < 4) return null;
  const id = parts.slice(-2).join('.');
  return /^\d+\.\d+$/.test(id) ? id : null;
}

/**
 * `_ga_<container>` holds the session id, in one of two shapes — GA4 changed it
 * and BOTH are live in the wild depending on the visitor's tag version:
 *   GS1.1.1712345678.3.1.1712345699.0.0.0        -> field 2
 *   GS2.1.s1712345678$o3$g1$t1712345699$j0$...   -> field 2, after `s`, before `$`
 * Reading field 2 blindly returns "s1712345678" on the newer shape, which GA4
 * rejects as a session id and silently drops the join — the event still lands,
 * attached to nothing.
 */
export function sessionIdFromCookie(gaSessionCookie: string | undefined): string | null {
  if (!gaSessionCookie) return null;
  const field = gaSessionCookie.split('.')[2];
  if (!field) return null;
  const match = field.match(/^s?(\d+)/);
  return match ? match[1] : null;
}

interface SendOptions {
  clientId: string | null;
  sessionId?: string | null;
  /** Supabase user id, so GA4 can stitch across devices. */
  userId?: string | null;
  name: EventName;
  params?: EventParams;
}

/**
 * Never throws and never blocks a paid request for long. Analytics failing must
 * not turn into a customer's generation failing, so every exit here is a return.
 */
export async function sendGa4Event({
  clientId,
  sessionId,
  userId,
  name,
  params = {},
}: SendOptions): Promise<void> {
  if (!GA_API_SECRET) {
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.warn(
        '[analytics] GA4_API_SECRET is not set — server-side GA4 events are being skipped. ' +
          'Internal user_events recording is unaffected. ' +
          'Create a secret at GA4 -> Admin -> Data Streams -> Measurement Protocol API secrets.'
      );
    }
    return;
  }

  // Without a client id GA4 would mint an anonymous one and file the event under
  // a brand-new user with no acquisition source. A purchase reported that way is
  // worse than one not reported: it inflates user counts and misattributes revenue.
  if (!clientId) return;

  const clean: EventParams = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) clean[k] = v;
  }

  try {
    const res = await fetch(
      `${ENDPOINT}?measurement_id=${encodeURIComponent(GA_MEASUREMENT_ID)}&api_secret=${encodeURIComponent(GA_API_SECRET)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          client_id: clientId,
          ...(userId ? { user_id: userId } : {}),
          events: [
            {
              name,
              params: {
                ...clean,
                ...(sessionId ? { session_id: sessionId } : {}),
                // Without this the event is collected but contributes zero
                // engagement, so it never appears in Realtime and does not keep
                // the session alive. GA4's own docs require it on MP events.
                engagement_time_msec: 1,
              },
            },
          ],
        }),
      }
    );
    // GA4 answers 204 on success and, unhelpfully, 2xx for malformed payloads
    // too — it validates asynchronously. Only transport-level failures are
    // visible here; use the DebugView endpoint when a payload looks wrong.
    if (!res.ok) {
      console.warn(`[analytics] GA4 rejected ${name}: HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn(`[analytics] GA4 send failed for ${name}:`, (err as Error).message);
  }
}

export { GA_SESSION_COOKIE };
