import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/stripe/client';
import { TOPUPS } from '@/lib/stripe/plans';

const InputSchema = z.object({
  topupId: z.enum(['small', 'medium', 'large', 'xl']),
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
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{ price: topup.priceId, quantity: 1 }],
      success_url: `${appUrl}/ar/billing?success=true&topup=${topupId}`,
      cancel_url: `${appUrl}/ar/billing`,
      metadata: {
        userId: user.id,
        topupId,
        credits: String(topup.credits),
        type: 'topup',
      },
    });

    return NextResponse.json({ success: true, data: { url: session.url } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    }
    console.error('Topup checkout error:', error);
    return NextResponse.json({ success: false, error: 'checkout_failed' }, { status: 500 });
  }
}
