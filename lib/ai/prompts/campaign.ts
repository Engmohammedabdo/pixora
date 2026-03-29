import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';

interface CampaignPromptInput {
  productDescription: string;
  targetAudience: string;
  dialect: string;
  platform: string;
  occasion?: string;
  brandName?: string;
  brandVoice?: string;
  brandColors?: string;
}

const DIALECT_MAP: Record<string, { name: string; guideline: string }> = {
  saudi: { name: 'Saudi Arabian', guideline: 'Use Saudi expressions, avoid formal Arabic, add local flavor' },
  emirati: { name: 'Emirati', guideline: 'UAE-specific references, cosmopolitan yet local' },
  egyptian: { name: 'Egyptian', guideline: 'Egyptian humor and warmth, colloquial Egyptian' },
  gulf: { name: 'Pan-Gulf', guideline: 'Pan-Gulf friendly, avoids country-specific slang' },
  formal: { name: 'Modern Standard Arabic', guideline: 'Professional فصحى, clear and eloquent' },
};

// v2.0 — matches system-prompts.md campaign_planner_v1
export function buildCampaignPrompt(input: CampaignPromptInput): string {
  const { productDescription, targetAudience, dialect, platform, occasion, brandName, brandVoice, brandColors } = input;
  const safeDesc = sanitizePrompt(productDescription);
  const dialectInfo = DIALECT_MAP[dialect] || DIALECT_MAP.gulf;

  let prompt = `Act as a professional Creative Director and Social Media Strategist specializing in the ${dialectInfo.name} market.`;

  prompt += `\n\nClient Brief:`;
  prompt += `\n- Product/Service: ${safeDesc}`;
  prompt += `\n- Target Audience: ${targetAudience}`;
  prompt += `\n- Platform: ${platform}`;
  if (occasion) prompt += `\n- Occasion/Season: ${occasion}`;
  if (brandName) prompt += `\n- Brand: ${brandName}`;
  if (brandVoice) prompt += `\n- Brand Voice: ${brandVoice}`;
  if (brandColors) prompt += `\n- Brand Colors: ${brandColors}`;

  prompt += `\n\nYour task: Create a complete social media campaign with exactly 9 posts.`;

  prompt += `\n\nEach post must follow this exact JSON structure:`;
  prompt += `\n{`;
  prompt += `\n  "post_number": 1,`;
  prompt += `\n  "theme": "Brief theme description in English",`;
  prompt += `\n  "scenario": "Detailed English visual prompt for image generation (be specific about composition, colors, subjects, mood — this goes directly to an AI image generator)",`;
  prompt += `\n  "caption": "Engaging ${dialectInfo.name} caption with emojis (150-200 characters)",`;
  prompt += `\n  "tov": "Hook phrase/tagline in ${dialectInfo.name} — 5-7 words, punchy",`;
  prompt += `\n  "hashtags": "#tag1 #tag2 ...10 hashtags total",`;
  prompt += `\n  "schedule": "Suggested day and time with reason",`;
  prompt += `\n  "post_type": "Image or Carousel or Video or Story"`;
  prompt += `\n}`;

  prompt += `\n\nCampaign Structure (spread strategically):`;
  prompt += `\n- Posts 1-3: Awareness (introduce product/brand)`;
  prompt += `\n- Posts 4-6: Engagement (benefits, social proof, UGC)`;
  prompt += `\n- Posts 7-9: Conversion (CTA, offer, urgency)`;

  prompt += `\n\nDialect Guideline for ${dialectInfo.name}: ${dialectInfo.guideline}`;

  prompt += `\n\nIMPORTANT: Return ONLY a valid JSON array of 9 posts. No additional text.`;

  return prompt;
}

export const CAMPAIGN_PROMPT_VERSION = getPromptVersion('campaign_planner');
