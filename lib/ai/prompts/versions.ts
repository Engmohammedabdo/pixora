/**
 * Prompt versioning — which version of each prompt produced a given generation.
 *
 * This was decorative until 2026-08-24: every *_PROMPT_VERSION export had zero
 * importers and no generation had ever recorded one. Seven studio routes now write
 * it into `generations.input.promptVersion` — JSONB, so no migration was needed —
 * which makes it a real record rather than a comment pretending to be a mechanism.
 *
 * BUMP THE VERSION whenever you materially change a prompt, or the record lies.
 */

export const PROMPT_VERSIONS: Record<string, string> = {
  creator_image: 'v2.1',
  photoshoot: 'v3.1',
  campaign_planner: 'v2.1',
  storyboard: 'v2.1',
  marketing_analysis: 'v3.0',
  marketing_plan: 'v3.0',
  voiceover_enhancer: 'v2.0',
  prompt_builder: 'v3.0',
  // v2.0 (2026-08-27): presets replaced the mandatory free-text instruction, the
  // brand kit reaches the builder for the first time, and the measured TEXT RULE
  // is stated as an override at the end of every prompt. Three material changes
  // in one round; a generation recorded under v1.0 was produced by none of them.
  edit: 'v2.0',
};

/**
 * Get the current prompt version for a studio.
 */
export function getPromptVersion(studio: string): string {
  return PROMPT_VERSIONS[studio] || 'v1.0';
}
