import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/client';
import { resolveReturnLocale } from '@/lib/stripe/locale';
import type Stripe from 'stripe';

/**
 * App locale -> the locale Stripe renders the billing portal in.
 *
 * **STRIPE HAS NO ARABIC BILLING PORTAL, AND THE TYPE SYSTEM WILL NOT TELL YOU.**
 * `Stripe.BillingPortal.SessionCreateParams.Locale` lists 47 locales — measured
 * from the installed package, node_modules/stripe/cjs/resources/BillingPortal/
 * Sessions.d.ts — and `ar` is not one of them. The union ends in `OtherString`,
 * an escape hatch that accepts ANY string, so `ar: 'ar'` type-checked cleanly,
 * reached the API, and would have been rejected: a 500 and NO portal for every
 * Arabic customer, which is this product's whole customer base. The first version
 * of this map did exactly that, and the comment above it claimed the map existed
 * to prevent it.
 *
 * So Arabic gets `auto` — Stripe's own Accept-Language detection, the behaviour
 * this route had before it sent a locale at all. It is not a translation; it is
 * the honest ceiling of what Stripe offers. `test:api-hygiene` now checks every
 * VALUE here against that published union, because the gate that shipped with the
 * bug asserted only that a `locale:` key was present.
 */
const PORTAL_LOCALE: Record<string, Stripe.BillingPortal.SessionCreateParams.Locale> = {
  ar: 'auto',
  en: 'en',
};

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

    // WHICH portal the customer is shown is stated here, by id, and is never left
    // to Stripe's account default.
    //
    // One live Stripe account carries three products — PyraSuite, HookLens and a
    // handful of one-off invoices — and "the default configuration" is a SINGLE
    // account-wide object, not one per product. A session created without an
    // explicit `configuration` uses it. So the day another product saves portal
    // settings in the Dashboard, this route would start handing PyraSuite
    // customers that product's plan list and cancellation policy, and nothing
    // would fail: the call succeeds, the page renders, the wrong prices are on it.
    //
    // Refusing is therefore the correct behaviour for a missing id, not a
    // fallback. Both callers (billing/page.tsx, PaymentFailedBanner.tsx) already
    // render the generic "could not open the portal" message for any error other
    // than `no_customer`, so this needs no new copy to reach the customer.
    const configuration = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
    if (!configuration) {
      console.error('[stripe] STRIPE_PORTAL_CONFIGURATION_ID is not set — refusing to open whatever the shared account default happens to be');
      return NextResponse.json({ success: false, error: 'portal_unavailable' }, { status: 503 });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      configuration,
      return_url: `${appUrl}/${locale}/billing`,
      // English customers get an English portal instead of whatever their browser
      // asks for; Arabic falls to 'auto' because Stripe publishes no Arabic portal
      // (see PORTAL_LOCALE). An app locale with no entry falls to 'auto' too, which
      // is the pre-existing behaviour and never an API error.
      locale: PORTAL_LOCALE[locale] ?? 'auto',
    });

    return NextResponse.json({ success: true, data: { url: portalSession.url } });
  } catch (error) {
    console.error('Portal error:', error);
    return NextResponse.json({ success: false, error: 'portal_failed' }, { status: 500 });
  }
}
