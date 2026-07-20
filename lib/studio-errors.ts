const KNOWN_ERROR_CODES = new Set([
  'insufficient_credits',
  'credit_reservation_failed',
  'rate_limited',
  'generation_failed',
  'generation_parse_failed',
  'prompt_blocked',
  'validation_error',
  'unauthorized',
  'maintenance_mode',
  'studio_disabled',
  'resolution_not_available',
  'duration_exceeded',
  'voice_not_available',
  'dialect_not_available',
  'network',
  'project_not_found',
]);

type Translator = (key: string) => string;

/**
 * Map a machine error code from the studio APIs to a localized user message.
 * Pass a translator scoped to the `studio` namespace: useTranslations('studio').
 */
export function mapApiError(code: unknown, t: Translator): string {
  const key = typeof code === 'string' && KNOWN_ERROR_CODES.has(code) ? code : 'fallback';
  return t(`errors.${key}`);
}

/**
 * A studio API failure, carrying BOTH the localized message (for the plain-text
 * fallback rendering every studio already had) and the raw machine code. The raw
 * code is what lets a render site later decide this is one of the four "gate"
 * codes that should open UpgradePrompt instead of just printing red text — that
 * information used to be discarded the moment `mapApiError` ran, which is why
 * UpgradePrompt sat unimported everywhere.
 */
export interface StudioError {
  code: string;
  message: string;
  /** Present on 402 insufficient_credits responses — every studio route echoes
   * the reserved amount back as `required`. Lets the modal show an accurate
   * "X / Y" ratio without each page re-deriving its own cost formula. */
  required?: number;
}

/** Build the state shape above from a fetch response's parsed `error` field
 * (or the literal 'network' on a thrown/caught request failure). */
export function toStudioError(code: unknown, t: Translator, required?: number): StudioError {
  return {
    code: typeof code === 'string' ? code : 'fallback',
    message: mapApiError(code, t),
    ...(typeof required === 'number' ? { required } : {}),
  };
}

export type UpgradeVariant = 'insufficient_credits' | 'feature_locked' | 'resolution_locked';

const GATE_VARIANTS: Partial<Record<string, UpgradeVariant>> = {
  insufficient_credits: 'insufficient_credits',
  resolution_not_available: 'resolution_locked',
  voice_not_available: 'feature_locked',
  dialect_not_available: 'feature_locked',
};

/**
 * The four codes above are the moment a user is most willing to pay — running
 * out mid-flow, or hitting a plan wall — so they get UpgradePrompt's working
 * /billing CTA instead of inert red text. Every other code keeps the plain
 * message path unchanged.
 */
export function getUpgradeVariant(code: string): UpgradeVariant | null {
  return GATE_VARIANTS[code] ?? null;
}

/**
 * The single gate every studio render site calls: given the current error and
 * the tri-state balance read, decide whether UpgradePrompt should replace the
 * red-text panel. `insufficient_credits` additionally requires a resolved
 * balance — a modal that confidently says "you have 0" while the balance read
 * is merely loading/erroring would repeat the exact bug Task 1 fixed elsewhere.
 * Pass `status` from `useCredits()`.
 */
export function getGatedUpgradeVariant(
  error: StudioError | null,
  creditsStatus: 'loading' | 'ready' | 'error'
): UpgradeVariant | null {
  if (!error) return null;
  const variant = getUpgradeVariant(error.code);
  if (variant === 'insufficient_credits' && creditsStatus !== 'ready') return null;
  return variant;
}
