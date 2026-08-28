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
import { readFileSync } from 'node:fs';
import { CLIENT_REPORTABLE, EVENTS, isClientReportable } from '../../lib/analytics/events';
import { clientIdFromCookie, sessionIdFromCookie } from '../../lib/analytics/ga4';
import { hashForMeta, metaCookieId } from '../../lib/analytics/meta-capi';
import { stripComments } from '../lib/strip-comments';

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

// ── 4. Meta: PII hashing is normalize-then-SHA256 ──────────────────────────
// Meta matches on the hash of the NORMALIZED value. An unnormalized hash is not
// an error — it silently matches nobody. The expected digests were computed
// independently (node -e), not with hashForMeta, so this cannot pass by both
// sides sharing the same mistake.
const FOO_BAR_SHA256 = '0c7e6a405862e402eb76a70f8a26fc732d07c32931e9fae9ab1582911d2e8a3b';
eq(hashForMeta('foo@bar.com'), FOO_BAR_SHA256, 'meta hash: known vector');
eq(hashForMeta('  Foo@Bar.COM  '), FOO_BAR_SHA256, 'meta hash: trims and lowercases before hashing');

// ── 5. Meta: `_fbp`/`_fbc` cookie validation ───────────────────────────────
eq(metaCookieId('fb.1.1596403881668.1116446470'), 'fb.1.1596403881668.1116446470', '_fbp canonical shape');
eq(
  metaCookieId('fb.1.1554763741205.AbCdEfGhIjKlMnOpQrStUvWxYz1234567890'),
  'fb.1.1554763741205.AbCdEfGhIjKlMnOpQrStUvWxYz1234567890',
  '_fbc ad-click shape'
);
eq(metaCookieId(undefined), null, '_fbp absent — visitor blocks the pixel');
eq(metaCookieId(''), null, '_fbp empty');
eq(metaCookieId('nonsense'), null, '_fbp unparseable — a forged cookie is not an id');
eq(metaCookieId('fb.1.'), null, '_fbp truncated — must not half-parse');
eq(metaCookieId('fb.x.123.abc'), null, '_fbp non-numeric subdomain index');
eq(metaCookieId(`fb.1.123.${'a'.repeat(600)}`), null, '_fbp oversized — Stripe metadata caps values at 500 chars');

// ── 6. Meta: the CSP carries all three load-bearing directives ─────────────
// Same silent-failure class the GoogleAnalytics.tsx header documents: a dropped
// host refuses the request with nothing thrown, and the pixel reads as "no
// traffic" — indistinguishable from launch-day quiet. Asserted per-DIRECTIVE,
// not per-file, and against COMMENT-STRIPPED source: the explanatory comment
// beside the CSP names these very hosts, and `[^,]` crosses newlines, so an
// unstripped match would be satisfiable by the comment alone — the exact trap
// root-document.test.ts documents. stripComments keeps string/template
// literals, which is where the real directives live.
const csp = stripComments(readFileSync('next.config.ts', 'utf8'));
checks++;
if (!/script-src[^,]*connect\.facebook\.net/.test(csp)) {
  failures++;
  console.log('FAIL  CSP script-src is missing connect.facebook.net — fbevents.js cannot load, the pixel dies silently');
}
checks++;
if (!/img-src[^,]*www\.facebook\.com/.test(csp)) {
  failures++;
  console.log('FAIL  CSP img-src is missing www.facebook.com — the /tr beacon is refused, events are dropped silently');
}
checks++;
if (!/connect-src[^,]*www\.facebook\.com/.test(csp)) {
  failures++;
  console.log('FAIL  CSP connect-src is missing www.facebook.com — fbevents fetch/XHR reporting is refused silently');
}
// These two are NOT in Meta's usual allowlist trio, and their necessity was
// MEASURED, not read: on a production build in a real browser, fbevents
// delivered the PageView as a form POST into a facebook.com iframe, and the
// console showed form-action and frame-src blocking it while the img/XHR
// fallbacks never fired. Removing either re-kills delivery with nothing thrown.
checks++;
if (!/form-action[^,]*www\.facebook\.com/.test(csp)) {
  failures++;
  console.log('FAIL  CSP form-action is missing www.facebook.com — the pixel form-POST transport is refused silently');
}
checks++;
if (!/frame-src[^,]*www\.facebook\.com/.test(csp)) {
  failures++;
  console.log('FAIL  CSP frame-src is missing www.facebook.com — the pixel delivery iframe is refused silently');
}

// ── 7. Meta: the browser pixel never reports what the server witnesses ─────
// The Meta equivalent of the CLIENT_REPORTABLE closed set. Purchase and
// CompleteRegistration are CAPI-only (webhook / signup witnesses); an
// fbq('track','Purchase') added to the component would let Ads Manager book
// revenue from any devtools console, and would double-count real sales against
// the webhook's copy. Comments are stripped first — the component's header
// legitimately NAMES Purchase while forbidding it.
for (const file of [
  'components/analytics/MetaPixel.tsx',
  // Owns the SPA PageView for both tags, so it carries an fbq call site — the
  // exact place a well-meant fbq('track','Purchase') would be added.
  'components/analytics/PageViewTracker.tsx',
]) {
  const source = stripComments(readFileSync(file, 'utf8'));
  for (const serverOnly of ['Purchase', 'CompleteRegistration', 'InitiateCheckout']) {
    checks++;
    if (source.includes(serverOnly)) {
      failures++;
      console.log(`FAIL  ${file} mentions ${serverOnly} outside comments — server-witnessed events are CAPI-only`);
    }
  }
}

if (failures > 0) {
  console.log(`\n[analytics] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[analytics] ${checks} checks passed`);
