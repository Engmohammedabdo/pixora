import type { SupabaseClient } from '@supabase/supabase-js';

export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  maxRequests: number = 20,
  windowMs: number = 60000
): Promise<boolean> {
  const windowStart = new Date(Date.now() - windowMs).toISOString();
  const { count } = await supabase
    .from('generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart);
  return (count || 0) < maxRequests;
}
