import { z } from 'zod/v4';

/**
 * The shape of `brand_kits.logo_url` on the wire, shared by POST and PUT.
 *
 * They disagreed before: POST had `.optional()` and PUT had `.nullable().optional()`,
 * while the one form that feeds both always sends `logo_url: logoUrl` — null when
 * there is no logo. So editing a kit worked and creating one 400'd, for the same
 * payload, from the same component.
 *
 * `.url()` is deliberately absent. It is a syntax check that passed blob:,
 * data:, javascript: and any foreign host; provenance is decided by
 * `isOwnUploadUrl(url, userId)` in the route, which needs the caller's id and
 * so cannot live in a static schema. The length cap is here because this column
 * is TEXT and an unbounded data: URL would otherwise be storable in it.
 */
export const brandKitLogoSchema = z.string().max(512).nullable().optional();

/**
 * The five business-context columns added by migration 045, bounded to
 * IDENTICAL caps as that migration's CHECK constraints — not tighter, not
 * looser. A route that accepts a string the database refuses turns a clean 400
 * into a 500 carrying raw Postgres text; a route that refuses a string the
 * database would accept just wastes a save. See scripts/tests/brand-context-parity.ts.
 *
 * `.nullable()` on every field is not optional, same reasoning as
 * `brandKitLogoSchema` above: the form sends explicit `null` to clear a field,
 * and `.optional()` alone rejects `null`.
 *
 * On the `website_url` regex: JS `\S` is *stricter* than Postgres
 * `[^[:space:]]` (it also excludes U+00A0 and other Unicode spaces). That
 * asymmetry is the SAFE direction — the route 400s on a string the database
 * would have accepted. The dangerous direction is the reverse, so do not
 * loosen this to "fix" the mismatch.
 */
export const brandKitBusinessFields = {
  website_url: z.string().trim().max(500).regex(/^https?:\/\/\S+$/).nullable().optional(),
  industry: z.string().trim().min(1).max(40).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  target_audience: z.string().trim().max(500).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
};

/**
 * Every field POST and PUT agree on, `name` excepted — it differs between them
 * (required on create, optional on update) so each route's schema below adds
 * it itself. Before this, POST and PUT carried two literal copies of this list
 * that had already diverged once (see brandKitLogoSchema's comment); deriving
 * both from one object is what stops it happening again.
 */
const brandKitSharedFields = {
  logo_url: brandKitLogoSchema,
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  font_primary: z.string().max(50).optional(),
  font_secondary: z.string().max(50).optional(),
  brand_voice: z.string().max(500).nullable().optional(),
  is_default: z.boolean().optional(),
  ...brandKitBusinessFields,
};

/** POST /api/brand-kits — `name` is required on create. */
export const CreateBrandKitSchema = z.object({
  name: z.string().min(1).max(100),
  ...brandKitSharedFields,
});

/** PUT /api/brand-kits/[id] — a partial update, so `name` is optional too. */
export const UpdateBrandKitSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  ...brandKitSharedFields,
});
