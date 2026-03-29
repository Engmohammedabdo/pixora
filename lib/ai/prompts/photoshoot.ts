import type { BrandKit } from '@/lib/supabase/types';
import { getPromptVersion } from './versions';

interface PhotoshootPromptInput {
  environment: string;
  shotIndex: number;
  totalShots: number;
  notes?: string;
  brandKit?: BrandKit | null;
}

const ENVIRONMENT_PRESETS: Record<string, { environment: string; background: string; lighting: string; camera: string; style: string }> = {
  white_studio: {
    environment: 'Professional photo studio',
    background: 'Pure white seamless backdrop',
    lighting: 'Soft box lighting from 45° left and right, even illumination',
    camera: 'Eye-level, slight downward angle',
    style: 'Clean, minimal, e-commerce ready',
  },
  lifestyle: {
    environment: 'Real-world usage context appropriate for the product',
    background: 'Natural, lived-in space with soft-focus depth of field',
    lighting: 'Natural window light, golden hour warmth',
    camera: 'Candid, slightly dynamic angle',
    style: 'Authentic, aspirational, social-media ready',
  },
  nature: {
    environment: 'Natural outdoor setting complementary to product',
    background: 'Natural landscape with bokeh',
    lighting: 'Natural sunlight, preferably golden hour',
    camera: 'Environmental portrait style',
    style: 'Fresh, organic, natural',
  },
  urban: {
    environment: 'Modern city setting with architectural elements',
    background: 'Concrete textures, modern architecture, street elements',
    lighting: 'Mixed natural and urban ambient light',
    camera: 'Dynamic street photography angles',
    style: 'Edgy, modern, metropolitan',
  },
  luxury: {
    environment: 'High-end styled set — marble surfaces, elegant props',
    background: 'Deep, rich textures (velvet, marble, polished metal)',
    lighting: 'Dramatic single-source lighting with subtle fill',
    camera: 'Low angle, heroic perspective',
    style: 'Premium, aspirational, editorial',
  },
  festive: {
    environment: 'Celebration setting with seasonal decorations',
    background: 'Festive elements, warm colors, celebration atmosphere',
    lighting: 'Warm, golden, festive ambient lighting with sparkle',
    camera: 'Inviting, warm perspective',
    style: 'Joyful, warm, celebratory',
  },
};

const SHOT_ANGLES = [
  'Front-facing hero shot',
  '45-degree three-quarter view',
  'Top-down flat lay',
  'Close-up detail macro',
  'Side profile with depth',
  'Low angle dramatic perspective',
];

// v2.0 — matches system-prompts.md photoshoot_base_v1
export function buildPhotoshootPrompt(input: PhotoshootPromptInput): string {
  const { environment, shotIndex, totalShots, notes, brandKit } = input;
  const preset = ENVIRONMENT_PRESETS[environment] || ENVIRONMENT_PRESETS.white_studio;
  const angle = SHOT_ANGLES[shotIndex % SHOT_ANGLES.length];

  let prompt = `Professional product photography session.`;
  prompt += `\n\nProduct: The item in the provided reference image`;
  prompt += `\nEnvironment: ${preset.environment}`;
  prompt += `\nCamera Angle: ${angle}`;
  prompt += `\nLighting Setup: ${preset.lighting}`;
  prompt += `\nBackground: ${preset.background}`;
  prompt += `\nStyle: ${preset.style}`;
  prompt += `\n\nRequirements:`;
  prompt += `\n- EXACT product preservation — do not alter the product's colors, text, logos, or shape`;
  prompt += `\n- The product must be the clear focal point`;
  prompt += `\n- Professional commercial quality`;
  prompt += `\n- No shadows that obscure product details`;
  prompt += `\n- Consistent with high-end brand photography`;
  prompt += `\n\nShot ${shotIndex + 1} of ${totalShots}: ${angle}`;

  if (brandKit) {
    prompt += `\n\nBrand colors for subtle accents: ${brandKit.primary_color}, ${brandKit.secondary_color}`;
  }
  if (notes) {
    prompt += `\n\nAdditional requirements: ${notes}`;
  }

  return prompt;
}

export const PHOTOSHOOT_PROMPT_VERSION = getPromptVersion('photoshoot');
