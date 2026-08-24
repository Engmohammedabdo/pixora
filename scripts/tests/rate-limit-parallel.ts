#!/usr/bin/env tsx
/**
 * Proof that the studio throttle is atomic, not check-then-act.
 *
 *   npm run test:rate-limit
 *
 * NEEDS THE LIVE DATABASE, so this is NOT a prebuild gate — same as
 * test:logo-parity. Run it after touching lib/rate-limit.ts or lib/throttle.ts.
 *
 * WHY IT MUST BE PARALLEL
 *
 * The limiter this replaced did `SELECT count(*) … ; if (count < max) proceed`.
 * That passes every sequential test ever written for it, and fails the moment two
 * requests overlap: both read the same count, both find it under the cap, both
 * proceed. It was the only throttle in front of nine paid studios, so stepping
 * past it means spending model budget that someone else pays for.
 *
 * This is the same proof migration 039 was signed off with: 25 genuinely parallel
 * calls against a cap of 5 must allow exactly 5.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Env before any import that builds a Supabase client at module scope. Same
// approach as scripts/tests/logo-parity.ts — this repo has no dotenv dependency.
const ROOT = join(__dirname, '..', '..');
const envPath = join(ROOT, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const CAP = 5;
const CALLS = 25;

async function main(): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('[rate-limit] Supabase credentials not found in .env.local — cannot test against the database.');
    process.exit(1);
  }

  const { consumeAttempt } = await import('../../lib/throttle');

  let failures = 0;
  let checks = 0;

  function check(label: string, actual: unknown, expected: unknown): void {
    checks++;
    if (actual !== expected) {
      failures++;
      console.log(`FAIL  ${label}\n        expected ${String(expected)}, got ${String(actual)}`);
    }
  }

  // A key nothing else uses, fresh per run, so a previous run's counter cannot
  // make this pass or fail for the wrong reason.
  const key = `test:parallel:${process.pid}:${Date.now()}`;

  // Fired without awaiting in between — the whole point is that they overlap.
  const results = await Promise.all(
    Array.from({ length: CALLS }, () =>
      consumeAttempt(key, CAP, 1).catch((e: unknown) => {
        console.error('  call errored:', String(e));
        return null;
      })
    )
  );

  const errored = results.filter((r) => r === null).length;
  const allowed = results.filter((r) => r === true).length;
  const denied = results.filter((r) => r === false).length;

  console.log(`  ${CALLS} parallel calls, cap ${CAP} → allowed=${allowed} denied=${denied} errored=${errored}`);

  check('no call errored', errored, 0);
  check(`exactly ${CAP} of ${CALLS} parallel calls were allowed`, allowed, CAP);
  check('every other call was denied', denied, CALLS - CAP);

  // A different key must have its own budget.
  const other = await consumeAttempt(`${key}:other`, CAP, 1);
  check('a different key gets its own budget', other, true);

  if (failures > 0) {
    console.log(`\n[rate-limit] ${failures} of ${checks} checks FAILED`);
    process.exit(1);
  }
  console.log(`[rate-limit] ${checks} checks passed`);
}

void main();
