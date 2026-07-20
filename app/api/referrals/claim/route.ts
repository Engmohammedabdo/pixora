import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getCachedFeatureFlags } from '@/lib/admin/settings';

const InputSchema = z.object({
  code: z.string().min(4).max(32),
});

/**
 * POST /api/referrals/claim — attach the signed-in user to a referrer's code and
 * award both sides.
 *
 * Called once, straight after signup, with the `ref` code carried in from the
 * invite link. Every rule (code exists, not self-referral, not already referred,
 * account is genuinely new) is enforced inside the `claim_referral` RPC rather
 * than here, so the guarantees hold even if another caller is added later.
 *
 * The RPC is SECURITY DEFINER and EXECUTE is granted to service_role only
 * (migration 023 §5), so it is invoked with the service-role client. That is safe
 * because the referee id comes from the verified session below, never from the
 * request body.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const flags = await getCachedFeatureFlags();
    if (!flags.referral_enabled) {
      return NextResponse.json({ success: false, error: 'referrals_disabled' }, { status: 403 });
    }

    const { code } = InputSchema.parse(await request.json());

    const admin = await createServiceRoleClient();
    const { data, error } = await admin.rpc('claim_referral', {
      p_referee_id: user.id,
      p_code: code,
      p_credits: 25,
    });

    if (error) {
      console.error('[referrals] claim RPC failed:', error.message);
      return NextResponse.json({ success: false, error: 'claim_failed' }, { status: 500 });
    }

    const result = data as { success: boolean; error?: string; credits_awarded?: number; new_balance?: number } | null;

    // A rejected claim is not a server fault — an invalid or reused code is the
    // normal case. Report it as 200 with success:false so the signup flow can
    // continue silently instead of showing the new user an error.
    if (!result?.success) {
      return NextResponse.json({ success: false, error: result?.error ?? 'claim_rejected' });
    }

    return NextResponse.json({
      success: true,
      data: { creditsAwarded: result.credits_awarded, newBalance: result.new_balance },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error' }, { status: 400 });
    }
    console.error('Referral claim error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
