/**
 * Turns `POST /api/brand-kits/extract`'s success payload into the shape the
 * onboarding draft form actually needs.
 *
 * `data.draft` arrives typed as `Record<string, unknown>` (the route's own
 * `UpstreamSuccessBody` — see app/api/brand-kits/extract/route.ts:44 — never
 * narrows it further, because it is relaying an n8n workflow's JSON, not
 * something this app's type system produced). `parseExtractDraft()` is the
 * one place that treats it as trusted: every field is read defensively,
 * falling back to '' / null for anything that is not the type the workflow's
 * `Shape Response` node actually emits.
 *
 * Ground truth for that shape (n8n workflow "PyraSuite — Brand DNA from URL",
 * node `Shape Response`, read 2026-08-25): the text fields (`name`,
 * `website_url`, `industry`, `description`, `target_audience`, `city`,
 * `brand_voice`) are always strings, '' when unknown. `logo_url`,
 * `primary_color`, `secondary_color`, `accent_color`, `font_primary` and
 * `font_secondary` can be `null`. `industry` is '' or one of
 * `lib/industries.ts`'s seven slugs — never free text.
 */

export interface ExtractDraft {
  name: string;
  website_url: string;
  industry: string;
  description: string;
  target_audience: string;
  city: string;
  brand_voice: string;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  font_primary: string | null;
  font_secondary: string | null;
}

/** Deliberately excludes `logo_url`: a URL the extraction workflow found on the
 *  customer's own site is not a URL `POST /api/brand-kits` can accept —
 *  `isOwnUploadUrl()` (lib/storage/uploaded-url.ts) only ever passes an object
 *  this app's own `/api/upload` produced, and a foreign host would also fail
 *  next/image's remotePatterns allowlist if shown in a preview. The onboarding
 *  form always starts the logo picker empty; the customer can upload a real
 *  one through the existing control if they want one. */
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function colorOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseExtractDraft(raw: unknown): ExtractDraft {
  const d = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    name: str(d.name),
    website_url: str(d.website_url),
    industry: str(d.industry),
    description: str(d.description),
    target_audience: str(d.target_audience),
    city: str(d.city),
    brand_voice: str(d.brand_voice),
    primary_color: colorOrNull(d.primary_color),
    secondary_color: colorOrNull(d.secondary_color),
    accent_color: colorOrNull(d.accent_color),
    font_primary: colorOrNull(d.font_primary),
    font_secondary: colorOrNull(d.font_secondary),
  };
}

/**
 * The field-level "we couldn't determine this" set the draft form marks.
 *
 * The workflow's own `missing[]` (Shape Response node) is coarser than the UI
 * needs on two of its five entries: `'colors'` is only added when the crawl
 * found ZERO colours, so a site with exactly one or two brand colours leaves
 * `secondary_color`/`accent_color` null WITHOUT `'colors'` appearing in
 * `missing[]` — same shape for `'fonts'`/`font_secondary`. Deriving the badge
 * from the field's OWN value (in addition to the coarse flag) closes that gap
 * without contradicting it: whenever the workflow's flag IS present, every
 * field it covers is provably null too (see the node's own
 * `!visual.palette.length && 'colors'`), so this is strictly more precise,
 * never less.
 *
 * `logo` and any other string the workflow returns is ignored on purpose —
 * the draft form never shows a missing-logo badge (see ExtractDraft's
 * comment on why logo_url is dropped entirely), and `industry`/`city` are
 * still read from `rawMissing` because a field can be legitimately EMPTY
 * without the crawl having "found" an empty string.
 */
export function expandMissingFields(rawMissing: unknown, draft: ExtractDraft): string[] {
  const flagged = new Set(Array.isArray(rawMissing) ? rawMissing.filter((v): v is string => typeof v === 'string') : []);
  const out = new Set<string>();

  if (flagged.has('industry') || !draft.industry) out.add('industry');
  if (flagged.has('city') || !draft.city) out.add('city');
  if (flagged.has('colors') || !draft.primary_color) out.add('primary_color');
  if (flagged.has('colors') || !draft.secondary_color) out.add('secondary_color');
  if (flagged.has('colors') || !draft.accent_color) out.add('accent_color');
  if (flagged.has('fonts') || !draft.font_primary) out.add('font_primary');
  if (flagged.has('fonts') || !draft.font_secondary) out.add('font_secondary');

  return [...out];
}
