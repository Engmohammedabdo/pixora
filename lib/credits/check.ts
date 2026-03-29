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
    .select('credits_balance, purchased_credits')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return { hasEnough: false, currentBalance: 0, required: amount };
  }

  const totalBalance = (data.credits_balance || 0) + (data.purchased_credits || 0);

  return {
    hasEnough: totalBalance >= amount,
    currentBalance: totalBalance,
    required: amount,
  };
}
