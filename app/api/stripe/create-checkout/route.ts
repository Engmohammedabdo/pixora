import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/client';
import { PLANS } from '@/lib/stripe/plans';
import { resolveReturnLocale, persistLocale } from '@/lib/stripe/locale';
import { gaCheckoutMetadata, metaCheckoutMetadata } from '@/lib/analytics/stripe-attribution';
import { readMetaIds, sendMetaCapiEvent } from '@/lib/analytics/meta-capi';

const InputSchema = z.object({
  /**
   * Derived from PLANS, not typed out. The literal list was
   * ['starter','pro','business','agency'] and it — not the `!plan.priceId`
   * guard below — is what rejected a new plan: `InputSchema.parse()` runs
   * before that guard is ever reached, so an unknown id became a
   * `400 validation_error` naming no plan. The guard already refuses `free`,
   * which has no priceId, so the hand-typed list was redundant as well as a
   * second answer to "which plans can be bought".
   */
  planId: z.string().refine((v) => Object.hasOwn(PLANS, v), { message: 'unknown_plan' }),
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

    // A payment that has SETTLED but whose webhook has not landed yet leaves
    // `stripe_subscription_id` empty, so the 409 above cannot see it — and the
    // $2 button is on every page a free account visits, so "pay, come back, click
    // again before the webhook" opened a second subscription. A completed
    // subscription session for this customer in the last half hour means one is
    // settling; the billing page and UnlockButton both say so.
    const recent = await stripe.checkout.sessions.list({ customer: customerId, limit: 5 });
    const settling = recent.data.find(
      (s) => s.mode === 'subscription' && s.status === 'complete' && Date.now() / 1000 - s.created < 30 * 60
    );
    if (settling) {
      return NextResponse.json({ success: false, error: 'checkout_pending' }, { status: 409 });
    }
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
      // Names the product and the terms on Stripe's own page, where the Stripe
      // product name is otherwise the only brand the customer sees.
      custom_text: {
        submit: {
          message: locale === 'ar'
            ? 'PyraSuite — اشتراك شهري، تلغيه في أي وقت.'
            : 'PyraSuite — a monthly subscription you can cancel anytime.',
        },
      },
      metadata: {
        // Captured here for the same reason the locale is, three lines up: the
        // webhook has no customer request to read them from. Without them the
        // purchase reaches GA4 and Meta attributed to nobody. See
        // lib/analytics/stripe-attribution.ts.
        ...(await gaCheckoutMetadata()),
        ...(await metaCheckoutMetadata()),
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

    // Mid-funnel signal for Meta's optimizer, sent from here rather than the
    // browser because this request already witnesses the intent AND carries
    // the customer's cookies. Fire-and-forget: reporting must never delay or
    // fail a checkout. Keyed on the session id so a double-click that creates
    // two sessions counts twice — which it genuinely is — while a retry of
    // the SAME session collapses.
    void readMetaIds().then((ids) =>
      sendMetaCapiEvent({
        eventName: 'InitiateCheckout',
        eventId: `ic_${session.id}`,
        email: user.email,
        userId: user.id,
        ...ids,
        customData: { content_name: `plan_${planId}` },
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    }
    console.error('Checkout error:', error);
    return NextResponse.json({ success: false, error: 'checkout_failed' }, { status: 500 });
  }
}
