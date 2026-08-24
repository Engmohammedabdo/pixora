/**
 * Memoize an async load for `ttlMs`, and NEVER cache a rejection.
 *
 * ── WHY THIS IS ONE FUNCTION ───────────────────────────────────────────────
 * A memoized REJECTED promise poisons every later call for the lifetime of the
 * process, turning one cold-start blip into permanently broken settings. That
 * reasoning was written out separately in `lib/ai/router.ts` and
 * `lib/admin/settings.ts`, and the two studio-settings lookups had no cache at all
 * — each built a fresh service-role client and made its own round trip, inside a
 * chain of strictly serial awaits sitting in front of every model call.
 *
 * The `inflight` guard matters as much as the TTL: without it, N concurrent
 * requests arriving on a cold cache each issue their own query, which is exactly
 * the stampede this exists to remove.
 */
export function memoizeWithTtl<T>(
  load: () => Promise<T>,
  fallback: T,
  ttlMs: number
): () => Promise<T> {
  let value: T | undefined;
  let expiresAt = 0;
  let inflight: Promise<T> | null = null;

  return async (): Promise<T> => {
    if (value !== undefined && Date.now() < expiresAt) return value;
    if (inflight) return inflight;

    inflight = load()
      .then((loaded) => {
        value = loaded;
        expiresAt = Date.now() + ttlMs;
        return loaded;
      })
      .catch(() => fallback)
      .finally(() => {
        inflight = null;
      });

    return inflight;
  };
}
