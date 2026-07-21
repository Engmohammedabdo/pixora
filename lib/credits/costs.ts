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

/**
 * Translates a raw plan credit balance into an approximate outcome count
 * ("≈ N images") for pricing UI — plan cards otherwise show a bare credit
 * number a prospect has no way to evaluate. Derived from the cheapest image
 * resolution's real cost (`CREDIT_COSTS.image`, currently 1080p at 1 credit)
 * rather than hardcoded, so this stays correct if resolution pricing changes.
 */
export function estimateImagesFromCredits(credits: number): number {
  const cheapestImageCost = Math.min(...Object.values(CREDIT_COSTS.image));
  return Math.max(0, Math.floor(credits / cheapestImageCost));
}
