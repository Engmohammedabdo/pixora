/**
 * Source-level proofs for three small API rules the 2026-09-01 audit rated high.
 *
 *   npx tsx scripts/tests/api-hygiene.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../lib/strip-comments';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}
const ROOT = join(__dirname, '..', '..');
const src = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

// upload: throttled BEFORE the body is read
const up = src('app/api/upload/route.ts');
const throttleAt = up.search(/consumeAttempt\(\s*`upload:/);
const bodyAt = up.indexOf('request.formData()');
check('upload throttles with consumeAttempt', throttleAt !== -1);
check('upload throttle runs before the body is read', throttleAt !== -1 && bodyAt !== -1 && throttleAt < bodyAt, `throttle@${throttleAt} body@${bodyAt}`);
check('upload returns 429 rate_limited', /rate_limited[\s\S]{0,80}429/.test(up));

// assets DELETE: ownership via the shared resolver, never an ad-hoc parse
const del = src('app/api/assets/[id]/route.ts');
check('assets DELETE uses ownedStoragePath', /ownedStoragePath\(/.test(del));
check('assets DELETE no longer splits the public-object marker by hand', !/split\('\/storage\/v1\/object\/public\/'\)/.test(del));

// gate-status: cached briefly
const gate = src('app/api/public/gate-status/route.ts');
check('gate-status sets a short shared cache', /s-maxage=30/.test(gate));

// billing portal: the configuration is NAMED, never inherited from the account
//
// Three products share one live Stripe account and "the default configuration" is
// a single account-wide object. A session created without an explicit
// `configuration` uses it — so the moment another product saves portal settings in
// the Dashboard, PyraSuite customers would be shown that product's plan list and
// cancellation policy with nothing failing. The rule is therefore stated on the
// CREATE CALL's own argument object, not on "the file mentions the env var
// somewhere": a fallback spread would satisfy the looser reading while doing
// exactly the thing this exists to forbid.
const portal = src('app/api/stripe/portal/route.ts');
const createAt = portal.indexOf('billingPortal.sessions.create(');
check('portal creates a billing-portal session', createAt !== -1);
const createArgs = createAt === -1 ? '' : portal.slice(createAt, portal.indexOf('});', createAt));
check('portal names the configuration on the create call', /[\s{,]configuration\s*[,:]/.test(createArgs), createArgs.slice(0, 200));
check('portal reads STRIPE_PORTAL_CONFIGURATION_ID', portal.includes('STRIPE_PORTAL_CONFIGURATION_ID'));
const refuseAt = portal.search(/if\s*\(\s*!\s*configuration\s*\)/);
check('portal refuses a missing configuration BEFORE creating a session', refuseAt !== -1 && createAt !== -1 && refuseAt < createAt, `refuse@${refuseAt} create@${createAt}`);
check('that refusal returns rather than falling through', /if\s*\(\s*!\s*configuration\s*\)\s*\{[\s\S]{0,400}?return NextResponse\.json/.test(portal));
// The two shapes that would reintroduce the defect while keeping the word
// `configuration` in the file: an optional spread, and an `||`/`??` fallback.
check('portal has no conditional-spread configuration', !/\.\.\.\(\s*(process\.env\.STRIPE_PORTAL_CONFIGURATION_ID|configuration)/.test(portal));
check('portal has no fallback for a missing configuration id', !/STRIPE_PORTAL_CONFIGURATION_ID\s*(\|\||\?\?)/.test(portal));
check('portal asks Stripe for a locale', /[\s{,]locale:\s*/.test(createArgs), createArgs.slice(0, 300));

// ...and EVERY locale it can send is one Stripe actually publishes.
//
// The first version of this block checked only that a `locale:` KEY was present.
// It passed while PORTAL_LOCALE mapped `ar -> 'ar'`, which Stripe's billing portal
// does not support: its Locale union carries 47 values, no Arabic, and ends in
// `OtherString` — an escape hatch that makes ANY string type-check. So `tsc` was
// green, the gate was green, and every Arabic customer would have got a 500 and no
// portal at all. A gate that asserts a key and not its value is the "rule that only
// runs on the arm you did not break" this repo keeps paying for.
//
// The published list is read out of the INSTALLED package, which is the only
// offline source of truth, and a scan that cannot find it FAILS.
const stripeLocaleSrc = readFileSync(
  join(ROOT, 'node_modules/stripe/cjs/resources/BillingPortal/Sessions.d.ts'),
  'utf8'
);
const localeUnion = stripeLocaleSrc.match(/type Locale = ([^;]+);/);
check('the Stripe portal locale union is readable', !!localeUnion);
const stripeLocales = localeUnion ? [...localeUnion[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [];
check('that union has a plausible number of locales', stripeLocales.length >= 20, `${stripeLocales.length}`);
check('Arabic is still absent from it (the fact this rule exists for)', !stripeLocales.includes('ar'));

const mapBody = portal.slice(portal.indexOf('const PORTAL_LOCALE'), portal.indexOf('};', portal.indexOf('const PORTAL_LOCALE')));
const mapped = [...mapBody.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
check('PORTAL_LOCALE has entries', mapped.length > 0, mapBody.slice(0, 200));
for (const value of mapped) {
  check(`PORTAL_LOCALE sends "${value}", which Stripe publishes`, stripeLocales.includes(value), `not in the union of ${stripeLocales.length}`);
}

if (failures) { console.log(`\n[api-hygiene] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[api-hygiene] ${checks} checks passed`);
