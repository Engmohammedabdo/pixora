import { generateImage as geminiImage, generateText as geminiText } from './gemini';
import { generateImage as openaiImage, generateText as openaiText } from './openai';
import { generateFlux } from './replicate';
import type { AIModel, Studio } from '@/types/studios';

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

  // Build fallback order starting with preferred model
  const fallbackOrder = [
    preferredModel,
    ...IMAGE_FALLBACK_ORDER.filter((m) => m !== preferredModel),
  ];

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

  const fallbackOrder = [
    preferredModel,
    ...TEXT_FALLBACK_ORDER.filter((m) => m !== preferredModel),
  ];

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
