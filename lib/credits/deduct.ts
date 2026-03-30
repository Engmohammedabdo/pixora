import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

interface DeductCreditsParams {
  supabase: SupabaseClient<Database>;
  userId: string;
  amount: number;
  studio: string;
  description: string;
  generationId?: string;
}

interface DeductCreditsResult {
  success: boolean;
  newBalance: number;
  error?: string;
}

/**
 * @deprecated Use reserveCredits() instead for studio routes.
 * Kept for backward compatibility (admin, webhooks, etc).
 */
export async function deductCredits({
  supabase, userId, amount, studio, description, generationId,
}: DeductCreditsParams): Promise<DeductCreditsResult> {
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
  supabase, userId, amount, studio, description, generationId,
}: DeductCreditsParams): Promise<DeductCreditsResult> {
  if (amount <= 0) return { success: true, newBalance: 0 };

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
  supabase, userId, amount, description, generationId,
}: Omit<DeductCreditsParams, 'studio'>): Promise<DeductCreditsResult> {
  if (amount <= 0) return { success: true, newBalance: 0 };

  const { data, error } = await supabase.rpc('refund_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description,
    ...(generationId ? { p_generation_id: generationId } : {}),
  });

  if (error) return { success: false, newBalance: 0, error: error.message };
  const result = data as { success: boolean; new_balance?: number } | null;
  return { success: true, newBalance: result?.new_balance || 0 };
}
