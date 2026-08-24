/**
 * Proof that the retry policy distinguishes "try again" from "this will never work".
 *
 *   npx tsx scripts/tests/provider-retry.test.ts
 *
 * withRetry retried EVERY error class, so a rotated API key became three 401s, a
 * wrong model id became three 404s, and one failing image request became up to 9
 * upstream calls — 81 for a nine-post campaign. The platform pays for every one.
 * Retrying a permanent error is not resilience; it is paying three times for the
 * same certain failure.
 */
import { ProviderPermanentError, ProviderTimeoutError, PROVIDER_TIMEOUTS, isRetryable } from '../../lib/ai/http';

let failures = 0;
let checks = 0;

function expectRetry(label: string, err: unknown, want: boolean): void {
  checks++;
  if (isRetryable(err) !== want) {
    failures++;
    console.log(`FAIL  ${label}\n        expected isRetryable=${want}`);
  }
}

// ---- Transient: worth another attempt. ----
expectRetry('408 request timeout', new ProviderPermanentError('timeout', 408), true);
expectRetry('429 rate limit', new ProviderPermanentError('rate limited', 429), true);
expectRetry('500', new ProviderPermanentError('server error', 500), true);
expectRetry('502', new ProviderPermanentError('bad gateway', 502), true);
expectRetry('503', new ProviderPermanentError('unavailable', 503), true);
expectRetry('504', new ProviderPermanentError('gateway timeout', 504), true);
expectRetry('a timeout we imposed', new ProviderTimeoutError('gemini', 30_000), true);
expectRetry('a socket failure', new TypeError('fetch failed'), true);

// ---- Permanent: retrying is paying three times for the same certain failure. ----
expectRetry('400 bad request', new ProviderPermanentError('bad request', 400), false);
expectRetry('401 rotated key', new ProviderPermanentError('unauthorized', 401), false);
expectRetry('403 forbidden', new ProviderPermanentError('forbidden', 403), false);
expectRetry('404 wrong model id', new ProviderPermanentError('not found', 404), false);
expectRetry('422 unprocessable', new ProviderPermanentError('unprocessable', 422), false);

// ---- Our own refusals must never be retried. ----
expectRetry('host not on the allowlist', new Error('host not allowed: evil.example'), false);
expectRetry('reference image too large', new Error('image too large'), false);
expectRetry('a blocked prompt', new Error('PROMPT_BLOCKED: contains "bomb"'), false);

// ---- Every deadline must be a positive number of milliseconds. ----
for (const [name, ms] of Object.entries(PROVIDER_TIMEOUTS)) {
  checks++;
  if (typeof ms !== 'number' || ms <= 0) {
    failures++;
    console.log(`FAIL  PROVIDER_TIMEOUTS.${name} must be a positive number, got ${String(ms)}`);
  }
}

if (failures > 0) {
  console.log(`\n[provider-retry] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[provider-retry] ${checks} checks passed`);
