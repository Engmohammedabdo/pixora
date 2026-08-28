import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/client';
import { TOPUPS } from '@/lib/stripe/plans';
import { resolveReturnLocale, persistLocale } from '@/lib/stripe/locale';
import { gaCheckoutMetadata, metaCheckoutMetadata } from '@/lib/analytics/stripe-attribution';
import { readMetaIds, sendMetaCapiEvent } from '@/lib/analytics/meta-capi';

const InputSchema = z.object({
  topupId: z.enum(['small', 'medium', 'large', 'xl']),
  locale: z.string().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { topupId } = InputSchema.parse(body);
    const locale = resolveReturnLocale(body);
    await persistLocale(supabase, user.id, locale);

    const topup = TOPUPS[topupId];
    if (!topup) {
      return NextResponse.json({ success: false, error: 'invalid_topup' }, { status: 400 });
    }

    // Get or ensure Stripe customer exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || '',
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      // Server-authoritative column — see migration 022. Must use service-role.
      const admin = await createServiceRoleClient();
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{ price: topup.priceId, quantity: 1 }],
      success_url: `${appUrl}/${locale}/billing?success=true&topup=${topupId}`,
      cancel_url: `${appUrl}/${locale}/billing`,
      // Same rationale as the subscription checkout: inert until a code exists,
      // but a code created later is unredeemable without this.
      allow_promotion_codes: true,
      metadata: {
        // Captured here for the same reason the locale is, three lines up: the
        // webhook has no customer request to read them from. Without them the
        // purchase reaches GA4 and Meta attributed to nobody. See
        // lib/analytics/stripe-attribution.ts.
        ...(await gaCheckoutMetadata()),
        ...(await metaCheckoutMetadata()),
        userId: user.id,
        topupId,
        credits: String(topup.credits),
        type: 'topup',
      },
    });

    // Same mid-funnel signal as create-checkout, same fire-and-forget contract.
    void readMetaIds().then((ids) =>
      sendMetaCapiEvent({
        eventName: 'InitiateCheckout',
        eventId: `ic_${session.id}`,
        email: user.email,
        userId: user.id,
        ...ids,
        customData: { content_name: `topup_${topupId}` },
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    }
    console.error('Topup checkout error:', error);
    return NextResponse.json({ success: false, error: 'checkout_failed' }, { status: 500 });
  }
}
