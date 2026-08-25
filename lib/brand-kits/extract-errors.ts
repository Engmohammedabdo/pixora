/**
 * The complete set of error codes `POST /api/brand-kits/extract` can return in
 * `{ success: false, error: <code> }`, and where each one's copy lives.
 *
 * `studio-error-codes` (scripts/check-invariants.ts:1110-1124) only scans
 * `app/api/studios/**\/route.ts`, so this route gets no automatic check that a
 * code it returns has a message in both locales — that gap is exactly why this
 * catalog exists as code rather than as a comment. It is the thing
 * scripts/tests/brand-extract.test.ts imports and checks for EXACT membership
 * against messages/{ar,en}.json, so a code added to the route with no matching
 * entry here fails typecheck (the route's literal isn't in the union), and a
 * code added here with no message fails the test.
 *
 * Same mechanism as lib/brand-kits/errors.ts + the ERROR_MESSAGE_KEYS lookup in
 * app/[locale]/(dashboard)/brand-kit/page.tsx (P2.2), reimplemented for this
 * route because that lookup is local to a page this route's caller (P3.3) does
 * not use, and because this route's codes are a different set (upstream outcomes,
 * not database constraint names).
 */
export const BRAND_EXTRACT_ERROR_CODES = [
  'unauthorized',
  'rate_limited',
  'validation_error',
  'extract_unavailable',
  'extract_invalid_url',
  'extract_crawl_failed',
  'extract_failed',
  'extract_timeout',
  'internal_error',
] as const;

export type BrandExtractErrorCode = (typeof BRAND_EXTRACT_ERROR_CODES)[number];

/** code -> flat key under the `brandKit` namespace in messages/{ar,en}.json. */
export const BRAND_EXTRACT_ERROR_MESSAGE_KEYS: Record<BrandExtractErrorCode, string> = {
  unauthorized: 'extractUnauthorized',
  rate_limited: 'extractRateLimited',
  validation_error: 'extractValidationError',
  extract_unavailable: 'extractUnavailable',
  extract_invalid_url: 'extractInvalidUrl',
  extract_crawl_failed: 'extractCrawlFailed',
  extract_failed: 'extractFailed',
  extract_timeout: 'extractTimeout',
  internal_error: 'extractInternalError',
};
