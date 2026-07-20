import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';

// Matches the "أضفنا 5 كريدت مجانية لحسابك" promise on onboarding step 5
// (messages/ar.json: onboarding.step5Description). Keep in sync with that copy.
const ONBOARDING_BONUS_CREDITS = 5;

// Body is optional. Normal completion sends none (or `{}`); the Skip control
// sends `{ skipped: true }` to release the user from the middleware's
// onboarding redirect WITHOUT paying out the completion bonus.
const BodySchema = z.object({
  skipped: z.boolean().optional(),
}).strict();

interface GrantOnboardingBonusResult {
  success: boolean;
  error?: string;
  credits_awarded?: number;
  new_balance?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Auth check FIRST, via the cookie-authenticated session client. The user
    // id below comes only from the verified session — never from the request
    // body — because grant_onboarding_bonus is service_role-only and would
    // otherwise let any caller credit an arbitrary account.
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    const rawBody = await request.text();
    const { skipped } = rawBody ? BodySchema.parse(JSON.parse(rawBody)) : { skipped: undefined };

    if (skipped === true) {
      // Skip must still release the user from the middleware's onboarding
      // redirect, but must NOT grant the completion bonus. Only flip the
      // flag, via the session client — 022 grants authenticated users UPDATE
      // on this exact column, so no service-role client / RPC is needed and
      // no credit_transactions row is written.
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);

      if (updateError) {
        console.error('Onboarding skip update error:', updateError.message);
        return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
      }

      return NextResponse.json({ success: true, skipped: true });
    }

    // Releases the user from the middleware's onboarding redirect regardless
    // of what happens to the credit payout below. Uses the SESSION client —
    // 022:57 grants authenticated users column-level UPDATE on exactly this
    // column, so no service-role privilege is needed just to flip the flag.
    // A credit-payout problem (RPC down, migration 027 not yet applied on
    // this environment, a thrown service-role client, ...) must never become
    // a lockout: the middleware redirects /dashboard -> /onboarding forever
    // whenever onboarding_completed is false, and Skip would be the only
    // remaining escape for every affected user.
    const releaseUser = async (): Promise<void> => {
      const { error: releaseError } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);
      if (releaseError) {
        console.error('Onboarding release update error:', releaseError.message);
      }
    };

    try {
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
        await releaseUser();
        return NextResponse.json({ success: true, bonusGranted: false });
      }

      const result = data as unknown as GrantOnboardingBonusResult | null;

      if (!result) {
        console.error('Onboarding bonus RPC returned no data');
        await releaseUser();
        return NextResponse.json({ success: true, bonusGranted: false });
      }

      if (!result.success) {
        // 'already_granted' is the expected outcome on every repeat completion
        // (double-submit, back button, a second device) — the user already
        // holds their bonus, so this is a normal success-shaped response, not
        // an error. The flag itself is already released by this point:
        // migration 027's exception handler re-sets onboarding_completed=TRUE
        // in the outer transaction before returning 'already_granted', so no
        // extra release call is needed here.
        //
        // Any OTHER rejection (e.g. 'profile_not_found') is a genuine
        // server-side problem, but it must still release the user rather than
        // trap them behind the onboarding redirect — the response stays
        // success-shaped with bonusGranted:false so the failure is visible
        // without blocking access.
        if (result.error === 'already_granted') {
          return NextResponse.json({ success: true, alreadyGranted: true, bonusGranted: false });
        }
        console.error('Onboarding bonus rejected:', result.error);
        await releaseUser();
        return NextResponse.json({ success: true, bonusGranted: false });
      }

      return NextResponse.json({
        success: true,
        alreadyGranted: false,
        bonusGranted: true,
        creditsAwarded: result.credits_awarded,
        newBalance: result.new_balance,
      });
    } catch (grantError) {
      // A throw here (e.g. createServiceRoleClient() failing on missing env
      // vars, or the RPC call itself throwing rather than resolving with
      // `error`) is a server-side infra problem, not something the user did —
      // same treatment as the RPC-error branch above: release, don't lock out.
      console.error('Onboarding bonus grant threw:', grantError);
      await releaseUser();
      return NextResponse.json({ success: true, bonusGranted: false });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error' }, { status: 400 });
    }
    console.error('Onboarding save error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
