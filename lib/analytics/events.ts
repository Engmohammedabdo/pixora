/**
 * The event catalogue. One definition, two sinks.
 *
 * ── WHY A CATALOGUE AND NOT JUST STRINGS ───────────────────────────────────
 * Every event here is written to BOTH `public.user_events` (our own timeline,
 * queryable from the admin panel and joinable to credits and invoices) and GA4
 * (acquisition, funnels, attribution). A free-text event name would let the two
 * drift apart one call site at a time, and a typo would land in exactly one of
 * them — the failure being a report that is quietly short, never an error.
 *
 * `sign_up` and `purchase` are GA4 RECOMMENDED event names, spelled exactly as
 * GA4 expects, so they populate the built-in Monetization and User Acquisition
 * reports instead of sitting in "custom events" where nothing reads them. Do not
 * rename them for internal tidiness.
 *
 * ── GA4 PARAMETER RULES THAT BITE ──────────────────────────────────────────
 * A custom parameter is NOT visible in GA4 reports until it is registered as a
 * custom dimension (Admin -> Custom definitions). It is still collected and still
 * queryable via BigQuery/the Data API — it just does not appear in the UI. So
 * `studio` will be recorded from day one and reportable only once registered.
 * `value` and `currency` are the two GA4 reads natively for revenue.
 */

export const EVENTS = {
  /** Credits committed and generation begun. Fired for all nine studios. */
  GENERATION_STARTED: 'generation_started',
  /** Terminal success. The row left the reconciler's window as `completed`. */
  GENERATION_COMPLETED: 'generation_completed',
  /** Terminal failure. Credits were refunded before this was written. */
  GENERATION_FAILED: 'generation_failed',
  /** The customer wanted to generate and could not afford it. */
  INSUFFICIENT_CREDITS: 'insufficient_credits',
  /** GA4 recommended event. Money actually settled — sent from the webhook. */
  PURCHASE: 'purchase',
  /** GA4 recommended event. */
  SIGN_UP: 'sign_up',
  /** Invite-only launch: the gate was passed. */
  INVITE_REDEEMED: 'invite_redeemed',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** Primitive JSON values GA4 accepts as a parameter. */
export type EventParamValue = string | number | boolean | null | undefined;

/**
 * `items` is the one non-primitive GA4 understands, and it is not optional for
 * revenue: without it `purchase` populates the Monetization totals but every
 * Items report — which product sold, which plan converts — stays empty and looks
 * like a broken tag rather than a missing parameter.
 */
export type EventParams = Record<
  string,
  EventParamValue | Array<Record<string, EventParamValue>>
>;

/**
 * Events a BROWSER is allowed to report through POST /api/events.
 *
 * Deliberately tiny. Anything a server already witnesses must be recorded by the
 * server: a client-reportable `purchase` or `generation_completed` would let any
 * customer POST themselves free revenue and free completions, corrupting both the
 * admin dashboard and GA4 with data that reads exactly like the real thing.
 *
 * These two are safe because neither carries a value the business trusts —
 * they mark that a real, already-authenticated session reached a point in the UI.
 */
export const CLIENT_REPORTABLE: readonly EventName[] = [
  EVENTS.SIGN_UP,
  EVENTS.INVITE_REDEEMED,
];

export function isClientReportable(name: string): name is EventName {
  return (CLIENT_REPORTABLE as readonly string[]).includes(name);
}
