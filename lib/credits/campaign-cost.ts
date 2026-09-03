import { EXPECTED_POSTS } from '@/lib/ai/studio-output-schemas';
import { CREDIT_COSTS, getStudioCost } from '@/lib/credits/costs';

/**
 * The campaign price, DECOMPOSED — the one place it is decomposed.
 *
 * A campaign is the only studio the product charges two different prices for.
 * `app/api/studios/campaign/route.ts` has always known that: its reservation is
 * `input.generateImages ? full : text`, because the form's "Generate All
 * Images" checkbox is real and clearing it means the nine image slots are null
 * by construction, so charging the flat price for them would be charging for
 * work no path can deliver.
 *
 * The decomposition lived inside that route as three local consts, which was
 * fine while the route was the only reader — and it was not. The public
 * /studios/campaign page and the /studios index published `costShape: 'flat'`,
 * i.e. the 12, while the same page's own FAQ told the visitor the images are
 * optional and that "you pay for the text half alone" without ever naming that
 * figure. The only number a shop owner could read was the one that does not
 * apply to the path the page describes.
 *
 * So the rule moved here and BOTH readers import it. A second copy of
 * `Math.max(1, full - 9 * perImage)` is exactly how a published price and a
 * charged price drift apart — the reason the admin per-studio price knob was
 * deleted and prices became code.
 */
export interface CampaignCostBands {
  /** The flat price: nine posts AND their nine images. What the in-app form
   *  charges by default — `CampaignForm.tsx` starts the checkbox at `true`. */
  full: number;
  /** The nine posts as text alone, with no image reserved. */
  text: number;
  /** What one campaign image costs, at the 1080p rate every other studio pays. */
  perImage: number;
  /** EXPECTED_POSTS, re-exported so a caller reasoning about the split does not
   *  have to reach into lib/ai/ for it. */
  posts: number;
}

export function campaignCostBands(): CampaignCostBands {
  const perImage = CREDIT_COSTS.image['1080p'];
  const full = getStudioCost('campaign');
  // Clamped at 1, so a price set at or below the image half cannot make the
  // text-only campaign reserve nothing and generate for free. The clamp is part
  // of the rule, not a defensive extra: it is what the route charges.
  const text = Math.max(1, full - EXPECTED_POSTS * perImage);
  return { full, text, perImage, posts: EXPECTED_POSTS };
}
