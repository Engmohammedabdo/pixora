import { MODELS } from './models';
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

/**
 * Arabic voices.
 *
 * ⚠ HISTORY — these were previously ElevenLabs' DEFAULT ENGLISH voices with Arabic
 *   labels stuck on them: pNInz6obpgDQGcFmaJgB is "Adam" (American male) and
 *   EXAVITQu4vr4xnSDxMaL is "Bella" (American female). A customer who picked
 *   "رجل - احترافي (عربي)" received an American voice reading Arabic with a heavy
 *   English accent. The original comment said "should be verified against your
 *   ElevenLabs account" — that verification never happened.
 *
 * These are genuine Arabic voices, chosen to match the dialects this product
 * actually targets (Emirati and Saudi first, then Modern Standard).
 *
 * ⚠ BEFORE RELYING ON THESE: Voice Library voices must be added to your ElevenLabs
 *   account before the API will accept their IDs. Verify with
 *   `GET https://api.elevenlabs.io/v1/voices` and override any that your account
 *   does not expose using the PYRA_VOICE_* env vars below.
 */
function voice(envKey: string, fallbackId: string): string {
  const v = process.env[envKey];
  return v && v.trim().length > 0 ? v.trim() : fallbackId;
}

export const ELEVENLABS_ARABIC_VOICES: Record<string, { id: string; name: string; nameAr: string; gender: 'male' | 'female'; dialect: string }> = {
  // Authentic Emirati Gulf Arabic — the closest match to the primary target market.
  el_arabic_male_2: { id: voice('PYRA_VOICE_MALE_GULF', 'rUaPbzcZIu8df8iNL9WZ'), name: 'Sultan — Emirati', nameAr: 'سلطان — خليجي إماراتي', gender: 'male', dialect: 'emirati' },
  // Saudi Najdi, professional female read.
  el_arabic_female_2: { id: voice('PYRA_VOICE_FEMALE_GULF', 'gVzwmdZzRgBrNjXaTmi5'), name: 'Layan — Najdi', nameAr: 'ليان — نجدي', gender: 'female', dialect: 'saudi' },
  // Modern Standard Arabic, warm and refined — safe default for pan-Arab copy.
  el_arabic_male_1: { id: voice('PYRA_VOICE_MALE_MSA', 'xvhpbk8otnNHtT3fjCpr'), name: 'Omar — Modern Standard', nameAr: 'عمر — فصحى', gender: 'male', dialect: 'formal' },
  el_arabic_female_1: { id: voice('PYRA_VOICE_FEMALE_MSA', 'ML7jGRDg4E9hIl5qEm1Z'), name: 'Suhair — Modern Standard', nameAr: 'سهير — فصحى', gender: 'female', dialect: 'formal' },
  // Deep neutral narrator for documentary/VO reads.
  el_arabic_formal: { id: voice('PYRA_VOICE_NARRATOR', 'G1HOkzin3NMwRHSq60UI'), name: 'Arabic Knight — Narrator', nameAr: 'فارس — راوي فصحى', gender: 'male', dialect: 'formal' },
  // Premium tier: deep Saudi male and friendly Hijazi female.
  el_premium_1: { id: voice('PYRA_VOICE_PREMIUM_MALE', '8KMBeKnOSHXjLqGuWsAE'), name: 'Sultan — Saudi', nameAr: 'سلطان — سعودي', gender: 'male', dialect: 'saudi' },
  el_premium_2: { id: voice('PYRA_VOICE_PREMIUM_FEMALE', 'kdUY91gH5xyDHapxlthT'), name: 'Hana — Hijazi', nameAr: 'هناء — حجازي', gender: 'female', dialect: 'saudi' },
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
        model_id: MODELS.elevenlabs,
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
