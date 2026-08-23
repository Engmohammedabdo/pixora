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
 * The simulation mirrors what app/api/stripe/webhook/route.ts actually does: a paid
 * period writes a type='subscription' ledger row for the full allowance, a switch
 * that grants writes another, and a clamp-down writes type='reset' — which is why a
 * clamp-down must NOT reduce the running total.
 */
import { planSwitchBalance } from '../../lib/credits/plan-switch';
import { getCreditsForPlan } from '../../lib/stripe/plans';

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

/** One subscriber across a single billing period. */
class Account {
  balance = 0;
  plan: string;
  /** Sum of type='subscription' rows this period — what the webhook queries. */
  grantedThisPeriod = 0;
  /** Every positive grant, for the ceiling assertions. */
  totalGranted = 0;

  constructor(plan: string) {
    this.plan = plan;
  }

  /** checkout.session.completed / invoice.payment_succeeded: a period is paid for. */
  paidPeriod(plan: string): void {
    this.plan = plan;
    const allowance = getCreditsForPlan(plan);
    this.balance = allowance;
    this.grantedThisPeriod += allowance;
    this.totalGranted += allowance;
  }

  /** customer.subscription.updated carrying a real tier change. */
  switchTo(plan: string): number {
    const { newBalance, granted } = planSwitchBalance({
      balance: this.balance,
      previousAllowance: getCreditsForPlan(this.plan),
      newAllowance: getCreditsForPlan(plan),
      alreadyGrantedThisPeriod: this.grantedThisPeriod,
    });
    this.balance = newBalance;
    this.plan = plan;
    // A clamp-down is written as type='reset' and so does not move the mark.
    if (granted > 0) {
      this.grantedThisPeriod += granted;
      this.totalGranted += granted;
    }
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

// ---- HONEST 1: a plain mid-period upgrade must deliver the difference. ----
{
  const a = new Account('free');
  a.paidPeriod('starter');
  const granted = a.switchTo('pro');
  check(
    'honest: starter -> pro grants the difference',
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
  a.grantedThisPeriod = 0;
  a.paidPeriod('starter');
  check('honest: the renewal after a downgrade pays the new tier in full', a.balance, getCreditsForPlan('starter'));
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
  });
  check('fail-closed: an unreadable ledger grants nothing', granted, 0);
}

// ---- A switch between two plans of equal allowance is a no-op. ----
{
  const a = new Account('free');
  a.paidPeriod('pro');
  const granted = a.switchTo('pro');
  check('no-op: same allowance grants nothing', granted, 0);
}

if (failures > 0) {
  console.log(`\n[plan-switch] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[plan-switch] ${checks} checks passed`);
