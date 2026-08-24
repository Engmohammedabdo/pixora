/**
 * Proof for the charge-settlement rule (lib/credits/settle.ts).
 *
 *   npx tsx scripts/tests/settle.test.ts
 *
 * WHY THIS IS A SEPARATE FUNCTION AND NOT THREE LINES INLINE
 *
 * creator and photoshoot both wrote `credits_used: totalCost - refundAmount` and
 * returned the same figure to the customer, WITHOUT checking that the refund
 * landed. The refund result was captured — so the `refund-captured` invariant was
 * satisfied — and then ignored at the only place it mattered. Two files, the same
 * mistake, because the rule lived in nobody's head as a rule.
 *
 * The rule: a charge may only be restated DOWNWARD, and only from a refund that
 * actually landed. Everything else is the reservation.
 */
import { settleCharge } from '../../lib/credits/settle';

let failures = 0;
let checks = 0;

function check(label: string, actual: number, expected: number): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${expected}, got ${actual}`);
  }
}

// ---- A refund that landed reduces the charge. ----
{
  const s = settleCharge(12, 4, true);
  check('landed: charge drops by the refund', s.charged, 8);
  check('landed: refunded is reported', s.refunded, 4);
}

// ---- A refund that did NOT land leaves the charge at the reservation. ----
// This is the whole point: the ledger must not claim credits came back when the
// customer's balance says otherwise. The failure is already logged [credits][OWED].
{
  const s = settleCharge(12, 4, false);
  check('not landed: charge stays at the reservation', s.charged, 12);
  check('not landed: nothing is reported as refunded', s.refunded, 0);
}

// ---- No refund was due. ----
{
  const s = settleCharge(8, 0, true);
  check('no refund due: charge is the reservation', s.charged, 8);
  check('no refund due: refunded is zero', s.refunded, 0);
}

// ---- A refund larger than the reservation can never mint credits. ----
{
  const s = settleCharge(5, 9, true);
  check('over-refund: charge floors at zero', s.charged, 0);
  check('over-refund: refunded is capped at the reservation', s.refunded, 5);
}

// ---- A negative refund is nonsense and must not raise the charge. ----
{
  const s = settleCharge(10, -3, true);
  check('negative refund: charge is unchanged', s.charged, 10);
  check('negative refund: refunded is zero', s.refunded, 0);
}

// ---- A zero reservation settles to zero. ----
{
  const s = settleCharge(0, 0, true);
  check('zero reservation: charge is zero', s.charged, 0);
  check('zero reservation: refunded is zero', s.refunded, 0);
}

if (failures > 0) {
  console.log(`\n[settle] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[settle] ${checks} checks passed`);
