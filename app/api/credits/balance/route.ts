import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('credits_balance, purchased_credits, plan_id, payment_failed')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: 'profile_not_found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        balance: data.credits_balance + (data.purchased_credits || 0),
        planCredits: data.credits_balance,
        purchasedCredits: data.purchased_credits || 0,
        planId: data.plan_id,
        // The dashboard polls this route every 30s, which makes it the cheapest
        // carrier for both signals the billing UI needs to stay truthful without a
        // reload: the plan (so the page heals itself after a checkout lands) and
        // the dunning flag (so a failed card is visible at all — it was written by
        // the webhook and read by nothing).
        paymentFailed: data.payment_failed === true,
      },
    });
  } catch (error) {
    console.error('Credits balance error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
