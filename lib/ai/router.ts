import { generateImage as geminiImage, generateText as geminiText } from './gemini';
import { generateImage as openaiImage, generateText as openaiText } from './openai';
import { generateFlux } from './replicate';
import { getModelConfig, getEnabledModels, type ModelConfig } from '@/lib/admin/settings';
import type { AIModel, Studio } from '@/types/studios';

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
}

interface GenerationResult {
  url?: string;
  text?: string;
  model: AIModel;
  mock: boolean;
  usedFallback: boolean;
  originalModel?: AIModel;
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

  let fallbackOrder = enabledModels.includes(preferredModel)
    ? [preferredModel, ...adminOrder.filter((m) => m !== preferredModel)]
    : [...adminOrder];

  // An image-to-image request may only run on providers that forward the image.
  if (input.referenceImageUrl) {
    const capable = fallbackOrder.filter((m) => IMAGE_INPUT_CAPABLE.includes(m));
    if (capable.length === 0) {
      throw new Error(
        'No image-capable model is enabled. Editing and product photography require a model that accepts an input image.'
      );
    }
    fallbackOrder = capable;
  }

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

  const fallbackOrder = textOrder.includes(preferredModel)
    ? [preferredModel, ...textOrder.filter((m) => m !== preferredModel)]
    : [...textOrder];

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
            });
          case 'gpt':
            return openaiText({
              prompt: input.prompt,
              maxTokens: input.maxTokens,
              temperature: input.temperature,
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
