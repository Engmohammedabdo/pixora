import { createBrowserClient as createClient } from '@supabase/ssr';
import type { Database } from './types';

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase not configured');
  }
  return createClient<Database>(url, key);
}
