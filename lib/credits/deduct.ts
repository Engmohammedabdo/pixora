import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * The credit RPCs are SECURITY DEFINER and take p_user_id from the caller with
 * no auth.uid() check of their own. Migration 022 therefore revokes EXECUTE from
 * anon/authenticated and grants it to service_role only, so they can no longer be
 * invoked straight from the browser.
 *
 * Consequently these helpers must NOT accept a caller-supplied client: a
 * user-context client would now be rejected by Postgres. They build their own
 * service-role client instead.
 *
 * Safety contract for callers: every route that calls these has already resolved
 * the session via supabase.auth.getUser() and passes THAT user's id. Never pass a
 * user id taken from request input.
 */
let clientPromise: ReturnType<typeof createServiceRoleClient> | null = null;

function getServiceClient(): ReturnType<typeof createServiceRoleClient> {
  // Cache the client, but never cache a REJECTION: createServiceRoleClient()
  // throws when the env vars are missing, and a memoized rejected promise would
  // poison every later call for the lifetime of the process — turning one cold
  // start into permanently broken credits.
  clientPromise ??= createServiceRoleClient().catch((err: unknown) => {
    clientPromise = null;
    throw err;
  });
  return clientPromise;
}

interface CreditParams {
  /** Must come from the verified session, never from request input. */
  userId: string;
  amount: number;
  studio: string;
  description: string;
  generationId?: string;
}

interface CreditResult {
  success: boolean;
  newBalance: number;
  error?: string;
}

/**
 * @deprecated Use reserveCredits() instead for studio routes.
 * Kept for backward compatibility (admin, webhooks, etc).
 */
export async function deductCredits({
  userId, amount, studio, description, generationId,
}: CreditParams): Promise<CreditResult> {
  const supabase = await getServiceClient();
  const { data, error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_studio: studio,
    p_description: description,
    ...(generationId ? { p_generation_id: generationId } : {}),
  });

  if (error) return { success: false, newBalance: 0, error: error.message };
  const result = data as { success: boolean; new_balance?: number; error?: string } | null;
  if (!result || !result.success) return { success: false, newBalance: 0, error: result?.error || 'deduction_failed' };
  return { success: true, newBalance: result?.new_balance || 0 };
}

/**
 * Reserve credits BEFORE generation (atomic check + deduct).
 * If generation fails, call refundCredits() to return them.
 * Eliminates the check→generate→deduct race condition.
 */
export async function reserveCredits({
  userId, amount, studio, description, generationId,
}: CreditParams): Promise<CreditResult> {
  if (amount <= 0) return { success: true, newBalance: 0 };

  const supabase = await getServiceClient();
  const { data, error } = await supabase.rpc('reserve_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_studio: studio,
    p_description: description,
    ...(generationId ? { p_generation_id: generationId } : {}),
  });

  if (error) return { success: false, newBalance: 0, error: error.message };
  const result = data as { success: boolean; new_balance?: number; error?: string } | null;
  if (!result || !result.success) return { success: false, newBalance: 0, error: result?.error || 'reservation_failed' };
  return { success: true, newBalance: result?.new_balance || 0 };
}

/** Transient Postgres/PostgREST conditions worth one more attempt. */
const RETRYABLE_REFUND_ERRORS = [
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available
  '57014', // query_canceled (statement timeout)
  '08006', // connection_failure
  '08003', // connection_does_not_exist
];

const isRetryableRefundError = (code: unknown, message: string): boolean =>
  (typeof code === 'string' && RETRYABLE_REFUND_ERRORS.includes(code)) ||
  /timeout|deadlock|connection|fetch failed|network/i.test(message);

/**
 * Refund credits when a generation fails AFTER reservation.
 *
 * WHY THIS RETRIES AND LOGS SO LOUDLY: a refund that does not land means the
 * user paid credits and received nothing. Every one of the eight studio routes
 * calls this as a bare `await refundCredits(...)` and discards the result, so
 * this function is the ONLY place that can protect the user's balance — a
 * failure here is otherwise invisible to them. Two things follow from that:
 *
 *  1. Transient failures (deadlock, lock timeout, dropped connection) get one
 *     bounded retry. That is where most real-world refund failures live, and
 *     retrying costs nothing because refund_credits is called once per failed
 *     generation, not in a loop.
 *  2. A refund that still will not land is logged as a single structured,
 *     greppable line so it is recoverable. Grep production logs for
 *     `[credits][OWED]` to find every user who is owed credits, with the amount
 *     and generation id needed to reconcile them by hand.
 *
 * This does NOT make refunds transactional. If the process is killed between
 * reserveCredits() and the caller's catch block, no refund is attempted at all —
 * closing that requires a reconciliation job over reserved-but-unfinished
 * generations, which is tracked separately.
 */
export async function refundCredits({
  userId, amount, description, generationId,
}: Omit<CreditParams, 'studio'>): Promise<CreditResult> {
  if (amount <= 0) return { success: true, newBalance: 0 };

  const supabase = await getServiceClient();

  const attempt = async (): Promise<CreditResult & { retryable: boolean }> => {
    const { data, error } = await supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_description: description,
      ...(generationId ? { p_generation_id: generationId } : {}),
    });

    if (error) {
      return {
        success: false, newBalance: 0, error: error.message,
        retryable: isRetryableRefundError((error as { code?: string }).code, error.message),
      };
    }

    const result = data as { success: boolean; new_balance?: number; error?: string } | null;
    if (!result?.success) {
      // A rejection from the function body is a decision, not a glitch — the
      // same call will be rejected again, so do not retry it.
      return { success: false, newBalance: 0, error: result?.error || 'refund_failed', retryable: false };
    }

    return { success: true, newBalance: result.new_balance || 0, retryable: false };
  };

  let outcome = await attempt();
  if (!outcome.success && outcome.retryable) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    outcome = await attempt();
  }

  if (!outcome.success) {
    // Single line, machine-parseable, newline-free: this is the record that a
    // user is owed credits. Alert on it.
    console.error(`[credits][OWED] ${JSON.stringify({
      userId, amount, generationId: generationId ?? null,
      description: description.replace(/[\r\n]+/g, ' '),
      reason: (outcome.error ?? 'unknown').replace(/[\r\n]+/g, ' '),
      at: new Date().toISOString(),
    })}`);
  }

  return { success: outcome.success, newBalance: outcome.newBalance, error: outcome.error };
}
