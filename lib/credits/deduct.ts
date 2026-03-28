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
 * Atomic credit deduction using Supabase RPC.
 * Uses SELECT FOR UPDATE inside the DB function to prevent race conditions.
 */
export async function deductCredits({
  supabase,
  userId,
  amount,
  studio,
  description,
  generationId,
}: DeductCreditsParams): Promise<DeductCreditsResult> {
  const { data, error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_studio: studio,
    p_description: description,
    ...(generationId ? { p_generation_id: generationId } : {}),
  });

  if (error) {
    return { success: false, newBalance: 0, error: error.message };
  }

  const result = data as { success: boolean; new_balance?: number; error?: string } | null;

  if (!result || !result.success) {
    return {
      success: false,
      newBalance: 0,
      error: result?.error || 'deduction_failed',
    };
  }

  return {
    success: true,
    newBalance: result?.new_balance || 0,
  };
}
