import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCreditsForPlan } from '@/lib/stripe/plans';
import type Stripe from 'stripe';

// In-memory idempotency set (sufficient for single-instance; use DB table at scale)
const processedEvents = new Set<string>();

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else if (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_APP_URL?.includes('localhost')) {
      // Dev mode only: parse without verification
      console.warn('Webhook signature verification skipped (dev mode)');
      event = JSON.parse(body) as Stripe.Event;
    } else {
      // Production without secret = reject
      console.error('STRIPE_WEBHOOK_SECRET not configured in production');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
  }

  // C3: Idempotency — skip already-processed events
  if (processedEvents.has(event.id)) {
    return NextResponse.json({ received: true, skipped: 'duplicate' });
  }
  processedEvents.add(event.id);
  // Prevent memory leak: cap at 10k entries
  if (processedEvents.size > 10000) {
    const first = processedEvents.values().next().value;
    if (first) processedEvents.delete(first);
  }

  const supabase = await createServiceRoleClient();

  try {
    switch (event.type) {
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

            // C4: Fix balance calculation — don't double-count
            const currentPurchased = profile?.purchased_credits || 0;
            const newPurchased = currentPurchased + creditsToAdd;
            const currentBalance = profile?.credits_balance || 0;
            const newTotalBalance = currentBalance + creditsToAdd;

            await supabase
              .from('profiles')
              .update({ purchased_credits: newPurchased })
              .eq('id', userId);

            await supabase.from('credit_transactions').insert({
              user_id: userId,
              amount: creditsToAdd,
              type: 'topup',
              description: `Top-up: ${topupId} — ${creditsToAdd} credits (never expire)`,
              stripe_payment_intent_id: typeof session.payment_intent === 'string'
                ? session.payment_intent : null,
              balance_after: newTotalBalance,
            });
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) break;

        const planId = subscription.metadata?.planId;
        if (planId) {
          const credits = getCreditsForPlan(planId);
          await supabase
            .from('profiles')
            .update({ plan_id: planId, credits_balance: credits })
            .eq('id', userId);
        }
        break;
      }

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

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer : invoice.customer?.id;

        if (customerId) {
          console.error(`Payment failed for customer ${customerId}`);
        }
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
