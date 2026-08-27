import { EDIT_PRESETS, EDIT_PRESET_IDS, type EditPresetId } from '../../lib/ai/prompts/edit';

/**
 * What the live sweep runs, and what each case must be true of.
 *
 * ── WHY THE FIXTURE MATTERS AS MUCH AS THE CASE ────────────────────────────
 * On 2026-08-27 three presets were first judged "inconclusive" because they were
 * run against a shawarma photograph containing no glass, no price sticker and no
 * colour cast. A preset applied to an image lacking the defect it removes
 * produces a no-op that is INDISTINGUISHABLE from a broken preset. So every case
 * names the fixture whose content it needs, and adding a preset without a
 * suitable fixture is a deliberate decision rather than an oversight — the
 * coverage check at the bottom will not let it pass silently.
 */

/** Prompts for the source images the sweep generates once per run. Each exists
 *  because some case needs that specific content present in the frame. */
export const FIXTURES: Record<string, string> = {
  busy_scene:
    'A chicken shawarma wrap on a wooden board in a busy Levantine restaurant, warm lighting, ' +
    'small bowls of garlic sauce and pickles beside it, blurred kitchen and diners behind. Photographic.',
  glass_reflections:
    'A clear glass perfume bottle on a dark polished surface, studio lighting. The glass shows strong ' +
    'distracting reflections: a window frame, a softbox rectangle, and a smudged fingerprint on the front. Sharp product photography.',
  shop_sticker:
    'A jar of honey on a plain white surface, studio product photography. A bright yellow discount price ' +
    'sticker and a printed barcode label are stuck on the front, partly covering the jar own label.',
  colour_cast:
    'A white ceramic coffee mug on a wooden table under strong orange tungsten indoor lighting, so the whole ' +
    'image carries a heavy warm yellow-orange cast and the white mug does not look white.',
  clean_white:
    'A single glass jar of honey centred on a pure white seamless studio background, even soft lighting, ' +
    'no props, no text anywhere in the frame. Sharp e-commerce product photography.',
};

export interface EditCase {
  preset: EditPresetId;
  fixture: keyof typeof FIXTURES;
  /** Required for text_add: there the description is the text to render. */
  text?: string;
  /** Extra measured expectations beyond "the edit did something". */
  expect?: {
    /** Background must be pure white at every sample point. */
    pureWhiteBackground?: boolean;
    /** Subject's longest side, as a share of the frame's — the rule as written. */
    minSubjectSpan?: number;
  };
}

/**
 * Every preset gets a case, on a fixture that contains what it acts on.
 *
 * `minEffect` is NOT set per case on purpose. The threshold lives in
 * lib/image/edit-effect.ts and is shared with production, so the sweep cannot
 * drift into judging by a different standard than the running product.
 */
export const EDIT_CASES: EditCase[] = [
  { preset: 'marketplace_white', fixture: 'busy_scene',
    expect: { pureWhiteBackground: true, minSubjectSpan: 0.7 } },
  { preset: 'studio_gradient', fixture: 'busy_scene' },
  { preset: 'lifestyle_scene', fixture: 'clean_white' },
  { preset: 'festive_gifting', fixture: 'clean_white' },

  { preset: 'remove_props', fixture: 'busy_scene' },
  { preset: 'remove_reflections', fixture: 'glass_reflections' },
  { preset: 'remove_labels', fixture: 'shop_sticker' },

  { preset: 'brand_color_match', fixture: 'clean_white' },
  { preset: 'accurate_color', fixture: 'colour_cast' },

  { preset: 'product_label', fixture: 'clean_white', text: 'شاورما الشام' },
  { preset: 'promo_badge', fixture: 'clean_white', text: 'خصم 20%' },

  { preset: 'luxury_editorial', fixture: 'busy_scene' },
  { preset: 'bright_ecommerce', fixture: 'busy_scene' },
  { preset: 'warm_appetite', fixture: 'busy_scene' },
];

/**
 * Coverage, asserted rather than assumed.
 *
 * A preset added to `EDIT_PRESETS` and not to this list would otherwise ship
 * unrun and unlooked-at, which is exactly the state all fourteen were in before
 * the first sweep. Returns the gap so the runner can refuse to start.
 */
export function uncoveredPresets(): string[] {
  const covered = new Set(EDIT_CASES.map((c) => c.preset));
  return EDIT_PRESET_IDS.filter((id) => !covered.has(id));
}

/** The editType a case runs under, read from the preset table so the two cannot
 *  disagree — a mismatch is a 400 the sweep would have to interpret. */
export function editTypeFor(preset: EditPresetId): string {
  return EDIT_PRESETS[preset].editType;
}
