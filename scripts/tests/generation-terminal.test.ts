/**
 * Proof for the terminal-write rule (lib/supabase/generation-writes.ts).
 *
 *   npx tsx scripts/tests/generation-terminal.test.ts
 *
 * WHY THIS TEST EXISTS
 *
 * reconcile_orphaned_generations() is the last automated payout in the system, and
 * its scan window is `status IN ('pending','processing')` (028:161). Marking a row
 * 'failed' takes it out of that window forever. So the ONE thing failGeneration()
 * must never do is write when the credits have not come back — that converts a
 * recoverable failure into stranded money whose only trace is a log line.
 *
 * The assertion is therefore on WHETHER A WRITE WAS ISSUED AT ALL, not on the
 * return value. A helper that wrote and then reported false would pass a
 * return-value check and still lose the customer's credits.
 */
import { failGeneration } from '../../lib/supabase/generation-writes';

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${String(expected)}, got ${String(actual)}`);
  }
}

type UpdateResult = { data: { id: string }[] | null; error: { code?: string; message: string } | null };

/** Records every .update() payload and replays a scripted list of outcomes. */
function fakeClient(outcomes: UpdateResult[]) {
  const payloads: Record<string, unknown>[] = [];
  let i = 0;
  const client = {
    from() {
      return {
        update(payload: Record<string, unknown>) {
          payloads.push(payload);
          return {
            eq() {
              return {
                select: async (): Promise<UpdateResult> => outcomes[Math.min(i++, outcomes.length - 1)],
              };
            },
          };
        },
      };
    },
  };
  return { payloads, client: client as unknown as Parameters<typeof failGeneration>[0] };
}

const ok: UpdateResult = { data: [{ id: 'g1' }], error: null };
const noRow: UpdateResult = { data: [], error: null };

async function main(): Promise<void> {
  // ---- The rule: an unsettled refund must not produce a write. ----
  {
    const { payloads, client } = fakeClient([ok]);
    const result = await failGeneration(client, 'g1', { creditsSettled: false }, 'analysis');
    check('unsettled: issues no write at all', payloads.length, 0);
    check('unsettled: reports it did not mark the row', result, false);
  }

  // ---- Settled credits do mark the row terminal. ----
  {
    const { payloads, client } = fakeClient([ok]);
    const result = await failGeneration(client, 'g1', { creditsSettled: true }, 'analysis');
    check('settled: issues exactly one write', payloads.length, 1);
    check('settled: writes status failed', payloads[0]?.status, 'failed');
    check('settled: reports success', result, true);
  }

  // ---- The error label reaches the row when one is given. ----
  {
    const { payloads, client } = fakeClient([ok]);
    await failGeneration(client, 'g1', { creditsSettled: true, error: 'all_shots_failed' }, 'photoshoot');
    check('error label is written', payloads[0]?.error, 'all_shots_failed');
  }

  // ---- Omitting the label must not write an `error` key at all. ----
  {
    const { payloads, client } = fakeClient([ok]);
    await failGeneration(client, 'g1', { creditsSettled: true }, 'plan');
    check('no label writes no error key', 'error' in (payloads[0] ?? {}), false);
  }

  // ---- An UPDATE that matches no row is NOT success, and is retried. ----
  {
    const { payloads, client } = fakeClient([noRow, noRow, noRow]);
    const result = await failGeneration(client, 'missing', { creditsSettled: true }, 'edit');
    check('zero-row update is not treated as success', result, false);
    check('zero-row update is retried three times', payloads.length, 3);
  }

  // ---- A transient failure that clears on retry still succeeds. ----
  {
    const { payloads, client } = fakeClient([
      { data: null, error: { code: '40001', message: 'serialization failure' } },
      ok,
    ]);
    const result = await failGeneration(client, 'g1', { creditsSettled: true }, 'creator');
    check('transient failure then success reports true', result, true);
    check('transient failure retried once', payloads.length, 2);
  }

  if (failures > 0) {
    console.log(`\n[generation-terminal] ${failures} of ${checks} checks FAILED`);
    process.exit(1);
  }
  console.log(`[generation-terminal] ${checks} checks passed`);
}

void main();
