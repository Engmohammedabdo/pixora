/**
 * Voiceover credit cost calculation based on plan tier.
 * Free/Starter: 1 credit per 15 seconds (OpenAI TTS)
 * Pro/Business/Agency: 3 credits per 20 seconds (ElevenLabs)
 */

export interface VoiceoverCostConfig {
  creditsPerUnit: number;
  unitSeconds: number;
  maxDurationSeconds: number;
  provider: 'openai' | 'elevenlabs';
  quality: 'tts-1' | 'tts-1-hd';
  dialectsAvailable: string[];
  voicesAvailable: string[];
  toneEnabled: boolean;
  enhanceEnabled: boolean;
  watermark: boolean;
}

const PLAN_VOICEOVER_CONFIG: Record<string, VoiceoverCostConfig> = {
  free: {
    creditsPerUnit: 1,
    unitSeconds: 15,
    maxDurationSeconds: 30,
    provider: 'openai',
    quality: 'tts-1',
    dialectsAvailable: ['formal'],
    voicesAvailable: ['male_pro', 'female_pro'],
    toneEnabled: false,
    enhanceEnabled: false,
    watermark: true,
  },
  starter: {
    creditsPerUnit: 1,
    unitSeconds: 15,
    maxDurationSeconds: 60,
    provider: 'openai',
    quality: 'tts-1-hd',
    dialectsAvailable: ['formal', 'saudi'],
    voicesAvailable: ['male_pro', 'female_pro', 'male_youth', 'female_youth', 'male_formal'],
    toneEnabled: false,
    enhanceEnabled: true,
    watermark: false,
  },
  pro: {
    creditsPerUnit: 3,
    unitSeconds: 20,
    maxDurationSeconds: 120,
    provider: 'elevenlabs',
    quality: 'tts-1-hd',
    dialectsAvailable: ['formal', 'saudi', 'emirati', 'egyptian', 'gulf'],
    voicesAvailable: ['male_pro', 'female_pro', 'male_youth', 'female_youth', 'male_formal', 'el_arabic_male_1', 'el_arabic_male_2', 'el_arabic_female_1', 'el_arabic_female_2', 'el_arabic_formal'],
    toneEnabled: true,
    enhanceEnabled: true,
    watermark: false,
  },
  business: {
    creditsPerUnit: 3,
    unitSeconds: 20,
    maxDurationSeconds: 300,
    provider: 'elevenlabs',
    quality: 'tts-1-hd',
    dialectsAvailable: ['formal', 'saudi', 'emirati', 'egyptian', 'gulf'],
    voicesAvailable: ['male_pro', 'female_pro', 'male_youth', 'female_youth', 'male_formal', 'el_arabic_male_1', 'el_arabic_male_2', 'el_arabic_female_1', 'el_arabic_female_2', 'el_arabic_formal', 'el_premium_1', 'el_premium_2'],
    toneEnabled: true,
    enhanceEnabled: true,
    watermark: false,
  },
  agency: {
    creditsPerUnit: 3,
    unitSeconds: 20,
    maxDurationSeconds: 600,
    provider: 'elevenlabs',
    quality: 'tts-1-hd',
    dialectsAvailable: ['formal', 'saudi', 'emirati', 'egyptian', 'gulf'],
    voicesAvailable: ['male_pro', 'female_pro', 'male_youth', 'female_youth', 'male_formal', 'el_arabic_male_1', 'el_arabic_male_2', 'el_arabic_female_1', 'el_arabic_female_2', 'el_arabic_formal', 'el_premium_1', 'el_premium_2'],
    toneEnabled: true,
    enhanceEnabled: true,
    watermark: false,
  },
};

export function getVoiceoverConfig(planId: string): VoiceoverCostConfig {
  return PLAN_VOICEOVER_CONFIG[planId] || PLAN_VOICEOVER_CONFIG.free;
}

/**
 * Calculate voiceover credit cost based on estimated duration and plan.
 */
export function calculateVoiceoverCost(scriptLength: number, speed: number, planId: string): number {
  const config = getVoiceoverConfig(planId);
  // ~5 chars per second for Arabic at normal speed
  const estimatedSeconds = Math.ceil((scriptLength / 5) / speed);
  const units = Math.max(1, Math.ceil(estimatedSeconds / config.unitSeconds));
  return units * config.creditsPerUnit;
}

/**
 * Estimate duration from script length and speed.
 */
export function estimateVoiceoverDuration(scriptLength: number, speed: number): number {
  return Math.round((scriptLength / 5) / speed);
}
