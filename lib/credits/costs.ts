export const CREDIT_COSTS = {
  image: { '1080p': 1, '2K': 2, '4K': 4 } as const,
  campaign: 12,
  photoshoot: 8,
  storyboard: 14,
  analysis: 3,
  plan: 5,
  voiceover: 1,
  edit: 1,
  prompt: 0,
  video: 10,
} as const;

export type StudioCostKey = keyof typeof CREDIT_COSTS;

export function getStudioCost(studio: string, resolution?: string): number {
  if (studio === 'image' || studio === 'creator') {
    const res = (resolution || '1080p') as keyof typeof CREDIT_COSTS.image;
    return CREDIT_COSTS.image[res] || 1;
  }

  const key = studio as keyof typeof CREDIT_COSTS;
  const cost = CREDIT_COSTS[key];

  if (typeof cost === 'number') {
    return cost;
  }

  return 1;
}
