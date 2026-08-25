/**
 * The complete set of error codes `POST /api/brand-kits/extract` can return in
 * `{ success: false, error: <code> }`, and where each one's copy lives.
 *
 * `studio-error-codes` (scripts/check-invariants.ts:1110-1124) only scans
 * `app/api/studios/**\/route.ts`, so this route gets no automatic check that a
 * code it returns has a message in both locales — that gap is exactly why this
 * catalog exists as code rather than as a comment.
 *
 * A previous version of this comment claimed "a code added to the route with
 * no matching entry here fails typecheck (the route's literal isn't in the
 * union)". That was false, and it was proved false empirically: the route
 * builds its response with a plain `NextResponse.json({ success: false, error:
 * '...' })` object literal — nothing in it is typed against
 * `BrandExtractErrorCode` — so adding `error: 'extract_blocked'` to the route
 * left `tsc`, `check:invariants` and this file's own test all green.
 * scripts/tests/brand-extract.test.ts now reads the ROUTE's SOURCE (the same
 * regex `studio-error-codes` uses over the studio routes) and asserts exact
 * set equality against `BRAND_EXTRACT_ERROR_CODES` below — that is the actual
 * guarantee, and it lives in the test, not in TypeScript's type checker.
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

/**
 * code -> dotted key under the `brandKit.extract` sub-namespace in
 * messages/{ar,en}.json — same shape as `studio.errors.<code>`
 * (lib/studio-errors.ts:47), read with `useTranslations('brandKit')` then
 * `t('extract.unauthorized')` etc.
 *
 * Nested under `brandKit.extract` (review finding F4) rather than flat
 * `brandKit.extractXxx` siblings: the previous flat shape meant "which keys
 * belong to this catalog" could only be answered by a NAMING CONVENTION over
 * the whole `brandKit` namespace (`/^extract[A-Z]/`), and that already needed
 * casing luck to exclude the unrelated `brandKit.extractionMissing` (a
 * missing-field badge label, nothing to do with this catalog) — a future,
 * equally unrelated `brandKit.extractHelpText` would have false-positived as
 * a stale catalog key. Nesting makes ownership structural: the scan in
 * scripts/tests/brand-extract.test.ts now enumerates `brandKit.extract`'s own
 * keys directly, with no naming guess involved.
 */
export const BRAND_EXTRACT_ERROR_MESSAGE_KEYS: Record<BrandExtractErrorCode, string> = {
  unauthorized: 'extract.unauthorized',
  rate_limited: 'extract.rateLimited',
  validation_error: 'extract.validationError',
  extract_unavailable: 'extract.unavailable',
  extract_invalid_url: 'extract.invalidUrl',
  extract_crawl_failed: 'extract.crawlFailed',
  extract_failed: 'extract.failed',
  extract_timeout: 'extract.timeout',
  internal_error: 'extract.internalError',
};
