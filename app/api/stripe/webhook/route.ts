import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCreditsForPlan } from '@/lib/stripe/plans';
import type Stripe from 'stripe';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_APP_URL?.includes('localhost')) {
      console.warn('Webhook signature verification skipped (dev mode)');
      event = JSON.parse(body) as Stripe.Event;
    } else {
      console.error('STRIPE_WEBHOOK_SECRET not configured in production');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // ═══ DB-BASED IDEMPOTENCY ═══
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('event_id')
    .eq('event_id', event.id)
    .single();

  if (existing) {
    return NextResponse.json({ received: true, skipped: 'duplicate' });
  }

  await supabase.from('webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
  });

  try {
    switch (event.type) {
      // ═══ CHECKOUT COMPLETED (new subscription or top-up) ═══
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId) break;

        if (session.mode === 'subscription') {
          const planId = session.metadata?.planId || 'starter';
          const credits = getCreditsForPlan(planId);
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;

          await supabase
            .from('profiles')
            .update({
              plan_id: planId,
              credits_balance: credits,
              stripe_subscription_id: subscriptionId || null,
              credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              payment_failed: false,
            })
            .eq('id', userId);

          await supabase.from('credit_transactions').insert({
            user_id: userId,
            amount: credits,
            type: 'subscription',
            description: `Subscription: ${planId} plan — ${credits} credits`,
            balance_after: credits,
          });
        }

        if (session.mode === 'payment') {
          const creditsToAdd = parseInt(session.metadata?.credits || '0', 10);
          const topupId = session.metadata?.topupId || 'unknown';

          if (creditsToAdd > 0) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('credits_balance, purchased_credits')
              .eq('id', userId)
              .single();

            const currentPurchased = profile?.purchased_credits || 0;
            const newPurchased = currentPurchased + creditsToAdd;
            const currentBalance = profile?.credits_balance || 0;
            const newTotalBalance = currentBalance + creditsToAdd;

            await supabase
              .from('profiles')
              .update({
                purchased_credits: newPurchased,
                purchased_credits_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              })
              .eq('id', userId);

            await supabase.from('credit_transactions').insert({
              user_id: userId,
              amount: creditsToAdd,
              type: 'topup',
              description: `Top-up: ${topupId} — ${creditsToAdd} credits (expires in 12 months)`,
              stripe_payment_intent_id: typeof session.payment_intent === 'string'
                ? session.payment_intent : null,
              balance_after: newTotalBalance,
            });
          }
        }
        break;
      }

      // ═══ SUBSCRIPTION UPDATED (plan change) ═══
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) break;

        const planId = subscription.metadata?.planId;
        if (planId) {
          const credits = getCreditsForPlan(planId);
          await supabase
            .from('profiles')
            .update({ plan_id: planId, credits_balance: credits, payment_failed: false })
            .eq('id', userId);

          await supabase.from('credit_transactions').insert({
            user_id: userId,
            amount: credits,
            type: 'subscription',
            description: `Plan updated to ${planId} — ${credits} credits`,
            balance_after: credits,
          });
        }
        break;
      }

      // ═══ SUBSCRIPTION CANCELLED ═══
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) break;

        const { data: cancelProfile } = await supabase
          .from('profiles')
          .select('purchased_credits')
          .eq('id', userId)
          .single();

        await supabase
          .from('profiles')
          .update({
            plan_id: 'free',
            credits_balance: 25,
            stripe_subscription_id: null,
            payment_failed: false,
          })
          .eq('id', userId);

        await supabase.from('credit_transactions').insert({
          user_id: userId,
          amount: 0,
          type: 'reset',
          description: `Subscription cancelled — downgraded to Free (purchased: ${cancelProfile?.purchased_credits || 0} kept)`,
          balance_after: 25 + (cancelProfile?.purchased_credits || 0),
        });
        break;
      }

      // ═══ MONTHLY RENEWAL — CREDITS RESET ═══
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.billing_reason !== 'subscription_cycle') break;

        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;

        const { data: renewalProfile } = await supabase
          .from('profiles')
          .select('id, plan_id, purchased_credits')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!renewalProfile) break;

        const renewalCredits = getCreditsForPlan(renewalProfile.plan_id);

        await supabase.from('profiles').update({
          credits_balance: renewalCredits,
          credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          payment_failed: false,
        }).eq('id', renewalProfile.id);

        await supabase.from('credit_transactions').insert({
          user_id: renewalProfile.id,
          amount: renewalCredits,
          type: 'subscription',
          description: `Monthly renewal: ${renewalProfile.plan_id} plan — ${renewalCredits} credits reset`,
          balance_after: renewalCredits + (renewalProfile.purchased_credits || 0),
        });
        break;
      }

      // ═══ PAYMENT FAILED — FLAG USER ═══
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer : invoice.customer?.id;
        if (!customerId) break;

        const { data: failedProfile } = await supabase
          .from('profiles')
          .select('id, plan_id, email')
          .eq('stripe_customer_id', customerId)
          .single();
        if (!failedProfile) break;

        await supabase.from('profiles')
          .update({ payment_failed: true })
          .eq('id', failedProfile.id);

        await supabase.from('credit_transactions').insert({
          user_id: failedProfile.id,
          amount: 0,
          type: 'reset',
          description: `Payment failed for ${failedProfile.plan_id} plan. Please update payment method.`,
          balance_after: 0,
        });
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
