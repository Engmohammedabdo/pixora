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

  const safeName = name ? sanitizePrompt(name, 100) : '';
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

  const lines: string[] = [];
  if (safeName) lines.push(`- Business: ${safeName}`);
  if (safeIndustry) lines.push(`- Industry: ${safeIndustry}`);
  if (safeCity) lines.push(`- City: ${safeCity}`);
  if (safeTargetAudience) lines.push(`- Target Audience: ${safeTargetAudience}`);
  if (safeDescription) lines.push(`- Business Description: ${safeDescription}`);

  if (lines.length === 0) return '';

  return `\n\nCLIENT CONTEXT\n${lines.join('\n')}`;
}
