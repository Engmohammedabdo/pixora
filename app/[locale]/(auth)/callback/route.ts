import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCachedFeatureFlags } from '@/lib/admin/settings';

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const locale = request.nextUrl.pathname.split('/')[1] || 'ar';
  const baseUrl = getBaseUrl(request);

  const referralCode = searchParams.get('ref');

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
  }

  return NextResponse.redirect(`${baseUrl}/${locale}/login`);
}
