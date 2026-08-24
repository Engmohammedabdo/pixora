/**
 * One place that knows the GA4 property. Imported by both the browser tag
 * (components/analytics/GoogleAnalytics.tsx) and the server-side Measurement
 * Protocol sender (lib/analytics/ga4.ts), so the two can never drift onto
 * different properties — which would be invisible until you noticed half your
 * events missing from one report.
 */
export const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-L45LDQPRKJ';

/**
 * The `_ga_<container>` cookie is named after the measurement id WITHOUT its
 * `G-` prefix: G-L45LDQPRKJ -> _ga_L45LDQPRKJ. Used to recover the session id so
 * server-sent events join the browser's session instead of opening a new one.
 */
export const GA_SESSION_COOKIE = `_ga_${GA_MEASUREMENT_ID.replace(/^G-/, '')}`;

/**
 * Server-to-GA4 events need an API secret, which is NOT the measurement id and
 * cannot be derived from it. Create one at:
 *   GA4 -> Admin -> Data Streams -> (stream) -> Measurement Protocol API secrets
 * and set GA4_API_SECRET on the app service.
 *
 * Absent, every server-side send is skipped — deliberately, and loudly once per
 * process rather than per event. The internal `user_events` write does NOT
 * depend on it, so analytics degrade to "we have our own data but GA4 is missing
 * the server half" rather than to nothing.
 */
export const GA_API_SECRET = process.env.GA4_API_SECRET || '';
