import type { BrandKit } from '@/lib/supabase/types';

interface CreatorPromptInput {
  userPrompt: string;
  style: string;
  resolution: string;
  brandKit?: BrandKit | null;
}

// v1.0
export function buildCreatorPrompt(input: CreatorPromptInput): string {
  const { userPrompt, style, resolution, brandKit } = input;

  let prompt = `Professional commercial photography. Create: ${userPrompt}`;

  if (brandKit) {
    prompt += `\nBrand: ${brandKit.name}. Colors: Primary ${brandKit.primary_color}, Secondary ${brandKit.secondary_color}, Accent ${brandKit.accent_color}.`;
    prompt += `\nSTRICTLY PRESERVE all original branding elements.`;
  }

  prompt += `\nStyle: ${style}. Resolution: ${resolution}.`;
  prompt += `\nNO EXTRA text or logos not specified. Clean, professional composition.`;
  prompt += `\nHigh quality, sharp details, professional lighting.`;

  return prompt;
}
