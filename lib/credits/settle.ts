/**
 * What the customer was ACTUALLY charged, given a reservation and a refund that
 * may or may not have landed.
 *
 * ── WHY THIS IS A FUNCTION ─────────────────────────────────────────────────
 * creator and photoshoot both wrote `credits_used: totalCost - refundAmount` and
 * returned that same figure to the customer, without consulting
 * `refundResult.success`. The refund result WAS captured — so the `refund-captured`
 * invariant passed — and then ignored at the only place it mattered. So
 * `generations.credits_used` said the customer paid less than their balance says
 * they did, every admin revenue figure reads off that column, and the response told
 * the customer the same untruth.
 *
 * voiceover and campaign already state the rule correctly in prose. This is that
 * rule, once, where it can be tested.
 *
 * The rule: a charge may only be restated DOWNWARD, and only from a refund that
 * actually landed. A refund that failed is already recorded as `[credits][OWED]` by
 * refundCredits(); it must not also be recorded here as if it had succeeded.
 */
export function settleCharge(
  reserved: number,
  refundAmount: number,
  refundLanded: boolean
): { charged: number; refunded: number } {
  // Clamped at both ends so the arithmetic is total. Neither bound is reachable
  // through today's call sites — and every credit defect in this repo's history was
  // a case nobody thought was reachable.
  const refunded = refundLanded ? Math.min(Math.max(refundAmount, 0), Math.max(reserved, 0)) : 0;
  return { charged: Math.max(reserved, 0) - refunded, refunded };
}
