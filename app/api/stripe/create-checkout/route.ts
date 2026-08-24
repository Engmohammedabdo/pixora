import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/client';
import { PLANS } from '@/lib/stripe/plans';
import { resolveReturnLocale, persistLocale } from '@/lib/stripe/locale';
import { gaCheckoutMetadata } from '@/lib/analytics/stripe-attribution';

const InputSchema = z.object({
  planId: z.enum(['starter', 'pro', 'business', 'agency']),
  // Optional: pre-existing callers that omit it fall back to the default locale.
  locale: z.string().optional(),
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
    const { planId } = InputSchema.parse(body);
    const locale = resolveReturnLocale(body);
    // Captured here because a webhook has no request to read it from later.
    await persistLocale(supabase, user.id, locale);

    const plan = PLANS[planId];
    if (!plan || !plan.priceId) {
      return NextResponse.json({ success: false, error: 'invalid_plan' }, { status: 400 });
    }

    const priceId = plan.priceId;

    // A customer with a live subscription must go through the billing portal, not
    // a second checkout. Stripe happily creates a SECOND parallel subscription, so
    // a Starter subscriber clicking "Pro" ended up paying for both — and the
    // webhook then overwrote the stored subscription id, leaving the first one
    // billing forever with no way to cancel it from the app.
    const { data: existingSub } = await supabase
      .from('profiles')
      .select('stripe_subscription_id, plan_id')
      .eq('id', user.id)
      .single();

    if (existingSub?.stripe_subscription_id) {
      return NextResponse.json({
        success: false,
        error: 'subscription_exists',
        currentPlan: existingSub.plan_id,
      }, { status: 409 });
    }

    const customerId = await getOrCreateStripeCustomer(supabase, user.id, user.email || '');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

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
        // Captured here for the same reason the locale is, three lines up: the
        // webhook has no customer request to read them from. Without them the
        // purchase reaches GA4 attributed to nobody. See lib/analytics/stripe-attribution.ts.
        ...(await gaCheckoutMetadata()),
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
