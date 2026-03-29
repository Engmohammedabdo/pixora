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
    } else {
      // Dev mode: parse without verification
      console.warn('Webhook signature verification skipped (no secret configured)');
      event = JSON.parse(body) as Stripe.Event;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return NextResponse.json({ error: `Webhook Error: ${message}` }, { status: 400 });
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

          // Update profile with new plan
          await supabase
            .from('profiles')
            .update({
              plan_id: planId,
              credits_balance: credits,
              stripe_subscription_id: subscriptionId || null,
              credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .eq('id', userId);

          // Log transaction
          const { data: profile } = await supabase
            .from('profiles')
            .select('credits_balance')
            .eq('id', userId)
            .single();

          await supabase.from('credit_transactions').insert({
            user_id: userId,
            amount: credits,
            type: 'subscription',
            description: `Subscription: ${planId} plan — ${credits} credits`,
            balance_after: profile?.credits_balance || credits,
          });
        }

        if (session.mode === 'payment') {
          const creditsToAdd = parseInt(session.metadata?.credits || '0', 10);
          const topupId = session.metadata?.topupId || 'unknown';

          if (creditsToAdd > 0) {
            // Get current balance
            const { data: profile } = await supabase
              .from('profiles')
              .select('credits_balance')
              .eq('id', userId)
              .single();

            const newBalance = (profile?.credits_balance || 0) + creditsToAdd;

            // Add credits
            await supabase
              .from('profiles')
              .update({ credits_balance: newBalance })
              .eq('id', userId);

            // Log transaction
            await supabase.from('credit_transactions').insert({
              user_id: userId,
              amount: creditsToAdd,
              type: 'topup',
              description: `Top-up: ${topupId} — ${creditsToAdd} credits`,
              stripe_payment_intent_id: typeof session.payment_intent === 'string'
                ? session.payment_intent : null,
              balance_after: newBalance,
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

        // Downgrade to free
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
          description: 'Subscription cancelled — downgraded to Free',
          balance_after: 25,
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === 'string'
          ? invoice.customer : invoice.customer?.id;

        if (customerId) {
          console.error(`Payment failed for customer ${customerId}`);
          // Future: send notification email
        }
        break;
      }

      default:
        // Unhandled event type
        break;
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
