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
