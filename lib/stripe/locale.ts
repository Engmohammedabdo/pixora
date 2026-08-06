import { z } from 'zod/v4';
import { routing } from '@/i18n/routing';
import type { createServerClient } from '@/lib/supabase/server';

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

/**
 * Record the customer's language on their profile.
 *
 * This is what finally makes `profiles.locale` a real column instead of a default
 * nothing ever overwrote. Checkout is the right place to write it: an email sent
 * from a Stripe webhook has no request and no URL to read a locale from, so the
 * language has to have been captured earlier — and the population that receives
 * billing email is exactly the population that has been through checkout.
 *
 * `locale` is in the authenticated-writable column list (migration 022), so this
 * runs as the user and needs no service role. Best-effort by design: a customer must
 * never be blocked from paying because a preference write failed.
 */
export async function persistLocale(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  locale: string
): Promise<void> {
  const { error } = await supabase.from('profiles').update({ locale }).eq('id', userId);
  if (error) {
    const message = (error as { message?: string })?.message ?? String(error);
    console.warn(`[stripe] could not record locale "${locale}" for ${userId}: ${message}`);
  }
}
