/**
 * What a mid-period plan switch is allowed to do to `credits_balance`.
 *
 * This lives here, as a pure function, because it is the third attempt at this rule
 * and the first two both shipped as taps. Keeping it inline in the webhook meant the
 * only way to check it was to reason about it, and reasoning about it is exactly what
 * failed twice:
 *
 *   1. Stated on the EVENT ("has this switch already granted?"). Defeated because
 *      every switch in a down-up cycle is a genuine, distinct tier change and is
 *      indistinguishable from honest churn.
 *   2. Stated on the RESULTING BALANCE (cap the balance at the new allowance).
 *      Defeated because balance is a number the customer moves at will: a lap that
 *      ends at zero re-earns the whole difference. Spend 600, drop to starter, return
 *      to pro, collect 400, repeat for as long as the billing portal is open.
 *
 * Credits already granted this period is the one quantity spending cannot move, so
 * that is what the ceiling is measured against.
 *
 *   - an upgrade may add at most the DIFFERENCE between the two allowances, and never
 *     more than the period has left before it has issued one full allowance of the
 *     tier being moved to;
 *   - the balance is clamped to the new tier's allowance in BOTH directions. Clamping
 *     DOWN matters as much as clamping up, because Stripe prorates a mid-period
 *     downgrade: it hands back the money for the part of the month being given up.
 *     Leaving the higher tier's credits in place as well pays the customer twice —
 *     buy Agency, downgrade a minute later, keep the whole allowance.
 *
 * `purchased_credits` is a separate pool (migration 031) and is deliberately not an
 * input here: a top-up the customer actually bought survives every switch.
 *
 * Proven by scripts/tests/plan-switch.test.ts, which runs the attack sequences as
 * sequences rather than as single steps — the second attempt passed every
 * single-step check and still minted credits on the second lap.
 */
export interface PlanSwitchInput {
  /** `profiles.credits_balance` before the switch. */
  balance: number;
  /** Monthly allowance of the plan being left. */
  previousAllowance: number;
  /** Monthly allowance of the plan being moved to. */
  newAllowance: number;
  /**
   * Sum of plan-allowance credits already granted in the current billing period.
   * On a read failure the caller must pass `newAllowance` — failing closed costs an
   * honest upgrader credits the next renewal restores, while failing open mints them
   * against a live Stripe account. Only one of those is recoverable.
   */
  alreadyGrantedThisPeriod: number;
}

export interface PlanSwitchResult {
  /** What `credits_balance` must become. */
  newBalance: number;
  /** Signed delta for the ledger row. Negative on a clamp-down. */
  granted: number;
}

export function planSwitchBalance(input: PlanSwitchInput): PlanSwitchResult {
  const { balance, previousAllowance, newAllowance, alreadyGrantedThisPeriod } = input;

  const headroom = Math.max(0, newAllowance - alreadyGrantedThisPeriod);
  const difference = Math.max(0, newAllowance - previousAllowance);
  const newBalance = Math.min(balance + Math.min(difference, headroom), newAllowance);

  return { newBalance, granted: newBalance - balance };
}
