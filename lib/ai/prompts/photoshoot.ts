import type { BrandKit } from '@/lib/supabase/types';

interface PhotoshootPromptInput {
  environment: string;
  shotIndex: number;
  totalShots: number;
  notes?: string;
  brandKit?: BrandKit | null;
}

const ENVIRONMENT_DESCRIPTIONS: Record<string, string> = {
  white_studio: 'Clean white studio background with soft diffused lighting, minimal shadows',
  lifestyle: 'Lifestyle home setting with natural daylight, warm tones, modern interior',
  nature: 'Outdoor natural setting with green foliage, soft sunlight, organic feel',
  urban: 'Urban city backdrop, concrete textures, modern architecture, street style',
  luxury: 'Premium luxury setting, marble surfaces, gold accents, elegant atmosphere',
  festive: 'Festive celebration setting, decorative elements, warm and joyful atmosphere',
};

const ANGLES = ['front-facing hero', 'slight 45-degree angle', 'top-down flat lay', 'close-up detail', 'side profile', 'three-quarter view'];
const LIGHTING = ['soft diffused', 'dramatic side', 'natural window', 'rim backlit', 'warm golden hour', 'cool studio'];

// v1.0
export function buildPhotoshootPrompt(input: PhotoshootPromptInput): string {
  const { environment, shotIndex, totalShots, notes, brandKit } = input;

  const envDesc = ENVIRONMENT_DESCRIPTIONS[environment] || ENVIRONMENT_DESCRIPTIONS.white_studio;
  const angle = ANGLES[shotIndex % ANGLES.length];
  const lighting = LIGHTING[shotIndex % LIGHTING.length];

  let prompt = `Professional commercial product photography.`;
  prompt += `\nShot ${shotIndex + 1} of ${totalShots}: ${angle} angle.`;
  prompt += `\nEnvironment: ${envDesc}.`;
  prompt += `\nLighting: ${lighting} lighting.`;
  prompt += `\nFocus on product details, clean composition, high-end advertising quality.`;

  if (brandKit) {
    prompt += `\nBrand colors: ${brandKit.primary_color}, ${brandKit.secondary_color}. Subtle brand color accents.`;
  }

  if (notes) {
    prompt += `\nAdditional requirements: ${notes}`;
  }

  prompt += `\nNo text overlays. No watermarks. Professional e-commerce quality.`;

  return prompt;
}
