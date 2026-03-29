import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/client';
import { PLANS } from '@/lib/stripe/plans';

const InputSchema = z.object({
  planId: z.enum(['starter', 'pro', 'business', 'agency']),
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

  await supabase
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
    const { planId } = InputSchema.parse(body);

    const plan = PLANS[planId];
    if (!plan || !plan.priceId) {
      return NextResponse.json({ success: false, error: 'invalid_plan' }, { status: 400 });
    }

    const customerId = await getOrCreateStripeCustomer(supabase, user.id, user.email || '');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: plan.priceId, quantity: 1 }],
      success_url: `${appUrl}/ar/billing?success=true&plan=${planId}`,
      cancel_url: `${appUrl}/ar/billing`,
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
