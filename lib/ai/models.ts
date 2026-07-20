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
export function openaiImageSize(resolution: string | undefined): string {
  switch (resolution) {
    case '4K': return '2048x2048';
    case '2K': return '1536x1536';
    default: return '1024x1024';
  }
}
