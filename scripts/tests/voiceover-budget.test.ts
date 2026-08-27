/**
 * Proof that the voiceover character budget is the exact inverse of the price.
 *
 *   npx tsx scripts/tests/voiceover-budget.test.ts
 *
 * WHY THIS EXISTS
 *
 * The route quotes a price and a duration cap from the ORIGINAL script, then hands
 * the script to an LLM rewrite and synthesises the rewrite. Nothing measured the
 * rewrite, so a longer one delivered audio the customer never paid for and walked
 * through their plan's own duration cap; a shorter one charged them for silence.
 *
 * maxCharsForBudget() is the guard, and its contract is strict: a script of exactly
 * the returned length must still cost what was quoted AND still fit the plan cap.
 * One character more must do neither. That is what these checks assert — the
 * function is only useful if it is the true inverse of calculateVoiceoverCost.
 */
import {
  calculateVoiceoverCost,
  estimateVoiceoverDuration,
  getVoiceoverConfig,
  maxCharsForBudget,
} from '../../lib/credits/voiceover-costs';

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${String(expected)}, got ${String(actual)}`);
  }
}

const PLANS = ['free', 'starter', 'pro', 'business', 'agency'];
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];
const LENGTHS = [1, 40, 100, 137, 300, 640, 1200, 2000];

// ---- The budget never costs more than was quoted, and one char more does. ----
for (const plan of PLANS) {
  for (const speed of SPEEDS) {
    for (const len of LENGTHS) {
      const quoted = calculateVoiceoverCost(len, speed, plan);
      const budget = maxCharsForBudget(quoted, speed, plan);
      const cap = getVoiceoverConfig(plan).maxDurationSeconds;

      if (budget < len) {
        // Only legitimate when the plan cap, not the price, is the binding limit.
        check(
          `${plan}@${speed}/${len}: budget below the priced length only when capped`,
          estimateVoiceoverDuration(len, speed) > cap,
          true
        );
        continue;
      }

      check(
        `${plan}@${speed}/${len}: a script of exactly the budget still costs the quote`,
        calculateVoiceoverCost(budget, speed, plan) <= quoted,
        true
      );
      check(
        `${plan}@${speed}/${len}: the budget fits the plan duration cap`,
        estimateVoiceoverDuration(budget, speed) <= cap,
        true
      );
      check(
        `${plan}@${speed}/${len}: one character past the budget costs more or breaches the cap`,
        calculateVoiceoverCost(budget + 1, speed, plan) > quoted ||
          estimateVoiceoverDuration(budget + 1, speed) > cap,
        true
      );
    }
  }
}

// ---- The worked example: Starter, 300 chars, speed 1. ----
//
// The figures here changed on 2026-08-27 and the reason is worth stating,
// because a test whose numbers move looks like a test being bent to fit.
//
// `CHARS_PER_SECOND` was 5 and is now 8, measured against three Arabic scripts
// whose delivered MP3s were parsed frame by frame on production. At 5 the
// product billed 1.8x the audio it handed over. So this example is quoted at 3
// credits where it used to be 4 — the same script, correctly priced, one credit
// cheaper — and the budget those credits buy is 360 characters rather than 300.
//
// What did NOT change is the property this file exists to hold: the budget is
// still the exact inverse of the price, still bounded by the plan's duration
// cap, and every one of the 500-odd generated cases above still proves it. Only
// the anchor moved.
{
  const quoted = calculateVoiceoverCost(300, 1, 'starter');
  check('starter/300ch/1x is quoted at 3 credits', quoted, 3);
  check('starter/300ch/1x budgets 360 characters', maxCharsForBudget(quoted, 1, 'starter'), 360);
  // The budget must still COVER the script the customer was quoted for — a
  // budget below the typed length would truncate work already paid for.
  check('the budget covers the script it was quoted for', maxCharsForBudget(quoted, 1, 'starter') >= 300, true);
  check(
    'a 700-character rewrite is over budget and must be refused',
    700 > maxCharsForBudget(quoted, 1, 'starter'),
    true
  );
}

// ---- A budget is never negative or zero, even at the smallest quote. ----
for (const plan of PLANS) {
  for (const speed of SPEEDS) {
    const quoted = calculateVoiceoverCost(1, speed, plan);
    check(`${plan}@${speed}: minimum quote yields a usable budget`, maxCharsForBudget(quoted, speed, plan) >= 1, true);
  }
}

if (failures > 0) {
  console.log(`\n[voiceover-budget] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[voiceover-budget] ${checks} checks passed`);
