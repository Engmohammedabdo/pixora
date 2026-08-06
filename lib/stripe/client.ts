import Stripe from 'stripe';

/**
 * The API version is pinned explicitly, never left to the account default.
 *
 * The account default is a dashboard setting. If it is ever changed — by a click,
 * or by Stripe's own upgrade prompt — every response shape this code reads would
 * change underneath it with no deploy and no warning. Pinning here means the
 * version only moves when someone edits this file.
 *
 * It must match the version the installed SDK was generated against
 * (`stripe/esm/apiVersion.js`), and nothing here has to remember that: `apiVersion`
 * is typed as the exact literal the SDK pins, so a stale value is a compile error
 * rather than a payload shape that silently disagrees with its own types.
 *
 *   Type '"2026-03-25.dahlia"' is not assignable to type '"2026-07-29.dahlia"'
 *
 * So the upgrade procedure is just: bump the package, run tsc, fix what it points at.
 */
export const STRIPE_API_VERSION = '2026-07-29.dahlia';

function createStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    // Return a mock-safe instance for build time / dev without keys
    return new Stripe('sk_test_placeholder', {
      apiVersion: STRIPE_API_VERSION,
    });
  }
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
  });
}

export const stripe = createStripeClient();
