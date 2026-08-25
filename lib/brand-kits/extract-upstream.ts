import { z } from 'zod/v4';

/**
 * The shape `POST /api/brand-kits/extract` will accept from the n8n workflow,
 * and the caps it clips that payload to.
 *
 * ── WHY IT IS NOT IN THE ROUTE ─────────────────────────────────────────────
 * A `route.ts` cannot export anything but its handlers — Next's generated
 * types constrain the module to `{ [x: string]: never }` for every other name,
 * so `export const UpstreamSuccessSchema` fails `tsc` with TS2344. Measured,
 * not assumed: the same wall `lib/ai/studio-output-schemas.ts` exists to get
 * around. The test that proves these bounds must run the REAL schema, not a
 * re-implementation of it — a re-implementation passes while the route
 * regresses.
 *
 * ── WHY EACH FIELD IS CAPPED, AND WHY BY TRUNCATION ────────────────────────
 * This was a bare `z.string().nullable().optional()` — a TYPE check and
 * nothing else — and the draft was relayed verbatim into `BrandKitForm`, where
 * `maxLength` on an <input> does not truncate a programmatically-set value.
 * The workflow's own `Shape Response` node clips six fields to exactly the
 * caps in `brandKitBusinessFields`, but `font_primary`/`font_secondary` are
 * unclipped, and its font source regex (`font-family\s*:\s*([^;"'}<]+)`) on a
 * WordPress/Elementor site yields `var(--wp--preset--font-family--…)` —
 * comfortably past the 50-char cap `CreateBrandKitSchema` enforces. The crawl
 * then "succeeded", the draft looked right, and Save 400'd on a field the
 * customer never typed in.
 *
 * That cap was a claim about an UNVERSIONED n8n workflow whose response shape
 * has changed four times this session. Restating it here is not a second rule
 * that can drift — it is this repo taking ownership of a bound it is the one
 * paying for.
 *
 * TRUNCATE rather than reject: a crawl costs the customer 25-60 seconds and
 * one of five per hour, and a `.max()` refusal would throw the ENTIRE draft
 * away — every field, plus the slot — over one over-long font name. Truncated,
 * the field arrives editable and everything else survives.
 */
const upstreamText = (maxLength: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((v) => (typeof v === 'string' ? v.slice(0, maxLength) : v));

/**
 * `.loose()` on the object (not `.strict()`) because
 * `lib/brand-kits/extract-draft.ts`'s `parseExtractDraft()` already reads only
 * these known keys and ignores anything else; rejecting an unrecognised extra
 * key here would fail a shape that downstream tolerates fine. `missing` is a
 * flat array of strings — see `expandMissingFields()`.
 */
export const UpstreamSuccessSchema = z.object({
  ok: z.literal(true),
  draft: z
    .object({
      // Caps mirror lib/brand-kits/schema.ts's brandKitBusinessFields and
      // brandKitSharedFields — i.e. migration 045's own CHECK constraints.
      name: upstreamText(100),
      website_url: upstreamText(500),
      industry: upstreamText(40),
      description: upstreamText(2000),
      target_audience: upstreamText(500),
      city: upstreamText(100),
      brand_voice: upstreamText(500),
      // `#RRGGBB` is 7 characters. Truncating to 7 does not MAKE a value valid
      // — `parseExtractDraft` refuses anything that is not a hex triple — it
      // just stops an arbitrarily long string being relayed as a colour.
      primary_color: upstreamText(7),
      secondary_color: upstreamText(7),
      accent_color: upstreamText(7),
      font_primary: upstreamText(50),
      font_secondary: upstreamText(50),
    })
    .loose(),
  missing: z.array(z.string()),
});
