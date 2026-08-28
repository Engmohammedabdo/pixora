import type Stripe from 'stripe';
import { readGaIds, type GaIds } from './track';
import { readMetaIds, type MetaIds } from './meta-capi';

/**
 * Carrying the browser's GA — and Meta — identity across the Stripe round trip.
 *
 * ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────────
 * `purchase` is the one event the business cares most about, and it is the one
 * event the browser must never report — a client-reportable purchase is free
 * revenue for anyone with a devtools console. So it is sent from the webhook.
 *
 * But the webhook's HTTP request comes from Stripe. It carries Stripe's headers
 * and no `_ga` cookie, so `readGaIds()` there returns nulls, and `sendGa4Event()`
 * refuses an event with no client id (deliberately — see its comment). The sale
 * would simply never reach GA4.
 *
 * Even if we let it through with a minted id, that is worse than dropping it:
 * GA4 would file the purchase under a brand-new user whose source is `(direct)`.
 * The campaign that actually earned the sale keeps its click and loses its
 * conversion, so every channel ROI number is wrong in the same direction.
 *
 * ── THE FIX ────────────────────────────────────────────────────────────────
 * Read the ids in the checkout route, where the request IS the customer's
 * browser, and hand them to Stripe as session metadata. Stripe returns metadata
 * verbatim on the webhook event, so the purchase rejoins the session that earned
 * it. One module owns both ends so the key names cannot drift apart — a typo on
 * one side is not an error, it is silently unattributed revenue.
 *
 * ── LIMITS THAT APPLY ──────────────────────────────────────────────────────
 * Stripe metadata: at most 50 keys, values are strings of at most 500 chars.
 * Both ids are short numeric strings, so neither is near a limit — but they must
 * be strings, which is why nulls are omitted rather than sent as 'null'.
 */

const CLIENT_ID_KEY = 'gaClientId';
const SESSION_ID_KEY = 'gaSessionId';
const META_FBP_KEY = 'metaFbp';
const META_FBC_KEY = 'metaFbc';

/**
 * Call from a checkout route, inside the customer's request, and spread the
 * result into `metadata`. Returns `{}` when the visitor has no GA cookies (ad
 * blocker, consent declined, tag not yet loaded) — the checkout is unaffected
 * and only the attribution is lost.
 */
export async function gaCheckoutMetadata(): Promise<Record<string, string>> {
  const { clientId, sessionId } = await readGaIds();
  const md: Record<string, string> = {};
  if (clientId) md[CLIENT_ID_KEY] = clientId;
  if (sessionId) md[SESSION_ID_KEY] = sessionId;
  return md;
}

/** Call from the webhook with `session.metadata`. */
export function gaIdsFromMetadata(metadata: Stripe.Metadata | null | undefined): GaIds {
  return {
    clientId: metadata?.[CLIENT_ID_KEY] || null,
    sessionId: metadata?.[SESSION_ID_KEY] || null,
  };
}

/**
 * The Meta half, same round trip and same reasoning. `_fbp` is the pixel's
 * browser id and `_fbc` exists only when the visitor arrived through an ad
 * click — exactly the case where losing it means the campaign that earned the
 * sale is never credited. `_fbc` is also the shorter-lived of the two (the
 * cookie is refreshed per ad click), so capturing it at checkout time rather
 * than at webhook time is not just a transport necessity, it snapshots the
 * click closest to the money.
 */
export async function metaCheckoutMetadata(): Promise<Record<string, string>> {
  const { fbp, fbc } = await readMetaIds();
  const md: Record<string, string> = {};
  if (fbp) md[META_FBP_KEY] = fbp;
  if (fbc) md[META_FBC_KEY] = fbc;
  return md;
}

/** Call from the webhook with `session.metadata`. */
export function metaIdsFromMetadata(metadata: Stripe.Metadata | null | undefined): MetaIds {
  return {
    fbp: metadata?.[META_FBP_KEY] || null,
    fbc: metadata?.[META_FBC_KEY] || null,
  };
}
