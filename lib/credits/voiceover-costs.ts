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
  dialectsAvailable: string[];
  voicesAvailable: string[];
  toneEnabled: boolean;
  enhanceEnabled: boolean;
}

/*
 * REMOVED 2026-08-24: `watermark: boolean` on this config.
 *
 * It had ZERO readers — grep for `config.watermark` returns nothing — so free-tier
 * voiceover audio has always shipped unmarked while this file claimed otherwise.
 * A config field asserting a protection that does not exist is worse than no field:
 * it is the shape that let free-plan IMAGES ship with empty boxes for a week
 * (see CLAUDE.md on assertTextRenderingAvailable).
 *
 * Marking audio is real work — an audible tag or an inaudible mark — and is not in
 * scope here. `lib/stripe/plans.ts` keeps its own `watermark` flag, which IS read,
 * and governs images only.
 */

const PLAN_VOICEOVER_CONFIG: Record<string, VoiceoverCostConfig> = {
  free: {
    creditsPerUnit: 1,
    unitSeconds: 15,
    maxDurationSeconds: 30,
    provider: 'openai',
    dialectsAvailable: ['formal'],
    voicesAvailable: ['male_pro', 'female_pro'],
    toneEnabled: false,
    enhanceEnabled: false,
  },
  starter: {
    creditsPerUnit: 1,
    unitSeconds: 15,
    maxDurationSeconds: 60,
    provider: 'openai',
    dialectsAvailable: ['formal', 'saudi'],
    voicesAvailable: ['male_pro', 'female_pro', 'male_youth', 'female_youth', 'male_formal'],
    toneEnabled: false,
    enhanceEnabled: true,
  },
  pro: {
    creditsPerUnit: 3,
    unitSeconds: 20,
    maxDurationSeconds: 120,
    provider: 'elevenlabs',
    dialectsAvailable: ['formal', 'saudi', 'emirati', 'egyptian', 'gulf'],
    voicesAvailable: ['male_pro', 'female_pro', 'male_youth', 'female_youth', 'male_formal', 'el_arabic_male_1', 'el_arabic_male_2', 'el_arabic_female_1', 'el_arabic_female_2', 'el_arabic_formal'],
    toneEnabled: true,
    enhanceEnabled: true,
  },
  business: {
    creditsPerUnit: 3,
    unitSeconds: 20,
    maxDurationSeconds: 300,
    provider: 'elevenlabs',
    dialectsAvailable: ['formal', 'saudi', 'emirati', 'egyptian', 'gulf'],
    voicesAvailable: ['male_pro', 'female_pro', 'male_youth', 'female_youth', 'male_formal', 'el_arabic_male_1', 'el_arabic_male_2', 'el_arabic_female_1', 'el_arabic_female_2', 'el_arabic_formal', 'el_premium_1', 'el_premium_2'],
    toneEnabled: true,
    enhanceEnabled: true,
  },
  agency: {
    creditsPerUnit: 3,
    unitSeconds: 20,
    maxDurationSeconds: 600,
    provider: 'elevenlabs',
    dialectsAvailable: ['formal', 'saudi', 'emirati', 'egyptian', 'gulf'],
    voicesAvailable: ['male_pro', 'female_pro', 'male_youth', 'female_youth', 'male_formal', 'el_arabic_male_1', 'el_arabic_male_2', 'el_arabic_female_1', 'el_arabic_female_2', 'el_arabic_formal', 'el_premium_1', 'el_premium_2'],
    toneEnabled: true,
    enhanceEnabled: true,
  },
};

export function getVoiceoverConfig(planId: string): VoiceoverCostConfig {
  return PLAN_VOICEOVER_CONFIG[planId] || PLAN_VOICEOVER_CONFIG.free;
}

/**
 * Calculate voiceover credit cost based on estimated duration and plan.
 */
/**
 * How fast the provider actually reads, in characters per second at speed 1.
 *
 * ── THIS WAS 5, AND IT WAS WRONG BY 1.8x ───────────────────────────────────
 * Measured on production 2026-08-27 against three Arabic scripts, with the
 * delivered MP3 parsed frame by frame and cross-checked against file size over
 * bitrate (both derivations agreed to the centisecond):
 *
 *     chars   billed as   actually played   real rate
 *        33          7s             4.01s     8.2/sec
 *        67         13s             6.96s     9.6/sec
 *       130         26s            14.35s     9.1/sec
 *
 * One constant sets three things, so a single wrong number was wrong three
 * times over, all against the customer:
 *   - PRICE. The 130-char script cost 2 credits for 14.35s of audio; the free
 *     plan bills 1 credit per 15 seconds, so it should have cost 1.
 *   - THE PLAN'S DURATION CAP. Free is sold as "30 seconds" and at 5 chars/sec
 *     admitted only 150 characters — about 17 seconds of real speech. Customers
 *     were getting a little over half the length they were sold.
 *   - The duration badge on the player, which read roughly double.
 *
 * ── WHY 8 AND NOT THE MEAN OF 9.0 ──────────────────────────────────────────
 * Deliberately the SLOWEST rate observed, rounded down, not the average, because
 * the two things this constant controls want opposite ends of the range:
 *
 *   - PRICE wants the FAST end. Underestimating how fast the voice reads makes
 *     us think the script is longer than it is, which rounds an extra credit on
 *     at every unit boundary.
 *   - THE CAP wants the SLOW end. Overestimating the rate admits a script that
 *     then plays for longer than the duration the plan sells — a 30-second free
 *     plan handing out 36 seconds.
 *
 * The cap wins, so the residual error is NOT in the customer's favour and this
 * comment said the opposite until a live measurement contradicted it: verified on
 * production after the fix, a script billed and displayed as 8s plays 7.15s —
 * ratio 1.12, down from 1.80. We still overstate by about 12%, which costs a
 * credit only at a unit boundary, and understates how many characters the plan's
 * own cap can really hold.
 *
 * Closing that last 12% is not a matter of picking a better constant. It needs
 * the price to be settled against the duration actually synthesised, the way the
 * rewrite is already repriced on `synthesizedChars` — at which point this number
 * stops being a price input and is only an up-front quote.
 *
 * Measured on OpenAI TTS, Arabic, `formal` dialect, speed 1. ElevenLabs (pro and
 * above) has NOT been measured and may differ; if voiceover pricing is revisited,
 * measure it there before assuming this carries over.
 */
const CHARS_PER_SECOND = 8;

export function calculateVoiceoverCost(scriptLength: number, speed: number, planId: string): number {
  const config = getVoiceoverConfig(planId);
  const estimatedSeconds = Math.ceil((scriptLength / CHARS_PER_SECOND) / speed);
  const units = Math.max(1, Math.ceil(estimatedSeconds / config.unitSeconds));
  return units * config.creditsPerUnit;
}

/**
 * Estimate duration from script length and speed.
 */
export function estimateVoiceoverDuration(scriptLength: number, speed: number): number {
  return Math.round((scriptLength / CHARS_PER_SECOND) / speed);
}

/**
 * The longest script that still costs `creditCost` AND still fits the plan's
 * duration cap — i.e. the exact inverse of calculateVoiceoverCost, bounded by
 * maxDurationSeconds.
 *
 * WHY THIS EXISTS: the route prices and cap-checks the script the customer typed,
 * then tts-router hands an LLM REWRITE of it to the provider. Without a budget the
 * rewrite is bounded only by maxTokens, so a longer one delivers audio nobody paid
 * for and breaches the plan's own limit, and a shorter one charges for silence.
 *
 * Derivation, against calculateVoiceoverCost above:
 *   cost    = max(1, ceil(ceil((len/CHARS_PER_SECOND)/speed) / unitSeconds)) * creditsPerUnit
 *   so      units      = cost / creditsPerUnit
 *           maxSeconds = units * unitSeconds
 *           len        <= maxSeconds * speed * CHARS_PER_SECOND
 * and independently the cap requires len <= maxDurationSeconds * speed * CHARS_PER_SECOND.
 * The smaller of the two wins; floored, because a partial character buys nothing.
 */
export function maxCharsForBudget(creditCost: number, speed: number, planId: string): number {
  const config = getVoiceoverConfig(planId);
  const units = Math.max(1, Math.floor(creditCost / config.creditsPerUnit));
  const secondsAffordable = units * config.unitSeconds;
  const secondsAllowed = Math.min(secondsAffordable, config.maxDurationSeconds);
  return Math.max(1, Math.floor(secondsAllowed * speed * CHARS_PER_SECOND));
}
