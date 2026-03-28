interface CampaignPromptInput {
  productDescription: string;
  targetAudience: string;
  dialect: string;
  platform: string;
  occasion?: string;
  brandName?: string;
}

const DIALECT_MAP: Record<string, string> = {
  saudi: 'Saudi Arabian dialect',
  emirati: 'Emirati dialect',
  egyptian: 'Egyptian dialect',
  gulf: 'General Gulf dialect',
  formal: 'Modern Standard Arabic (فصحى)',
};

// v1.0
export function buildCampaignPrompt(input: CampaignPromptInput): string {
  const { productDescription, targetAudience, dialect, platform, occasion, brandName } = input;

  const dialectDesc = DIALECT_MAP[dialect] || DIALECT_MAP.gulf;

  let prompt = `Act as a professional Creative Director specializing in the ${dialectDesc} market.`;
  prompt += `\n\nProduct/Service: ${productDescription}`;

  if (brandName) {
    prompt += `\nBrand: ${brandName}`;
  }

  prompt += `\nTarget Audience: ${targetAudience}`;
  prompt += `\nPlatform: ${platform}`;

  if (occasion) {
    prompt += `\nOccasion/Theme: ${occasion}`;
  }

  prompt += `\n\nGenerate exactly 9 campaign posts. Each post MUST include:`;
  prompt += `\n1. "scenario": A detailed English visual prompt for image generation (photographic style, specific composition, lighting, and mood)`;
  prompt += `\n2. "caption": Engaging caption in ${dialectDesc}, with emojis, 150-200 characters`;
  prompt += `\n3. "tov": Hook phrase 5-7 words in ${dialectDesc}`;
  prompt += `\n4. "schedule": Suggested posting day and time`;
  prompt += `\n5. "hashtags": 10 relevant hashtags`;
  prompt += `\n\nIMPORTANT: Return ONLY a valid JSON array. No markdown, no explanation, just the JSON array.`;
  prompt += `\nEach post should have a different theme/angle to keep the campaign diverse and engaging.`;

  return prompt;
}
