import type { BrandKit } from '@/lib/supabase/types';
import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';

interface CreatorPromptInput {
  userPrompt: string;
  style: string;
  resolution: string;
  brandKit?: BrandKit | null;
  mood?: string;
  platform?: string;
}

// v2.0 — matches system-prompts.md creator_image_v1
export function buildCreatorPrompt(input: CreatorPromptInput): string {
  const { userPrompt, style, resolution, brandKit, mood, platform } = input;
  const safePrompt = sanitizePrompt(userPrompt);

  let prompt = `You are a world-class commercial photographer and visual designer.\n\nCreate a professional commercial image with these specifications:`;
  prompt += `\n- Subject: ${safePrompt}`;

  if (brandKit) {
    prompt += `\n- Brand: ${brandKit.name}`;
    prompt += `\n- Brand Colors: Primary ${brandKit.primary_color}, Secondary ${brandKit.secondary_color}, Accent ${brandKit.accent_color}`;
    if (brandKit.brand_voice) prompt += `\n- Brand Voice: ${brandKit.brand_voice}`;
  }

  prompt += `\n- Visual Style: ${style}`;
  prompt += `\n- Mood: ${mood || 'Professional'}`;
  prompt += `\n- Platform: ${platform || 'General'}`;
  prompt += `\n- Resolution: ${resolution}`;

  prompt += `\n\nTechnical Requirements:`;
  prompt += `\n- STRICTLY PRESERVE all original brand elements`;
  prompt += `\n- STRICTLY PRESERVE original product appearance and branding`;
  prompt += `\n- NO extra text, logos, or watermarks unless specified`;
  prompt += `\n- Professional studio lighting unless otherwise specified`;
  prompt += `\n- High contrast, commercially appealing composition`;
  prompt += `\n- Resolution optimized for ${platform || 'general use'}`;

  return prompt;
}

export const CREATOR_PROMPT_VERSION = getPromptVersion('creator_image');
