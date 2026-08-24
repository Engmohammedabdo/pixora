import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

type Client = SupabaseClient<Database>;

/**
 * The two writes every studio performs after the work is already delivered, and
 * that every studio performed WITHOUT LOOKING AT THE RESULT.
 *
 * ── WHY THE COMPLETION UPDATE IS A MONEY WRITE, NOT A BOOKKEEPING ONE ──────
 * `pg_cron` runs `reconcile_orphaned_generations()` every 15 minutes. Its scan
 * is (migration 028:160-162):
 *
 *     WHERE g.status IN ('pending','processing')
 *       AND g.created_at < now() - p_older_than
 *
 * A generation leaves that window only by being marked terminal. So a silently
 * failed `update({ status: 'completed' })` does not merely leave a row looking
 * wrong in history — it leaves delivered, paid-for work sitting in the
 * reconciler's scan, and the reconciler refunds it from the ledger. The route
 * meanwhile returned `success: true` with the images attached. That is the same
 * defect the round-3 lifecycle guard exists to prevent, arriving through the
 * front door instead: not a customer rewinding a generation, but the product
 * failing to move it forward and never noticing.
 *
 * ── WHY THE ASSET INSERT MATTERS ───────────────────────────────────────────
 * `assets` is what ملفاتي reads. A rejected insert means the customer paid, saw
 * their output once in the response, and can never find it again. Migration 040
 * added a BEFORE INSERT trigger to `assets`, and creator/photoshoot/campaign
 * insert MANY rows in one statement — so one off-shape URL takes the whole
 * batch down with it. That is precisely the risk 040's own header called out
 * and could not fix from the database side.
 */

interface FinalizePatch {
  status: 'completed';
  output?: Record<string, unknown> | null;
  credits_used?: number;
  /** voiceover corrects this once the provider that actually served is known. */
  model?: string;
}

/**
 * Mark a generation terminal, and keep trying until it is or we are out of
 * moves. Returns true when the row is confirmed out of the reconciler's window.
 *
 * `.select('id')` is not decoration: an UPDATE that matches no row — an RLS
 * filter, a wrong id — reports no error at all, so "no error" and "it worked"
 * are different claims and only the returned row proves the second one.
 *
 * Four attempts, shedding the least valuable field first:
 *   1. the full patch;
 *   2. the full patch again, because the common failures here are transient;
 *   3. everything except `output`. That column is JSONB built from model results
 *      and is the one part of the payload that can be rejected on its own merits
 *      — a campaign with nine inline images used to write megabytes into it.
 *      `credits_used` is kept here on purpose: creator, campaign, photoshoot and
 *      voiceover rewrite it downward after a partial refund, and dropping it
 *      leaves the ledger claiming the customer paid the full reservation, which
 *      overstates every admin revenue figure derived from this column;
 *   4. status alone.
 *
 * Losing the stored copy of an output the customer already received in the HTTP
 * response is a far smaller harm than leaving the row refundable.
 */
export async function finalizeGeneration(
  supabase: Client,
  generationId: string,
  patch: FinalizePatch,
  studio: string
): Promise<boolean> {
  const { output: _output, ...withoutOutput } = patch;
  const attempts: Array<{ label: string; payload: FinalizePatch }> = [
    { label: 'full', payload: patch },
    { label: 'full-retry', payload: patch },
    { label: 'without-output', payload: withoutOutput },
    { label: 'status-only', payload: { status: patch.status } },
  ];

  let lastError = '';
  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from('generations')
      .update(attempt.payload)
      .eq('id', generationId)
      .select('id');

    if (!error && data && data.length > 0) {
      if (attempt.label !== 'full') {
        console.error(
          `[generations] ${studio} ${generationId}: completion needed the ${attempt.label} path (previous failure: ${lastError})`
        );
      }
      return true;
    }
    lastError = error ? `${error.code ?? ''} ${error.message}`.trim() : 'update matched no row';
  }

  // Nothing further can be done from inside this request. Loud on purpose: the
  // customer has their output, the credits are spent, and the reconciler will
  // hand those credits back in at most 15 minutes unless someone intervenes.
  console.error(
    `[generations] REFUND RISK — ${studio} ${generationId} could not be marked completed after 4 attempts (${lastError}). ` +
      'The row remains in reconcile_orphaned_generations()\'s scan window and delivered work will be refunded.'
  );
  return false;
}

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
 * (`SUM(usage) - SUM(refund)`, 028:169-176), so a refund that DID land leaves
 * nothing owed and the row is skipped untouched (028's `owed <= 0` branch).
 *
 * This is the rule `app/api/studios/creator/route.ts` already followed at exactly
 * one of its four terminal-write sites.
 *
 * Returns true only when the row is confirmed terminal. `false` means either
 * "deliberately left for the reconciler" or "could not write" — in both the caller
 * must not claim the generation was closed out.
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

  // Same discipline as finalizeGeneration: an UPDATE that matches no row reports
  // no error at all, so only a returned row proves the write landed.
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

type AssetInsert = Database['public']['Tables']['assets']['Insert'];

/**
 * Insert asset rows, and never lose the whole batch to one bad row.
 *
 * On a batch failure each row is retried alone, so a URL migration 040 refuses
 * costs the customer that one asset instead of all nine. Returns how many rows
 * actually landed; the caller reports success either way, because the output is
 * already delivered and a 500 here would only invite a second, double-charged
 * attempt.
 */
export async function insertAssets(
  supabase: Client,
  candidates: AssetInsert[],
  studio: string
): Promise<number> {
  // An asset row whose url is empty is a tile in ملفاتي that points at nothing:
  // it cannot be previewed, downloaded or exported. `edit` writes `result.url || ''`
  // unconditionally, and migration 040 deliberately permits '' so that write does
  // not fail — which means the only place this can be caught is here.
  const rows = candidates.filter((row) => typeof row.url === 'string' && row.url.length > 0);
  if (rows.length < candidates.length) {
    console.error(
      `[assets] ${studio}: skipped ${candidates.length - rows.length} asset row(s) with an empty url — the generation produced no file.`
    );
  }
  if (rows.length === 0) return 0;

  const { data, error } = await supabase.from('assets').insert(rows).select('id');
  if (!error) return data?.length ?? rows.length;

  // Only a rejection the DATABASE reported is safe to retry row by row. A
  // multi-row INSERT is one statement, so a check violation rolls all of it back
  // and nothing was written — retrying cannot duplicate. A transport failure is
  // different: the statement may well have committed and only the response was
  // lost, and there is no unique constraint on `assets` to catch a second copy.
  // PostgREST errors carry a five-character SQLSTATE; a fetch failure does not.
  const sqlstate = typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code);
  if (!sqlstate) {
    console.error(
      `[assets] ${studio}: batch insert of ${rows.length} row(s) failed without a database verdict (${error.message}). ` +
        'Not retrying — the rows may already be committed.'
    );
    return 0;
  }

  console.error(
    `[assets] ${studio}: batch insert of ${rows.length} row(s) rejected (${error.code} ${error.message}). Retrying individually.`
  );

  let inserted = 0;
  for (const row of rows) {
    const { error: rowError } = await supabase.from('assets').insert(row);
    if (rowError) {
      console.error(
        `[assets] ${studio}: row rejected (${rowError.code ?? ''} ${rowError.message}) for url ${String(row.url).slice(0, 120)}`
      );
      continue;
    }
    inserted += 1;
  }

  if (inserted < rows.length) {
    console.error(
      `[assets] ${studio}: ${rows.length - inserted} of ${rows.length} asset row(s) were not saved — that output is unreachable from the assets library.`
    );
  }
  return inserted;
}
