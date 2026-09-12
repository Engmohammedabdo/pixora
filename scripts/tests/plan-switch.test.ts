/**
 * Proof for the mid-period plan-switch credit rule (lib/credits/plan-switch.ts).
 *
 *   npx tsx scripts/tests/plan-switch.test.ts
 *
 * WHY THIS IS A SEQUENCE HARNESS AND NOT A TABLE OF SINGLE CASES
 *
 * The rule this replaced passed every single-step check put to it — an upgrade
 * granted the difference, a downgrade kept the balance, a repeated no-op switch
 * granted nothing. It still minted credits without limit, because the attack is not
 * a step. It is a LAP: spend the balance to zero, drop a tier, come back, collect the
 * difference again. Only a harness that carries state between switches can see that,
 * so every case here is a sequence and the assertion is on the TOTAL granted across
 * it.
 *
 * WHY IT ALSO CARRIES A CLOCK, SINCE 2026-09-12
 *
 * The first three attempts were all written while plan switching was UNREACHABLE:
 * the live Stripe account had zero billing-portal configurations, so nothing could
 * call this function. Creating one brings Stripe's own proration into the trade, and
 * Stripe prorates by TIME: on the last day of the month, entry -> agency costs a few
 * cents. Attempt 3 handed over the whole 4,975-credit difference for it, every month,
 * forever. So `periodRemaining` is now an input and every sequence below states WHEN
 * in the period each switch happens.
 *
 * WHY IT MODELS A LEDGER WITH ROW TYPES
 *
 * `alreadyGrantedThisPeriod` is not a number the webhook holds; it is a SUM over
 * `credit_transactions`, and the exact filter is load-bearing in two opposite
 * directions. The monthly cron (`reset_monthly_credits`, migration 048) writes
 * `type='reset'` with a POSITIVE amount, so counting only `type='subscription'` reads
 * zero for a period the cron paid for and opens the ceiling to a second allowance. A
 * clamp-down ALSO writes `type='reset'`, with a negative amount, and letting that
 * reduce the total hands the lap its second chance back. The harness therefore keeps
 * rows, not a running total, and computes the sum the way the webhook does.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planSwitchBalance } from '../../lib/credits/plan-switch';
import { getCreditsForPlan } from '../../lib/stripe/plans';
import { stripComments } from '../lib/strip-comments';

let failures = 0;
let checks = 0;

function check(label: string, actual: number, expected: number): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${expected}, got ${actual}`);
  }
}

function checkAtMost(label: string, actual: number, ceiling: number): void {
  checks++;
  if (actual > ceiling) {
    failures++;
    console.log(`FAIL  ${label}\n        expected at most ${ceiling}, got ${actual}`);
  }
}

function checkNear(label: string, actual: number, expected: number, tolerance: number): void {
  checks++;
  if (Math.abs(actual - expected) > tolerance) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${expected} +/- ${tolerance}, got ${actual}`);
  }
}

type LedgerRow = { type: 'subscription' | 'reset' | 'purchase'; amount: number };

/** One subscriber across a single billing period. */
class Account {
  balance = 0;
  plan: string;
  /** Every positive grant, for the ceiling assertions. */
  totalGranted = 0;
  /** What the webhook actually reads back: rows, with types. */
  ledger: LedgerRow[] = [];
  /** Fraction of the billing period still unused. 1 = the period just started. */
  remaining = 1;

  constructor(plan: string) {
    this.plan = plan;
  }

  /**
   * The sum the webhook computes: every POSITIVE allowance row this period,
   * whichever writer produced it, with negatives floored rather than subtracted.
   */
  get grantedThisPeriod(): number {
    return this.ledger
      .filter((r) => r.type === 'subscription' || r.type === 'reset')
      .reduce((sum, r) => sum + Math.max(0, r.amount), 0);
  }

  /** checkout.session.completed / invoice.payment_succeeded: a period is paid for. */
  paidPeriod(plan: string): void {
    this.plan = plan;
    const allowance = getCreditsForPlan(plan);
    this.balance = allowance;
    this.ledger.push({ type: 'subscription', amount: allowance });
    this.totalGranted += allowance;
    this.remaining = 1;
  }

  /**
   * reset_monthly_credits() — the LIVE cron, `cron.job` jobid 1. It pays the month
   * whenever the invoice event has not, and it writes `type='reset'`, which is the
   * whole reason the sum above cannot filter on `type='subscription'`.
   */
  cronPaidPeriod(plan: string): void {
    this.plan = plan;
    const allowance = getCreditsForPlan(plan);
    this.balance = allowance;
    this.ledger.push({ type: 'reset', amount: allowance });
    this.totalGranted += allowance;
    this.remaining = 1;
  }

  /** A top-up the customer bought. A separate pool, and never an allowance. */
  boughtTopUp(amount: number): void {
    this.ledger.push({ type: 'purchase', amount });
  }

  /** Move the clock forward within the period. */
  at(remaining: number): this {
    this.remaining = remaining;
    return this;
  }

  /** customer.subscription.updated carrying a real tier change. */
  switchTo(plan: string): number {
    const { newBalance, granted } = planSwitchBalance({
      balance: this.balance,
      previousAllowance: getCreditsForPlan(this.plan),
      newAllowance: getCreditsForPlan(plan),
      alreadyGrantedThisPeriod: this.grantedThisPeriod,
      periodRemaining: this.remaining,
    });
    this.balance = newBalance;
    this.plan = plan;
    // The webhook writes 'subscription' for a positive grant and 'reset' otherwise,
    // and the sum above floors the negative — so a clamp-down cannot move the mark.
    this.ledger.push({ type: granted > 0 ? 'subscription' : 'reset', amount: granted });
    if (granted > 0) this.totalGranted += granted;
    return granted;
  }

  /** Ordinary product use. Credits come out of credits_balance first (007). */
  spendAll(): void {
    this.balance = 0;
  }
}

// ---- ATTACK 1: spend, then cycle. The one that defeated the previous rule. ----
{
  const a = new Account('free');
  a.paidPeriod('pro');
  for (let lap = 0; lap < 5; lap++) {
    a.spendAll();
    a.switchTo('starter');
    a.switchTo('pro');
  }
  checkAtMost(
    'attack: spend-then-cycle pro<->starter x5 never exceeds one pro allowance',
    a.totalGranted,
    getCreditsForPlan('pro')
  );
  check('attack: spend-then-cycle ends with nothing minted', a.balance, 0);
}

// ---- ATTACK 2: buy the top tier, downgrade at once, keep the credits. ----
{
  const a = new Account('free');
  a.paidPeriod('agency');
  a.switchTo('starter');
  checkAtMost(
    'attack: agency -> starter clamps the balance to the starter allowance',
    a.balance,
    getCreditsForPlan('starter')
  );
}

// ---- ATTACK 3: ladder up, fall back, climb again. ----
{
  const a = new Account('free');
  a.paidPeriod('starter');
  a.switchTo('pro');
  a.switchTo('agency');
  a.spendAll();
  a.switchTo('starter');
  a.switchTo('agency');
  checkAtMost(
    'attack: ladder plus relapse never exceeds one agency allowance in a period',
    a.totalGranted,
    getCreditsForPlan('agency')
  );
}

// ---- ATTACK 4: the one the billing portal opened. --------------------------
// Stripe charges a mid-period upgrade pro rata. On the last day of the month
// entry -> agency costs roughly one day of the $147 difference — under five
// dollars — and the previous rule answered it with 4,975 credits, the full
// allowance, on top of the 5,000 the renewal would grant hours later.
{
  const a = new Account('free');
  a.paidPeriod('entry');
  a.at(1 / 720); // one hour left of a 30-day period
  const granted = a.switchTo('agency');
  checkAtMost('attack: a last-hour entry -> agency upgrade buys almost nothing', granted, 25);
  checkAtMost('attack: and leaves the balance nowhere near an agency month', a.balance, 60);
}

// ---- ATTACK 5: run that every month for a year. -----------------------------
// The single-step version of ATTACK 4 could be argued away as one cheap month.
// As a sequence it is the business model: pay $2, upgrade at the death, collect,
// let the renewal drop you back. The total across twelve periods must stay close
// to twelve entry allowances, not twelve agency ones.
{
  const a = new Account('free');
  let total = 0;
  for (let month = 0; month < 12; month++) {
    a.ledger = [];
    a.paidPeriod('entry');
    a.at(1 / 720);
    a.switchTo('agency');
    total = a.totalGranted;
    a.switchTo('entry'); // the renewal lands back on the cheap tier
  }
  checkAtMost(
    'attack: twelve last-hour upgrades never approach twelve agency allowances',
    total,
    getCreditsForPlan('entry') * 12 + getCreditsForPlan('entry') * 12
  );
}

// ---- ATTACK 6: the month the CRON paid for, not the invoice webhook. --------
// reset_monthly_credits writes type='reset'. A read filtered to 'subscription'
// saw zero prior grants and let a switch collect a second full allowance on a
// month that had already been paid out.
{
  const a = new Account('free');
  a.cronPaidPeriod('pro');
  a.spendAll();
  const granted = a.switchTo('agency');
  checkAtMost(
    'attack: a switch after a CRON-paid month cannot collect a second allowance',
    a.grantedThisPeriod,
    getCreditsForPlan('agency')
  );
  checkAtMost('attack: and the switch itself is bounded by the headroom', granted, getCreditsForPlan('agency') - getCreditsForPlan('pro'));
}

// ---- ATTACK 7: a clamp-down must not buy back the lap. ----------------------
// The clamp-down writes type='reset' with a NEGATIVE amount. If the sum
// subtracted it, every downgrade would refund the ceiling and the lap in
// ATTACK 1 would work again.
{
  const a = new Account('free');
  a.paidPeriod('agency');
  a.switchTo('entry'); // a large negative 'reset' row
  a.spendAll();
  a.switchTo('agency');
  checkAtMost(
    'attack: a clamp-down does not restore the ceiling it passed through',
    a.totalGranted,
    getCreditsForPlan('agency')
  );
}

// ---- ATTACK 8: a bought top-up is not an allowance, in either direction. ----
{
  const a = new Account('free');
  a.paidPeriod('starter');
  a.boughtTopUp(1000);
  const granted = a.switchTo('pro');
  check(
    'attack: a top-up neither counts toward the ceiling nor is consumed by a switch',
    granted,
    getCreditsForPlan('pro') - getCreditsForPlan('starter')
  );
}

// ---- HONEST 1: a plain mid-period upgrade must deliver the difference. ----
{
  const a = new Account('free');
  a.paidPeriod('starter');
  const granted = a.switchTo('pro');
  check(
    'honest: starter -> pro on day one grants the whole difference',
    granted,
    getCreditsForPlan('pro') - getCreditsForPlan('starter')
  );
  check('honest: starter -> pro leaves a full pro allowance', a.balance, getCreditsForPlan('pro'));
}

// ---- HONEST 2: upgrading in steps must cost the same as going direct. ----
{
  const oneStep = new Account('free');
  oneStep.paidPeriod('starter');
  oneStep.switchTo('agency');

  const laddered = new Account('free');
  laddered.paidPeriod('starter');
  laddered.switchTo('pro');
  laddered.switchTo('business');
  laddered.switchTo('agency');

  check('honest: laddered upgrade lands on the same balance as a direct one', laddered.balance, oneStep.balance);
  check('honest: laddered upgrade grants the same total as a direct one', laddered.totalGranted, oneStep.totalGranted);
}

// ---- HONEST 3: an upgrade after spending still tops up, but never past the cap. ----
{
  const a = new Account('free');
  a.paidPeriod('starter');
  a.spendAll();
  a.switchTo('pro');
  checkAtMost('honest: upgrade after spending never exceeds the new allowance', a.balance, getCreditsForPlan('pro'));
  check(
    'honest: upgrade after spending still delivers the difference',
    a.balance,
    getCreditsForPlan('pro') - getCreditsForPlan('starter')
  );
}

// ---- HONEST 4: a downgrade never inflates a balance already below the cap. ----
{
  const a = new Account('free');
  a.paidPeriod('pro');
  a.balance = 10;
  const granted = a.switchTo('starter');
  check('honest: downgrade with a low balance changes nothing', granted, 0);
  check('honest: downgrade with a low balance keeps the balance', a.balance, 10);
}

// ---- HONEST 5: the next paid period resets cleanly whatever happened before. ----
{
  const a = new Account('free');
  a.paidPeriod('agency');
  a.switchTo('starter');
  a.ledger = [];
  a.paidPeriod('starter');
  check('honest: the renewal after a downgrade pays the new tier in full', a.balance, getCreditsForPlan('starter'));
}

// ---- HONEST 6: the grant tracks the money, at every point in the period. ----
// Stripe charges the difference pro rata, so half a month left must buy about
// half the difference — not none of it (which would make the portal useless for
// an honest upgrader) and not all of it (ATTACK 4).
{
  const difference = getCreditsForPlan('pro') - getCreditsForPlan('starter');
  for (const [label, remaining, expected] of [
    ['the first day', 1, difference],
    ['halfway', 0.5, Math.floor(difference * 0.5)],
    ['a week left', 7 / 30, Math.floor(difference * (7 / 30))],
  ] as [string, number, number][]) {
    const a = new Account('free');
    a.paidPeriod('starter');
    a.at(remaining);
    check(`honest: an upgrade with ${label} left grants its share of the difference`, a.switchTo('pro'), expected);
  }
}

// ---- HONEST 7: a period already over grants nothing, and never a negative. ----
{
  const a = new Account('free');
  a.paidPeriod('starter');
  a.at(-0.2); // credits_reset_date is in the past; the cron has not caught up
  const granted = a.switchTo('pro');
  check('honest: an overdue period grants nothing on a switch', granted, 0);
  check('honest: and does not take the existing balance away', a.balance, getCreditsForPlan('starter'));
}

// ---- FAIL-CLOSED: an unreadable ledger grants nothing, never everything. ----
{
  const newAllowance = getCreditsForPlan('agency');
  const { granted } = planSwitchBalance({
    balance: 0,
    previousAllowance: getCreditsForPlan('starter'),
    newAllowance,
    // What the webhook substitutes when the ledger read errors.
    alreadyGrantedThisPeriod: newAllowance,
    periodRemaining: 1,
  });
  check('fail-closed: an unreadable ledger grants nothing', granted, 0);
}

// ---- FAIL-CLOSED: an unknown period grants nothing. -------------------------
// `credits_reset_date` is nullable, and the webhook passes periodRemaining: 0
// for a missing one. The version before this passed a fabricated full period.
{
  const { granted } = planSwitchBalance({
    balance: 0,
    previousAllowance: getCreditsForPlan('entry'),
    newAllowance: getCreditsForPlan('agency'),
    alreadyGrantedThisPeriod: getCreditsForPlan('agency'),
    periodRemaining: 0,
  });
  check('fail-closed: an unknown billing period grants nothing', granted, 0);
}

// ---- FAIL-CLOSED: a nonsense clock cannot buy more than one difference. -----
{
  const difference = getCreditsForPlan('agency') - getCreditsForPlan('entry');
  for (const [label, remaining] of [['a stale future date', 12], ['NaN', Number.NaN]] as [string, number][]) {
    const { granted } = planSwitchBalance({
      balance: 0,
      previousAllowance: getCreditsForPlan('entry'),
      newAllowance: getCreditsForPlan('agency'),
      alreadyGrantedThisPeriod: 0,
      periodRemaining: remaining,
    });
    checkAtMost(`fail-closed: ${label} never grants more than one difference`, granted, difference);
  }
}

// ---- A switch between two plans of equal allowance is a no-op. ----
{
  const a = new Account('free');
  a.paidPeriod('pro');
  const granted = a.switchTo('pro');
  check('no-op: same allowance grants nothing', granted, 0);
}

// ---- The prorating must not quietly break the headline upgrade path. -------
// entry -> starter is the conversion this whole $2 tier exists to produce. If
// the proration ever made a day-one upgrade grant nothing, every sequence above
// would still pass and the product would be broken.
{
  const a = new Account('free');
  a.paidPeriod('entry');
  const granted = a.switchTo('starter');
  checkNear(
    'product: a day-one entry -> starter upgrade delivers the starter month',
    granted,
    getCreditsForPlan('starter') - getCreditsForPlan('entry'),
    0
  );
}

// ── THE HALF THE SEQUENCES CANNOT SEE ───────────────────────────────────────
//
// Everything above proves the pure function. Three of the four money defects the
// 2026-09-12 review found were not in the arithmetic at all — they were in what the
// webhook HANDS it, and a perfect function fed a wrong `alreadyGrantedThisPeriod`
// mints credits just as effectively. These read the caller.
{
  const webhook = stripComments(
    readFileSync(join(__dirname, '..', '..', 'app/api/stripe/webhook/route.ts'), 'utf8')
  );
  const callAt = webhook.indexOf('planSwitchBalance({');
  const branchStart = webhook.indexOf("case 'customer.subscription.updated'");
  const branchEnd = webhook.indexOf("case 'customer.subscription.deleted'");
  const branch = branchStart !== -1 && branchEnd > branchStart ? webhook.slice(branchStart, branchEnd) : '';

  function src(label: string, ok: boolean, detail = ''): void {
    checks++;
    if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
  }

  // A scan that matched nothing must FAIL rather than certify an empty result.
  src('the webhook still calls planSwitchBalance', callAt !== -1);
  src('the subscription.updated branch is findable', branch.length > 200, `${branch.length} chars`);

  // The clock reaches the rule at all.
  src(
    'the webhook passes periodRemaining',
    /planSwitchBalance\(\{[\s\S]{0,400}?periodRemaining/.test(webhook),
    webhook.slice(callAt, callAt + 260)
  );

  // The ledger read counts EVERY writer of an allowance. The monthly cron writes
  // type='reset' (migration 048), so `.eq('type','subscription')` reads zero for a
  // period the cron paid for — ATTACK 6, from the other side.
  src(
    "the prior-grants read counts 'reset' rows as well as 'subscription'",
    /\.in\('type',\s*\[\s*'subscription',\s*'reset'\s*\]\)/.test(branch),
    'expected .in(\'type\', [\'subscription\', \'reset\'])'
  );
  src(
    "the prior-grants read is not filtered to 'subscription' alone",
    !/\.eq\('type',\s*'subscription'\)/.test(branch)
  );

  // ...and floors the negatives instead of subtracting them — ATTACK 7.
  src(
    'the prior-grants sum floors negative rows at zero',
    /reduce\([\s\S]{0,140}?Math\.max\(0,/.test(branch),
    'a clamp-down writes a negative reset row; subtracting it restores the lap'
  );

  // A plan change is not a payment, so it must not clear the delinquency flag.
  const updateAt = branch.indexOf("'subscription.updated: update profile'");
  const updateCall = updateAt === -1 ? '' : branch.slice(Math.max(0, updateAt - 400), updateAt);
  src('the switch profile update is findable', updateAt !== -1);
  src(
    'a plan switch does not clear payment_failed',
    updateAt !== -1 && !/payment_failed/.test(updateCall),
    updateCall.slice(-220)
  );

  // The price is read back from Stripe, because webhook delivery is unordered and
  // the portal makes two switches in one visit ordinary.
  src(
    'the plan is resolved from a re-read subscription, not the event payload',
    /subscriptions\.retrieve\(/.test(branch) && /currentSubscription\.items/.test(branch),
    branch.slice(branch.indexOf('const priceId'), branch.indexOf('const priceId') + 200)
  );
}

if (failures > 0) {
  console.log(`\n[plan-switch] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[plan-switch] ${checks} checks passed`);
