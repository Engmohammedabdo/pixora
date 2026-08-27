import { generateImage as geminiImage, generateText as geminiText } from './gemini';
import { generateImage as openaiImage, generateText as openaiText } from './openai';
import { generateFlux } from './replicate';
import { isValidApiKey } from './utils';
import { getModelConfig, getEnabledModels, type ModelConfig } from '@/lib/admin/settings';
import type { AIModel, Studio } from '@/types/studios';
import { isRetryable } from './http';

// Cached model config to avoid DB hit on every generation
let modelConfigCache: { data: ModelConfig; fetchedAt: number } | null = null;
const CACHE_TTL = 60_000; // 60 seconds

async function getCachedModelConfig(): Promise<ModelConfig> {
  if (modelConfigCache && Date.now() - modelConfigCache.fetchedAt < CACHE_TTL) {
    return modelConfigCache.data;
  }
  try {
    const config = await getModelConfig();
    modelConfigCache = { data: config, fetchedAt: Date.now() };
    return config;
  } catch {
    // If DB is unavailable, return defaults
    return { enabled: ['gemini', 'gpt', 'flux'], fallback_order: ['gemini', 'gpt', 'flux'] };
  }
}

interface ImageGenerationInput {
  prompt: string;
  model: AIModel;
  resolution: string;
  referenceImageUrl?: string;
}

interface TextGenerationInput {
  prompt: string;
  model?: AIModel;
  maxTokens?: number;
  temperature?: number;
  /** Passed to BOTH provider arms. Missing one arm means the fallback silently
   *  reverts to scraping prose, which is the defect this exists to remove. */
  responseSchema?: Record<string, unknown>;
}

interface GenerationResult {
  url?: string;
  text?: string;
  model: AIModel;
  mock: boolean;
  usedFallback: boolean;
  originalModel?: AIModel;
  /**
   * Fingerprint of the reference image, when the serving adapter sent one.
   *
   * Only the gemini branch produces it, which is not a gap: `IMAGE_INPUT_CAPABLE`
   * already restricts any request carrying a reference image to gemini, because
   * the other two adapters have no field to put an image in. So "there was a
   * reference image but no signature" means the fingerprint failed, not that a
   * different provider served — and the caller treats a missing signature as
   * "cannot measure" rather than as a verdict.
   */
  inputSignature?: Buffer | null;
}

const DEFAULT_MODELS: Partial<Record<Studio, AIModel>> = {
  creator: 'gemini',
  // photoshoot and edit MUST default to a model that accepts an input image —
  // see IMAGE_INPUT_CAPABLE below.
  photoshoot: 'gemini',
  edit: 'gemini',
  campaign: 'gemini',
  plan: 'gemini',
  storyboard: 'gemini',
  analysis: 'gemini',
  'prompt-builder': 'gemini',
};

/**
 * Providers whose adapter actually forwards `referenceImageUrl`.
 *
 * The openaiImage() and generateFlux() adapters take a prompt only, so routing an
 * image-to-image request to them silently discards the customer's photo and
 * returns an unrelated picture — while still charging for it. Any request that
 * carries a reference image is therefore restricted to this list, which also
 * stops an admin's model-toggle from re-breaking photoshoot and edit.
 */
const IMAGE_INPUT_CAPABLE: AIModel[] = ['gemini'];

const IMAGE_FALLBACK_ORDER: AIModel[] = ['gemini', 'gpt', 'flux'];
const TEXT_FALLBACK_ORDER: AIModel[] = ['gemini', 'gpt'];

/** The env var each adapter reads to decide real-vs-mock. */
const MODEL_CREDENTIAL_ENV: Record<AIModel, string> = {
  gemini: 'GOOGLE_GEMINI_API_KEY',
  gpt: 'OPENAI_API_KEY',
  flux: 'REPLICATE_API_TOKEN',
};

/**
 * Drop providers this deployment has no usable key for.
 *
 * rejectMockInProduction() already treats an unconfigured provider as an outage,
 * but it can only find out AFTER the adapter has run — and generateFlux() with no
 * REPLICATE_API_TOKEN sleeps 2.5s imitating a real call before handing back its
 * placeholder (lib/ai/replicate.ts:29). So a generation whose earlier providers
 * failed paid 2.5s to reach a provider that was never going to answer, and the
 * `provider_unavailable: flux` thrown at the end of that wait then OVERWROTE
 * `lastError` — leaving the customer, and the logs, blaming the one provider that
 * was never configured instead of the one that actually broke.
 *
 * The knowledge needed to make that call is an environment variable, so it belongs
 * before the first network call rather than after the last one.
 *
 * Production only: in development the mock adapters ARE the intended behaviour, and
 * rejectMockInProduction deliberately leaves them alone.
 *
 * If nothing is configured the unfiltered list is returned on purpose. That is a
 * broken deployment, not a routing decision, and letting the normal loop run means
 * it surfaces as `provider_unavailable` — which names the cause — instead of an
 * empty-order error that reads like a bug in the studio the customer was using.
 */
function withCredentials(models: AIModel[]): AIModel[] {
  if (process.env.NODE_ENV !== 'production') return models;
  const usable = models.filter((m) => isValidApiKey(process.env[MODEL_CREDENTIAL_ENV[m]]));
  return usable.length > 0 ? usable : models;
}

const MAX_RETRIES = 3;

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // A permanent error will fail identically on the next attempt. Retrying it
      // bills us three times for one certain failure, delays the customer's refund
      // by the backoff, and multiplies across a fan-out: one image request became
      // up to 9 upstream calls and a nine-post campaign up to 81. The errors it
      // retried hardest were the ones that could never succeed — a rotated key, a
      // wrong model id, a host we ourselves refused.
      if (!isRetryable(error)) throw lastError;
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  throw lastError;
}

export function getDefaultModel(studio: Studio): AIModel {
  return DEFAULT_MODELS[studio] || 'gemini';
}

/**
 * A `mock: true` result means the provider's API key is missing or a placeholder,
 * so the client returned a placehold.co image or canned text instead of calling
 * anything. That is fine in development, but in production it means the customer
 * is charged real credits for a placeholder.
 *
 * Throwing here treats it as a provider outage: the router moves on to the next
 * model, and if every provider is unconfigured the studio's existing catch block
 * refunds the reservation and surfaces a real error.
 */
function rejectMockInProduction(result: { mock: boolean }, model: AIModel): void {
  if (result.mock && process.env.NODE_ENV === 'production') {
    throw new Error(`provider_unavailable: ${model} returned a mock result in production (missing or placeholder API key)`);
  }
}

export async function generateImage(input: ImageGenerationInput): Promise<GenerationResult> {
  const preferredModel = input.model;

  // Build fallback order using admin-configured enabled models
  const modelConfig = await getCachedModelConfig();
  const enabledModels = getEnabledModels(modelConfig) as AIModel[];
  const adminOrder = enabledModels.length > 0 ? enabledModels : IMAGE_FALLBACK_ORDER;

  const preferredOrder = enabledModels.includes(preferredModel)
    ? [preferredModel, ...adminOrder.filter((m) => m !== preferredModel)]
    : [...adminOrder];

  // An image-to-image request may only run on providers that forward the image.
  //
  // The narrowing happens BEFORE withCredentials, and that order is the whole
  // point. withCredentials' "never hand back an empty order" guard protects
  // whatever list it is given; run first, it protected the FULL order and this
  // filter emptied the result afterwards — so a production box with no
  // GOOGLE_GEMINI_API_KEY dropped gemini for want of a key and then told the admin
  // "No image-capable model is enabled", sending them to the model toggles, which
  // were fine.
  //
  // Narrowed first, each message is answerable by the thing it names: an empty
  // capable set really is a toggle problem, while a capable set with no usable key
  // keeps its guard (withCredentials returns the capable list unfiltered) and the
  // loop surfaces `provider_unavailable: gemini`, which names the missing key.
  let candidates = preferredOrder;
  if (input.referenceImageUrl) {
    candidates = preferredOrder.filter((m) => IMAGE_INPUT_CAPABLE.includes(m));
    if (candidates.length === 0) {
      throw new Error(
        'No image-capable model is enabled. Editing and product photography require a model that accepts an input image.'
      );
    }
  }

  const fallbackOrder = withCredentials(candidates);

  let lastError: Error | null = null;

  for (let i = 0; i < fallbackOrder.length; i++) {
    const model = fallbackOrder[i];
    try {
      const result = await withRetry(async () => {
        switch (model) {
          case 'gemini':
            return geminiImage({
              prompt: input.prompt,
              resolution: input.resolution,
              referenceImageUrl: input.referenceImageUrl,
            });
          case 'gpt':
            return openaiImage({
              prompt: input.prompt,
              resolution: input.resolution,
            });
          case 'flux':
            return generateFlux({
              prompt: input.prompt,
              resolution: input.resolution,
            });
          default:
            throw new Error(`Unknown model: ${model}`);
        }
      });

      rejectMockInProduction(result, model);

      return {
        url: result.url,
        model,
        mock: result.mock,
        // Only the gemini adapter sets this, and only when a reference image was
        // sent. Passed straight through rather than recomputed here: the point
        // of the fingerprint is that it is taken where the bytes already exist.
        inputSignature: (result as { inputSignature?: Buffer | null }).inputSignature ?? null,
        // Compare against the requested model, NOT the loop index. The
        // reference-image guard above REPLACES fallbackOrder with the capable
        // subset, so a re-route can land at index 0 — `i > 0` then reported no
        // fallback, the "بايرا استخدمت مسار بديل" notice never rendered, and
        // generations.model recorded a path that never ran. The same applies
        // when the admin disables the requested model.
        usedFallback: model !== preferredModel,
        originalModel: model !== preferredModel ? preferredModel : undefined,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Model ${model} failed:`, lastError.message);
    }
  }

  throw new Error(
    `All models failed. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

export async function generateText(input: TextGenerationInput): Promise<GenerationResult> {
  const preferredModel = input.model || 'gemini';

  // Use admin-configured enabled models for text fallback
  const modelConfig = await getCachedModelConfig();
  const enabledTextModels = getEnabledModels(modelConfig).filter(m => TEXT_FALLBACK_ORDER.includes(m as AIModel)) as AIModel[];
  const textOrder = enabledTextModels.length > 0 ? enabledTextModels : TEXT_FALLBACK_ORDER;

  const fallbackOrder = withCredentials(
    textOrder.includes(preferredModel)
      ? [preferredModel, ...textOrder.filter((m) => m !== preferredModel)]
      : [...textOrder]
  );

  let lastError: Error | null = null;

  for (let i = 0; i < fallbackOrder.length; i++) {
    const model = fallbackOrder[i];
    try {
      const result = await withRetry(async () => {
        switch (model) {
          case 'gemini':
            return geminiText({
              prompt: input.prompt,
              maxTokens: input.maxTokens,
              temperature: input.temperature,
              responseSchema: input.responseSchema,
            });
          case 'gpt':
            return openaiText({
              prompt: input.prompt,
              maxTokens: input.maxTokens,
              temperature: input.temperature,
              responseSchema: input.responseSchema,
            });
          default:
            throw new Error(`Text generation not supported for model: ${model}`);
        }
      });

      rejectMockInProduction(result, model);

      return {
        text: result.text,
        model,
        mock: result.mock,
        // Index-based detection misses the case where the requested model is not
        // in the admin-enabled set: fallbackOrder then starts at a different
        // model and `i > 0` wrongly reports no fallback.
        usedFallback: model !== preferredModel,
        originalModel: model !== preferredModel ? preferredModel : undefined,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Text model ${model} failed:`, lastError.message);
    }
  }

  throw new Error(
    `All text models failed. Last error: ${lastError?.message || 'Unknown error'}`
  );
}
