# Studio Money Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every path in the nine studio routes where a customer can be charged for work they did not receive, or lose credits with no automated way to get them back.

**Architecture:** One new shared helper, `failGeneration()`, becomes the only way a studio route may mark a generation terminal — and it refuses to write unless the credits are provably settled, leaving the row in `reconcile_orphaned_generations()`'s scan window otherwise. The `generation-finalized` build invariant is then widened from `'completed'` to any terminal status so the 25 raw writes cannot come back. Four independent per-studio money defects (voiceover repricing, campaign image cap, storyboard scene floor, plan completeness gate) are fixed alongside.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Zod (`zod/v4`), Supabase JS, `tsx` for test scripts (no test framework — plain scripts with a `check()` helper and `process.exit(1)`).

**Spec:** The audit report at https://claude.ai/code/artifact/d89501a0-e49d-4c4f-8084-d35e98cbc180 — Batch 1 ("Money correctness"), derived from Patterns 01 and 05. Every requirement it imposes is restated inline below; this plan is self-contained.

## Global Constraints

- **TypeScript strict, zero `any`.** `npx tsc --noEmit` must be clean after every task.
- **Zod imports come from `zod/v4`**, never `zod`.
- **Never use `--update-baseline` for this work.** `scripts/check-invariants.ts` restricts baseline
  eligibility to `no-arabic-literals-in-tsx` (`BASELINE_ELIGIBLE_IDS`) precisely so a new violation
  cannot be silenced. The widened invariant in Task 7 must go green by fixing code, not by baselining.
- **Build gates must stay green after every task:** `npm run check:invariants`, `npm run test:safety`,
  `npm run test:uploads`, `npm run test:plan-switch`. These run via `prebuild`.
- **Commit after every task.** Never batch tasks into one commit.
- **User-facing strings say "بايرا", never a model name.** No task here adds user-facing copy, but if
  you add an error code it MUST be registered in `KNOWN_ERROR_CODES` (`lib/studio-errors.ts:1-24`) or
  the customer sees the generic `fallback` message.
- **Do not change refund amounts or credit arithmetic** anywhere in this plan. Every task changes
  *when* a row is marked terminal or *what quantity is measured*, never how much is refunded — except
  Task 8, which is explicitly a repricing task and is capped so it can only ever refund, never charge.

---

## Background: the rule this plan implements

`reconcile_orphaned_generations()` (migration `028_reconcile_orphaned_generations.sql`) is the last
automated payout in the system. Every 15 minutes it scans:

```sql
WHERE g.status IN ('pending', 'processing')
  AND g.created_at < now() - p_older_than
```

For each row it recomputes what is owed **from the ledger, not from `generations.credits_used`**:

```sql
SELECT COALESCE(SUM(CASE WHEN ct.type = 'usage'  THEN -ct.amount ELSE 0 END), 0)
     - COALESCE(SUM(CASE WHEN ct.type = 'refund' THEN ct.amount ELSE 0 END), 0)
INTO v_owed
FROM public.credit_transactions ct
WHERE ct.generation_id = v_gen.id;
```

Two consequences the whole plan rests on:

1. **`owed <= 0` → the reconciler skips the row entirely.** No refund, no status change. So leaving a
   row in `processing` when nothing is owed is harmless, and **a double refund is impossible.**
2. **If the refund fails, the reconciler deliberately leaves the row as it found it** so the next run
   retries (028's `ELSE` branch).

Therefore the rule is:

> **A studio route may mark a generation `failed` only when the credits are provably settled — the
> refund returned `success: true`, or nothing was ever charged. Otherwise it must leave the row
> alone, in the reconciler's window.**

`app/api/studios/creator/route.ts:352` already implements exactly this, with a comment deriving the
reasoning. It is the reference implementation. The other 24 sites do not.

**The cost of the change:** a row whose refund failed now shows as `processing` in history for up to
one reconciler tick instead of showing `failed` immediately. That is the correct trade — the
alternative is stranded money whose only trace is a `[credits][OWED]` log line nothing alerts on.

### The 25 sites, classified

| Shape | What it needs | Sites |
|---|---|---|
| **A** — reserve-failure path | `creditsSettled: reserveResult.error === 'insufficient_credits'` | `analysis:192`, `campaign:216`, `creator:228`, `edit:133`, `photoshoot:168`, `plan:172`, `storyboard:125`, `voiceover:137` |
| **B** — refund already computed above the write | gate the write on `refundResult.success` | `analysis:227`, `campaign:451`, `creator:296`, `creator:457`, `edit:166`, `photoshoot:347`, `plan:221`, `storyboard:172`, `voiceover:168`, `voiceover:188` |
| **C** — write happens **before** the refund | move the write below the refund, then gate it | `analysis:213`, `campaign:258`, `photoshoot:275`, `plan:197`, `storyboard:148` |
| **D** — no credits involved | `creditsSettled: true` unconditionally | `prompt-builder:84` |
| — | already correct, leave alone | `creator:352` |

**Shape A's discriminator matters.** `reserve_credits` returns `{success:false, error:'insufficient_credits'}`
from the function body (`017_reserve_credits.sql:31`) — the RPC ran and decided no, so nothing was
charged. Any *other* failure returns a Postgres/PostgREST `error.message` (`lib/credits/deduct.ts:87`),
which may mean the reservation committed and only the reply was lost. Only the first is proof.

---

## File Structure

**Created:**
- `lib/supabase/generation-writes.ts` — *modified*, gains `failGeneration()` beside `finalizeGeneration()`. These two are the complete set of terminal writes, so they belong in one file.
- `scripts/tests/generation-terminal.test.ts` — proves `failGeneration()`'s decision rule with a fake client. No DB needed.
- `scripts/tests/voiceover-budget.test.ts` — proves the character budget is the exact inverse of the price function.

**Modified:**
- All nine `app/api/studios/*/route.ts` — 24 terminal-write conversions (Tasks 2–6).
- `scripts/check-invariants.ts:299-335` — widen `generation-finalized` (Task 7).
- `lib/credits/voiceover-costs.ts` — add `maxCharsForBudget()` (Task 8).
- `lib/ai/tts-router.ts` — enforce the budget, report what was synthesised (Task 8).
- `package.json` — register the two new test scripts in `prebuild`.
- `CLAUDE.md` — record what is now true (Task 12).

---

### Task 1: `failGeneration()` and its decision rule

**Files:**
- Modify: `lib/supabase/generation-writes.ts` (append after `finalizeGeneration`, before `type AssetInsert`)
- Create: `scripts/tests/generation-terminal.test.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `failGeneration(supabase: Client, generationId: string, opts: { creditsSettled: boolean; error?: string }, studio: string): Promise<boolean>`. Returns `true` when the row was confirmed terminal, `false` when it was deliberately left for the reconciler **or** could not be written. Tasks 2–6 call this exact signature.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/generation-terminal.test.ts`:

```ts
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
                select: async (): Promise<UpdateResult> =>
                  outcomes[Math.min(i++, outcomes.length - 1)],
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx scripts/tests/generation-terminal.test.ts`

Expected: FAIL — a TypeScript/module error along the lines of
`The requested module '../../lib/supabase/generation-writes' does not provide an export named 'failGeneration'`.
The function does not exist yet.

- [ ] **Step 3: Implement `failGeneration`**

In `lib/supabase/generation-writes.ts`, insert this **after** the closing brace of
`finalizeGeneration` (currently line 107) and **before** `type AssetInsert = ...` (currently line 109):

```ts
interface FailOptions {
  /**
   * Proof that the customer's credits are not owed: the refund returned
   * `success: true`, or nothing was ever charged for this generation.
   *
   * NOT "we tried to refund". A refund that failed leaves credits owed, and this
   * must be false for those.
   */
  creditsSettled: boolean;
  /** Optional label written to `generations.error`, e.g. 'all_shots_failed'. */
  error?: string;
}

/**
 * Mark a generation `failed` — but ONLY when the credits are provably settled.
 *
 * ── WHY THIS REFUSES TO WRITE ──────────────────────────────────────────────
 * `reconcile_orphaned_generations()` scans `status IN ('pending','processing')`
 * (028:161) and is, after migration 038, the only automated payout left. `failed`
 * is terminal, so writing it removes the row from that scan forever. Do that over
 * a refund that did not land and the credits survive only as a `[credits][OWED]`
 * line that nothing alerts on.
 *
 * Leaving the row in `processing` instead costs at most one 15-minute tick and
 * CANNOT double-pay: the reconciler derives what it owes from the ledger
 * (`SUM(usage) - SUM(refund)`, 028:169-176), so a refund that did land leaves
 * nothing owed and the row is skipped untouched (028's `owed <= 0` branch).
 *
 * This is the rule `app/api/studios/creator/route.ts:352` already followed alone.
 *
 * Returns true only when the row is confirmed terminal. `false` means either
 * "deliberately left for the reconciler" or "could not write" — both are states in
 * which the caller must not claim the generation was closed out.
 */
export async function failGeneration(
  supabase: Client,
  generationId: string,
  opts: FailOptions,
  studio: string
): Promise<boolean> {
  if (!opts.creditsSettled) {
    // Not an error. This is the helper doing its job.
    console.warn(
      `[generations] ${studio} ${generationId}: left in the reconciler's window — credits are not ` +
        'confirmed returned, so the row must stay refundable by reconcile_orphaned_generations().'
    );
    return false;
  }

  const payload: { status: 'failed'; error?: string } = { status: 'failed' };
  if (opts.error) payload.error = opts.error;

  // Same discipline as finalizeGeneration: an UPDATE matching no row reports no
  // error at all, so only a returned row proves the write landed.
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { data, error } = await supabase
      .from('generations')
      .update(payload)
      .eq('id', generationId)
      .select('id');

    if (!error && data && data.length > 0) return true;
    lastError = error ? `${error.code ?? ''} ${error.message}`.trim() : 'update matched no row';
  }

  // Far less serious than the finalize equivalent: the credits are already back,
  // so the customer is whole and the reconciler will find nothing owed and skip
  // the row. Only the history label is wrong.
  console.error(
    `[generations] ${studio} ${generationId}: could not be marked failed after 3 attempts (${lastError}). ` +
      'Credits were already refunded, so this is a history-label problem, not a money one.'
  );
  return false;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx scripts/tests/generation-terminal.test.ts`
Expected: `[generation-terminal] 11 checks passed`

- [ ] **Step 5: Register the test as a build gate**

In `package.json`, add to `scripts`:

```json
"test:generation-terminal": "npx tsx scripts/tests/generation-terminal.test.ts",
```

and extend `prebuild` to:

```json
"prebuild": "npm run check:invariants && npm run test:safety && npm run test:uploads && npm run test:plan-switch && npm run test:generation-terminal",
```

- [ ] **Step 6: Verify types and gates**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run test:generation-terminal`
Expected: `[generation-terminal] 11 checks passed`

- [ ] **Step 7: Commit**

```bash
git add lib/supabase/generation-writes.ts scripts/tests/generation-terminal.test.ts package.json
git commit -m "feat(credits): add failGeneration(), which refuses to close a row over an unsettled refund"
```

---

### Task 2: Convert `analysis` — all three shapes in one route

**Files:**
- Modify: `app/api/studios/analysis/route.ts:192`, `:213`, `:227`

**Interfaces:**
- Consumes: `failGeneration` from Task 1.
- Produces: the conversion pattern Tasks 3–6 repeat. `analysis` is done first because it carries one instance of each of shapes A, B and C.

- [ ] **Step 1: Add the import**

At the top of `app/api/studios/analysis/route.ts`, the existing import is:

```ts
import { finalizeGeneration } from '@/lib/supabase/generation-writes';
```

Change it to:

```ts
import { failGeneration, finalizeGeneration } from '@/lib/supabase/generation-writes';
```

If the file imports `insertAssets` too, keep it in the same braces, alphabetically.

- [ ] **Step 2: Convert site A (line 192, reserve failure)**

Replace:

```ts
    if (!reserveResult.success) {
      if (generation) await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      return NextResponse.json({ success: false, error: reserveResult.error === 'insufficient_credits' ? 'insufficient_credits' : 'credit_reservation_failed', required: creditCost }, { status: 402 });
    }
```

with:

```ts
    if (!reserveResult.success) {
      // Only a verdict from the RPC BODY proves nothing was charged.
      // `insufficient_credits` is such a verdict (017_reserve_credits.sql:31) — the
      // function ran and declined. Any other failure is a transport error, and the
      // reservation may well have committed with only the reply lost, so the row
      // must stay in the reconciler's window until the ledger is consulted.
      const nothingWasCharged = reserveResult.error === 'insufficient_credits';
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: nothingWasCharged,
          error: 'credit_reservation_failed',
        }, 'analysis');
      }
      return NextResponse.json({ success: false, error: nothingWasCharged ? 'insufficient_credits' : 'credit_reservation_failed', required: creditCost }, { status: 402 });
    }
```

- [ ] **Step 3: Convert site C (line 213, parse failure — the write must move)**

Replace:

```ts
      } catch {
        if (generation) {
          await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
        }
        const refundResult = await refundCredits({
          userId: user.id, amount: creditCost,
          description: 'Refund: analysis parse failure',
          generationId: generation?.id,
        });
        return NextResponse.json({
          success: false,
          error: refundAwareErrorCode(refundResult, 'generation_parse_failed'),
        }, { status: 500 });
      }
```

with (note the refund now runs **first**):

```ts
      } catch {
        // The refund runs BEFORE the terminal write, and the write is conditional on
        // it. Marking the row failed first — as this did — hands the credits nowhere
        // if the refund then fails: the row is already out of the reconciler's scan.
        const refundResult = await refundCredits({
          userId: user.id, amount: creditCost,
          description: 'Refund: analysis parse failure',
          generationId: generation?.id,
        });
        if (generation) {
          await failGeneration(supabase, generation.id, {
            creditsSettled: refundResult.success,
            error: 'generation_parse_failed',
          }, 'analysis');
        }
        return NextResponse.json({
          success: false,
          error: refundAwareErrorCode(refundResult, 'generation_parse_failed'),
        }, { status: 500 });
      }
```

- [ ] **Step 4: Convert site B (line 227, outer catch — already after the refund)**

Replace:

```ts
      if (generation) await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
```

with:

```ts
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_failed',
        }, 'analysis');
      }
```

- [ ] **Step 5: Verify no raw terminal write remains in this route**

Run: `grep -n "from('generations').update" app/api/studios/analysis/route.ts`
Expected: no output.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add app/api/studios/analysis/route.ts
git commit -m "fix(analysis): never close a generation over a refund that did not land"
```

---

### Task 3: Convert `plan` and `storyboard`

**Files:**
- Modify: `app/api/studios/plan/route.ts:172` (A), `:197` (C), `:221` (B)
- Modify: `app/api/studios/storyboard/route.ts:125` (A), `:148` (C), `:172` (B)

**Interfaces:**
- Consumes: `failGeneration` from Task 1; the three shapes as written in Task 2.
- Produces: nothing new.

Both routes have the identical three-site layout as `analysis`. Apply the same three shapes,
substituting the studio label (`'plan'` / `'storyboard'`) and keeping each site's existing
`description` string and error code exactly as they are.

- [ ] **Step 1: Add the import to both files**

In each of `app/api/studios/plan/route.ts` and `app/api/studios/storyboard/route.ts`, add
`failGeneration` to the existing `@/lib/supabase/generation-writes` import braces.

- [ ] **Step 2: Convert `plan:172` (shape A)**

Replace:

```ts
      if (generation) await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
```

inside the `if (!reserveResult.success) {` block with:

```ts
      const nothingWasCharged = reserveResult.error === 'insufficient_credits';
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: nothingWasCharged,
          error: 'credit_reservation_failed',
        }, 'plan');
      }
```

Then change the response's inline ternary `reserveResult.error === 'insufficient_credits' ? ... : ...`
to use `nothingWasCharged ? 'insufficient_credits' : 'credit_reservation_failed'` so the condition is
evaluated once.

- [ ] **Step 3: Convert `plan:197` (shape C — move the write below the refund)**

The write currently sits above `const refundResult = await refundCredits({...})` inside the parse
`catch`. Cut the `await supabase.from('generations').update({ status: 'failed' })...` line, and
immediately **after** the `refundCredits` call insert:

```ts
        if (generation) {
          await failGeneration(supabase, generation.id, {
            creditsSettled: refundResult.success,
            error: 'generation_parse_failed',
          }, 'plan');
        }
```

- [ ] **Step 4: Convert `plan:221` (shape B — gate in place)**

Replace:

```ts
      if (generation) await supabase.from('generations').update({ status: 'failed', error: 'generation_failed' }).eq('id', generation.id);
```

with:

```ts
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_failed',
        }, 'plan');
      }
```

- [ ] **Step 5: Apply Steps 2–4 to `storyboard` at lines 125, 148 and 172**

Identical edits, with `'storyboard'` as the studio label. Note `storyboard:148`'s `catch` block also
contains the `ScenesSchema.parse` failure path — leave the parse logic untouched; only the terminal
write moves below the refund.

**One extra thing at `storyboard:172`:** the existing guard reads

```ts
      if (!refundResult.success && !(genError instanceof PromptBlockedError)) {
```

Leave that guard exactly as it is. It controls the HTTP response, not the terminal write, and
changing it is Batch 2 work.

- [ ] **Step 6: Verify**

Run: `grep -n "from('generations').update" app/api/studios/plan/route.ts app/api/studios/storyboard/route.ts`
Expected: no output.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add app/api/studios/plan/route.ts app/api/studios/storyboard/route.ts
git commit -m "fix(plan,storyboard): never close a generation over a refund that did not land"
```

---

### Task 4: Convert `campaign` and `prompt-builder`

**Files:**
- Modify: `app/api/studios/campaign/route.ts:216` (A), `:258` (C), `:451` (B)
- Modify: `app/api/studios/prompt-builder/route.ts:84` (D)

**Interfaces:**
- Consumes: `failGeneration` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Add the import to both files**

Add `failGeneration` to the existing `@/lib/supabase/generation-writes` import braces in each file.

- [ ] **Step 2: Convert `campaign:216` (shape A)** — same edit as Task 3 Step 2, with `'campaign'`.

- [ ] **Step 3: Convert `campaign:258` (shape C)** — move the write below the `refundCredits` call in the parse `catch` and gate it:

```ts
        if (generation) {
          await failGeneration(supabase, generation.id, {
            creditsSettled: refundResult.success,
            error: 'generation_parse_failed',
          }, 'campaign');
        }
```

- [ ] **Step 4: Convert `campaign:451` (shape B, with a nuance)**

Here `refundResult` is declared as a ternary just above:

```ts
      const outstanding = creditCost - refundedSoFar;
      const refundResult: { success: boolean } = outstanding > 0
        ? await refundCredits({ /* ... unchanged ... */ })
        : { success: true };
```

The `: { success: true }` arm is correct for our purposes — `outstanding === 0` means everything owed
was already returned by the partial-refund site above, so the credits **are** settled. Replace:

```ts
      if (generation) await supabase.from('generations').update({ status: 'failed', error: 'generation_failed' }).eq('id', generation.id);
```

with:

```ts
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_failed',
        }, 'campaign');
      }
```

Do **not** alter the `outstanding` arithmetic — it exists to stop a second refund minting credits.

- [ ] **Step 5: Convert `prompt-builder:84` (shape D)**

This route charges nothing: there is no `reserveCredits` call anywhere in it, and the row is inserted
already `completed` (which is why the invariant exempts `.insert()`). Replace:

```ts
      if (generation) {
        await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      }
```

with:

```ts
      if (generation) {
        // Nothing was ever reserved for this route, so there is nothing owed and
        // the row is safe to close. Kept explicit rather than left as a raw write
        // so the terminal-write invariant has no exceptions to carve out.
        await failGeneration(supabase, generation.id, {
          creditsSettled: true,
          error: 'generation_parse_failed',
        }, 'prompt-builder');
      }
```

- [ ] **Step 6: Verify**

Run: `grep -n "from('generations').update" app/api/studios/campaign/route.ts app/api/studios/prompt-builder/route.ts`
Expected: no output.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add app/api/studios/campaign/route.ts app/api/studios/prompt-builder/route.ts
git commit -m "fix(campaign,prompt-builder): route terminal writes through failGeneration"
```

---

### Task 5: Convert `creator`, `edit` and `photoshoot`

**Files:**
- Modify: `app/api/studios/creator/route.ts:228` (A), `:296` (B), `:457` (B) — and `:352` **left alone**
- Modify: `app/api/studios/edit/route.ts:133` (A), `:166` (B)
- Modify: `app/api/studios/photoshoot/route.ts:168` (A), `:275` (C), `:347` (B)

**Interfaces:**
- Consumes: `failGeneration` from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Add the import to all three files**

Add `failGeneration` to the existing `@/lib/supabase/generation-writes` import braces.

- [ ] **Step 2: Convert the three shape-A reserve-failure sites**

`creator:228`, `edit:133`, `photoshoot:168` — the edit from Task 3 Step 2, with studio labels
`'creator'`, `'edit'`, `'photoshoot'`.

- [ ] **Step 3: Convert `creator:296` (shape B)**

Replace:

```ts
        await supabase.from('generations').update({ status: 'failed', error: 'all_variations_failed' }).eq('id', generation.id);
```

with:

```ts
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'all_variations_failed',
        }, 'creator');
```

- [ ] **Step 4: Rewrite `creator:352` to use the helper without changing its behaviour**

This site is **already correct** — it reads:

```ts
        if (refundResult.success) {
          await supabase.from('generations').update({ status: 'failed', error: 'all_variations_failed' }).eq('id', generation.id);
        }
```

Its long preceding comment is the origin of this whole plan's rule; **keep that comment**. Replace
only the three lines above with:

```ts
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'all_variations_failed',
        }, 'creator');
```

This is behaviour-preserving (the helper performs the same check) and is required so the Task 7
invariant has zero exceptions.

- [ ] **Step 5: Convert `creator:457`, `edit:166`, `photoshoot:347` (shape B)**

Each sits below a `refundResult` declaration. Replace each raw write with:

```ts
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_failed',
        }, 'creator');
      }
```

substituting the studio label. For `edit:166`, keep whatever error label that site currently writes —
if it writes none, omit the `error` key entirely.

Leave the `outstanding = totalCost - refundedSoFar` arithmetic in `creator:457` and
`photoshoot:347` untouched.

- [ ] **Step 6: Convert `photoshoot:275` (shape C)**

Move the write below the `refundCredits` call in that block and gate it:

```ts
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'all_shots_failed',
        }, 'photoshoot');
```

- [ ] **Step 7: Verify all nine routes are clean**

Run: `grep -rn "from('generations').update" app/api/studios/`
Expected: no output. This is the whole point of Tasks 2–5.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add app/api/studios/creator/route.ts app/api/studios/edit/route.ts app/api/studios/photoshoot/route.ts
git commit -m "fix(creator,edit,photoshoot): route terminal writes through failGeneration"
```

---

### Task 6: Convert `voiceover`

**Files:**
- Modify: `app/api/studios/voiceover/route.ts:137` (A), `:168` (B), `:188` (B)

**Interfaces:**
- Consumes: `failGeneration` from Task 1.
- Produces: a `voiceover` route with no raw terminal writes, which Task 8 then edits further.

Kept separate from Task 5 because Task 8 rewrites this route's settlement block, and reviewing the
two changes independently is the point of the split.

- [ ] **Step 1: Add the import**

Add `failGeneration` to the existing `@/lib/supabase/generation-writes` import braces.

- [ ] **Step 2: Convert `:137` (shape A)** — the edit from Task 3 Step 2, with `'voiceover'`.

- [ ] **Step 3: Convert `:168` and `:188` (shape B)**

Each sits below a `refundResult`. Replace each raw write with the gated helper call, preserving that
site's existing error label — `:188` writes `error: 'audio_upload_failed'`, so:

```ts
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'audio_upload_failed',
        }, 'voiceover');
```

- [ ] **Step 4: Verify**

Run: `grep -n "from('generations').update" app/api/studios/voiceover/route.ts`
Expected: no output.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/api/studios/voiceover/route.ts
git commit -m "fix(voiceover): route terminal writes through failGeneration"
```

---

### Task 7: Widen the build invariant so the raw writes cannot return

**Files:**
- Modify: `scripts/check-invariants.ts:299-335`

**Interfaces:**
- Consumes: all nine routes converted (Tasks 2–6).
- Produces: a build gate that fails on **any** raw terminal write in a studio route.

- [ ] **Step 1: Widen the rule**

In `scripts/check-invariants.ts`, in the `generationFinalized` invariant, change the title and the
status match. Keep the `id` as `'generation-finalized'` — it is referenced elsewhere.

Replace:

```ts
  title: "No studio route marks a generation 'completed' with a raw, unchecked update",
```

with:

```ts
  title: 'No studio route marks a generation terminal with a raw, unchecked update',
```

Replace:

```ts
        if (!/status:\s*['"]completed['"]/.test(stmt)) continue;
```

with:

```ts
        // BOTH terminal statuses, not just 'completed'. `failed` is equally terminal:
        // reconcile_orphaned_generations() scans `status IN ('pending','processing')`
        // (028:161), so writing EITHER value removes the row from the one automated
        // payout left. This rule matched only 'completed' until 2026-08-24, and 25
        // raw `status: 'failed'` writes sat behind that gap in all nine routes —
        // several of them executed BEFORE the refund they were supposed to follow.
        if (!/status:\s*['"](?:completed|failed)['"]/.test(stmt)) continue;
```

- [ ] **Step 2: Append to the `why` string**

Extend the existing `why` text with:

```ts
    'The same reasoning applies to `failed`, and more sharply: a route that ' +
    'marks a row failed when its refund did NOT land converts a recoverable ' +
    'failure into stranded credits, because the reconciler deliberately leaves ' +
    'a refund-failed row alone for the next run (028 ELSE branch) and can no ' +
    'longer see it. Use failGeneration(), which refuses to write unless the ' +
    'credits are provably settled.',
```

- [ ] **Step 3: Run the invariants and verify green**

Run: `npm run check:invariants`
Expected: all invariants pass. If `generation-finalized` reports violations, a site from Tasks 2–6
was missed — fix the route, never the rule, and never `--update-baseline` (this invariant is not
baseline-eligible).

- [ ] **Step 4: Prove the gate actually catches a regression**

Temporarily reintroduce one raw write. In `app/api/studios/edit/route.ts`, immediately inside the
outer `catch (genError) {`, add:

```ts
      await supabase.from('generations').update({ status: 'failed' }).eq('id', 'probe');
```

Run: `npm run check:invariants`
Expected: FAIL, naming `app/api/studios/edit/route.ts` and that line number under
`generation-finalized`.

This step is not optional. The rule it replaces was green for months while 25 violations sat behind
it; a gate nobody has watched fail is a gate nobody knows works.

- [ ] **Step 5: Remove the probe and confirm green again**

Delete the line added in Step 4.

Run: `npm run check:invariants`
Expected: all invariants pass.

Run: `git diff --stat app/api/studios/edit/route.ts`
Expected: no output — the probe left nothing behind.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-invariants.ts
git commit -m "test(invariants): fail the build on any raw terminal write, not just 'completed'"
```

---

### Task 8: Price voiceover on the script that is actually spoken

**Files:**
- Modify: `lib/credits/voiceover-costs.ts` (append `maxCharsForBudget`)
- Create: `scripts/tests/voiceover-budget.test.ts`
- Modify: `lib/ai/tts-router.ts` (`TTSInput`, `TTSResult`, `enhanceScript`, `generateTTS`)
- Modify: `app/api/studios/voiceover/route.ts` (the settlement block at ~195-235, and the `output` written at ~250)
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing from Tasks 1–7.
- Produces:
  - `maxCharsForBudget(creditCost: number, speed: number, planId: string): number`
  - `TTSInput` gains `maxScriptChars: number`
  - `TTSResult` gains `synthesizedChars: number` and `enhancementRejected: boolean`

**The defect.** `estimatedDuration` (`route:77`), the plan duration cap (`route:78`) and `creditCost`
(`route:106`) are all computed from `safeScript.length`. `generateTTS` then runs that script through
`enhanceScript()` — an LLM rewrite bounded only by `maxTokens: 1000` — and synthesises **the rewrite**.
The new length is never measured, never re-priced, never re-checked against the cap. On pro, business
and agency `toneEnabled` is true, so the rewrite fires on essentially every paid request.

**The fix, in one sentence:** give the rewrite a character budget it may not exceed, and settle the
charge against what was actually synthesised — reusing the settlement pattern the route already has
for provider fallback.

- [ ] **Step 1: Write the failing test**

Create `scripts/tests/voiceover-budget.test.ts`:

```ts
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

      if (budget < len) {
        // Only legitimate when the plan cap, not the price, is the binding limit.
        const cap = getVoiceoverConfig(plan).maxDurationSeconds;
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
        estimateVoiceoverDuration(budget, speed) <= getVoiceoverConfig(plan).maxDurationSeconds,
        true
      );
      check(
        `${plan}@${speed}/${len}: one character past the budget costs more or breaches the cap`,
        calculateVoiceoverCost(budget + 1, speed, plan) > quoted ||
          estimateVoiceoverDuration(budget + 1, speed) > getVoiceoverConfig(plan).maxDurationSeconds,
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx scripts/tests/voiceover-budget.test.ts`
Expected: FAIL — `does not provide an export named 'maxCharsForBudget'`.

- [ ] **Step 3: Implement `maxCharsForBudget`**

Append to `lib/credits/voiceover-costs.ts`:

```ts
/**
 * The longest script that still costs `creditCost` AND still fits the plan's
 * duration cap — i.e. the exact inverse of calculateVoiceoverCost, bounded by
 * maxDurationSeconds.
 *
 * WHY THIS EXISTS: the route prices and cap-checks the script the customer typed,
 * then tts-router hands an LLM REWRITE of it to the provider. Without a budget the
 * rewrite is bounded only by maxTokens, so a longer one delivers audio nobody paid
 * for and breaches the plan's own limit, and a shorter one charges for silence.
 *
 * Derivation, against calculateVoiceoverCost above:
 *   cost    = max(1, ceil(ceil((len/5)/speed) / unitSeconds)) * creditsPerUnit
 *   so      units      = cost / creditsPerUnit
 *           maxSeconds = units * unitSeconds
 *           len        <= maxSeconds * speed * 5
 * and independently the cap requires len <= maxDurationSeconds * speed * 5.
 * The smaller of the two wins; floored, because a partial character buys nothing.
 */
export function maxCharsForBudget(creditCost: number, speed: number, planId: string): number {
  const config = getVoiceoverConfig(planId);
  const units = Math.max(1, Math.floor(creditCost / config.creditsPerUnit));
  const secondsAffordable = units * config.unitSeconds;
  const secondsAllowed = Math.min(secondsAffordable, config.maxDurationSeconds);
  return Math.max(1, Math.floor(secondsAllowed * speed * 5));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx scripts/tests/voiceover-budget.test.ts`
Expected: a passing line, `[voiceover-budget] N checks passed`.

If any `one character past the budget` check fails, the floor/ceil boundary is off by one — fix
`maxCharsForBudget`, never the test.

- [ ] **Step 5: Register the test as a build gate**

In `package.json` add:

```json
"test:voiceover-budget": "npx tsx scripts/tests/voiceover-budget.test.ts",
```

and append ` && npm run test:voiceover-budget` to `prebuild`.

- [ ] **Step 6: Enforce the budget in the router**

In `lib/ai/tts-router.ts`:

Add to `TTSInput` (after `planId: string;`):

```ts
  /**
   * The longest script the caller has already priced and cap-checked. A dialect or
   * tone rewrite longer than this is discarded rather than synthesised — the
   * customer must never receive audio they were not quoted.
   */
  maxScriptChars: number;
```

Add to `TTSResult` (after `usedFallback: boolean;`):

```ts
  /** Length of the text actually handed to the provider. The route reprices on this. */
  synthesizedChars: number;
  /** True when a rewrite was produced but discarded for exceeding maxScriptChars. */
  enhancementRejected: boolean;
```

Change `enhanceScript`'s signature and its accept branch:

```ts
async function enhanceScript(
  script: string,
  dialect: string,
  tone: string,
  config: VoiceoverCostConfig,
  maxChars: number
): Promise<{ text: string; enhanced: boolean; rejected: boolean }> {
  if (!config.enhanceEnabled) {
    return { text: script, enhanced: false, rejected: false };
  }
```

Every existing `return { text: script, enhanced: false }` in this function becomes
`return { text: script, enhanced: false, rejected: false }`, and the accept branch becomes:

```ts
    const enhanced = result.text?.trim();
    if (enhanced && enhanced.length > 0) {
      // The price and the plan's duration cap were both computed from the script the
      // customer submitted. A rewrite longer than that budget would be audio they
      // were never quoted, so it is discarded and the original is spoken instead —
      // never truncated, which would cut an Arabic sentence mid-clause.
      if (enhanced.length > maxChars) {
        console.warn(
          `[tts] dialect/tone rewrite discarded: ${enhanced.length} chars exceeds the ${maxChars}-char budget quoted to the customer.`
        );
        return { text: script, enhanced: false, rejected: true };
      }
      return { text: enhanced, enhanced: true, rejected: false };
    }
```

In `generateTTS`, change the call and thread the new fields through:

```ts
  const { text: enhancedScript, enhanced, rejected } = await enhanceScript(
    input.script, input.dialect, input.tone, config, input.maxScriptChars
  );
```

Then, wherever `generateTTS` builds its returned object, add:

```ts
    synthesizedChars: enhancedScript.length,
    enhancementRejected: rejected,
```

- [ ] **Step 7: Reprice in the route**

In `app/api/studios/voiceover/route.ts`, pass the budget into the call (currently ~line 145):

```ts
      ttsResult = await generateTTS({
        script: safeScript,
        voice: input.voice,
        dialect: input.dialect,
        speed: input.speed,
        tone: input.tone,
        planId,
        maxScriptChars: maxCharsForBudget(creditCost, parseFloat(input.speed), planId),
      });
```

Add `maxCharsForBudget` to the existing `@/lib/credits/voiceover-costs` import.

Now replace the whole `if (ttsResult.usedFallback) { ... }` settlement block (currently ~lines
210-235) with a single settlement that accounts for **both** repricing inputs at once:

```ts
    // ONE settlement, not two. The charge can be wrong for two independent reasons —
    // the premium path was sold but the standard one ran (usedFallback), and the
    // script that was priced is not the script that was spoken (synthesizedChars) —
    // and they compose: a Pro customer can hit both in the same request. Computing
    // them as separate refunds would return the overlap twice.
    //
    // Math.min against creditCost: a delivered cost ABOVE the quote must never
    // become a second charge. The budget passed to generateTTS already makes that
    // arm unreachable (a rewrite over budget is discarded, not spoken), so this is
    // a belt on top of braces — the worst case is that we refund nothing.
    //
    // Must run BEFORE finalizeGeneration: marking the row terminal takes it out of
    // reconcile_orphaned_generations()'s scan window, i.e. out of reach of the one
    // thing that could still pay the customer back if this route dies mid-refund.
    const ratePlan = ttsResult.usedFallback ? FALLBACK_RATE_PLAN : planId;
    const deliveredCost = Math.min(
      calculateVoiceoverCost(ttsResult.synthesizedChars, parseFloat(input.speed), ratePlan),
      creditCost
    );
    const deliveredDuration = estimateVoiceoverDuration(
      ttsResult.synthesizedChars,
      parseFloat(input.speed)
    );

    let creditsCharged = creditCost;
    let balanceAfterRefund = reserveResult.newBalance;
    const overcharge = creditCost - deliveredCost;
    if (overcharge > 0) {
      const settlement = await refundCredits({
        userId: user.id, amount: overcharge,
        description: `Partial refund: voiceover delivered ${deliveredDuration}s at the ${ratePlan} rate (${overcharge} credits returned)`,
        generationId: generation.id,
      });
      // Only rewrite credits_used once the credits are actually back. Recording the
      // lower figure over a refund that did not land makes the row disagree with the
      // ledger, and every admin revenue number reads off this column — the failed
      // refund is already logged as `[credits][OWED]`.
      if (settlement.success) {
        creditsCharged = deliveredCost;
        balanceAfterRefund = settlement.newBalance;
      }
    } else {
      creditsCharged = deliveredCost;
    }
```

Then, in the `finalizeGeneration` patch below it, change the stored duration from the estimate off the
original script to the one off the synthesised script:

```ts
        output: {
          audioUrl,
          duration: deliveredDuration,
          provider: ttsResult.provider,
          enhanced: ttsResult.enhanced,
          enhancementRejected: ttsResult.enhancementRejected,
          mock: ttsResult.mock,
          usedFallback: ttsResult.usedFallback,
        },
```

Leave the `model:` correction line exactly as it is.

- [ ] **Step 8: Correct the duration the customer is shown**

The stored row is not the only place the old estimate leaks. The success response (~line 268) also
carries `duration: estimatedDuration`, and that is the value the player badge renders —
`app/[locale]/(dashboard)/voiceover/page.tsx:98` does `setAudioDuration(data.data.duration || 0)`.
Left unchanged, the customer would still be told the length of a script that was never spoken.

In the final `return NextResponse.json({ success: true, data: { ... } })`, replace:

```ts
        duration: estimatedDuration,
```

with:

```ts
        duration: deliveredDuration,
```

and confirm the same response object reports the settled figures — `creditsUsed: creditsCharged` and
`newBalance: balanceAfterRefund` — rather than `creditCost` / `reserveResult.newBalance`. If it
already does (the provider-fallback settlement introduced those variables), leave it alone.

- [ ] **Step 9: Check for other `generateTTS` callers**

Run: `grep -rn "generateTTS(" --include=*.ts --include=*.tsx . | grep -v node_modules`
Expected: the definition in `lib/ai/tts-router.ts` and exactly one caller, the voiceover route. If
any other caller exists, it needs `maxScriptChars` too — `tsc` will catch it in the next step.

- [ ] **Step 10: Verify**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm run test:voiceover-budget`
Expected: passing.

Run: `grep -n "estimatedDuration" app/api/studios/voiceover/route.ts`
Expected: only the plan-cap check near line 77-78. If `estimatedDuration` still reaches the `output`
object, Step 7 was not applied fully.

- [ ] **Step 11: Commit**

```bash
git add lib/credits/voiceover-costs.ts lib/ai/tts-router.ts app/api/studios/voiceover/route.ts scripts/tests/voiceover-budget.test.ts package.json
git commit -m "fix(voiceover): price and cap on the script actually spoken, not the one submitted"
```

---

### Task 9: Cap campaign's image loop at the nine posts it was priced for

**Files:**
- Modify: `app/api/studios/campaign/route.ts` (the `posts = arr.map(...)` line, ~254)

**Interfaces:**
- Consumes: the existing `EXPECTED_POSTS` constant (`campaign/route.ts:41`).
- Produces: nothing new.

**The defect.** The 12 credits decompose as 9 images × 1 credit + 3 for the text, and every refund is
already sized against `EXPECTED_POSTS`. But the image loop iterates `posts` unbounded
(`posts.map(async (post) => ...)`, ~line 281), so a model that returns 20 posts drives 20 paid image
generations against a 9-image price, writes 20 asset rows and stores 20 posts.

**Why capping at parse is safe:** the refund arithmetic reads `missingPosts = Math.max(0, EXPECTED_POSTS - posts.length)`,
which is already 0 for any `posts.length >= 9`. Truncating 20 → 9 leaves that term at 0, unchanged.
`failedImageCount` can then only count within the 9 that were sold.

- [ ] **Step 1: Write the failing check**

There is no unit-testable seam here — the truncation lives inside the route handler. Verify by
reading instead, and record the expectation as a comment in the code (Step 2).

Run: `sed -n '245,300p' app/api/studios/campaign/route.ts`
Expected: confirm `posts = arr.map((p: unknown) => CampaignPostSchema.parse(p));` has no `.slice`,
and that `posts.map(async (post) => {` drives `generateImage` with no bound.

- [ ] **Step 2: Cap at parse**

Replace:

```ts
      if (arr.length === 0) throw new Error('campaign returned no posts');
      posts = arr.map((p: unknown) => CampaignPostSchema.parse(p));
```

with:

```ts
      if (arr.length === 0) throw new Error('campaign returned no posts');
      // Sold as nine, priced as nine (12 credits = 9 images x 1 + 3 text), refunded
      // against nine. The image loop below iterates THIS array, so an over-delivering
      // model used to drive one paid image generation per extra post — 20 posts meant
      // 20 image calls, 20 asset rows and 20 stored posts against a 9-image price.
      // Truncating here keeps images, assets, `output` and the refund arithmetic all
      // measured against the same number. `missingPosts` is already Math.max(0, ...),
      // so this cannot change any refund.
      posts = arr.slice(0, EXPECTED_POSTS).map((p: unknown) => CampaignPostSchema.parse(p));
```

- [ ] **Step 3: Verify the refund arithmetic is untouched**

Run: `grep -n "missingPosts\|failedImageCount\|EXPECTED_POSTS" app/api/studios/campaign/route.ts`
Expected: `missingPosts` still reads `Math.max(0, EXPECTED_POSTS - posts.length)` and the
`refundAmount` expression is unchanged.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/api/studios/campaign/route.ts
git commit -m "fix(campaign): cap generated images at the nine posts the price is built on"
```

---

### Task 10: Refuse a storyboard shorter than the nine scenes it was sold as

**Files:**
- Modify: `app/api/studios/storyboard/route.ts:66`

**Interfaces:**
- Consumes: nothing.
- Produces: `EXPECTED_SCENES` constant in `storyboard/route.ts`, mirroring campaign's `EXPECTED_POSTS`.

**The defect.** `lib/ai/prompts/storyboard.ts:32` asks for "exactly 9 scenes", the price is 14 credits
— the most expensive text studio — and the schema is `z.array(SceneSchema).min(1)`. A model that
returns one scene is finalized `completed` and the full 14 credits are kept.

**Why refuse rather than partial-refund** (campaign's approach): a storyboard is a sequence whose
durations must sum to the requested video length, so three of nine scenes is not a partial deliverable
but an unusable one. Refusing routes it into the existing parse-failure branch, which already refunds
in full and returns `generation_parse_failed` — a code already in `KNOWN_ERROR_CODES`, so the customer
gets the right Arabic message and can retry at no cost.

- [ ] **Step 1: Confirm the current floor accepts one scene**

Run: `grep -n "ScenesSchema" app/api/studios/storyboard/route.ts`
Expected: `const ScenesSchema = z.array(SceneSchema).min(1);`

- [ ] **Step 2: Raise the floor to what was sold**

Replace:

```ts
const ScenesSchema = z.array(SceneSchema).min(1);
```

with:

```ts
/**
 * The number of scenes a storyboard is sold as and priced for: the prompt asks for
 * "exactly 9 scenes" (lib/ai/prompts/storyboard.ts:32) and the flat 14-credit price
 * is built on that. Mirrors campaign's EXPECTED_POSTS.
 */
const EXPECTED_SCENES = 9;

/**
 * `.min(1)` accepted one scene of the nine that were sold, marked the row completed
 * and kept all 14 credits. A storyboard is not a bag of independent items like a
 * campaign's posts — its scene durations must sum to the requested video length, so
 * a short response is unusable rather than partial. Refusing here routes it into the
 * existing parse-failure branch: full refund, `generation_parse_failed`, free retry.
 */
const ScenesSchema = z.array(SceneSchema).min(EXPECTED_SCENES);
```

- [ ] **Step 3: Verify it lands in the refund branch, not a 500**

Read the parse site (`storyboard/route.ts` ~140-160, as edited in Task 3). Confirm
`ScenesSchema.parse(...)` sits inside the `try` whose `catch` refunds and calls `failGeneration`. A
Zod failure throws, so a short response now takes exactly that path.

Run: `sed -n '138,162p' app/api/studios/storyboard/route.ts`
Expected: `scenes = ScenesSchema.parse(JSON.parse(jsonMatch[0]));` inside the `try`, with the
`refundCredits` + `failGeneration` sequence in its `catch`.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/api/studios/storyboard/route.ts
git commit -m "fix(storyboard): refuse a response shorter than the nine scenes sold for 14 credits"
```

---

### Task 11: Stop the plan completeness gate passing on a section nobody renders

**Files:**
- Modify: `app/api/studios/plan/route.ts` (the `.refine(...)` at ~92-105)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

**The defect.** The gate is `sections.some(hasPrintableText)` — any ONE section suffices — and `kpis`
is in that list. The plan page renders exactly four tabs: `objectives`, `channels`, `calendar`,
`budget` (`plan/page.tsx:146-149`). There is no `kpis` tab and no `generatePlanPdf`. So a response
carrying only `kpis` is finalized `completed`, keeps 5 credits, and the customer sees four empty tabs
and no error.

- [ ] **Step 1: Confirm no surface renders `kpis`**

Run: `grep -n "activeTab === " "app/[locale]/(dashboard)/plan/page.tsx"`
Expected: exactly four branches — `objectives`, `channels`, `calendar`, `budget`. No `kpis`.

Run: `grep -rn "generatePlanPdf" lib/ lib/export/`
Expected: no output — plan has no PDF export, so nothing else consumes `kpis` either.

- [ ] **Step 2: Drop the unrendered section from the gate**

Replace:

```ts
    const sections: unknown[] = [
      p.objectives.map((o) => [o.goal, o.kpi, o.target]),
      p.channels.map((c) => [c.name, c.strategy]),
      p.calendar.map((w) => [w.content, w.channel]),
      p.kpis.map((k) => [k.metric, k.target, k.tracking]),
      p.budget?.breakdown.map((b) => [b.item, b.amount]) ?? [],
    ];
    return sections.some(hasPrintableText);
  }, 'model returned no usable plan sections');
```

with:

```ts
    // Only sections the customer can actually SEE may vouch for a plan. The page
    // renders exactly four tabs — objectives, channels, calendar, budget
    // (plan/page.tsx:146-149) — and there is no generatePlanPdf, so nothing else
    // consumes the parsed object either.
    //
    // `kpis` used to sit in this list. It is parsed, stored and never rendered
    // anywhere, so a response carrying nothing but kpis passed the gate, was
    // finalized `completed`, kept the 5 credits, and left the customer looking at
    // four empty tabs with no error. Do not add a section here without first
    // pointing at the code that prints it.
    const sections: unknown[] = [
      p.objectives.map((o) => [o.goal, o.kpi, o.target]),
      p.channels.map((c) => [c.name, c.strategy]),
      p.calendar.map((w) => [w.content, w.channel]),
      p.budget?.breakdown.map((b) => [b.item, b.amount]) ?? [],
    ];
    return sections.some(hasPrintableText);
  }, 'model returned no usable plan sections');
```

Leave the `kpis` field in `PlanSchema` itself — removing it would drop the data from
`generations.output` for no benefit, and rendering it is Batch 3 work.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `grep -n "p.kpis" app/api/studios/plan/route.ts`
Expected: no output. The schema field stays; only the gate's reference goes.

- [ ] **Step 4: Commit**

```bash
git add app/api/studios/plan/route.ts
git commit -m "fix(plan): gate completeness on rendered sections, not on the unrendered kpis block"
```

---

### Task 12: Run every gate and record what is now true

**Files:**
- Modify: `CLAUDE.md` (the "Project Status" section)

**Interfaces:**
- Consumes: all previous tasks.
- Produces: documentation that names file:line, per this repo's own rule.

- [ ] **Step 1: Run the full gate set**

```bash
npx tsc --noEmit
npm run lint
npm run check:invariants
npm run test:safety
npm run test:uploads
npm run test:plan-switch
npm run test:generation-terminal
npm run test:voiceover-budget
```

Expected: all clean. Record the actual counts each test prints — they go in the doc, not
approximations.

- [ ] **Step 2: Run a production build**

Run: `npm run build`
Expected: completes. `prebuild` runs all gates first, so this also proves the new tests are wired in.

- [ ] **Step 3: Confirm no raw terminal write survives anywhere**

Run: `grep -rn "from('generations').update" app/api/studios/`
Expected: no output.

- [ ] **Step 4: Add a section to `CLAUDE.md`**

Insert after the "Launch readiness" section, following the existing table style. Write only what the
commands in Step 1 actually printed — this repo's rule is that a ✅ must name a file:line.

```markdown
### Studio money correctness — fixed 2026-08-24

An audit of all nine studios (194 agents, 15 review units, every finding adversarially
verified) produced 79 distinct defects and **no blockers**. This round closes the money
half. The single largest finding was structural:

| Defect | State |
|--------|-------|
| The `generation-finalized` invariant matched only `status: 'completed'`, so **25 raw `status: 'failed'` writes** across all nine routes passed the build untouched | ✅ fixed — the rule now matches any terminal status, proved by reintroducing one |
| A route that marked a row `failed` when its refund had NOT landed removed it from `reconcile_orphaned_generations()`'s `status IN ('pending','processing')` window — the last automated payout — stranding the credits | ✅ fixed — `failGeneration()` refuses to write unless the credits are provably settled |
| `analysis:213`, `plan:197`, `storyboard:148`, `campaign:258`, `photoshoot:275` wrote `failed` **before** `refundCredits()` was even called | ✅ fixed — the refund now runs first and the write is conditional on it |
| On a reservation failure the row was closed regardless of cause; if `reserve_credits` committed and only the reply was lost, the customer was charged with **no refund attempted and no `[credits][OWED]` line** | ✅ fixed — only `insufficient_credits`, a verdict from the RPC body (`017:31`), proves nothing was charged |
| Voiceover priced and duration-capped on the submitted script while synthesising an LLM rewrite of it that was never re-measured | ✅ fixed — `maxCharsForBudget()` bounds the rewrite; one settlement reprices on `synthesizedChars` and the delivered rate |
| Campaign generated one paid image per post the model returned, uncapped, against a nine-image price | ✅ fixed — truncated to `EXPECTED_POSTS` at parse |
| Storyboard's schema accepted 1 of the 9 scenes sold for 14 credits | ✅ fixed — `.min(EXPECTED_SCENES)`, routed into the existing full-refund branch |
| Plan's completeness gate passed on `kpis` alone — a section no screen renders and no PDF exports | ✅ fixed — the gate now lists only rendered sections |

**Why `failGeneration()` refuses rather than retries harder.** Leaving a row in
`processing` costs at most one reconciler tick and cannot double-pay: 028 derives what
it owes from the ledger (`SUM(usage) - SUM(refund)`, 028:169-176), so a refund that did
land leaves nothing owed and the row is skipped untouched. Writing `failed` over a
refund that did not land is unrecoverable by any automated path.

**Precedent:** `creator/route.ts:352` already implemented this rule, alone, with the
comment that this round generalised to the other 24 sites.

**Verification:** `tsc` clean, `lint` clean, invariants 12/12,
`[generation-terminal] 11`, `[voiceover-budget] N`, `[safety] 72`, `[uploaded-url] 37`,
`[plan-switch] 15`, clean production build. The widened invariant was proved by
reintroducing a raw write in `edit/route.ts` and confirming the build failed.

**Not covered by this round** (see the audit report, Batches 2–4): campaign has no
retrieval path so a reload destroys its nine captions; the competitor-analysis PDF has
no competitors section; seven of nine routes still return English prose where a
registered error code belongs; eight of nine still hardcode `model: 'gemini'`.
```

Replace `[voiceover-budget] N` with the real number the test printed in Step 1.

- [ ] **Step 5: Update the Commands section**

In `CLAUDE.md`, the build-gates block currently lists four commands. Add the two new ones:

```bash
npm run test:generation-terminal  # 11 checks over the terminal-write rule
npm run test:voiceover-budget     # N checks proving the char budget inverts the price
```

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the studio money-correctness round against verified output"
```

---

## Self-Review

**Spec coverage.** Batch 1 lists five items; all five have tasks — `failGeneration()` + widened
invariant (Tasks 1–7), voiceover repricing (Task 8), campaign image cap (Task 9), storyboard scene
floor (Task 10), plan completeness gate (Task 11). Pattern 01's sharpest edge (the reservation-failure
path that charges without logging) is covered by shape A in Tasks 2–6.

**Deliberately out of scope**, and belonging to later batches — recorded so nobody treats their
absence as an oversight:
- Campaign retrieval, the analysis PDF's missing competitors section, storyboard's 80-character
  truncation (Batch 2).
- Structured output, prompt cleanup, `edit`'s missing prompt (Batch 3).
- `withStudio()`, sanitize-at-the-schema-boundary, registered error codes, `model: result.model`,
  provider timeouts (Batch 4). **Note:** Batch 4's sanitization work depends on nothing here, but
  Pattern 02's `storyboard` finding (it never sanitizes in-route) is a *security* item, not a money
  one, and is intentionally not fixed in this plan.

**Type consistency.** `failGeneration(supabase, generationId, { creditsSettled, error? }, studio)` is
used with that exact shape in Tasks 2–6. `maxCharsForBudget(creditCost, speed, planId)` is defined in
Task 8 Step 3 and called in Task 8 Step 7. `TTSResult.synthesizedChars` / `.enhancementRejected` are
added in Step 6 and read in Step 7. `EXPECTED_SCENES` is defined and used in the same edit.

**Placeholder scan.** Every code step carries real code. Two steps intentionally verify by reading
rather than by a unit test (Task 9 Step 1, Task 11 Step 1) because the logic has no importable seam —
each names the exact command and the exact expected output.

**One risk worth flagging to the reviewer.** Task 8 changes what `duration` means for voiceover: it
becomes the length of the audio actually produced, where previously it was an estimate off the
submitted script. Rows written before 2026-08-24 keep the old meaning, so any future report over
`generations.output.duration` will be reading two definitions across that boundary.

Verified while writing this plan, so the reviewer does not have to re-derive it: the field has
exactly one reader today — `app/[locale]/(dashboard)/voiceover/page.tsx:98`, which does
`setAudioDuration(data.data.duration || 0)` against the **HTTP response**, not the stored row. That is
why Task 8 Step 8 exists: changing only `output.duration` would have left the badge under the player
still quoting a script that was never spoken. Nothing aggregates the stored column.
