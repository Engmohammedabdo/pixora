import { NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';

// Matches the "أضفنا 5 كريدت مجانية لحسابك" promise on onboarding step 5
// (messages/ar.json: onboarding.step5Description). Keep in sync with that copy.
const ONBOARDING_BONUS_CREDITS = 5;

interface GrantOnboardingBonusResult {
  success: boolean;
  error?: string;
  credits_awarded?: number;
  new_balance?: number;
}

export async function POST(): Promise<NextResponse> {
  try {
    // Auth check FIRST, via the cookie-authenticated session client. The user
    // id below comes only from the verified session — never from the request
    // body — because grant_onboarding_bonus is service_role-only and would
    // otherwise let any caller credit an arbitrary account.
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    // grant_onboarding_bonus() is REVOKEd from anon/authenticated (027) and
    // GRANTed to service_role only, so it must be called through the
    // service-role client, not the session client above.
    const serviceClient = await createServiceRoleClient();
    const { data, error } = await serviceClient.rpc('grant_onboarding_bonus', {
      p_user_id: user.id,
      p_credits: ONBOARDING_BONUS_CREDITS,
    });

    if (error) {
      console.error('Onboarding bonus RPC error:', error.message);
      return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
    }

    const result = data as unknown as GrantOnboardingBonusResult | null;

    if (!result) {
      console.error('Onboarding bonus RPC returned no data');
      return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
    }

    if (!result.success) {
      // 'already_granted' is the expected outcome on every repeat completion
      // (double-submit, back button, a second device) — the user already
      // holds their bonus, so this is a normal success-shaped response, not
      // an error. Any OTHER rejection (e.g. 'profile_not_found') is a genuine
      // server-side problem and must stay visible as one rather than being
      // silently folded into "success".
      if (result.error === 'already_granted') {
        return NextResponse.json({ success: true, alreadyGranted: true });
      }
      console.error('Onboarding bonus rejected:', result.error);
      return NextResponse.json({ success: false, error: result.error ?? 'grant_failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      alreadyGranted: false,
      creditsAwarded: result.credits_awarded,
      newBalance: result.new_balance,
    });
  } catch (error) {
    console.error('Onboarding save error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
