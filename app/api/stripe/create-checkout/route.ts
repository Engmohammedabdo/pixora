import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/client';
import { PLANS, ANNUAL_PLANS } from '@/lib/stripe/plans';

const InputSchema = z.object({
  planId: z.enum(['starter', 'pro', 'business', 'agency']),
  billing: z.enum(['monthly', 'annual']).default('monthly'),
});

async function getOrCreateStripeCustomer(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  userId: string,
  email: string
): Promise<string> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  // stripe_customer_id is server-authoritative: migration 022 revokes UPDATE on it
  // from `authenticated`, so this write must use the service-role client. (Letting a
  // user set their own stripe_customer_id would also let them point it at another
  // customer and open that customer's billing portal.)
  const admin = await createServiceRoleClient();
  await admin
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId);

  return customer.id;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { planId, billing } = InputSchema.parse(body);

    const plan = PLANS[planId];
    if (!plan || !plan.priceId) {
      return NextResponse.json({ success: false, error: 'invalid_plan' }, { status: 400 });
    }

    // Use annual price if billing=annual and annual plan exists
    const priceId = billing === 'annual' && ANNUAL_PLANS[planId]
      ? ANNUAL_PLANS[planId].annualPriceId
      : plan.priceId;

    const customerId = await getOrCreateStripeCustomer(supabase, user.id, user.email || '');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const { data: prof } = await supabase.from('profiles').select('locale').eq('id', user.id).single();
    const locale = prof?.locale || 'ar';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/${locale}/billing?success=true&plan=${planId}`,
      cancel_url: `${appUrl}/${locale}/billing`,
      // Surfaces the promo-code field at checkout. Inert until a code actually
      // exists in the Stripe dashboard, so enabling it costs nothing — but
      // without it a code you create later simply cannot be redeemed.
      allow_promotion_codes: true,
      metadata: {
        userId: user.id,
        planId,
        credits: String(plan.credits),
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          planId,
        },
      },
    });

    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    }
    console.error('Checkout error:', error);
    return NextResponse.json({ success: false, error: 'checkout_failed' }, { status: 500 });
  }
}
