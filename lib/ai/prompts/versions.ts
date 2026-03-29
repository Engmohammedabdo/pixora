/**
 * Prompt versioning — track which version of each prompt is active.
 * Version is logged with each generation for A/B testing and debugging.
 */

export const PROMPT_VERSIONS: Record<string, string> = {
  creator_image: 'v2.0',
  photoshoot: 'v2.0',
  campaign_planner: 'v2.0',
  storyboard: 'v2.0',
  marketing_analysis: 'v2.0',
  marketing_plan: 'v2.0',
  voiceover_enhancer: 'v2.0',
  prompt_builder: 'v2.0',
};

/**
 * Get the current prompt version for a studio.
 */
export function getPromptVersion(studio: string): string {
  return PROMPT_VERSIONS[studio] || 'v1.0';
}
