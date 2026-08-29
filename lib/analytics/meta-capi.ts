import { createHash } from 'node:crypto';
import { META_PIXEL_ID } from './meta-config';

/**
 * Server -> Meta over the Conversions API.
 *
 * ── WHY THE SERVER SENDS AT ALL ────────────────────────────────────────────
 * Same reason as lib/analytics/ga4.ts, and the same architecture: a Stripe
 * payment settles in a webhook the browser pixel never witnesses, so a
 * pixel-only `Purchase` structurally cannot exist for this product. And in
 * this product's market the browser half is weaker than usual — the Gulf is
 * iOS-heavy, and ATT plus ad blockers hide a large share of pixel traffic.
 * The CAPI event is the one Meta's ad optimizer can actually count on.
 *
 * ── MATCH QUALITY, AND WHY `_fbp` IS CARRIED THROUGH STRIPE ────────────────
 * Meta matches a server event to a real person by the identifiers in
 * `user_data`. An event with only a hashed email matches worse than one that
 * also carries the browser ids the pixel set (`_fbp`, and `_fbc` when the
 * visitor arrived through an ad click). The webhook request is Stripe's and
 * has no cookies, so those ids are captured in the checkout route and carried
 * through session metadata — see lib/analytics/stripe-attribution.ts, which
 * owns both ends for GA and Meta alike.
 *
 * ── DEDUPLICATION ──────────────────────────────────────────────────────────
 * Meta deduplicates on (event_name, event_id) within 48h, across channels and
 * across repeated sends. `event_id` is therefore REQUIRED here, not optional:
 * Stripe delivers webhooks at least once, and the idempotency guard in the
 * webhook deliberately re-runs an event whose row exists but is unfinished —
 * so a replayed delivery MUST carry the same event_id (the checkout session
 * id) or every retry books a second sale in Ads Manager.
 *
 * Never throws and never blocks a paid request for long — analytics failing
 * must not become a customer's checkout failing. Every exit is a return.
 */

// v24.0 confirmed live 2026-08-28 (v99.0 returns "Unknown path components";
// v24.0 returns a normal auth error). Graph versions live ~2 years from
// release; bump deliberately, not as a side effect of another change.
const GRAPH_API_VERSION = 'v24.0';
const TIMEOUT_MS = 3000;

/**
 * Generate at Events Manager -> Data Sources -> (pixel) -> Settings ->
 * Conversions API -> Generate access token. NOT derivable from the pixel id.
 * Absent, every server-side send is skipped — deliberately, and loudly once
 * per process rather than per event. The browser pixel and the internal
 * user_events timeline are unaffected.
 */
const META_CAPI_ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN || '';

/**
 * Optional. When set, events land in Events Manager -> Test Events instead of
 * being recorded for delivery — the supported way to verify the pipe end to
 * end without writing fake conversions into the ad account.
 */
const META_CAPI_TEST_EVENT_CODE = process.env.META_CAPI_TEST_EVENT_CODE || '';

let warnedNoToken = false;

/** The Meta STANDARD event names this app sends. A closed set on purpose —
 * a typo'd name becomes a "custom event" no campaign can optimize on, and
 * nothing errors. */
export type MetaEventName = 'Purchase' | 'CompleteRegistration' | 'InitiateCheckout' | 'Lead';

/*
 * WHY 'Lead' IS THE ODD ONE OUT, AND WHY IT IS BROWSER-REPORTABLE.
 *
 * The other three are SERVER-WITNESSED: money settling, an account existing, a
 * checkout opening. MetaPixel.tsx forbids the browser from claiming any of them,
 * because a client-reportable Purchase is free Ads-Manager revenue for anyone
 * with a devtools console.
 *
 * A waitlist join is different in kind. It is witnessed by an UNAUTHENTICATED
 * public form — there is no session to attribute it to and no user_events row it
 * could ever write (that table is keyed on user_id). Forging one costs the
 * attacker an email address and gains them nothing but a worse lookalike
 * audience for us. So it is reported from BOTH sides with a shared event_id and
 * left to Meta's 48h dedup, which is what gives it iOS/ATT coverage the browser
 * alone cannot reach.
 *
 * Until 2026-08-29 this type had three members and the funnel's ONLY reachable
 * conversion — the invite gate makes the other three unreachable — was therefore
 * invisible to Meta. A campaign could only be optimised toward PageView, i.e.
 * toward the cheapest clicker rather than the person who signs up.
 */

export interface MetaIds {
  fbp: string | null;
  fbc: string | null;
}

/**
 * `_fbp` looks like `fb.1.1596403881668.1116446470`; `_fbc` like
 * `fb.1.1554763741205.AbCdEfGhIj…`. The shape is validated loosely — the
 * subdomain index and timestamp vary — because a malformed value degrades
 * matching rather than breaking anything, but an obviously-forged cookie
 * (someone else's session id pasted in) is not worth relaying.
 */
export function metaCookieId(value: string | undefined): string | null {
  if (!value) return null;
  return /^fb\.\d\.\d+\..+/.test(value) && value.length <= 500 ? value : null;
}

/**
 * Reads the browser's Meta identifiers out of the request cookies. Same
 * contract as readGaIds() in track.ts: outside a request context it reports
 * "no ids" rather than throwing, and the caller loses only match quality.
 */
export async function readMetaIds(): Promise<MetaIds> {
  try {
    const { cookies } = await import('next/headers');
    const jar = await cookies();
    return {
      fbp: metaCookieId(jar.get('_fbp')?.value),
      fbc: metaCookieId(jar.get('_fbc')?.value),
    };
  } catch {
    return { fbp: null, fbc: null };
  }
}

/**
 * Meta requires PII normalized-then-SHA256: email is trimmed and lowercased
 * before hashing, per their user_data spec. Sending an unnormalized hash is
 * not an error — it silently matches nobody, which is the worse outcome.
 */
export function hashForMeta(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

/**
 * The dedup key for a waitlist Lead, derived so the BROWSER and the SERVER
 * compute the same string without either sending it to the other.
 *
 * Meta dedups on (event_name, event_id) for 48h. The two copies exist because
 * neither alone is enough: the browser copy carries `_fbp`/`_fbc` and so has the
 * match quality, while the server copy survives ad blockers and iOS/ATT — which
 * in a Gulf audience is the larger half.
 *
 * Owned HERE, next to the sender, for the same reason stripe-attribution.ts owns
 * the GA/Meta id key names: two call sites deriving "the same" key separately is
 * not an error when they drift, it is a silently DOUBLE-COUNTED conversion — and
 * a doubled lead count is a halved cost-per-lead, i.e. a number that tells the
 * founder to spend more on an ad that is doing worse than it looks.
 *
 * Built on `hashForMeta` rather than a second hash of its own, so the key and the
 * `em` identity sent alongside it can never normalise differently. Truncated to
 * 32 chars: Meta caps event_id length and the collision risk over a waitlist is nil.
 *
 * NOTE for the browser copy: this module is server-only (`node:crypto`). The
 * client computes the same key with Web Crypto — see WaitlistForm.tsx, where the
 * duplication is deliberate and commented, because importing this file into a
 * client component would pull the access token's module into the bundle.
 */
export function waitlistEventId(email: string): string {
  return `wl_${hashForMeta(email).slice(0, 32)}`;
}

interface SendOptions {
  eventName: MetaEventName;
  /** Dedup key. For Purchase: the checkout session id — stable across
   * Stripe's at-least-once delivery. For CompleteRegistration: keyed on the
   * user id, so the password and OAuth witnesses collapse to one event. */
  eventId: string;
  email?: string | null;
  /** Supabase user id — hashed and sent as external_id for cross-device match. */
  userId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  /** Where on the site it happened, e.g. the billing page URL. */
  sourceUrl?: string | null;
  /** For Purchase: { currency, value } at minimum. */
  customData?: Record<string, string | number>;
}

export async function sendMetaCapiEvent({
  eventName,
  eventId,
  email,
  userId,
  fbp,
  fbc,
  sourceUrl,
  customData,
}: SendOptions): Promise<void> {
  if (!META_CAPI_ACCESS_TOKEN) {
    if (!warnedNoToken) {
      warnedNoToken = true;
      console.warn(
        '[analytics] META_CAPI_ACCESS_TOKEN is not set — server-side Meta events are being skipped. ' +
          'The browser pixel and user_events are unaffected. Generate a token at ' +
          'Events Manager -> Data Sources -> (pixel) -> Settings -> Conversions API.'
      );
    }
    return;
  }

  // Meta rejects an event whose user_data carries no identifier at all, and a
  // half-anonymous event would match nobody anyway. Refusing here keeps the
  // failure visible in one place instead of as a per-event API error.
  const userData: Record<string, string[] | string> = {};
  if (email) userData.em = [hashForMeta(email)];
  if (userId) userData.external_id = [hashForMeta(userId)];
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;
  if (Object.keys(userData).length === 0) return;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${META_PIXEL_ID}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          access_token: META_CAPI_ACCESS_TOKEN,
          ...(META_CAPI_TEST_EVENT_CODE ? { test_event_code: META_CAPI_TEST_EVENT_CODE } : {}),
          data: [
            {
              event_name: eventName,
              event_time: Math.floor(Date.now() / 1000),
              event_id: eventId,
              action_source: 'website',
              ...(sourceUrl ? { event_source_url: sourceUrl } : {}),
              user_data: userData,
              ...(customData ? { custom_data: customData } : {}),
            },
          ],
        }),
      }
    );
    if (!res.ok) {
      // Unlike GA4, Meta validates synchronously and says what is wrong —
      // surface it, because "events_received: 0" in Events Manager is
      // otherwise indistinguishable from a healthy quiet account.
      const body = await res.text().catch(() => '');
      console.warn(`[analytics] Meta CAPI rejected ${eventName}: HTTP ${res.status} ${body.slice(0, 300)}`);
    }
  } catch (err) {
    console.warn(`[analytics] Meta CAPI send failed for ${eventName}:`, (err as Error).message);
  }
}
