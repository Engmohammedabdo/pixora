import { createBrowserClient as createClient } from '@supabase/ssr';
import type { Database } from './types';

export function createBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!url || !key) {
    // Return a mock-like client that won't crash during dev without env vars
    return createClient<Database>(
      'https://placeholder.supabase.co',
      'placeholder-key'
    );
  }

  return createClient<Database>(url, key);
}
