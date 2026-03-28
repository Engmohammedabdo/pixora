import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

interface CheckCreditsParams {
  supabase: SupabaseClient<Database>;
  userId: string;
  amount: number;
}

interface CheckCreditsResult {
  hasEnough: boolean;
  currentBalance: number;
  required: number;
}

export async function checkCredits({
  supabase,
  userId,
  amount,
}: CheckCreditsParams): Promise<CheckCreditsResult> {
  const { data, error } = await supabase
    .from('profiles')
    .select('credits_balance')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return { hasEnough: false, currentBalance: 0, required: amount };
  }

  return {
    hasEnough: data.credits_balance >= amount,
    currentBalance: data.credits_balance,
    required: amount,
  };
}
