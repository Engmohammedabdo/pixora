import { z } from 'zod/v4';
import { routing } from '@/i18n/routing';

/**
 * Which locale Stripe should send the customer back to.
 *
 * All three Stripe routes used to read `profiles.locale` for this. That column is
 * declared in migration 001 with `DEFAULT 'ar'` and is written by NOTHING — the
 * language switcher in the TopBar is a client-side `router.replace`, not a profile
 * update. So `profile?.locale || 'ar'` evaluated to `'ar'` for every user who has
 * ever existed, and an English customer was returned from Stripe to an Arabic,
 * right-to-left billing page.
 *
 * Reading a different column would not have helped; the information simply is not
 * in the database. The caller's active locale is, so it is passed in the request.
 * Defaulting to the app's own default locale keeps every existing caller working.
 */
const LocaleBody = z.object({
  locale: z.enum(routing.locales as unknown as [string, ...string[]]).optional(),
});

export function resolveReturnLocale(body: unknown): string {
  const parsed = LocaleBody.safeParse(body ?? {});
  return parsed.success && parsed.data.locale ? parsed.data.locale : routing.defaultLocale;
}
