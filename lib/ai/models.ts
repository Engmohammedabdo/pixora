/**
 * Central registry of AI model IDs.
 *
 * Model IDs used to be hardcoded across gemini.ts / openai.ts / replicate.ts /
 * elevenlabs.ts / tts-router.ts, so every provider update meant a code change and
 * a redeploy. They now live here and every one can be overridden with an env var,
 * so a model can be swapped from Coolify without touching the codebase.
 *
 * Verified against official provider documentation on 2026-07-20:
 *   https://ai.google.dev/gemini-api/docs/models
 *   https://developers.openai.com/api/docs/pricing
 *   https://developers.openai.com/api/docs/deprecations
 *   https://elevenlabs.io/docs/overview/models
 *
 * ⚠ Do NOT invent model IDs. An unknown ID fails at runtime, not at build time —
 *   check the provider's model list before changing a default.
 */

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : fallback;
}

export const MODELS = {
  /**
   * Gemini image — "Nano Banana 2". Chosen as the default because it is the
   * cheapest and by far the fastest of the current family (~850ms vs ~1,800ms for
   * Pro and ~4,200ms for GPT Image 2), which matters most on the studios users
   * run in a loop. Supports image input, so reference/product photos reach it.
   */
  geminiImage: env('PYRA_MODEL_GEMINI_IMAGE', 'gemini-3.1-flash-image'),

  /**
   * Gemini image, premium tier — "Nano Banana Pro". Studio-quality with true 4K
   * and markedly better in-image text rendering. Used for 4K requests, where the
   * customer is already being charged a premium.
   */
  geminiImagePro: env('PYRA_MODEL_GEMINI_IMAGE_PRO', 'gemini-3-pro-image'),

  /**
   * Gemini text — Flash-Lite. Frontier-class quality at a small fraction of the
   * first-tier price, which is what keeps the margin on text studios (plan,
   * analysis, campaign) viable. Arabic consumes more tokens than English for the
   * same meaning, so per-token cost matters more here than for an English product.
   */
  geminiText: env('PYRA_MODEL_GEMINI_TEXT', 'gemini-3.1-flash-lite'),

  /**
   * OpenAI image. MUST NOT be gpt-image-1: that model is deprecated and shuts
   * down on 2026-12-01. gpt-image-2 is the documented replacement.
   */
  openaiImage: env('PYRA_MODEL_OPENAI_IMAGE', 'gpt-image-2'),

  /** OpenAI text, used as the fallback path when Gemini is unavailable. */
  openaiText: env('PYRA_MODEL_OPENAI_TEXT', 'gpt-5.4-mini'),

  /**
   * OpenAI text-to-speech. gpt-4o-mini-tts is the current recommended model and
   * accepts a natural-language `instructions` field to steer accent and tone —
   * useful for asking for a specific Arabic dialect. tts-1/tts-1-hd still work but
   * are no longer the recommendation.
   */
  openaiTts: env('PYRA_MODEL_OPENAI_TTS', 'gpt-4o-mini-tts'),

  /**
   * ElevenLabs. v3 is the newest model, covers 70+ languages including Arabic,
   * and handles diacritics (tashkeel) better than multilingual_v2.
   */
  elevenlabs: env('PYRA_MODEL_ELEVENLABS', 'eleven_v3'),

  /** Replicate / Flux. Text-to-image only — it cannot accept a reference image. */
  flux: env('PYRA_MODEL_FLUX', 'black-forest-labs/flux-1.1-pro'),
} as const;

/**
 * Maps PyraSuite's plan-facing resolution labels to Gemini's `imageSize` values.
 * Gemini requires an uppercase "K" — lowercase is rejected by the API.
 */
export function geminiImageSize(resolution: string | undefined): '1K' | '2K' | '4K' {
  switch (resolution) {
    case '4K': return '4K';
    case '2K': return '2K';
    default: return '1K';
  }
}

/** Maps the same labels to OpenAI's pixel `size` strings. */
/**
 * ── THE ACCEPTANCE RULE, FROM OPENAI'S OWN DOCS (checked 2026-08-31) ────────
 * `gpt-image-2` has NO fixed size enum. The guide states it "accepts any
 * resolution in the size parameter when it satisfies the constraints below":
 *
 *   - both edges must be multiples of 16
 *   - maximum edge length <= 3840
 *   - long:short ratio must not exceed 3:1
 *   - total pixels within [655,360 , 8,294,400]
 *
 * The three values this function returned before — 1024x1024, 1536x1536 and
 * 2048x2048 — all satisfy every one of them, so the suspicion that 2K/4K gpt
 * requests were already failing in production is REFUTED. Recorded because a
 * corrected claim is worth as much as a fixed defect.
 *
 * One real caution survives: 2048x2048 is 4,194,304 px, above the 2560x1440
 * (3,686,400 px) line past which OpenAI explicitly calls output "experimental".
 * The 4K tier therefore rides a band OpenAI reserves the right to change.
 */
const OPENAI_STEP = 16;
const OPENAI_MAX_EDGE = 3840;
const OPENAI_MIN_PIXELS = 655_360;
const OPENAI_MAX_PIXELS = 8_294_400;
const OPENAI_MAX_RATIO = 3;

/** Longest edge per tier. Unchanged for the square case, so the sizes this
 *  function already returned for a caller with no ratio are byte-identical. */
const OPENAI_LONG_EDGE: Record<string, number> = {
  '1080p': 1024,
  '2K': 1536,
  '4K': 2048,
};

function snap16(n: number): number {
  return Math.max(OPENAI_STEP, Math.round(n / OPENAI_STEP) * OPENAI_STEP);
}

/**
 * `WIDTHxHEIGHT` for the requested tier and shape.
 *
 * Every constraint above is enforced HERE rather than discovered from a 400,
 * because OpenAI documents no size-specific error — the docs name no code, no
 * message and no example for a rejected size, so a caller cannot tell that
 * failure apart from any other bad request. The one thing the docs ARE explicit
 * about is that image-generation user errors "must not be automatically
 * retried", which makes a silently-wrong size a paid failure with no recovery.
 */
export function openaiImageSize(resolution: string | undefined, aspectRatio?: string): string {
  const long = OPENAI_LONG_EDGE[resolution ?? ''] ?? OPENAI_LONG_EDGE['1080p'];
  const [rw, rh] = (aspectRatio ?? '1:1').split(':').map(Number);
  const valid = Number.isFinite(rw) && Number.isFinite(rh) && rw > 0 && rh > 0;
  // An unparseable ratio falls back to square — the shape this function
  // returned for every caller before it took a ratio at all.
  const [w0, h0] = valid ? [rw, rh] : [1, 1];

  const landscape = w0 >= h0;
  let width = snap16(landscape ? long : (long * w0) / h0);
  let height = snap16(landscape ? (long * h0) / w0 : long);

  // Clamp in the order the constraints bind: edge, then ratio, then pixels.
  // Scaling for the pixel ceiling last means the earlier clamps cannot push it
  // back over — shrinking never increases area.
  const overEdge = Math.max(width, height) / OPENAI_MAX_EDGE;
  if (overEdge > 1) { width = snap16(width / overEdge); height = snap16(height / overEdge); }

  const ratio = Math.max(width, height) / Math.min(width, height);
  if (ratio > OPENAI_MAX_RATIO) {
    if (width > height) width = snap16(height * OPENAI_MAX_RATIO);
    else height = snap16(width * OPENAI_MAX_RATIO);
  }

  const pixels = width * height;
  if (pixels > OPENAI_MAX_PIXELS) {
    const k = Math.sqrt(OPENAI_MAX_PIXELS / pixels);
    width = snap16(width * k); height = snap16(height * k);
  } else if (pixels < OPENAI_MIN_PIXELS) {
    const k = Math.sqrt(OPENAI_MIN_PIXELS / pixels);
    // Ceil onto the grid rather than round: rounding down here would land
    // back under the floor, which is the one direction that is a hard reject.
    width = Math.ceil((width * k) / OPENAI_STEP) * OPENAI_STEP;
    height = Math.ceil((height * k) / OPENAI_STEP) * OPENAI_STEP;
  }

  return `${width}x${height}`;
}
