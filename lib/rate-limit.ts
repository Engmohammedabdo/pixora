import type { SupabaseClient } from '@supabase/supabase-js';
import { clientIp, consumeAttempt, ipBucket } from '@/lib/throttle';

/**
 * The throttle in front of all nine studios.
 *
 * ── WHY THIS IS NOT A COUNT ANY MORE ───────────────────────────────────────
 * This used to `SELECT count(*) FROM generations WHERE created_at > now() - 1min`
 * and compare. That is check-then-act: N concurrent requests all read the same
 * count, all find it under the cap, and all proceed — the limit cost an attacker
 * one extra connection to step past. It was also the ONLY throttle in front of
 * nine paid studios, so stepping past it means spending someone else's model
 * budget.
 *
 * `consumeAttempt()` (lib/throttle.ts, migration 039) is a single
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING`, so PostgreSQL takes the row lock
 * as part of the write and concurrent callers serialise. It was signed off with
 * 25 genuinely parallel calls against a cap of 5 → exactly 5 allowed.
 *
 * ── WHY IT FAILS CLOSED ────────────────────────────────────────────────────
 * A limiter that opens when its own store is unreachable is not a limiter — it is
 * a limiter with a documented bypass. `checkKeyedRateLimit` below used to
 * `catch { return true }`, so any database blip lifted the cap on three
 * unauthenticated endpoints at once. Both functions here now deny on failure and
 * log it, which is the rule migration 039 was written to establish.
 */
export async function checkRateLimit(
  _supabase: SupabaseClient,
  userId: string,
  maxRequests: number = 20,
  windowMinutes: number = 1
): Promise<boolean> {
  // The client argument is kept so all nine call sites stay unchanged, but it is
  // deliberately unused: `consume_login_attempt` is SECURITY DEFINER with EXECUTE
  // granted to service_role only, so the caller's anon+JWT client cannot run it.
  // consumeAttempt() builds its own service-role client.
  try {
    return await consumeAttempt(`studio:${userId}`, maxRequests, windowMinutes);
  } catch (e: unknown) {
    console.error(
      `[rate-limit] studio throttle unavailable for ${userId}; denying (fails CLOSED): ${String(e)}`
    );
    return false;
  }
}

/**
 * Keyed rate limiter for routes with no user id to count against — the
 * unauthenticated surfaces (waitlist, support, client-errors) that migration 039
 * was written for.
 *
 * Was a SELECT-then-UPSERT into `system_settings`: two round trips, no row lock,
 * a fail-OPEN catch, and a counter written into the same config table
 * `getCachedFeatureFlags()` reads on every studio request. All four of those are
 * gone.
 */
export async function checkKeyedRateLimit(
  key: string,
  maxRequests: number = 20,
  windowMinutes: number = 1
): Promise<boolean> {
  try {
    return await consumeAttempt(key, maxRequests, windowMinutes);
  } catch (e: unknown) {
    console.error(
      `[rate-limit] keyed throttle unavailable for ${key}; denying (fails CLOSED): ${String(e)}`
    );
    return false;
  }
}

/**
 * Best-effort caller IP for an unauthenticated request, bucketed for keying.
 *
 * Delegates to lib/throttle.ts, which reads the NEAREST hop of `x-forwarded-for`
 * rather than the leftmost. The leftmost entry is whatever the client sent and is
 * fully attacker-controlled, so keying on it hands an attacker a fresh budget per
 * forged header — that was defect #3 in migration 039's own header, and it was
 * still live in this file until now.
 */
export function getRequestIp(request: Request): string {
  return ipBucket(clientIp(request));
}
