import OpenAI from 'openai';
import { MODELS } from './models';
import { generateElevenLabsSpeech, getElevenLabsVoiceId, getToneSettings } from './elevenlabs';
import { generateText } from './router';
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
  /**
   * The longest script the caller has already priced and cap-checked. A dialect or
   * tone rewrite longer than this is discarded rather than synthesised — the
   * customer must never receive audio they were not quoted, and must never be
   * walked through their own plan's duration cap by a rewrite nobody measured.
   */
  maxScriptChars: number;
}

interface TTSResult {
  audioBuffer: Buffer;
  provider: 'openai' | 'elevenlabs';
  mock: boolean;
  enhanced: boolean;
  /**
   * True when the plan sold the premium path but the standard one actually ran.
   * The route MUST reprice from this flag, never from the plan — the plan is what
   * was bought, this is what was delivered.
   */
  usedFallback: boolean;
  /** Length of the text actually handed to the provider. The route reprices on this. */
  synthesizedChars: number;
  /** True when a rewrite was produced but discarded for exceeding maxScriptChars. */
  enhancementRejected: boolean;
}

/**
 * What a provider returns. It knows what it synthesised but not what was ASKED for
 * — the budget and the rewrite verdict belong to generateTTS, which owns both.
 */
type ProviderResult = Omit<TTSResult, 'synthesizedChars' | 'enhancementRejected'>;

/**
 * The premium path was the one that routed, and it could not deliver. There is no
 * honest substitute: every target in OPENAI_VOICE_MAP is one of OpenAI's English
 * voices, so whatever the customer picked collapses to an American English voice
 * reading Arabic. Handing that back is not a degraded version of what the customer
 * chose, it is a different product, so the request fails and the reservation is
 * returned in full.
 *
 * This is the EXPECTED first-run state, not a rare edge: lib/ai/elevenlabs.ts warns
 * in its own header that Voice Library ids must be added to the account before the
 * API accepts them, and until they are every one of these ids 404s.
 */
export class PremiumVoiceUnavailableError extends Error {
  readonly voice: string;

  constructor(voice: string, detail: string) {
    super(`premium_voice_unavailable: ${voice} (${detail})`);
    this.name = 'PremiumVoiceUnavailableError';
    this.voice = voice;
  }
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

/**
 * Standard-path voices that can honestly stand in for an Arabic read.
 *
 * Keyed on the OpenAI voice we would actually HAND BACK — never on the key the
 * customer picked. The rule used to be "is this key in ELEVENLABS_ARABIC_VOICES",
 * which is a naming convention, not a capability: on pro/business/agency every
 * selectable voice routes to the premium provider, and getElevenLabsVoiceId()
 * resolves the generic roles (male_pro, female_youth…) to a real Arabic narrator
 * via its el_arabic_male_1 default. So a Pro customer on the page default
 * "male_pro" was quietly swapped from an Arabic voice to 'onyx' — the exact
 * substitution this file exists to refuse. Anything derived from the shape of the
 * key reintroduces that bug; only the delivered voice's own ability decides.
 *
 * Every entry in OPENAI_VOICE_MAP is one of OpenAI's English voices, so nothing
 * qualifies today and this set is empty — deliberately a set rather than a bare
 * `false` so that adding a genuinely Arabic-capable standard voice is one
 * reviewable line, and so the line has to name that voice rather than a key
 * pointing at it.
 */
const ARABIC_CAPABLE_STANDARD_VOICES = new Set<string>();

/**
 * The delivery instruction for each tone. A TABLE, not an interpolation: the
 * caller's value now only ever selects a row, so no string a customer sends can
 * reach the prompt. Same shape as DIALECT_PROMPTS below, and the same reason — the
 * tone branch was the one place a raw request field was pasted into a prompt whose
 * output becomes the audio the customer is billed for. Keys must stay in step with
 * TONES in app/api/studios/voiceover/route.ts and TONE_SETTINGS in lib/ai/elevenlabs.ts.
 */
const TONE_INSTRUCTIONS: Record<string, string> = {
  professional: 'formal and authoritative',
  friendly: 'warm and conversational',
  energetic: 'excited and dynamic',
  calm: 'calm and soothing',
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
async function enhanceScript(script: string, dialect: string, tone: string, config: VoiceoverCostConfig, maxChars: number): Promise<{ text: string; enhanced: boolean; rejected: boolean }> {
  if (!config.enhanceEnabled) {
    return { text: script, enhanced: false, rejected: false };
  }

  const dialectPrompt = DIALECT_PROMPTS[dialect] || '';
  const toneInstruction = config.toneEnabled ? TONE_INSTRUCTIONS[tone] : undefined;
  // An unrecognised tone yields no instruction at all, exactly as an unrecognised
  // dialect yields no dialect prompt on the line above. The old ternary had no such
  // exit: anything that was not one of three named strings fell through to
  // 'calm and soothing' and was still pasted in verbatim.
  const tonePrompt = toneInstruction
    ? `Also adjust the tone so it sounds ${toneInstruction}.`
    : '';

  if (!dialectPrompt && !tonePrompt) {
    return { text: script, enhanced: false, rejected: false };
  }

  try {
    const prompt = `${dialectPrompt}\n${tonePrompt}\n\nOriginal text:\n${script}\n\nReturn ONLY the rewritten text, nothing else.`;
    const result = await generateText({ prompt, maxTokens: 1000, temperature: 0.3 });
    const enhanced = result.text?.trim();
    if (enhanced && enhanced.length > 0) {
      // The price and the plan's duration cap were both computed from the script the
      // customer submitted. A rewrite longer than that budget would be audio they
      // were never quoted, so it is discarded and the original is spoken instead —
      // never truncated, which would cut an Arabic sentence mid-clause.
      if (enhanced.length > maxChars) {
        console.warn(
          `[tts] dialect/tone rewrite discarded: ${enhanced.length} chars exceeds the ${maxChars}-char budget quoted to the customer.`
        );
        return { text: script, enhanced: false, rejected: true };
      }
      return { text: enhanced, enhanced: true, rejected: false };
    }
  } catch (e: unknown) {
    // A bare `catch {}` returned { enhanced: false } here, which is INDISTINGUISHABLE
    // from "there was nothing to enhance". So a customer on a paid tier picked مصري,
    // was charged the premium rate, received a plain فصحى reading of their own text,
    // and nothing — not the response, not a log line — said the dialect had not been
    // applied. `rejected: true` is what makes it visible to the route and the page.
    console.error(`[tts] dialect/tone rewrite failed; speaking the original instead: ${String(e)}`);
    return { text: script, enhanced: false, rejected: true };
  }

  return { text: script, enhanced: false, rejected: false };
}

/**
 * Generate TTS audio — routes to correct provider based on plan.
 */
export async function generateTTS(input: TTSInput): Promise<TTSResult> {
  const config = getVoiceoverConfig(input.planId);

  // Step 1: Enhance script (dialect + tone conversion)
  const { text: enhancedScript, enhanced, rejected } = await enhanceScript(
    input.script, input.dialect, input.tone, config, input.maxScriptChars
  );

  // Step 2: Route to correct TTS provider
  const result = config.provider === 'elevenlabs'
    ? await generateWithElevenLabs(enhancedScript, input, config, enhanced)
    : await generateWithOpenAI(enhancedScript, input, config, enhanced);

  // Mirrors rejectMockInProduction() in lib/ai/router.ts, which only guards the
  // image and text routers. Without this, an unconfigured TTS provider returns
  // `Buffer.alloc(0)` with mock:true, and the voiceover route happily reports
  // success — charging full credits for a zero-byte audio file. Throwing lets the
  // route's existing catch block refund the reservation.
  if (result.mock && process.env.NODE_ENV === 'production') {
    throw new Error('provider_unavailable: TTS returned a mock result in production (missing or placeholder API key)');
  }

  // A configured provider that still produced no audio is equally unsellable.
  if (!result.audioBuffer || result.audioBuffer.length === 0) {
    throw new Error('provider_unavailable: TTS returned an empty audio buffer');
  }

  // What was ACTUALLY spoken. The route prices on this, not on the script the
  // customer submitted — those are different strings whenever a rewrite ran.
  return { ...result, synthesizedChars: enhancedScript.length, enhancementRejected: rejected };
}

async function generateWithOpenAI(
  script: string,
  input: TTSInput,
  config: VoiceoverCostConfig,
  enhanced: boolean
): Promise<ProviderResult> {
  if (!process.env.OPENAI_API_KEY) {
    return { audioBuffer: Buffer.alloc(0), provider: 'openai', mock: true, enhanced, usedFallback: false };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // gpt-4o-mini-tts is the current recommended speech model. It keeps `speed` and
  // adds `instructions`, which lets us ask for natural Arabic delivery instead of
  // the flat, English-accented reading tts-1 produces on Arabic script. `config.quality`
  // (tts-1 / tts-1-hd) is retained only as the per-plan fidelity hint.
  const mp3 = await openai.audio.speech.create({
    model: MODELS.openaiTts,
    voice: OPENAI_VOICE_MAP[input.voice] || 'alloy',
    input: script,
    speed: parseFloat(input.speed),
    instructions: 'Read as a native Arabic speaker with natural Gulf-Arabic pronunciation, clear diction, and a warm, confident advertising delivery.',
  });

  const audioBuffer = Buffer.from(await mp3.arrayBuffer());
  return { audioBuffer, provider: 'openai', mock: false, enhanced, usedFallback: false };
}

async function generateWithElevenLabs(
  script: string,
  input: TTSInput,
  config: VoiceoverCostConfig,
  enhanced: boolean
): Promise<ProviderResult> {
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
      // Premium provider not configured (missing or placeholder key).
      return fallBackToStandard(script, input, config, enhanced, 'provider not configured');
    }

    return { audioBuffer: result.audioBuffer, provider: 'elevenlabs', mock: false, enhanced, usedFallback: false };
  } catch (err) {
    // 401, 404 (voice id not added to the account), rate limit, network — from the
    // customer's side these are one event: the voice they chose did not speak.
    // The unconfigured branch above runs inside this try, so its refusal arrives
    // here as a throw. Re-dispatching it would call the standard path anyway and
    // undo the refusal.
    if (err instanceof PremiumVoiceUnavailableError) throw err;
    return fallBackToStandard(script, input, config, enhanced, err instanceof Error ? err.message : String(err));
  }
}

/**
 * The premium path could not deliver. Two outcomes, and the difference is whether
 * the voice we would hand back can do the job the customer paid for — an Arabic
 * read — not whether the key they picked looks premium:
 *
 *  - No Arabic-capable standard voice for it: throw, and let the route refund the
 *    whole reservation. Reaching here at all means the premium path routed, i.e.
 *    the customer was on the tier that sells Arabic narrators; quietly reading
 *    their Arabic in an English voice is the defect this function exists to
 *    prevent, whatever the substitution is billed at.
 *  - An Arabic-capable standard voice exists: deliver it — but flagged, because
 *    the route must then bill it at the rate of the path that ran and say so in
 *    the response. A degraded delivery at full price is the same theft as no
 *    delivery at full price.
 */
async function fallBackToStandard(
  script: string,
  input: TTSInput,
  config: VoiceoverCostConfig,
  enhanced: boolean,
  detail: string
): Promise<ProviderResult> {
  // The standard voice this key resolves to is the whole question — `alloy` when
  // the map has no entry, which is as English as the rest of them.
  const standardVoice = OPENAI_VOICE_MAP[input.voice] ?? 'alloy';
  if (!ARABIC_CAPABLE_STANDARD_VOICES.has(standardVoice)) {
    throw new PremiumVoiceUnavailableError(input.voice, detail);
  }

  // Server-side only — never surfaced to the user, who is told "بايرا استخدمت
  // مسار بديل" and nothing about which engine that is.
  console.warn(`[tts] premium path unavailable for voice "${input.voice}" — serving the standard path and repricing (${detail})`);

  const result = await generateWithOpenAI(script, input, config, enhanced);
  return { ...result, usedFallback: true };
}
