import type { AIModel } from '@/types/studios';
import { MODELS } from './models';
import { isValidApiKey } from './utils';
import { PROVIDER_TIMEOUTS, ProviderPermanentError, ProviderTimeoutError, fetchWithTimeout } from './http';

interface GenerateFluxOptions {
  prompt: string;
  resolution: string;
  /** One of FLUX_ASPECT_RATIOS. Omitted means "the caller has no opinion", which
   *  this adapter turns into the model's own 1:1 default — see fluxSize(). */
  aspectRatio?: string;
}

/**
 * ── A CONFIRMED PRODUCTION DEFECT, FOUND 2026-08-31 ────────────────────────
 * `width` and `height` were being sent on every request and IGNORED on every
 * request. Read from the `dereferenced_openapi_schema` Replicate embeds in the
 * model's own /api/schema page, for version
 * `0e5adbef57ef4793d87177edaab0657cb1d5b1a8493ffa5c1fb0446306f10c95`:
 *
 *     width:  { type: integer, minimum: 256, maximum: 1440,
 *               description: "Only used when aspect_ratio=custom. Must be a
 *                             multiple of 32 (if it's not, it will be rounded
 *                             to nearest multiple of 32)." }
 *     height: byte-identical
 *     aspect_ratio: { enum: [custom, 1:1, 16:9, 3:2, 2:3, 4:5, 5:4, 9:16, 3:4, 4:3],
 *                     default: "1:1" }
 *
 * This adapter never sent `aspect_ratio`, so it defaulted to `1:1` and the
 * width/height beside it were inert. Every tier — 1080p, 2K and 4K — produced
 * the same default square. **flux has never delivered the 2K/4K resolution the
 * paid plans sell.** Same defect class as photoshoot's hardcoded '1080p', which
 * CLAUDE.md already records.
 *
 * A second, independent problem: `4K` mapped to 2048, above the schema's
 * declared maximum of 1440. Whether Replicate's API rejects that or silently
 * accepts it was NOT established — the claim that it 422s traced to a GitHub
 * SDK issue rather than to provider documentation, and Replicate's own
 * changelog says payload validation "only applies to top-level properties".
 * It is capped here either way, because a value outside a published range is
 * not something to find out about in production.
 *
 * ── WHY THE MULTIPLE-OF-32 RULE IS OBEYED RATHER THAN CHECKED ──────────────
 * `multipleOf` appears ZERO times in that 192 KB schema payload. The rule lives
 * only in the description, and the description says an off-grid value is
 * ROUNDED, not rejected. So a wrong width does not error — it silently changes
 * the delivered aspect ratio. Every dimension below is computed onto the grid
 * for that reason, and `test:image-canvas` asserts it.
 */
const FLUX_MAX_EDGE = 1440;
const FLUX_MIN_EDGE = 256;
const FLUX_STEP = 32;

/** The enum, verbatim from the schema. Exported so the framing table can be
 *  checked against what this provider can actually serve rather than against a
 *  restatement of it. */
export const FLUX_ASPECT_RATIOS = [
  'custom', '1:1', '16:9', '3:2', '2:3', '4:5', '5:4', '9:16', '3:4', '4:3',
] as const;

/** Longest edge per resolution tier, clamped to the schema's own ceiling.
 *
 *  `4K` cannot be honoured by this model at all — 1440 is the most it can give,
 *  so 2K and 4K collapse to the same frame here. That is a real limitation and
 *  it is NOT hidden: `router.ts` prefers gemini for image work, so this is the
 *  fallback delivering the best it can rather than failing. What it must never
 *  do again is discard the tier entirely, which is what the enum path did. */
const FLUX_LONG_EDGE: Record<string, number> = {
  '1080p': 1024,
  '2K': 1440,
  '4K': FLUX_MAX_EDGE,
};

function snap(n: number): number {
  const stepped = Math.round(n / FLUX_STEP) * FLUX_STEP;
  return Math.min(FLUX_MAX_EDGE, Math.max(FLUX_MIN_EDGE, stepped));
}

/**
 * The width/height to send, and the shape to send them under.
 *
 * ── ALWAYS `custom`, AND THE FIRST VERSION OF THIS FUNCTION GOT IT WRONG ────
 * The obvious version preferred flux's own enum whenever it carried the
 * requested ratio, on the reasoning that the provider's supported path avoids
 * the rounding trap. Adversarial review measured what that actually produced:
 *
 *     fluxSize('1080p','4:5') -> {"aspect_ratio":"4:5"}
 *     fluxSize('2K',   '4:5') -> {"aspect_ratio":"4:5"}
 *     fluxSize('4K',   '4:5') -> {"aspect_ratio":"4:5"}
 *
 * Byte-identical across all three tiers. `width`/`height` are the ONLY channel
 * this model has for resolution, and they are read only under `custom` — so the
 * enum path throws the tier away and flux picks its own ~1 MP canvas. Every
 * ratio the product can send (1:1, 4:5, 9:16, 16:9 from platform-framing.ts;
 * 1:1 and 2:3 from edit) is an enum member, so the `custom` branch was dead on
 * every reachable path and this function had **reproduced the very defect its
 * own header describes** — a paid 4K request served at 1080p-class size, at 4x
 * the price, with nothing in the response to say so.
 *
 * So: `custom` always, dimensions always, computed onto the 32px grid. The
 * rounding trap is handled by computing onto the grid rather than by avoiding
 * the parameter that carries the resolution the customer paid for.
 */
export function fluxSize(resolution: string, aspectRatio?: string): {
  aspect_ratio: 'custom';
  width: number;
  height: number;
} {
  const long = FLUX_LONG_EDGE[resolution] ?? FLUX_LONG_EDGE['1080p'];
  const [w, h] = (aspectRatio ?? '1:1').split(':').map(Number);
  // An unparseable ratio degrades to a square at the requested tier — the
  // resolution is still honoured, which is the half a caller is paying for.
  const valid = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  const [rw, rh] = valid ? [w, h] : [1, 1];

  const landscape = rw >= rh;
  return {
    aspect_ratio: 'custom',
    width: snap(landscape ? long : (long * rw) / rh),
    height: snap(landscape ? (long * rh) / rw : long),
  };
}

interface AIResult {
  url?: string;
  model: AIModel;
  mock: boolean;
}

const MOCK_IMAGE_URLS = [
  'https://placehold.co/1080x1080/0891B2/FFFFFF?text=Flux+Generated',
  'https://placehold.co/1080x1080/22D3EE/000000?text=Flux+AI',
  'https://placehold.co/1080x1080/67E8F9/000000?text=Flux+Studio',
];

function getMockImageUrl(): string {
  return MOCK_IMAGE_URLS[Math.floor(Math.random() * MOCK_IMAGE_URLS.length)];
}

export async function generateFlux(options: GenerateFluxOptions): Promise<AIResult> {
  const apiToken = process.env.REPLICATE_API_TOKEN;

  if (!isValidApiKey(apiToken)) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return { url: getMockImageUrl(), model: 'flux', mock: true };
  }

  // Replaces a `sizeMap` whose width/height were inert on every tier because
  // `aspect_ratio` was never sent and defaults to "1:1" — see fluxSize()'s
  // header for the schema evidence and what it means for the paid plans.
  const size = fluxSize(options.resolution, options.aspectRatio);

  const startedAt = Date.now();

  // Start prediction
  const createResponse = await fetchWithTimeout('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      model: MODELS.flux,
      input: {
        prompt: options.prompt,
        // `aspect_ratio` FIRST and always: without it the two dimensions below
        // are ignored by the model, which is how this adapter shipped a square
        // for every tier for as long as it has existed. Spread rather than set
        // to undefined, so `custom` is the only shape that carries dimensions
        // and the enum path sends exactly what the schema documents.
        ...size,
      },
    }),
  }, PROVIDER_TIMEOUTS.image, 'flux');

  if (!createResponse.ok) {
    throw new ProviderPermanentError(`Replicate API error: ${createResponse.status}`, createResponse.status);
  }

  const prediction = await createResponse.json();
  let result = prediction;

  // Poll for completion (max 60 seconds)
  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    if (result.status === 'succeeded') break;
    if (result.status === 'failed') throw new Error('Flux generation failed');

    await new Promise((resolve) => setTimeout(resolve, 2000));

    // A poll loop needs a deadline for the WHOLE operation, not just each poll —
    // otherwise a prediction that never finishes still hangs, holding the credit
    // reservation open until the reconciler finds it.
    if (Date.now() - startedAt > PROVIDER_TIMEOUTS.image) {
      throw new ProviderTimeoutError('flux', PROVIDER_TIMEOUTS.image);
    }

    const pollResponse = await fetchWithTimeout(
      `https://api.replicate.com/v1/predictions/${result.id}`,
      {
        headers: { Authorization: `Bearer ${apiToken}` },
      },
      PROVIDER_TIMEOUTS.image,
      'flux'
    );

    result = await pollResponse.json();
  }

  if (result.status !== 'succeeded') {
    throw new Error('Flux generation timeout (exceeded 60 seconds)');
  }

  const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;

  if (!outputUrl) {
    throw new Error('No image generated by Flux');
  }

  return { url: outputUrl as string, model: 'flux', mock: false };
}
