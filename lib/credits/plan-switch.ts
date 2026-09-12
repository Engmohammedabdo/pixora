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
 *   - an upgrade may add at most the DIFFERENCE between the two allowances, SCALED BY
 *     HOW MUCH OF THE PERIOD IS LEFT, and never more than the period has left before
 *     it has issued one full allowance of the tier being moved to;
 *   - the balance is clamped to the new tier's allowance in BOTH directions. Clamping
 *     DOWN matters as much as clamping up, because Stripe prorates a mid-period
 *     downgrade: it hands back the money for the part of the month being given up.
 *     Leaving the higher tier's credits in place as well pays the customer twice —
 *     buy Agency, downgrade a minute later, keep the whole allowance.
 *
 * ── THE FOURTH ATTEMPT, AND WHY THE THIRD WAS NOT ENOUGH (2026-09-12) ─────────
 *
 * Attempts 1-3 were written while plan switching was UNREACHABLE: the live Stripe
 * account had zero billing-portal configurations, so nothing could call this. The
 * moment a configuration exists, Stripe's own proration becomes the other half of
 * the trade — and it is measured in TIME. Stripe charges for a mid-period upgrade
 * pro rata: on the last day of the month, entry -> agency costs roughly one day of
 * the difference, a few cents. Attempt 3 granted the WHOLE difference for it —
 * 4,975 credits — and then the renewal granted 5,000 more. Repeatable every month,
 * and the cheapest at exactly the moment it should be cheapest to refuse.
 *
 * So the grant is prorated the same way the money is. `periodRemaining` is the
 * fraction of the billing period still unused; the difference is multiplied by it
 * and floored. An upgrade on day 1 still delivers the full difference, an upgrade
 * in the last hour delivers nothing, and every point between is what the customer
 * has actually been charged for. The ceiling on credits already granted stays on
 * top of that: proration alone would still let a lap collect a slice per lap.
 *
 * ── AND THE DIFFERENCE IS STATED ON THE LEDGER, NOT ON THE PREVIOUS PLAN ─────
 *
 * `previousAllowance` is gone. The gap being bought is
 * `newAllowance - alreadyGrantedThisPeriod`, which in the ordinary case is exactly
 * what `newAllowance - previousAllowance` was — a customer on Pro whose period has
 * issued Pro's 600 gets the identical answer — and which is STRICTLY smaller
 * whenever the ledger says more has been issued than the previous tier's headline
 * allowance. That is precisely when being generous is wrong.
 *
 * The reason it had to change is not tightness, it is ORDER. Stripe applies a
 * portal price change immediately and bills it separately, so the credits must be
 * issued by whichever of the two events proves the money settled — and the invoice
 * event does not know what plan the customer was on a moment ago. Stated on the
 * ledger, the rule needs no such memory: both events compute the same number, and
 * the first one to run moves `alreadyGrantedThisPeriod` so the second grants zero.
 * Idempotence by arithmetic rather than by a lock.
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
  /** Monthly allowance of the plan being moved to. */
  newAllowance: number;
  /**
   * Sum of plan-allowance credits already granted in the current billing period.
   * On a read failure the caller must pass `newAllowance` — failing closed costs an
   * honest upgrader credits the next renewal restores, while failing open mints them
   * against a live Stripe account. Only one of those is recoverable.
   *
   * "Granted" means every POSITIVE allowance row, whichever writer produced it. The
   * monthly cron (`reset_monthly_credits`, migration 048) writes `type='reset'`, not
   * `type='subscription'`, so a caller that counts only the latter reads 0 for a
   * period the cron paid and opens the ceiling to a full second allowance. Negative
   * rows — a clamp-down writes one, also as `reset` — must NOT reduce the total, or
   * the lap gets its second chance back.
   */
  alreadyGrantedThisPeriod: number;
  /**
   * How much of the current billing period is still unused, 0..1.
   *
   * This is the half that makes the grant follow the money: Stripe prorates a
   * mid-period switch by time, so the credits have to be prorated by time too.
   * The caller must pass 0 when it cannot work the period out — `credits_reset_date`
   * is nullable — because an unknown period is not a full one.
   */
  periodRemaining: number;
}

export interface PlanSwitchResult {
  /** What `credits_balance` must become. */
  newBalance: number;
  /** Signed delta for the ledger row. Negative on a clamp-down. */
  granted: number;
  /**
   * The difference the period had actually been paid for, before the ceiling and
   * the clamp were applied. Returned rather than left to the caller because
   * `granted` is cut by THREE independent things — proration, the already-granted
   * ceiling, and the clamp to the new allowance — and the customer-facing line
   * that explains the number must not guess which one did it. A caller that
   * re-derived this from its own copy of the clock would be the "a rule stated
   * twice drifts" failure, with the drift landing in the customer's history.
   */
  earned: number;
  /** How much of the new tier's allowance this period had left to issue. */
  headroom: number;
  /**
   * The whole gap this period still owed of the new tier, before time touched it.
   * Returned for the same reason as `earned`: the sentence the customer reads
   * quotes it ("58 of 175"), and a caller computing its own copy is the drift this
   * project keeps paying for. Equal to `headroom` by construction; both names are
   * kept because the two readings — "the ceiling" and "the gap being bought" —
   * are what the wording downstream needs to tell apart.
   */
  difference: number;
}

export function planSwitchBalance(input: PlanSwitchInput): PlanSwitchResult {
  const { balance, newAllowance, alreadyGrantedThisPeriod, periodRemaining } = input;

  // One quantity, used twice: what this period still owes of the new tier. It is
  // the ceiling AND the gap being bought — see the header for why stating it on
  // the ledger rather than on the previous plan is what makes the rule
  // order-independent.
  const headroom = Math.max(0, newAllowance - alreadyGrantedThisPeriod);
  const difference = headroom;
  // Clamped rather than trusted: a clock skew or a stale reset date must not be able
  // to hand out more than one period's difference, and a period already over must
  // hand out none. NaN fails this comparison and lands on 0, which is the safe end.
  const remaining = periodRemaining > 0 ? Math.min(1, periodRemaining) : 0;
  // Floored, so the rounding error is always in the product's favour rather than
  // the customer's — the same direction every other ceiling here points.
  const earned = Math.floor(difference * remaining);
  const newBalance = Math.min(balance + Math.min(earned, headroom), newAllowance);

  return { newBalance, granted: newBalance - balance, earned, headroom, difference };
}
