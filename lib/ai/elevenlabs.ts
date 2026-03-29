import { isValidApiKey } from './utils';

/**
 * ElevenLabs TTS client for Arabic voice generation.
 * Used for Pro+ plans — higher quality Arabic voices with emotion control.
 */

interface ElevenLabsOptions {
  text: string;
  voiceId: string;
  stability?: number;     // 0-1, lower = more expressive
  similarityBoost?: number; // 0-1, higher = more consistent
  speed?: number;         // 0.5-2.0
}

interface ElevenLabsResult {
  audioBuffer: Buffer;
  mock: boolean;
}

// Arabic voice IDs from ElevenLabs
// These should be verified against your ElevenLabs account
export const ELEVENLABS_ARABIC_VOICES: Record<string, { id: string; name: string; nameAr: string; gender: 'male' | 'female'; dialect: string }> = {
  el_arabic_male_1: { id: 'pNInz6obpgDQGcFmaJgB', name: 'Arabic Male Professional', nameAr: 'رجل - احترافي (عربي)', gender: 'male', dialect: 'formal' },
  el_arabic_male_2: { id: 'VR6AewLTigWG4xSOukaG', name: 'Arabic Male Warm', nameAr: 'رجل - دافئ (عربي)', gender: 'male', dialect: 'gulf' },
  el_arabic_female_1: { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Arabic Female Professional', nameAr: 'امرأة - احترافية (عربي)', gender: 'female', dialect: 'formal' },
  el_arabic_female_2: { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Arabic Female Energetic', nameAr: 'امرأة - حماسية (عربي)', gender: 'female', dialect: 'gulf' },
  el_arabic_formal: { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Arabic Formal Narrator', nameAr: 'راوي - فصحى', gender: 'male', dialect: 'formal' },
  el_premium_1: { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Premium Arabic Male', nameAr: 'رجل مميز (بريميوم)', gender: 'male', dialect: 'saudi' },
  el_premium_2: { id: 'XB0fDUnXU5powFXDhCwa', name: 'Premium Arabic Female', nameAr: 'امرأة مميزة (بريميوم)', gender: 'female', dialect: 'emirati' },
};

// Tone to ElevenLabs stability/similarity mapping
const TONE_SETTINGS: Record<string, { stability: number; similarityBoost: number }> = {
  professional: { stability: 0.75, similarityBoost: 0.75 },
  friendly: { stability: 0.5, similarityBoost: 0.7 },
  energetic: { stability: 0.3, similarityBoost: 0.6 },
  calm: { stability: 0.85, similarityBoost: 0.8 },
};

export function getToneSettings(tone: string): { stability: number; similarityBoost: number } {
  return TONE_SETTINGS[tone] || TONE_SETTINGS.professional;
}

/**
 * Generate speech using ElevenLabs API.
 */
export async function generateElevenLabsSpeech(options: ElevenLabsOptions): Promise<ElevenLabsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!isValidApiKey(apiKey)) {
    // Mock: return empty buffer
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return { audioBuffer: Buffer.alloc(0), mock: true };
  }

  const { stability, similarityBoost } = options;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${options.voiceId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey!,
      },
      body: JSON.stringify({
        text: options.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: stability ?? 0.5,
          similarity_boost: similarityBoost ?? 0.75,
          speed: options.speed ?? 1.0,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  return { audioBuffer, mock: false };
}

/**
 * Get voice ID for ElevenLabs by voice key.
 */
export function getElevenLabsVoiceId(voiceKey: string): string {
  const voice = ELEVENLABS_ARABIC_VOICES[voiceKey];
  return voice?.id || ELEVENLABS_ARABIC_VOICES.el_arabic_male_1.id;
}
