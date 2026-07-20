import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

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

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

function createRateLimitStoreClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase service role credentials not configured');
  }
  // Untyped on purpose: `system_settings` predates the generated Database
  // types (lib/admin/db.ts's createAdminClient does the same) and the typed
  // client would fail to compile against a table outside that schema.
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Generic keyed rate limiter for routes with no `generations` row to count
 * against — most notably unauthenticated/pre-auth requests, where
 * checkRateLimit() above cannot apply: there is no user id to key on, and a
 * generation count says nothing about how many *other* requests a caller is
 * making (an idle account hammering a non-generation endpoint would count
 * as zero forever).
 *
 * Persists a rolling window counter in the existing `system_settings`
 * key/value table — the same table lib/admin/auth.ts's login rate limiter
 * already uses for exactly this purpose — so this needs no new table or
 * migration. Uses a service-role client internally because system_settings
 * has no anon/authenticated grants as of 022_privilege_lockdown.sql.
 *
 * Fails OPEN on any Supabase error, matching checkLoginRateLimit's failure
 * mode: a best-effort limiter must never hard-fail a caller because its own
 * store is temporarily unreachable.
 */
export async function checkKeyedRateLimit(
  key: string,
  maxRequests: number = 20,
  windowMs: number = 60000
): Promise<boolean> {
  try {
    const supabase = createRateLimitStoreClient();
    const settingsKey = `rate_limit:${key}`;
    const now = Date.now();

    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', settingsKey)
      .single();

    const record = data?.value as RateLimitRecord | undefined;

    if (!record || now > record.resetAt) {
      await supabase.from('system_settings').upsert({
        key: settingsKey,
        value: { count: 1, resetAt: now + windowMs },
        updated_at: new Date().toISOString(),
        updated_by: 'system',
      });
      return true;
    }

    if (record.count >= maxRequests) return false;

    await supabase.from('system_settings').upsert({
      key: settingsKey,
      value: { count: record.count + 1, resetAt: record.resetAt },
      updated_at: new Date().toISOString(),
      updated_by: 'system',
    });
    return true;
  } catch {
    return true;
  }
}

/** Best-effort caller IP, for rate-limiting requests that carry no user id. */
export function getRequestIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
