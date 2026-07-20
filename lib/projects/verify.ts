import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

/**
 * Resolve a client-supplied project id into a trusted one.
 *
 * `projectId` arrives in the request body, so it must never be written to
 * `generations.project_id` unchecked — that would let a user file work into
 * someone else's client workspace, which is the exact isolation agencies pay for.
 *
 * Returns the verified id, or null when no project was requested.
 * Returns `false` when the project does not exist or is not the caller's, so the
 * route can answer 404 without this helper needing to know about HTTP.
 */
export async function resolveProjectId(
  supabase: SupabaseClient<Database>,
  userId: string,
  projectId: string | undefined | null
): Promise<string | null | false> {
  if (!projectId) return null;

  const { data } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single();

  return data?.id ?? false;
}
