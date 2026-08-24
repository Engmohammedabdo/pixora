import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';

interface VoiceOverPromptInput {
  script: string;
  duration?: number;
  tone: string;
  dialect: string;
  brand?: string;
}

// v2.0 — matches system-prompts.md voiceover_script_enhancer_v1
export function buildVoiceOverPrompt(input: VoiceOverPromptInput): string {
  const { script, duration, tone, dialect, brand } = input;
  const safeScript = sanitizePrompt(script, 500);
  // tone and dialect select a row in a table on the live path, but this builder
  // interpolates them directly, so they meet the filter here.
  const safeTone = sanitizePrompt(tone, 50);
  const safeDialect = sanitizePrompt(dialect, 50);
  const safeBrand = brand ? sanitizePrompt(brand, 100) : '';
  const wordCount = Math.round((duration || 30) * 2.5); // ~2.5 words/second for Arabic

  let prompt = `You are a professional Arabic copywriter specializing in advertising scripts.`;

  prompt += `\n\nOriginal script: ${safeScript}`;
  prompt += `\nDuration target: ${duration || 30} seconds (approximately ${wordCount} words)`;
  prompt += `\nTone: ${safeTone}`;
  prompt += `\nDialect: ${safeDialect}`;
  if (safeBrand) prompt += `\nProduct/Brand: ${safeBrand}`;

  prompt += `\n\nEnhance this voice-over script for commercial use:`;
  prompt += `\n1. Optimize for the ${duration || 30}-second time limit`;
  prompt += `\n2. Match the ${safeTone} tone perfectly`;
  prompt += `\n3. Write in ${safeDialect} dialect`;
  prompt += `\n4. Include natural pauses indicated by [pause] tags`;
  prompt += `\n5. Emphasize key words with *asterisks*`;
  prompt += `\n6. Ensure the script ends with a clear call-to-action`;

  prompt += `\n\nReturn ONLY the enhanced script, no explanations.`;

  return prompt;
}

export const VOICEOVER_PROMPT_VERSION = getPromptVersion('voiceover_enhancer');
