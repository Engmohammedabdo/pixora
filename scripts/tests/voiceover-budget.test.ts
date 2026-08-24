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

// ---- The worked example from the audit: Starter, 300 chars, speed 1. ----
{
  const quoted = calculateVoiceoverCost(300, 1, 'starter');
  check('starter/300ch/1x is quoted at 4 credits', quoted, 4);
  check('starter/300ch/1x budgets exactly 300 characters', maxCharsForBudget(quoted, 1, 'starter'), 300);
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
