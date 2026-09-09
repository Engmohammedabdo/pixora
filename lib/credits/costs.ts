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

/**
 * What a photoshoot costs, by shot count — the DECOMPOSITION of
 * `CREDIT_COSTS.photoshoot`, which is only ever the six-shot ceiling.
 *
 * This lived as a private `const SHOT_COSTS` inside
 * `app/api/studios/photoshoot/route.ts` while THREE public surfaces published a
 * photoshoot price: /studios/[slug], the /studios index, and the pricing page's
 * cost table. None could import it, so each either typed the range into a
 * translation or published the bare ceiling — and the pricing table published
 * the ceiling, quoting a one-shot customer 4x what the route charges.
 *
 * Prices are code (that is why the admin per-studio price knob was deleted), so
 * the decomposition belongs beside the price it decomposes, exactly as
 * `campaignCostBands()` does for the campaign's two bands. `lib/studios/cost-label.ts`
 * previously carried a literal `2` for the floor with a comment explaining that
 * it could not be imported; it can now.
 *
 * The ceiling stays derived rather than restated: `PHOTOSHOOT_SHOT_COSTS[6]` and
 * `CREDIT_COSTS.photoshoot` must agree, and `scripts/tests/studio-pages.test.ts`
 * asserts it, so a change to one that is not made to the other fails the build
 * instead of shipping two prices for the same shoot.
 */
export const PHOTOSHOOT_SHOT_COSTS: Record<number, number> = { 1: 2, 3: 4, 6: 8 };

/** The shot counts the photoshoot form offers, in the order it offers them. */
export const PHOTOSHOOT_SHOT_OPTIONS = [1, 3, 6] as const;

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
 * number a prospect has no way to evaluate.
 *
 * Priced at the PLAN'S OWN resolution, not the cheapest one.
 *
 * This used to divide by the cheapest image cost (1080p at 1 credit) for every
 * tier, which is only true for Free — the one plan actually capped at 1080p.
 * Starter is sold on 2K and Pro, Business and Agency on 4K, so the figure a
 * prospect read on the pricing page overstated what their own plan delivers by
 * 2x and 4x: "600 credits ≈ 600 images" on a 4K plan is really 150. The number
 * that sells the plan has to be the number the plan produces.
 *
 * A customer can of course generate below their cap and get more images; this
 * is deliberately the conservative figure, since the alternative is a promise
 * the default resolution breaks.
 */
export function estimateImagesFromCredits(
  credits: number,
  resolution: keyof typeof CREDIT_COSTS.image
): number {
  // Required, deliberately. A default of '1080p' would keep the original bug
  // alive as the zero-argument call shape — the exact overstatement this
  // function was changed to remove.
  return Math.max(0, Math.floor(credits / CREDIT_COSTS.image[resolution]));
}
