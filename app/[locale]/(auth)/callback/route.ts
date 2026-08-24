import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCachedFeatureFlags } from '@/lib/admin/settings';
import { trackEventNow } from '@/lib/analytics/track';
import { EVENTS } from '@/lib/analytics/events';

function getBaseUrl(request: NextRequest): string {
  // Use NEXT_PUBLIC_APP_URL in production (Docker returns 0.0.0.0:3000 as origin)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  // Fallback: try x-forwarded headers from reverse proxy
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (host && !host.includes('0.0.0.0')) {
    return `${proto}://${host}`;
  }
  // Last resort
  return new URL(request.url).origin;
}

/**
 * A provider/GoTrue failure reduced to one of OUR codes.
 *
 * The provider's own text never goes on the wire. `error_description` is
 * attacker-influenceable and its destination is a page we render, so what leaves
 * this function is an allowlist of strings chosen here — the login page then uses
 * the code to SELECT a translated message rather than to display anything.
 */
function classifyAuthError(
  error: string | null,
  errorCode: string | null,
  description: string | null
): string {
  const haystack = `${error ?? ''} ${errorCode ?? ''} ${description ?? ''}`.toLowerCase();

  // The commonest failure on this deployment, and the reason this function
  // exists: a first-time Google sign-in is an INSERT into auth.users, which the
  // invite gate (migration 035) refuses. Postgres cannot get a clean message out
  // through GoTrue, so it arrives as unexpected_failure / "Database error saving
  // new user" — the same string signup/page.tsx matches on, for the same reason.
  // `signup_disabled` is what GoTrue answers when signups are off at its own level.
  if (
    haystack.includes('database error') ||
    haystack.includes('signup_disabled') ||
    haystack.includes('signups not allowed')
  ) {
    return 'invite_required';
  }

  // The user pressed cancel on Google's consent screen. Telling them sign-in
  // "failed" would be a lie about their own deliberate action.
  if (haystack.includes('access_denied')) return 'oauth_cancelled';

  return 'oauth_failed';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const locale = request.nextUrl.pathname.split('/')[1] || 'ar';
  const baseUrl = getBaseUrl(request);

  const referralCode = searchParams.get('ref');

  // GoTrue bounces a failed sign-in back to this exact URL with error /
  // error_code / error_description and NO code. This route used to look at
  // nothing but `code`, so every one of those fell through to a bare redirect to
  // /login carrying nothing — the user pressed "Continue with Google", was sent
  // back to the same form, and was never told why. Forever, since the usual
  // cause (no invite) does not change by retrying.
  //
  // Only the QUERY STRING is readable here. GoTrue returns OAuth errors as query
  // params, but anything it ever puts in the URL fragment never reaches the
  // server at all — which is why the login page keeps a generic fallback.
  const oauthError = searchParams.get('error');
  const oauthErrorCode = searchParams.get('error_code');
  const oauthErrorDescription = searchParams.get('error_description');

  if (oauthError || oauthErrorCode || oauthErrorDescription) {
    const reason = classifyAuthError(oauthError, oauthErrorCode, oauthErrorDescription);
    return NextResponse.redirect(`${baseUrl}/${locale}/login?error=${reason}`);
  }

  if (code) {
    // Destination is decided after the session exists — a first-time user should
    // land on onboarding, not the dashboard. Previously this always went to
    // /dashboard, so nobody signing in with Google ever saw onboarding at all.
    const response = NextResponse.redirect(`${baseUrl}/${locale}/dashboard`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const userId = sessionData?.user?.id;

      if (userId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', userId)
          .single();

        // ── SIGN-UP, THE OTHER HALF ──────────────────────────────────────────
        // signup/page.tsx reports the password path. This is the Google one, and
        // leaving it out would not merely undercount — it would undercount ONE
        // acquisition channel, which is worse: Google sign-ups would look like a
        // channel nobody uses.
        //
        // "New" is decided on auth.users.created_at, not on
        // `!onboarding_completed`. Every successful exchange runs this block, and
        // a returning user who abandoned onboarding has an incomplete profile
        // forever — that test would report them as a new sign-up on every login.
        // created_at is written once, by GoTrue, and cannot drift.
        const createdAt = Date.parse(sessionData?.user?.created_at ?? '');
        const isNewAccount = Number.isFinite(createdAt) && Date.now() - createdAt < 5 * 60_000;

        if (isNewAccount) {
          // Unlike the studio paths this is awaited: the response is a redirect,
          // so the function returns and the runtime is free to tear the invocation
          // down. Fire-and-forget here is fire-and-lose.
          await trackEventNow({
            userId,
            name: EVENTS.SIGN_UP,
            params: { method: 'google', locale },
          });

          // The signup page gets the gate status for free (it already fetched it
          // to decide what to render). This route does not, so it asks — once,
          // only for a genuinely new account, and never in a way that can break
          // sign-in.
          try {
            const admin = await createServiceRoleClient();
            const { data: gate } = await admin.rpc('invite_gate_status');
            const g = (gate ?? {}) as { installed?: boolean; enabled?: boolean };
            if (g.installed === true && g.enabled === true) {
              await trackEventNow({
                userId,
                name: EVENTS.INVITE_REDEEMED,
                params: { method: 'google', locale },
              });
            }
          } catch (e) {
            console.warn('[callback] invite_redeemed not recorded:', e);
          }
        }

        // Only on a first sign-in. This block runs on EVERY successful code
        // exchange, so without the onboarding guard an existing user who follows
        // a stranger's invite link and signs in with Google would permanently
        // burn their one-and-only referee slot and credit that stranger.
        // The referral_enabled kill switch is enforced here too: claim_referral
        // has no flag check of its own, and this is the second caller of it —
        // see app/api/referrals/claim/route.ts, which is the reference version.
        if (referralCode && !profile?.onboarding_completed) {
          // Best-effort: a rejected or failed claim must never block sign-in.
          try {
            const flags = await getCachedFeatureFlags();
            if (flags.referral_enabled) {
              const admin = await createServiceRoleClient();
              // supabase-js resolves with { error } instead of throwing, so the
              // catch below would never see a rejected claim.
              const { error: claimError } = await admin.rpc('claim_referral', {
                p_referee_id: userId,
                p_code: referralCode,
                p_credits: 25,
              });
              if (claimError) {
                console.error('[callback] referral claim failed:', claimError.message);
              }
            }
          } catch (e) {
            console.error('[callback] referral claim failed:', e);
          }
        }

        if (!profile?.onboarding_completed) {
          const onboarding = NextResponse.redirect(`${baseUrl}/${locale}/onboarding`);
          response.cookies.getAll().forEach((c) => onboarding.cookies.set(c));
          return onboarding;
        }
      }

      return response;
    }

    // The code was present but would not exchange — expired, replayed, or issued
    // to a different client. Generic on purpose: a gate refusal never lands here
    // (GoTrue creates the user before it redirects, so that failure arrives as
    // the error params handled above), so there is nothing more specific to say
    // than "try again".
    return NextResponse.redirect(`${baseUrl}/${locale}/login?error=oauth_failed`);
  }

  // Neither a code nor an error: somebody opened /callback directly. Nothing
  // failed, so claim nothing.
  return NextResponse.redirect(`${baseUrl}/${locale}/login`);
}
