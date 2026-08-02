import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/client';
import { resolveReturnLocale } from '@/lib/stripe/locale';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    // Deliberately gated on the CUSTOMER, not the subscription. Anyone who has ever
    // paid has a Stripe customer — including someone who only ever bought top-ups,
    // and a churned subscriber (the webhook nulls stripe_subscription_id but never
    // stripe_customer_id). Both need the portal to reach their receipts and payment
    // history; neither has a subscription.
    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ success: false, error: 'no_customer' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const locale = resolveReturnLocale(await request.json().catch(() => null));

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/${locale}/billing`,
    });

    return NextResponse.json({ success: true, data: { url: portalSession.url } });
  } catch (error) {
    console.error('Portal error:', error);
    return NextResponse.json({ success: false, error: 'portal_failed' }, { status: 500 });
  }
}
