import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createHash } from 'crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isEmailConfigured } from '@/lib/email/client';
import { sendPasswordResetEmail } from '@/lib/email/send';
import { consumeAttempt, clientIp, ipBucket } from '@/lib/throttle';
import { routing } from '@/i18n/routing';

/**
 * Password reset, sent by THIS app.
 *
 * ── WHY THIS ROUTE EXISTS ──────────────────────────────────────────────────
 * The forgot-password page called `supabase.auth.resetPasswordForEmail()`,
 * which asks Supabase Auth (GoTrue) to send the mail. GoTrue is a SEPARATE
 * service in Coolify with its own `SMTP_*`, and it has never had any — verified
 * live: `/auth/v1/settings` reports `mailer_autoconfirm: true`, and all three
 * accounts have `email_confirmed_at` equal to `created_at` to the millisecond,
 * which is what auto-confirm does when there is no mailer to confirm through.
 * So a customer who forgot their password had no route back into a paid
 * account, and the page answered with GoTrue's raw English error.
 *
 * `auth.admin.generateLink({ type: 'recovery' })` mints a real recovery token
 * and does NOT send anything, which is exactly what is wanted: the app takes
 * the link and puts it on its own mail transport — the one already used for the
 * dunning notice and the waitlist confirmation. One SMTP configuration instead
 * of two, on the service the app actually owns.
 *
 * ── THE TWO RULES THIS ROUTE IS BUILT AROUND ───────────────────────────────
 * 1. **The answer must not depend on whether the account exists.** Unknown
 *    address, known address, send failure — all return the same 200. Otherwise
 *    this endpoint is an account-enumeration oracle for a product whose whole
 *    customer list is its business.
 *
 * 2. **"We cannot send mail at all" is decided BEFORE the lookup.** Checking
 *    afterwards would mean the 503 is only ever returned for addresses that
 *    exist, which turns an honest outage notice into rule 1's leak. It reads
 *    only environment, so its answer is identical for every caller — and it is
 *    the state this deployment is in today, which is why the page must be able
 *    to say so rather than claim a link is on its way.
 */

const InputSchema = z.object({
  // 254 is the RFC 5321 maximum for a full address.
  email: z.string().email().max(254),
  locale: z.enum(['ar', 'en']).optional(),
});

/** Per-source budget. Generous enough for a person mistyping their address. */
const IP_MAX = 5;
const IP_WINDOW_MINUTES = 15;

/**
 * Per-address budget, and the more important of the two: without it, one
 * attacker rotating source addresses can mail-bomb a single inbox with reset
 * links, which is both harassment and a phishing setup.
 */
const ADDRESS_MAX = 3;
const ADDRESS_WINDOW_MINUTES = 60;

/** The counter key never holds the address itself. */
function addressKey(email: string): string {
  return `recover:addr:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * The link the customer clicks — built by us, pointing at our own page.
 *
 * ── WHY NOT GoTrue's `action_link` ─────────────────────────────────────────
 * Two independent reasons, both measured rather than assumed.
 *
 * 1. IT IS UNREACHABLE. GoTrue builds `action_link` from its own
 *    `API_EXTERNAL_URL`, and on this self-hosted deployment that is the
 *    INTERNAL docker hostname:
 *
 *        http://supabase-kong:8000/auth/v1/verify?token=…&type=recovery&redirect_to=…
 *
 *    `supabase-kong` resolves only inside the compose network, so that link is
 *    dead in any inbox — and it is the same link GoTrue would have put in its
 *    own email, so this was broken independently of the missing SMTP.
 *
 * 2. IT IS THE WRONG FLOW. `action_link` verifies server-side and 303s to the
 *    reset page with the session in the URL FRAGMENT — the implicit flow. But
 *    `@supabase/ssr`'s `createBrowserClient` hard-codes `flowType: 'pkce'`
 *    AFTER spreading caller options, so no caller can change it, and auth-js
 *    then throws `AuthPKCEGrantCodeExchangeError: Not a valid PKCE flow url.`
 *    before any network call. Verified by running the installed library: no
 *    session, no PASSWORD_RECOVERY event, and a reset form whose button is
 *    disabled forever with nothing on screen explaining why.
 *
 *    The old `resetPasswordForEmail()` did not hit this because a PKCE client
 *    attaches a `code_challenge` and gets a `?code=` link back — consistent
 *    with itself. Swapping in `generateLink` flipped the link's flow while the
 *    consumer stayed pinned to the other one.
 *
 * ── WHAT THIS DOES INSTEAD ─────────────────────────────────────────────────
 * `generateLink` also returns `properties.hashed_token`, which is exactly what
 * Supabase's own custom-email-template path uses. The link points at OUR page
 * carrying that token, and the page redeems it with
 * `verifyOtp({ token_hash, type: 'recovery' })` — an explicit call, so the
 * client's flow type is irrelevant, and the SSR client still writes the session
 * to cookies so the redirect to the dashboard afterwards actually works.
 *
 * Verified end to end against the live service: verifyOtp establishes a session
 * for the right user, and a second use of the same token returns
 * `403 Email link is invalid or has expired`.
 */
function resetUrlFor(locale: string, hashedToken: string): string {
  const url = new URL(`${appUrl()}/${locale}/reset-password`);
  url.searchParams.set('token_hash', hashedToken);
  url.searchParams.set('type', 'recovery');
  return url.toString();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let email: string;
  let locale: string;
  try {
    const body = await request.json();
    const input = InputSchema.parse(body);
    // Lowercased so `A@x.com` and `a@x.com` share one budget; GoTrue compares
    // addresses case-insensitively, so they are the same account either way.
    email = input.email.trim().toLowerCase();
    locale = input.locale ?? routing.defaultLocale;
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_email' }, { status: 400 });
  }

  // RULE 2 — before anything that touches the account.
  if (!isEmailConfigured()) {
    console.error(
      '[recover] refused: no mail backend configured. Set EMAIL_FROM plus SMTP_HOST (or RESEND_API_KEY) ' +
        'on the app service — see docs/EMAIL_SETUP.md. Until then no customer can reset a password.'
    );
    return NextResponse.json({ success: false, error: 'email_unavailable' }, { status: 503 });
  }

  // Throttle. Fails CLOSED: if the counter is unreachable the database is down,
  // and a product whose database is down has nothing to log into anyway — so
  // denying costs no working functionality, while allowing costs the whole cap.
  try {
    const perIp = await consumeAttempt(
      `recover:ip:${ipBucket(clientIp(request))}`,
      IP_MAX,
      IP_WINDOW_MINUTES
    );
    if (!perIp) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    // Consumed for unknown addresses too — a budget that only counts real
    // accounts is itself an oracle.
    const perAddress = await consumeAttempt(addressKey(email), ADDRESS_MAX, ADDRESS_WINDOW_MINUTES);
    if (!perAddress) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }
  } catch (error) {
    console.error('[recover] throttle unavailable, refusing:', error);
    return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
  }

  // RULE 1 — from here on, every path returns the same body.
  const generic = NextResponse.json({ success: true });

  try {
    const admin = await createServiceRoleClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${appUrl()}/${locale}/reset-password` },
    });

    const hashedToken = (data?.properties as { hashed_token?: string } | undefined)?.hashed_token;
    if (error || !hashedToken) {
      // The overwhelmingly common cause is "no account with that address",
      // which is not an error worth surfacing — and must not be.
      console.warn('[recover] no token generated (usually: no such account):', error?.message ?? 'no hashed_token');
      return generic;
    }

    // NOT awaited, on purpose. Awaiting made this route a timing oracle: the
    // unknown-address arm returns after one Kong round trip, while the known
    // arm additionally paid for a whole SMTP transaction — connect, STARTTLS,
    // AUTH, MAIL FROM/RCPT TO/DATA — before returning the byte-identical body.
    // Hundreds of milliseconds to seconds of difference, measurable over the
    // three samples the throttle allows, which defeats Rule 1 by the clock
    // instead of by the body.
    //
    // This does not make the two arms constant-time — the known arm still mints
    // a token and writes a row — but it removes the term that dominated by
    // orders of magnitude. The app runs as a long-lived Node server
    // (`output: 'standalone'`), so the promise settles normally after the
    // response; the only loss is a send interrupted by a process restart.
    void sendPasswordResetEmail({ email, resetUrl: resetUrlFor(locale, hashedToken), locale })
      .then((result) => {
        if (result.status !== 'sent') {
          // Loud, because the customer has just been told to check their inbox
          // and nothing is coming. Rule 1 forbids telling them apart from a
          // stranger guessing addresses, so the log is the only place this can
          // surface.
          console.error(
            `[recover] REACHABLE CUSTOMER NOT REACHED — link generated but not sent (${result.status}): ` +
              ('reason' in result ? result.reason : result.error)
          );
        }
      })
      .catch((e: unknown) => {
        console.error('[recover] send threw (it is documented never to):', e);
      });

    return generic;
  } catch (error) {
    console.error('[recover] unexpected failure:', error);
    return generic;
  }
}
