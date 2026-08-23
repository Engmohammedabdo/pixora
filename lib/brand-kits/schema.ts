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
