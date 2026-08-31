import { buildFramingBlock } from './platform-framing';
import { buildImageTextRule } from './image-text-rule';

/**
 * The image half of the campaign studio.
 *
 * ── WHY THIS IS A FILE AND NOT TWENTY LINES IN THE ROUTE ───────────────────
 * It was twenty lines in the route until 2026-08-31, and the route's own
 * comment already admitted the consequence (`campaign/route.ts:203-208`):
 * `prompt-builder-sanitized` scans `lib/ai/prompts` only, so the one image
 * prompt built inside a route was the one image prompt no invariant guarded.
 *
 * That matters here more than anywhere else in the product, because
 * `post.scenario` is MODEL-authored text handed straight to the image model.
 * The campaign route is the only path where the thing being interpolated was
 * written by an LLM rather than typed by a customer, and it is therefore the
 * one place a filter cannot be enforced at the request boundary.
 *
 * ── WHAT THE CAMPAIGN NEEDS THAT CREATOR DOES NOT ──────────────────────────
 * `post.scenario` arrives already in English and already photographic — the
 * text model is asked for "a detailed English visual prompt … be specific about
 * composition, colors, subjects, mood". So nothing here expands or rewrites it.
 * What it lacked was a canvas and a text rule, and both are shared with creator
 * rather than restated, so the two text-to-image studios cannot drift.
 *
 * ── THE CANVAS, MEASURED ───────────────────────────────────────────────────
 * On 2026-08-31 a full campaign with `platform: 'instagram'` returned nine
 * images at 1024x1024. Square is a legal Instagram feed post; 4:5 is the one the
 * platform gives the most height to, and naming the platform is the customer
 * asking for it. See platform-framing.ts.
 */
/**
 * ── WHY EVERY FIELD HERE ARRIVES PRE-FILTERED ──────────────────────────────
 * This builder does NOT call `sanitizePrompt`, and that is the one design
 * decision in this file that took a second pass to get right.
 *
 * The obvious version filtered its own inputs, belt-and-braces, the way
 * `buildCreatorPrompt` does. It is wrong HERE, and the reason is the campaign
 * route's structure rather than anything about filtering:
 *
 *     try { safeScenario = sanitizePrompt(post.scenario, 2000) }
 *     catch (e) { ...log, refund THIS image, return null }     <- route:387-393
 *
 *     const imagePrompt = buildCampaignImagePrompt({ ... })    <- OUTSIDE that try
 *
 * `sanitizePrompt` THROWS. A second call inside the builder throws outside the
 * per-image catch, so one blocked scenario out of nine would stop being "drop
 * that image and refund its share" and become "fail the whole 12-credit
 * campaign". That is a strictly worse outcome, produced by adding a guard.
 *
 * It could not fire today — same function, same string, already survived the
 * first call — but "safe because the caller happens to filter first" is the
 * kind of coupling this repo keeps getting caught by, so the contract is stated
 * instead: the caller filters, and every parameter here is named `safe*` so
 * `prompt-builder-sanitized` checks that this file only ever interpolates
 * filtered values. `photoshoot` takes `brandContextBlock` from its caller for
 * the same reason.
 */
interface CampaignImagePromptInput {
  /** The model-authored scene for this post, ALREADY filtered by the route
   *  inside the try/catch that drops one image on a block. */
  safeScenario: string;
  /** One of CAMPAIGN_PLATFORM_IDS, from the route's own z.enum. */
  platform: string;
  /** Already flattened and filtered by the route, matching the convention
   *  `buildCampaignPrompt` has always used for brand fields. */
  safeBrandColors?: string;
  /** The shared business-facts block, built and filtered by the caller. Taken
   *  rather than rebuilt for the same reason photoshoot takes it: this builder
   *  must not be where a blocked brand-kit column is discovered, because that
   *  turns a brand-kit problem into a failed campaign. */
  brandContextBlock?: string;
}

export function buildCampaignImagePrompt(input: CampaignImagePromptInput): string {
  const { safeScenario, platform, safeBrandColors, brandContextBlock } = input;

  let prompt = `Create a professional social media image.`;

  prompt += `\n\nSUBJECT\n${safeScenario}`;

  if (safeBrandColors) {
    prompt += `\n\nBRAND`;
    prompt += `\n- Colours: ${safeBrandColors}`;
    prompt += `\n- Let these colours appear in the styling, props and ambient light. Never recolour the subject itself to match them.`;
  }

  prompt += brandContextBlock ?? '';

  prompt += buildFramingBlock(platform);

  prompt += `\n\nMUST`;
  prompt += `\n- Keep the subject the unmistakable focal point and the sharpest element in the frame`;
  prompt += `\n- Light it deliberately, with a physically consistent key, and hold detail in both highlights and shadows`;

  prompt += `\n\nAVOID`;
  prompt += `\n- Watermarks, captions, borders, graphic overlays or UI chrome of any kind`;
  prompt += `\n- A plastic, over-retouched CGI look`;

  // `none`, not `contained`: a campaign's words are its CAPTION, and the caption
  // is delivered as text beside the image — `caption`, `tov` and `hashtags` are
  // separate fields on the post. Nothing in a campaign asks for words inside the
  // frame, so the strong concrete form is available and is the right one.
  //
  // The second argument is unused under `none` (the Arabic shaping branch only
  // fires for `contained`) and is passed anyway so the call reads the same at
  // both call sites and a later change of mode cannot silently drop it.
  prompt += buildImageTextRule('none', safeScenario);

  return prompt;
}
