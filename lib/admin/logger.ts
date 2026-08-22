import { createAdminClient } from './db';

export async function logAdminAction(
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown> | null,
  ipAddress: string | null
) {
  try {
    const supabase = createAdminClient();
    await supabase.from('admin_logs').insert({
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      ip_address: ipAddress,
    });
  } catch (error) {
    console.error('[AdminLogger] Failed to log action:', error);
  }
}

/**
 * The client address, as observed by our own proxy.
 *
 * `x-forwarded-for` is a list that grows left to right: entries a client sent
 * itself come first, and each proxy APPENDS the peer it actually saw. So the
 * LAST entry is the only one written by infrastructure we control — every entry
 * to its left is attacker-supplied text.
 *
 * Reading the leftmost entry, as this did, meant a caller could put any value
 * there and be counted under a bucket of their choosing. The admin login
 * throttle keyed on that, so "5 attempts per IP" was really 5 attempts per
 * header value, i.e. no limit at all. checkLoginRateLimit() also spends a
 * global budget for the same reason: a header is not an identity, however
 * carefully it is parsed.
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean);
    const nearest = hops[hops.length - 1];
    if (nearest) return nearest;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * The rate-limiting bucket for an address.
 *
 * IPv4 buckets per address; IPv6 buckets per /64. A single IPv6 host is
 * routinely handed a /64, which is 2^64 addresses — keyed exactly, one machine
 * would own 18 quintillion separate five-attempt budgets, and each fresh key
 * also writes a permanent row. /64 is the smallest unit an operator is actually
 * allocated, so it is the smallest unit worth counting.
 *
 * Not reachable today (the host has no AAAA record), which is exactly why it is
 * worth fixing now rather than after one is added.
 */
export function rateLimitBucket(ip: string): string {
  if (!ip.includes(':')) return ip;
  const groups = ip.split(':');
  return groups.slice(0, 4).join(':') + '::/64';
}
