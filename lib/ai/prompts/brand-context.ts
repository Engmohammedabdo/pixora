import { industryName } from '@/lib/industries';
import { sanitizePrompt } from './safety';

/**
 * The five business-context columns migration 045 added to `brand_kits`
 * (`website_url` excepted — nothing prompt-facing reads it), reshaped to the
 * camelCase a builder already works in. Every brand kit created before that
 * migration has all five null, so `null`/empty-everywhere is the common case
 * today, not an edge case — see `buildBrandContextBlock` below.
 *
 * This is the shared "the customer's business" block six studios can now
 * place in their prompt. Every field here is customer-writable straight over
 * PostgREST (`brand_kits` has no column-level GRANT lockdown beyond
 * `logo_url`, migration 042), so a caller passing a row fetched directly —
 * bypassing app/api/brand-kits/route.ts's Zod schema entirely — is the normal
 * case this function must hold for, not a hostile one.
 */
export interface BrandContextPromptInput {
  name: string | null;
  industry: string | null;
  description: string | null;
  targetAudience: string | null;
  city: string | null;
}

/**
 * Builds the block a prompt builder appends once it has established its
 * subject/task and before its own style/technical directives — see the
 * individual builders (creator, campaign, edit, photoshoot, storyboard) for
 * where each places it and why.
 *
 * Returns `''` — not a heading with nothing under it — when there is nothing
 * to say. A `CLIENT CONTEXT` heading with an empty body spends the model's
 * attention on nothing, and every brand kit created before migration 045 (and
 * every generation with no brand kit attached at all) hits exactly this path.
 *
 * The caps mirror migration 045's own CHECK constraints (see
 * lib/brand-kits/schema.ts's `brandKitBusinessFields`), restated here rather
 * than imported: this function must also hold for a row written directly over
 * PostgREST, which meets neither the route's Zod schema nor the form that
 * normally produces one.
 */
export function buildBrandContextBlock(input: BrandContextPromptInput | null): string {
  if (!input) return '';

  const { name, industry, description, targetAudience, city } = input;

  // industryName() returns '' for `other` and for any slug it does not
  // recognise — including a free-text value a hostile PostgREST write could
  // put in this column. Falling back to the raw slug here is the exact defect
  // P0.1 fixed in plan.ts's persona sentence ("expertise in مطاعم businesses");
  // an unresolved industry means the line is omitted, not degraded to raw text.
  const resolvedIndustry = industry ? industryName(industry) : '';
  const safeIndustry = resolvedIndustry ? sanitizePrompt(resolvedIndustry, 100) : '';
  const safeDescription = description ? sanitizePrompt(description, 2000) : '';
  const safeTargetAudience = targetAudience ? sanitizePrompt(targetAudience, 500) : '';
  const safeCity = city ? sanitizePrompt(city, 100) : '';

  // Emptiness is decided on these four BUSINESS-FACT fields only — `name`
  // does not count, and is deliberately not read until after this check.
  // `brand_kits.name` is NOT NULL, so every real row has one; counting it
  // here would mean this function could never return '' for a real row,
  // defeating the "nothing to say" contract the doc comment above promises —
  // a brand kit created before migration 045, or one whose owner never filled
  // in the business fields, is the COMMON case, not an edge case.
  const hasBusinessFacts = Boolean(safeIndustry || safeDescription || safeTargetAudience || safeCity);
  if (!hasBusinessFacts) return '';

  // Sanitized only now that the block is known to be non-empty, so a
  // name-only kit — the common pre-045 shape — returns '' above without ever
  // running the filter over `name`.
  const safeName = name ? sanitizePrompt(name, 100) : '';

  const lines: string[] = [];
  // `- Business: {name}` duplicates creator/campaign/storyboard's own
  // "- Brand: …" line, but is kept: photoshoot and edit have no other line
  // that carries the business name at all, so dropping it here would
  // silently remove the only place those two studios' prompts say who the
  // business IS. Gating on `hasBusinessFacts` (not on `safeName`) above is
  // what fixes the actual defect — a name-only kit now returns '' instead of
  // a CLIENT CONTEXT heading over a single restated line.
  if (safeName) lines.push(`- Business: ${safeName}`);
  if (safeIndustry) lines.push(`- Industry: ${safeIndustry}`);
  if (safeCity) lines.push(`- City: ${safeCity}`);
  if (safeTargetAudience) lines.push(`- Target Audience: ${safeTargetAudience}`);
  if (safeDescription) lines.push(`- Business Description: ${safeDescription}`);

  return `\n\nCLIENT CONTEXT\n${lines.join('\n')}`;
}
