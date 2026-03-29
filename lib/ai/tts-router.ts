import OpenAI from 'openai';
import { generateElevenLabsSpeech, getElevenLabsVoiceId, getToneSettings } from './elevenlabs';
import { generateText } from './router';
import { buildVoiceOverPrompt } from './prompts/voiceover';
import { getVoiceoverConfig, type VoiceoverCostConfig } from '@/lib/credits/voiceover-costs';

/**
 * TTS Router — routes between OpenAI and ElevenLabs based on user's plan.
 * Free/Starter → OpenAI TTS
 * Pro+ → ElevenLabs (Arabic voices + emotion control)
 */

interface TTSInput {
  script: string;
  voice: string;
  dialect: string;
  speed: string;
  tone: string;
  planId: string;
}

interface TTSResult {
  audioBuffer: Buffer;
  provider: 'openai' | 'elevenlabs';
  mock: boolean;
  enhanced: boolean;
}

const OPENAI_VOICE_MAP: Record<string, 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'> = {
  male_pro: 'onyx',
  female_pro: 'nova',
  male_youth: 'echo',
  female_youth: 'shimmer',
  male_formal: 'fable',
  male: 'onyx',
  female: 'nova',
};

const DIALECT_PROMPTS: Record<string, string> = {
  saudi: 'Rewrite the following text in Saudi Arabian Arabic dialect (اللهجة السعودية). Keep the meaning but use Saudi expressions and vocabulary.',
  emirati: 'Rewrite the following text in Emirati Arabic dialect (اللهجة الإماراتية). Keep the meaning but use UAE expressions.',
  egyptian: 'Rewrite the following text in Egyptian Arabic dialect (اللهجة المصرية). Keep the meaning but use Egyptian expressions.',
  gulf: 'Rewrite the following text in Gulf Arabic dialect (اللهجة الخليجية). Keep the meaning but use Gulf Arabic expressions.',
  formal: '', // No rewrite needed for فصحى
};

/**
 * Enhance script with dialect + tone before TTS.
 * Uses AI to rewrite the text in the desired dialect and tone.
 */
async function enhanceScript(script: string, dialect: string, tone: string, config: VoiceoverCostConfig): Promise<{ text: string; enhanced: boolean }> {
  if (!config.enhanceEnabled) {
    return { text: script, enhanced: false };
  }

  const dialectPrompt = DIALECT_PROMPTS[dialect] || '';
  const tonePrompt = tone && config.toneEnabled
    ? `Also adjust the tone to be: ${tone}. Make it sound ${tone === 'professional' ? 'formal and authoritative' : tone === 'friendly' ? 'warm and conversational' : tone === 'energetic' ? 'excited and dynamic' : 'calm and soothing'}.`
    : '';

  if (!dialectPrompt && !tonePrompt) {
    return { text: script, enhanced: false };
  }

  try {
    const prompt = `${dialectPrompt}\n${tonePrompt}\n\nOriginal text:\n${script}\n\nReturn ONLY the rewritten text, nothing else.`;
    const result = await generateText({ prompt, maxTokens: 1000, temperature: 0.3 });
    const enhanced = result.text?.trim();
    if (enhanced && enhanced.length > 0) {
      return { text: enhanced, enhanced: true };
    }
  } catch {
    // Enhancement failed — use original text
  }

  return { text: script, enhanced: false };
}

/**
 * Generate TTS audio — routes to correct provider based on plan.
 */
export async function generateTTS(input: TTSInput): Promise<TTSResult> {
  const config = getVoiceoverConfig(input.planId);

  // Step 1: Enhance script (dialect + tone conversion)
  const { text: enhancedScript, enhanced } = await enhanceScript(
    input.script, input.dialect, input.tone, config
  );

  // Step 2: Route to correct TTS provider
  if (config.provider === 'elevenlabs') {
    return generateWithElevenLabs(enhancedScript, input, config, enhanced);
  }

  return generateWithOpenAI(enhancedScript, input, config, enhanced);
}

async function generateWithOpenAI(
  script: string,
  input: TTSInput,
  config: VoiceoverCostConfig,
  enhanced: boolean
): Promise<TTSResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { audioBuffer: Buffer.alloc(0), provider: 'openai', mock: true, enhanced };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const mp3 = await openai.audio.speech.create({
    model: config.quality, // tts-1 or tts-1-hd
    voice: OPENAI_VOICE_MAP[input.voice] || 'alloy',
    input: script,
    speed: parseFloat(input.speed),
  });

  const audioBuffer = Buffer.from(await mp3.arrayBuffer());
  return { audioBuffer, provider: 'openai', mock: false, enhanced };
}

async function generateWithElevenLabs(
  script: string,
  input: TTSInput,
  config: VoiceoverCostConfig,
  enhanced: boolean
): Promise<TTSResult> {
  const voiceId = getElevenLabsVoiceId(input.voice);
  const toneSettings = config.toneEnabled ? getToneSettings(input.tone) : undefined;

  try {
    const result = await generateElevenLabsSpeech({
      text: script,
      voiceId,
      stability: toneSettings?.stability,
      similarityBoost: toneSettings?.similarityBoost,
      speed: parseFloat(input.speed),
    });

    if (result.mock) {
      // ElevenLabs not configured — fallback to OpenAI
      return generateWithOpenAI(script, input, { ...config, quality: 'tts-1-hd' }, enhanced);
    }

    return { audioBuffer: result.audioBuffer, provider: 'elevenlabs', mock: false, enhanced };
  } catch {
    // ElevenLabs failed — fallback to OpenAI
    return generateWithOpenAI(script, input, { ...config, quality: 'tts-1-hd' }, enhanced);
  }
}
