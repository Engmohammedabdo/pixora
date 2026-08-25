/**
 * A Postgres check_violation (23514) on `brand_kits` can now come from six
 * distinct constraints: migration 042's logo guard, plus the five bounds
 * migration 045 added. Before 045, every 23514 on this table WAS the logo
 * guard, so the routes hardcoded `invalid_logo_url` for any 23514 — correct
 * then, wrong now for five of the six: a too-long `description` would have
 * told the customer their LOGO URL was invalid.
 *
 * Postgres names the failing constraint inside `error.message` (e.g.
 * `violates check constraint "brand_kits_description_len"`), so that name is
 * what selects the code — the route never re-derives the shape of the value
 * itself, it just reads which constraint Postgres already decided was broken.
 *
 * Shared by both routes so the mapping cannot drift between them the way
 * CreateBrandKitSchema/UpdateBrandKitSchema once did.
 */
export function mapBrandKitCheckViolation(message: string): string {
  if (message.includes('brand_kits_website_url_shape')) return 'invalid_website_url';
  if (message.includes('brand_kits_industry_len')) return 'invalid_industry';
  if (message.includes('brand_kits_description_len')) return 'invalid_description';
  if (message.includes('brand_kits_target_audience_len')) return 'invalid_target_audience';
  if (message.includes('brand_kits_city_len')) return 'invalid_city';
  // Migration 042's logo guard, or any future constraint this function does
  // not yet know the name of. Keeps the behaviour this mapping has always had
  // for the case it was originally written for.
  return 'invalid_logo_url';
}

/**
 * code (from BrandKitError.code, i.e. what this route or `POST /api/brand-kits`
 * itself returns) -> flat key under the `brandKit` namespace in
 * messages/{ar,en}.json.
 *
 * Was a local object literal duplicated inline in
 * app/[locale]/(dashboard)/brand-kit/page.tsx. Pulled out here so P3.3's
 * onboarding save (a second caller of the SAME `POST /api/brand-kits`) reads
 * the identical mapping instead of growing its own copy that can drift from
 * this one the way CreateBrandKitSchema/UpdateBrandKitSchema once did.
 */
export const BRAND_KIT_SAVE_ERROR_MESSAGE_KEYS: Record<string, string> = {
  invalid_logo_url: 'invalidLogo',
  invalid_website_url: 'invalidWebsiteUrl',
  invalid_industry: 'invalidIndustry',
  invalid_description: 'invalidDescription',
  invalid_target_audience: 'invalidTargetAudience',
  invalid_city: 'invalidCity',
  // Both routes return this on a Zod refusal, and it had NO entry here — so
  // every schema-level 400 fell through to the generic `saveFailed` toast
  // ("we couldn't save it, try again"). Retrying an unchanged value cannot
  // work, and the six field-specific messages below it were reachable only via
  // `mapBrandKitCheckViolation` on a Postgres 23514 — a path the app itself can
  // never take, because Zod is at least as strict as migration 045's CHECK on
  // every one of them. `brandKitErrorMessageKey()` below reads the 400's
  // `details` first, so this generic wording is the LAST resort, not the only
  // one.
  validation_error: 'invalidFields',
  // The extract surface on the same screen already says "your session ended,
  // sign in again" for this condition (brandKit.extract.unauthorized). The save
  // surface said "try again". Same condition, same screen, two different
  // stories.
  unauthorized: 'sessionExpired',
};

/**
 * `brand_kits` column -> the same flat key under `brandKit`.
 *
 * Read from a `validation_error`'s `details`: Zod issues carry
 * `path: ['website_url']`, and the path HEAD is the column. Keyed on the wire
 * names (snake_case) because that is what the schema — and therefore the issue
 * path — actually uses; keying on the form's camelCase state names would look
 * right and match nothing.
 *
 * Covers every field `CreateBrandKitSchema`/`UpdateBrandKitSchema` can refuse,
 * not just the five migration 045 added: a 500-char `brand_voice` or a
 * 50-char-plus `font_primary` is exactly as unrecoverable-by-retrying as a
 * bad URL, and `font_*` is the shape review finding F4 measured arriving from
 * the extraction workflow.
 */
export const BRAND_KIT_FIELD_MESSAGE_KEYS: Record<string, string> = {
  name: 'invalidName',
  logo_url: 'invalidLogo',
  website_url: 'invalidWebsiteUrl',
  industry: 'invalidIndustry',
  description: 'invalidDescription',
  target_audience: 'invalidTargetAudience',
  city: 'invalidCity',
  brand_voice: 'invalidBrandVoice',
  font_primary: 'invalidFont',
  font_secondary: 'invalidFont',
  primary_color: 'invalidColor',
  secondary_color: 'invalidColor',
  accent_color: 'invalidColor',
};

/**
 * The single mapping both save surfaces use: the brand-kit page's dialogs and
 * the onboarding step. Returns a flat key under the `brandKit` namespace.
 *
 * `fields` are the path heads of a 400's Zod `details` (see
 * hooks/useBrandKit.ts). They are consulted ONLY for `validation_error` —
 * every other code already names its own condition, and a stale `details`
 * array must never be able to rename one.
 *
 * `fallbackKey` exists because one caller reports deletions through the same
 * helper, where "we couldn't save it" would be the wrong sentence.
 */
export function brandKitErrorMessageKey(
  code: string,
  fields: readonly string[] = [],
  fallbackKey = 'saveFailed'
): string {
  if (code === 'validation_error') {
    for (const field of fields) {
      const key = BRAND_KIT_FIELD_MESSAGE_KEYS[field];
      if (key) return key;
    }
  }
  return BRAND_KIT_SAVE_ERROR_MESSAGE_KEYS[code] ?? fallbackKey;
}
