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
 *
 * That last sentence is what the workflow DOES, not something this repo can
 * rely on: it is unversioned and its response shape has changed four times
 * this session. `industrySlugOrEmpty()` below enforces it here, which is the
 * only place the enforcement is under this repo's control.
 */

import { isIndustry } from '@/lib/industries';

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

/** A non-empty string, or null. Used for the two FONT fields, which were read
 *  with `colorOrNull()` — behaviourally identical, but the name asserted
 *  something false about the fields it was applied to. */
function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * `#RRGGBB` or null — the exact shape `CreateBrandKitSchema` accepts
 * (`/^#[0-9A-Fa-f]{6}$/`).
 *
 * This used to be a bare non-empty-string check, so `rgb(255,0,0)` or `#FFF`
 * from the crawl seeded the colour pickers, looked like a found fact, and
 * 400'd on Save. Returning null instead makes `expandMissingFields` render the
 * "we couldn't find this" badge — which is the truth — and leaves the picker
 * on its own default.
 */
function hexColorOrNull(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value) ? value : null;
}

/**
 * `''` for anything that is not one of `lib/industries.ts`'s seven slugs.
 *
 * The doc comment above claims the workflow only ever emits a slug or ''. That
 * claim is TRUE of the workflow as read on 2026-08-25 — and it is a claim
 * about an unversioned n8n workflow whose response shape has changed four
 * times this session, enforced by nothing in this repo. If it ever returned
 * `"restaurants"`, that string passed `z.string()`, the 1-40 cap and migration
 * 045's CHECK (deliberately not enum-constrained), and was STORED. Thereafter
 * `industryName('restaurants')` returns '' forever: no chip renders selected,
 * no missing badge shows (`expandMissingFields` only flagged an EMPTY
 * industry), and the industry line is silently omitted from every plan,
 * analysis, creator, campaign, storyboard and photoshoot prompt. A stored fact
 * the whole feature exists to carry, carried by nothing, with no error
 * anywhere.
 *
 * Note the asymmetry this closes: `plan/page.tsx` and `analysis/page.tsx`
 * already guard their prefill with `isIndustry()`. The components that WRITE
 * the column did not.
 */
function industrySlugOrEmpty(value: unknown): string {
  const s = str(value);
  return isIndustry(s) ? s : '';
}

export function parseExtractDraft(raw: unknown): ExtractDraft {
  const d = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    name: str(d.name),
    website_url: str(d.website_url),
    industry: industrySlugOrEmpty(d.industry),
    description: str(d.description),
    target_audience: str(d.target_audience),
    city: str(d.city),
    brand_voice: str(d.brand_voice),
    primary_color: hexColorOrNull(d.primary_color),
    secondary_color: hexColorOrNull(d.secondary_color),
    accent_color: hexColorOrNull(d.accent_color),
    font_primary: textOrNull(d.font_primary),
    font_secondary: textOrNull(d.font_secondary),
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

  // `!isIndustry(...)`, not `!draft.industry`: a value that is present but not
  // one of the seven slugs renders no selected chip, so a customer looking at
  // this form sees the industry question apparently unanswered with nothing
  // saying so. Stated on the value rather than on its emptiness, this holds
  // even if a caller ever hands over a draft `parseExtractDraft` did not
  // produce.
  if (flagged.has('industry') || !isIndustry(draft.industry)) out.add('industry');
  if (flagged.has('city') || !draft.city) out.add('city');
  if (flagged.has('colors') || !draft.primary_color) out.add('primary_color');
  if (flagged.has('colors') || !draft.secondary_color) out.add('secondary_color');
  if (flagged.has('colors') || !draft.accent_color) out.add('accent_color');
  if (flagged.has('fonts') || !draft.font_primary) out.add('font_primary');
  if (flagged.has('fonts') || !draft.font_secondary) out.add('font_secondary');

  return [...out];
}
