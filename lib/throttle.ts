import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * A keyed, atomic rate limiter for unauthenticated endpoints.
 *
 * Wraps `consume_login_attempt()` (migration 039), which is a single
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING`: PostgreSQL takes the row lock as
 * part of the write, so concurrent callers serialise and each sees a distinct
 * count. The version this replaced across the codebase was SELECT-then-UPSERT,
 * where N concurrent requests all read the same count and all wrote count + 1 —
 * the cap cost an attacker one extra connection to step past. It was proved
 * atomic with 25 genuinely parallel calls against a cap of 5.
 *
 * The RPC is `SECURITY DEFINER` with EXECUTE granted to `service_role` only, so
 * a caller needs the service-role client — never the browser one.
 *
 * `lib/admin/auth.ts` keeps its own private copy of this call deliberately: it
 * carries a long argument about why its global counter only warns and never
 * denies, and that reasoning is specific to admin login. Both go through the
 * same RPC, which is where the semantics actually live.
 */
export async function consumeAttempt(
  key: string,
  max: number,
  windowMinutes: number
): Promise<boolean> {
  const supabase = await createServiceRoleClient();
  const { data, error } = await supabase.rpc('consume_login_attempt', {
    p_key: key,
    p_max: max,
    p_window: `${windowMinutes} minutes`,
  });
  // Deliberately throws rather than returning false, so a caller must decide
  // what an unreachable counter means for it. Silently allowing is the failure
  // mode migration 039 exists to remove.
  if (error) throw new Error(`consume_login_attempt failed: ${error.message}`);
  return data === true;
}

/**
 * The rate-limiting bucket for an address. Same rule as `lib/admin/logger.ts`:
 * IPv4 keyed exactly, IPv6 keyed per /64, because a single IPv6 host is
 * routinely handed a /64 and keying exactly would give one machine 2^64
 * separate budgets — and a permanent counter row for each.
 */
export function ipBucket(ip: string): string {
  if (!ip.includes(':')) return ip;
  return ip.split(':').slice(0, 4).join(':') + '::/64';
}

/**
 * The nearest hop, not the first.
 *
 * `x-forwarded-for` is appended to by each proxy, so the LEFTMOST entry is
 * whatever the client sent and is fully attacker-controlled — reading it means
 * an attacker gets a fresh budget per forged header. The rightmost entry was
 * written by the proxy in front of this app.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean);
    const nearest = hops[hops.length - 1];
    if (nearest) return nearest;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}
