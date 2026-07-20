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

/**
 * Refund credits when generation fails AFTER reservation.
 */
export async function refundCredits({
  userId, amount, description, generationId,
}: Omit<CreditParams, 'studio'>): Promise<CreditResult> {
  if (amount <= 0) return { success: true, newBalance: 0 };

  const supabase = await getServiceClient();
  const { data, error } = await supabase.rpc('refund_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description,
    ...(generationId ? { p_generation_id: generationId } : {}),
  });

  // A failed refund means the user paid credits for nothing. Previously this
  // returned success:true unconditionally, so a refund that the database
  // rejected was reported as if it had worked and the loss was invisible.
  if (error) {
    console.error('[credits] refund RPC failed', { userId, amount, generationId, error: error.message });
    return { success: false, newBalance: 0, error: error.message };
  }

  const result = data as { success: boolean; new_balance?: number; error?: string } | null;
  if (!result?.success) {
    console.error('[credits] refund rejected — user is owed credits', {
      userId, amount, generationId, reason: result?.error ?? 'unknown',
    });
    return { success: false, newBalance: 0, error: result?.error || 'refund_failed' };
  }

  return { success: true, newBalance: result.new_balance || 0 };
}
