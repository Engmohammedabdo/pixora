/**
 * Two properties of the analytics layer that fail SILENTLY when broken.
 *
 *   npx tsx scripts/tests/analytics.test.ts
 *
 * WHY THIS IS A BUILD GATE
 *
 * Analytics has no user who complains. A wrong number looks exactly like a right
 * one, and the two defects guarded here are the kind that survive review:
 *
 * 1. WHICH EVENTS A BROWSER MAY REPORT. `POST /api/events` accepts any name on
 *    CLIENT_REPORTABLE and takes the subject from the verified session. That is
 *    safe only while the list holds nothing the business trusts. Add `purchase`
 *    to it — an easy, well-meant edit, since it is right there in the same
 *    enum — and any signed-in customer can POST themselves revenue that lands in
 *    both `user_events` and GA4's Monetization reports, indistinguishable from a
 *    real sale. The list is therefore asserted as a CLOSED SET, not a minimum.
 *
 * 2. THE GA COOKIE PARSERS. GA4 ships two live formats for `_ga_<container>`,
 *    and the newer one prefixes the session id with `s`. Reading field 2 blindly
 *    returns `s1712345678`, which GA4 rejects as a session id — and rejects
 *    quietly: the event still arrives, joined to nothing, so the purchase shows
 *    up under `(direct)` and the campaign that earned it is never credited.
 *    Nothing in the app can observe that. A test can.
 */
import { CLIENT_REPORTABLE, EVENTS, isClientReportable } from '../../lib/analytics/events';
import { clientIdFromCookie, sessionIdFromCookie } from '../../lib/analytics/ga4';

let failures = 0;
let checks = 0;

function eq(actual: unknown, expected: unknown, label: string): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function reportable(name: string, expected: boolean, why: string): void {
  checks++;
  if (isClientReportable(name) !== expected) {
    failures++;
    console.log(`FAIL  ${name} client-reportable=${!expected}, must be ${expected} — ${why}`);
  }
}

// ── 1. The client-reportable list is a closed set ──────────────────────────
// Stated as an exact membership check rather than "does not contain purchase",
// because the danger is any FUTURE server-witnessed event being added, not the
// three we can name today.
const ALLOWED = [EVENTS.SIGN_UP, EVENTS.INVITE_REDEEMED].sort();
eq(
  [...CLIENT_REPORTABLE].sort().join(','),
  ALLOWED.join(','),
  'CLIENT_REPORTABLE membership changed — every addition hands the browser a new way to write the admin dashboard'
);

reportable(EVENTS.SIGN_UP, true, 'the browser is the only witness: signUp() runs client-side');
reportable(EVENTS.INVITE_REDEEMED, true, 'same path as sign_up');
reportable(EVENTS.PURCHASE, false, 'REVENUE. Sent from the Stripe webhook only');
reportable(EVENTS.GENERATION_STARTED, false, 'written by reserveCredits, which the server owns');
reportable(EVENTS.GENERATION_COMPLETED, false, 'proves paid work was delivered — forgeable = fake completion rate');
reportable(EVENTS.GENERATION_FAILED, false, 'drives reliability numbers');
reportable(EVENTS.INSUFFICIENT_CREDITS, false, 'demand signal read to price plans');
reportable('anything_else', false, 'unknown names must never pass');
reportable('', false, 'empty name must never pass');

// ── 2. `_ga` -> client id ──────────────────────────────────────────────────
// The leading fields encode version and domain depth and are NOT fixed, which is
// why the parser reads from the end.
eq(clientIdFromCookie('GA1.1.1234567890.1234567890'), '1234567890.1234567890', '_ga GA1.1');
eq(clientIdFromCookie('GA1.2.987654321.1700000000'), '987654321.1700000000', '_ga GA1.2 (two-label domain)');
eq(clientIdFromCookie('GA1.3.111.222'), '111.222', '_ga GA1.3 (three-label domain)');
eq(clientIdFromCookie(undefined), null, '_ga absent — visitor blocks the tag');
eq(clientIdFromCookie(''), null, '_ga empty');
eq(clientIdFromCookie('GA1.1.1234567890'), null, '_ga truncated — must not half-parse');
eq(clientIdFromCookie('GA1.1.abc.def'), null, '_ga non-numeric — a forged cookie is not an id');
eq(clientIdFromCookie('nonsense'), null, '_ga unparseable');

// ── 3. `_ga_<container>` -> session id, BOTH live formats ──────────────────
eq(sessionIdFromCookie('GS1.1.1712345678.3.1.1712345699.0.0.0'), '1712345678', '_ga_* GS1 shape');
eq(
  sessionIdFromCookie('GS2.1.s1712345678$o3$g1$t1712345699$j0$l0$h0'),
  '1712345678',
  '_ga_* GS2 shape — the `s` prefix is the whole reason this parser exists'
);
eq(sessionIdFromCookie('GS1.1.1712345678'), '1712345678', '_ga_* minimal GS1');
eq(sessionIdFromCookie(undefined), null, '_ga_* absent');
eq(sessionIdFromCookie(''), null, '_ga_* empty');
eq(sessionIdFromCookie('GS1.1.'), null, '_ga_* empty field');
eq(sessionIdFromCookie('GS1.1.xyz'), null, '_ga_* non-numeric');

if (failures > 0) {
  console.log(`\n[analytics] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[analytics] ${checks} checks passed`);
