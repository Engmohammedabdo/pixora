/**
 * Provider HTTP: deadlines, and a retry policy that knows what is worth retrying.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `withRetry` in lib/ai/router.ts retried EVERY error class, and no provider call
 * had a deadline. So one failing image request became up to 9 upstream calls and a
 * nine-post campaign up to 81 — and the retries fired hardest on the errors that
 * were never going to succeed: a rotated API key (401), a wrong model id (404), a
 * host that is not on the allowlist. The platform pays for every one of them.
 *
 * Retrying a permanent error is not resilience. It is paying three times for the
 * same certain failure, and delaying the customer's refund by the backoff.
 *
 * A hung provider was worse: with no deadline anywhere, it held a credit
 * reservation open indefinitely, so the row sat in the reconciler's window until
 * the cron found it rather than being refunded inside the request.
 */

export class ProviderTimeoutError extends Error {
  constructor(public readonly provider: string, public readonly ms: number) {
    super(`${provider} did not respond within ${ms}ms`);
    this.name = 'ProviderTimeoutError';
  }
}

export class ProviderPermanentError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ProviderPermanentError';
  }
}

/**
 * Per-provider deadlines. Image generation is genuinely slow; a settings lookup is
 * not. These are ceilings, not targets — a request that hits one has already failed
 * the customer, and the point is to fail it while a refund can still be issued
 * inside the request rather than leaving the row to the reconciler.
 */
export const PROVIDER_TIMEOUTS = {
  text: 60_000,
  image: 120_000,
  tts: 90_000,
  referenceImage: 30_000,
} as const;

/** HTTP statuses where trying again can plausibly succeed. 429 is here on purpose:
 *  it is the provider asking us to wait, not refusing us. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isRetryable(error: unknown): boolean {
  if (error instanceof ProviderTimeoutError) return true;
  if (error instanceof ProviderPermanentError) return RETRYABLE_STATUS.has(error.status);
  // A socket-level failure — DNS, connection reset, TLS. `fetch` surfaces these as
  // TypeError, and they are the classic transient case.
  if (error instanceof TypeError) return true;
  // Everything else is one of OUR OWN refusals — an off-allowlist host, an
  // oversized reference image, a blocked prompt. Retrying our own verdict is
  // pointless, and each retry is another paid upstream call.
  return false;
}

/**
 * `fetch` with a deadline, reported as a ProviderTimeoutError so the retry policy
 * can tell it apart from a refusal.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
  provider: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') throw new ProviderTimeoutError(provider, ms);
    throw e;
  } finally {
    // Always clear it. A pending timer keeps the event loop alive and, in a
    // serverless runtime, can hold the invocation open past the response.
    clearTimeout(timer);
  }
}
