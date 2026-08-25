/**
 * The one place a customer-typed website address is turned into the bytes
 * `brand_kits.website_url` actually stores.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * `brandKitBusinessFields.website_url` (lib/brand-kits/schema.ts) is
 * `/^https?:\/\/\S+$/` — scheme required, case-sensitive. Measured against the
 * real schema, that refused four of the five things a customer actually types:
 *
 *     REJECTED  "mysite.ae"
 *     REJECTED  "www.mysite.ae"
 *     REJECTED  "Https://mysite.ae"      <- what iOS/Gboard autocapitalise to
 *     REJECTED  "HTTPS://mysite.ae"
 *     ACCEPTED  "https://mysite.ae"
 *
 * and `POST /api/brand-kits` parses before it does anything else, so all four
 * came back as a Zod `400 validation_error` that named no field. The website
 * field is OPTIONAL, which makes it the last thing a customer suspects, and
 * their only exit was to discard everything else they had filled in.
 *
 * A near-copy of this rule already lived in `components/onboarding/WebsiteStep.tsx`
 * (as `normalizeWebsiteUrlForDraft`) and was applied to exactly one of the two
 * write paths — the onboarding *fallback* draft. The form that actually SAVES
 * sent `websiteUrl.trim()` raw. One rule in one place, imported by both, is the
 * fix; a second copy is the drift class this repo keeps paying for.
 *
 * ── WHY THE SCHEME IS LOWERCASED RATHER THAN THE REGEX RELAXED ─────────────
 * The obvious fix is `/^https?:\/\/\S+$/i`. Do not do that alone. Migration
 * 045's CHECK is
 *
 *     website_url ~ '^https?://[^[:space:]]+$'
 *
 * and Postgres `~` is CASE-SENSITIVE (`~*` is the insensitive operator). A
 * case-insensitive Zod over a case-sensitive CHECK is exactly the 042 defect
 * in the opposite direction: the route validates `Https://mysite.ae`, the
 * insert 500s carrying raw Postgres text, and the customer gets an outage
 * instead of the clean 400 the six field-specific messages were written for.
 *
 * So the rule is stated on the SAME BYTES both layers store: this function
 * canonicalises the scheme before the value ever leaves the browser, and Zod
 * and the CHECK keep the identical (case-sensitive) accepted set. The cased
 * corpus is asserted against BOTH layers in
 * `scripts/tests/brand-context-parity.ts`, and against the Zod field alone in
 * `scripts/tests/website-url.test.ts` (a prebuild gate, no database needed).
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 * It is a normaliser, not a fixer and not a validator. `mysite .ae` still
 * comes back with a space in it and is still refused — but refused with a
 * message that names the field, which is the actual product requirement.
 * Host-level validation belongs to the n8n workflow (see
 * `app/api/brand-kits/extract/route.ts`'s header), not here.
 */

/** Migration 045's `char_length(website_url) <= 500`, restated as the cap this
 *  normaliser truncates to so the value it produces can always be stored. */
export const WEBSITE_URL_MAX_LENGTH = 500;

/**
 * `null` for "the customer typed nothing" — which is what both callers send to
 * clear the column — and otherwise a trimmed, scheme-bearing, length-bounded
 * string whose scheme is lowercase.
 */
export function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Replace rather than concatenate, so a mixed-case scheme is REWRITTEN
  // lowercase instead of being left alone (which is what a bare
  // `/^https?:\/\//i.test()` guard did — it accepted `Https://` and passed it
  // straight through to a case-sensitive CHECK).
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed.replace(/^https?:\/\//i, (scheme) => scheme.toLowerCase())
    : `https://${trimmed}`;
  return withScheme.slice(0, WEBSITE_URL_MAX_LENGTH);
}
