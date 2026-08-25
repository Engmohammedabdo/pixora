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
};
