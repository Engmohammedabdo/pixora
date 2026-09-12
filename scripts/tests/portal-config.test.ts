/**
 * The billing portal offers exactly the plans this product sells, at exactly the
 * prices this product bills.
 *
 *   STRIPE_SECRET_KEY=... STRIPE_PORTAL_CONFIGURATION_ID=... \
 *   STRIPE_ENTRY_PRICE_ID=... (and the other four) \
 *   npx tsx scripts/tests/portal-config.test.ts
 *
 * NOT a build gate, and it cannot be one: it reads the LIVE Stripe account. It sits
 * beside `test:rate-limit` and `test:logo-parity`, which are live-only for the same
 * reason. Run it after touching plans, prices, or the portal configuration.
 *
 * WHY IT EXISTS — the portal configuration is a THIRD copy of the price list.
 *
 * `create-checkout` sends a price read from the environment. `customer.subscription
 * .updated` maps a price BACK to a plan through the same environment. The portal
 * configuration holds its own list, stored on Stripe, that no deployment touches.
 * Rotate a price — a currency change, a price increase, a product rebuild — and
 * checkout follows the environment while the portal keeps offering the old id. The
 * customer switches plan, Stripe bills the old price, and the webhook finds NO plan
 * for it: `planId` is undefined, the branch is skipped, and the account keeps its
 * previous tier. No error anywhere. This repo has a name for that shape — a rule
 * stated twice drifts — and it has paid for it in the money path before.
 *
 * It also pins the two settings whose Stripe DEFAULTS are wrong for this product:
 *   - `subscription_update.proration_behavior` defaults to 'none', which hands a
 *     customer the new tier's credits without collecting the difference until the
 *     next cycle. See lib/credits/plan-switch.ts.
 *   - `products[].adjustable_quantity` defaults to ENABLED. Every subscription here
 *     is quantity 1 and the webhook grants per PLAN, reading the price and never the
 *     quantity, so a customer who set quantity 3 would be billed three times for one
 *     allowance. That is an overcharge, which is to say a dispute.
 *
 * `products` is an EXPANDABLE field. A plain retrieve omits it entirely rather than
 * returning it empty, so a check that read the configuration without
 * `expand[]=features.subscription_update.products` would see no products and could
 * be "fixed" by writing a list that was already there.
 */
import { PLANS } from '../../lib/stripe/plans';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}

const KEY = process.env.STRIPE_SECRET_KEY;
const CONFIG_ID = process.env.STRIPE_PORTAL_CONFIGURATION_ID;

if (!KEY || !CONFIG_ID) {
  // Loud, not skipped. A check that quietly reports success when it could not run is
  // the failure mode this repo keeps recording; `test:beta-credits` says the same.
  console.error('[portal-config] cannot run: needs STRIPE_SECRET_KEY and STRIPE_PORTAL_CONFIGURATION_ID in the environment.');
  console.error('                This reads the LIVE Stripe account, so it is deliberately not a build gate.');
  process.exit(1);
}

async function stripeGet(path: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

interface PortalProduct { product: string; prices: string[]; adjustable_quantity?: { enabled: boolean } }

(async () => {
  const res = await stripeGet(
    `billing_portal/configurations/${CONFIG_ID}?expand[]=features.subscription_update.products`
  );
  check('the configuration is readable', res.status === 200, JSON.stringify(res.json).slice(0, 200));
  if (res.status !== 200) { console.log(`\n[portal-config] ${failures} of ${checks} checks FAILED`); process.exit(1); }

  const cfg = res.json as {
    active: boolean;
    is_default: boolean;
    features: {
      subscription_update: {
        enabled: boolean;
        default_allowed_updates: string[];
        proration_behavior: string;
        products?: PortalProduct[];
      };
      subscription_cancel: { enabled: boolean; mode: string };
      payment_method_update: { enabled: boolean };
      invoice_history: { enabled: boolean };
    };
    login_page: { enabled: boolean };
  };

  check('the configuration is active', cfg.active === true);

  // Three products share this Stripe account. The DEFAULT configuration is one
  // account-wide object; owning it would hand PyraSuite's plans to HookLens
  // customers. portal/route.ts names this one by id precisely so it need not be.
  check('it is NOT the account default', cfg.is_default === false, 'a shared live account: the default is every product\'s portal');

  const su = cfg.features.subscription_update;
  check('plan switching is enabled', su.enabled === true);
  check('only the PRICE may be changed', JSON.stringify(su.default_allowed_updates) === JSON.stringify(['price']), JSON.stringify(su.default_allowed_updates));
  check('prorations are invoiced immediately', su.proration_behavior === 'always_invoice', su.proration_behavior);

  // ── the setting that closes the down-leg ────────────────────────────────────
  //
  // Stripe prorates BOTH directions by time. Upgrading on day one and downgrading
  // the same day returns nearly the whole charge as customer balance — while the
  // credits it bought have already been spent, and no clamp can claw back a spent
  // credit. Scheduling any DECREASE to the end of the period means there is no
  // mid-period refund to take: the customer keeps the tier they paid for until it
  // expires. Stated as a BICONDITIONAL on the arm that makes it necessary, because
  // a rule that only runs when someone has already changed the other setting is
  // not a rule.
  const schedule = (su as unknown as { schedule_at_period_end?: { conditions?: { type: string }[] } }).schedule_at_period_end;
  const decreasesAreScheduled = (schedule?.conditions ?? []).some((c) => c.type === 'decreasing_item_amount');
  check(
    'a downgrade is scheduled to period end whenever prorations are invoiced immediately',
    !(su.enabled && su.proration_behavior === 'always_invoice') || decreasesAreScheduled,
    JSON.stringify(schedule)
  );
  check('cancelling runs to the end of the paid period', cfg.features.subscription_cancel.mode === 'at_period_end', cfg.features.subscription_cancel.mode);
  check('cancelling is offered at all', cfg.features.subscription_cancel.enabled === true);
  check('the card can be updated', cfg.features.payment_method_update.enabled === true);
  check('invoices are reachable', cfg.features.invoice_history.enabled === true);

  // The portal's own login page would let anyone enter an address and learn whether
  // it is a customer. Nothing in the product needs it.
  check('the public portal login page is off', cfg.login_page.enabled === false);

  // ── the list, both directions, exactly ──────────────────────────────────────
  const products = su.products;
  check('the expanded products list came back', Array.isArray(products), 'products is expandable — a plain retrieve omits it');
  if (!Array.isArray(products)) { console.log(`\n[portal-config] ${failures} of ${checks} checks FAILED`); process.exit(1); }

  const sellable = Object.values(PLANS).filter((p) => p.price > 0 && p.priceId && !p.priceId.includes('placeholder'));
  check('the environment names every sellable plan', sellable.length === 5, `${sellable.length} of 5 — is the Stripe env loaded?`);

  const offered = new Set(products.flatMap((p) => p.prices));
  for (const plan of sellable) {
    check(`the portal offers ${plan.id} at the price this product bills`, offered.has(plan.priceId as string), `${plan.priceId} not among ${[...offered].join(', ')}`);
  }
  for (const price of offered) {
    check(`the portal offers no price the product does not sell (${price})`, sellable.some((p) => p.priceId === price));
  }
  check('the portal offers exactly one price per plan', offered.size === sellable.length, `${offered.size} prices for ${sellable.length} plans`);

  for (const p of products) {
    check(
      `quantity is locked for ${p.product}`,
      p.adjustable_quantity?.enabled === false,
      'Stripe defaults this to ENABLED; the webhook grants per plan and ignores quantity'
    );
  }

  if (failures) { console.log(`\n[portal-config] ${failures} of ${checks} checks FAILED`); process.exit(1); }
  console.log(`[portal-config] ${checks} checks passed (${products.length} products, ${offered.size} prices)`);
})();
