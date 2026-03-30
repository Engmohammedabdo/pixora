import { createClient } from '@supabase/supabase-js';

// Creates a Supabase client with service_role key (bypasses RLS)
// ONLY use this in admin API routes — never expose to frontend
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase env vars not configured');
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
