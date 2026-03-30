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
  photoshoot: 'flux',
  edit: 'gpt',
  campaign: 'gemini',
  plan: 'gemini',
  storyboard: 'gemini',
  analysis: 'gemini',
  'prompt-builder': 'gemini',
};

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

export async function generateImage(input: ImageGenerationInput): Promise<GenerationResult> {
  const preferredModel = input.model;

  // Build fallback order using admin-configured enabled models
  const modelConfig = await getCachedModelConfig();
  const enabledModels = getEnabledModels(modelConfig) as AIModel[];
  const adminOrder = enabledModels.length > 0 ? enabledModels : IMAGE_FALLBACK_ORDER;

  const fallbackOrder = enabledModels.includes(preferredModel)
    ? [preferredModel, ...adminOrder.filter((m) => m !== preferredModel)]
    : [...adminOrder];

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

      return {
        url: result.url,
        model,
        mock: result.mock,
        usedFallback: i > 0,
        originalModel: i > 0 ? preferredModel : undefined,
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

      return {
        text: result.text,
        model,
        mock: result.mock,
        usedFallback: i > 0,
        originalModel: i > 0 ? preferredModel : undefined,
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
