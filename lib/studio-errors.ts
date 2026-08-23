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
  // 503 from the voiceover route: the narrator is on the plan, the path to it is
  // down, and the reservation came back in full. Absent from this set the code
  // resolves to `fallback`, i.e. "something unexpected went wrong" — which tells
  // the customer neither to pick another voice nor that they were not charged.
  'premium_voice_unavailable',
  'network',
  'project_not_found',
  'refund_failed',
]);

type Translator = (key: string, values?: Record<string, string | number>) => string;

/**
 * Map a machine error code from the studio APIs to a localized user message.
 * Pass a translator scoped to the `studio` namespace: useTranslations('studio').
 */
export function mapApiError(
  code: unknown,
  t: Translator,
  values?: Record<string, string | number>,
): string {
  const key = typeof code === 'string' && KNOWN_ERROR_CODES.has(code) ? code : 'fallback';
  // `prompt_blocked` names the offending word. If a caller has no term to give,
  // fall back to the wording that does not reference one — otherwise the user
  // is shown the literal placeholder.
  const resolved = key === 'prompt_blocked' && !values?.term ? 'prompt_blocked_generic' : key;
  return t(`errors.${resolved}`, values);
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
export function toStudioError(
  code: unknown,
  t: Translator,
  required?: number,
  /**
   * The blocked word, on `prompt_blocked` responses. Without it the user is
   * told their text "contains disallowed content" and left to guess which of
   * their own words caused it — a wall with no door. Every studio route already
   * echoes it back as `term`; it just had nowhere to go.
   */
  term?: string,
): StudioError {
  return {
    code: typeof code === 'string' ? code : 'fallback',
    message: mapApiError(code, t, term ? { term } : undefined),
    ...(typeof required === 'number' ? { required } : {}),
  };
}

/**
 * Every studio route reserves credits before generating and calls
 * refundCredits() to give them back on failure — but that call can itself
 * fail (see lib/credits/deduct.ts). When it does, telling the user "generation
 * failed" is actively misleading: their credits are gone from the balance and
 * nothing on screen says so. `refund_failed` takes priority over whatever
 * failure code the route would otherwise have returned, EXCEPT the small set
 * of codes that carry their own required response metadata a caller must not
 * silently drop (e.g. `term` on `prompt_blocked`) — routes should only pass
 * this the plain fallback code they'd use when the refund succeeds.
 *
 * Usage at a call site:
 *   const refundResult = await refundCredits({ ... });
 *   return NextResponse.json({
 *     success: false,
 *     error: refundAwareErrorCode(refundResult, 'generation_parse_failed'),
 *   }, { status: 500 });
 */
export function refundAwareErrorCode(refundResult: { success: boolean }, fallbackCode: string): string {
  return refundResult.success ? fallbackCode : 'refund_failed';
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
