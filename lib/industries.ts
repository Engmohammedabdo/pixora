/**
 * The one industry list. Before this file there were two: a chip grid in
 * app/[locale]/(dashboard)/analysis/page.tsx:42 storing slugs, and a free-text
 * <Input> in the plan page whose own Arabic placeholder (messages/ar.json:378)
 * told the customer to type "مطاعم" — which lib/ai/prompts/plan.ts:49 then
 * spliced into an English sentence: "expertise in مطاعم businesses".
 *
 * analysis.ts had a slug->name table and plan.ts did not, which is the same
 * nine-copies-diverging-one-at-a-time shape this repo keeps paying for. One
 * module, imported by both builders and every form, is what stops it recurring.
 */
export const INDUSTRIES = [
  'restaurant',
  'clinic',
  'retail',
  'saas',
  'real_estate',
  'education',
  'other',
] as const;

export type Industry = (typeof INDUSTRIES)[number];

/** Slug -> the English industry name a model can reason about. */
export const INDUSTRY_NAMES: Record<Industry, string> = {
  restaurant: 'restaurant and food service',
  clinic: 'healthcare and clinics',
  retail: 'retail',
  saas: 'software as a service',
  real_estate: 'real estate',
  education: 'education',
  other: '',
};

export function isIndustry(value: string): value is Industry {
  return (INDUSTRIES as readonly string[]).includes(value);
}

/**
 * Empty string for `other` AND for anything not in the list. Callers must treat
 * empty as "no industry stated" and degrade, never as a name — a free-text value
 * typed by a customer is not an industry name in the model's language, and
 * pasting it into an English persona is the defect this table exists to remove.
 */
export function industryName(slug: string): string {
  return isIndustry(slug) ? INDUSTRY_NAMES[slug] : '';
}
