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
   *
   * Constrained to `OPENAI_IMAGE_MODELS` below — read that block before changing
   * this value or setting the env var. This is a PRICED choice, not a name.
   */
  openaiImage: env('PYRA_MODEL_OPENAI_IMAGE', 'gpt-image-2.5-flare'),

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
/**
 * ── THE OPENAI IMAGE MODELS THIS PRODUCT HAS PRICED ────────────────────────
 *
 * `PYRA_MODEL_OPENAI_IMAGE` is an env var, so the image model on the paid
 * fallback path can be changed on production with no code, no review and no
 * gate. That was fine while there was one sane value. On 2026-09-08 OpenAI
 * shipped **gpt-image-2.5**, and it is not one id — it is two:
 * `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst`. **There is no model called
 * `gpt-image-2.5`**, so the obvious env edit 400s every fallback request.
 *
 * The bigger reason this list exists is PRICE. Image output bills per token at
 * $30/1M — the same rate as gpt-image-2 — but 2.5 adds two quality tiers,
 * `xhigh` and `max`, ABOVE `high`. Documented cost per 1024x1024 runs $0.006 at
 * `low` to **$0.211 at `max`**. Against what a credit actually earns:
 *
 *     plan       4K image revenue     cost at `max` (1024x1024!)
 *     starter          $0.240                 $0.211
 *     pro              $0.193                 $0.211   <- loses money
 *     business         $0.157                 $0.211   <- loses money
 *     agency           $0.119                 $0.211   <- loses money
 *
 * and at 1080p, where a customer pays ONE credit, every plan loses $0.15-0.18.
 * Our 4K request asks for 2048x2048, four times the area that table prices, so
 * the real figure is worse.
 *
 * **We send no `quality` parameter at all**, so the API default applies, and the
 * documented default is `"auto"` — "automatically select the best quality for
 * the given model". On gpt-image-2 that ceiling is `high`. On 2.5 the same word
 * reaches `max`. So adopting 2.5 by changing this string alone would move the
 * cost ceiling without changing a single line that mentions money.
 *
 * ── WHAT ADOPTING 2.5 REQUIRES, BEFORE THE ID CHANGES ──────────────────────
 * 1. Send an explicit `quality`. Not `auto` — a named tier, priced against the
 *    table above. This is a PRODUCT decision (it sets what a paid image looks
 *    like), so it is deliberately not taken here.
 * 2. Re-measure `openaiImageSize()`'s constants against the new model's docs.
 *    They encode gpt-image-2's published limits; nothing has verified they hold.
 * 3. Check the rate limit. Tier 1 on 2.5 is **5 images/minute** and a campaign
 *    generates nine — a gemini outage mid-campaign would hit it.
 *
 * ── WHAT 2.5 DOES *NOT* UNLOCK, CONTRARY TO THE OBVIOUS READING ────────────
 * Image EDITING. `gpt-image-2` already lists `v1/images/edits` as supported —
 * checked in OpenAI's own model page, not recalled. CLAUDE.md has been right all
 * along that the blocker is **our adapter**, which posts to
 * `/v1/images/generations` and has no field for an image, which is why
 * `IMAGE_INPUT_CAPABLE` in router.ts is `['gemini']`. 2.5 improves edit quality;
 * it does not change what is buildable. Do not cite this release as the reason
 * to build the refine loop — `docs/POSITIONING.md` schedules that for weeks 7-8
 * and conditions it on the 30-day number.
 */
export const OPENAI_IMAGE_MODELS: Record<string, { qualityCeiling: string; note: string }> = {
  'gpt-image-2': {
    qualityCeiling: 'high',
    note: 'Previous default, replaced 2026-09-09. Ladder tops at `high`; supports v1/images/edits (our adapter does not use it). Kept here as the rollback target: setting PYRA_MODEL_OPENAI_IMAGE back to this is a valid, priced choice.',
  },
  'gpt-image-2.5-flare': {
    qualityCeiling: 'max',
    note: 'ADOPTED 2026-09-09, pinned to quality `high` in lib/ai/openai.ts. OpenAI positions it as the default for most apps: better output than gpt-image-2 at ~50% lower latency. Its ladder shifted DOWN against 2.0 — 2.5 at `high` bills roughly what 2.0 billed at `medium` — so this is cheaper than what it replaces, NOT more expensive. The `max` ceiling is why the pin is mandatory.',
  },
  'gpt-image-2.5-sunburst': {
    qualityCeiling: 'max',
    note: 'Released 2026-09-08. Premium tier for edit precision, longer generation times. NOT ADOPTED — same preconditions, and its latency is the wrong trade for a 9-image campaign.',
  },
};

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
