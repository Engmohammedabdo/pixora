import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCreditsForPlan, PLANS } from '@/lib/stripe/plans';
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

  /**
   * Run a database write that MUST succeed, and throw if it does not.
   *
   * supabase-js does not throw on a database error — it resolves with
   * `{ data, error }`. So every `await supabase...` below used to continue happily
   * after a failed write, fall through to the `processed: true` marker at the end,
   * and return 200. Stripe then treats the event as delivered and never retries,
   * while the customer has paid and received nothing.
   *
   * Throwing here routes the failure into the catch block, which returns 500 and
   * leaves `processed` false — so Stripe retries and the event can also be
   * replayed by hand.
   */
  async function mustSucceed<T extends { error: unknown }>(op: PromiseLike<T>, what: string): Promise<T> {
    const result = await op;
    if (result.error) {
      const message = (result.error as { message?: string })?.message ?? String(result.error);
      throw new Error(`${what}: ${message}`);
    }
    return result;
  }

  // ═══ DB-BASED IDEMPOTENCY (atomic) ═══
  // Check if already processed successfully
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('event_id, processed')
    .eq('event_id', event.id)
    .single();

  if (existing?.processed) {
    return NextResponse.json({ received: true, skipped: 'duplicate' });
  }

  // Insert as "in progress" (processed=false) — if already exists but not processed, allow retry
  if (!existing) {
    await supabase.from('webhook_events').insert({
      event_id: event.id,
      event_type: event.type,
      processed: false,
    });
  }

  try {
    switch (event.type) {
      // ═══ CHECKOUT COMPLETED (new subscription or top-up) ═══
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId) break;

        // A session can complete while the payment is still pending (delayed
        // methods, bank debits). Granting credits before the money settles gives
        // away product for a payment that may never arrive.
        if (session.payment_status !== 'paid') {
          console.warn(`[webhook] session ${session.id} completed with payment_status=${session.payment_status} — no credits granted`);
          break;
        }

        if (session.mode === 'subscription') {
          const planId = session.metadata?.planId || 'starter';
          const credits = getCreditsForPlan(planId);
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;

          await mustSucceed(supabase
            .from('profiles')
            .update({
              plan_id: planId,
              credits_balance: credits,
              stripe_subscription_id: subscriptionId || null,
              credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              payment_failed: false,
            })
            .eq('id', userId), 'subscription: update profile');

          await mustSucceed(supabase.from('credit_transactions').insert({
            user_id: userId,
            amount: credits,
            type: 'subscription',
            description: `Subscription: ${planId} plan — ${credits} credits`,
            balance_after: credits,
          }), 'subscription: ledger entry');

          // Track subscription event for analytics
          await supabase.from('subscription_events').insert({
            user_id: userId,
            event_type: 'subscribe',
            to_plan: planId,
            stripe_subscription_id: subscriptionId || null,
          }); // non-critical, ignore errors
        }

        if (session.mode === 'payment') {
          const creditsToAdd = parseInt(session.metadata?.credits || '0', 10);
          const topupId = session.metadata?.topupId || 'unknown';

          if (creditsToAdd > 0) {
            const { data: profile, error: readError } = await supabase
              .from('profiles')
              .select('credits_balance, purchased_credits')
              .eq('id', userId)
              .single();

            // Reading the current balance MUST succeed: the two writes below are
            // computed from it, so a failed read would silently zero the customer's
            // existing credits instead of adding to them.
            if (readError || !profile) {
              throw new Error(`top-up: read profile: ${readError?.message ?? 'not found'}`);
            }

            const currentPurchased = profile.purchased_credits || 0;
            const newPurchased = currentPurchased + creditsToAdd;
            const currentBalance = profile.credits_balance || 0;
            const newTotalBalance = currentBalance + creditsToAdd;

            await mustSucceed(supabase
              .from('profiles')
              .update({
                purchased_credits: newPurchased,
                purchased_credits_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
              })
              .eq('id', userId), 'top-up: update profile');

            await mustSucceed(supabase.from('credit_transactions').insert({
              user_id: userId,
              amount: creditsToAdd,
              type: 'topup',
              description: `Top-up: ${topupId} — ${creditsToAdd} credits (expires in 12 months)`,
              stripe_payment_intent_id: typeof session.payment_intent === 'string'
                ? session.payment_intent : null,
              balance_after: newTotalBalance,
            }), 'top-up: ledger entry');
          }
        }
        break;
      }

      // ═══ SUBSCRIPTION UPDATED (plan change) ═══
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) break;

        // Read the plan from the PRICE, not from metadata. Stripe does not update
        // metadata when a subscription item changes, so a plan swap made in the
        // billing portal left the old planId here and granted the wrong tier.
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const planId = priceId
          ? Object.values(PLANS).find((p) => p.priceId === priceId)?.id
          : subscription.metadata?.planId;

        // Only act on a live subscription. `updated` also fires for payment-method
        // edits, trial changes and cancel-at-period-end — none of which should
        // hand out a month of credits.
        const isLive = subscription.status === 'active' || subscription.status === 'trialing';

        if (planId && isLive) {
          const { data: prevProfile, error: prevError } = await supabase
            .from('profiles')
            .select('plan_id')
            .eq('id', userId)
            .single();

          if (prevError || !prevProfile) {
            throw new Error(`subscription.updated: read profile: ${prevError?.message ?? 'not found'}`);
          }

          const previousPlan = prevProfile.plan_id || 'free';

          // The tier did not change, so there is nothing to grant. Without this the
          // handler topped the balance up to a full month on EVERY update event —
          // free credits on demand for anyone who opened the billing portal.
          if (previousPlan === planId) {
            console.info(`[webhook] subscription ${subscription.id} updated with no plan change (${planId}) — no credits granted`);
            break;
          }

          const credits = getCreditsForPlan(planId);
          await mustSucceed(supabase
            .from('profiles')
            .update({ plan_id: planId, credits_balance: credits, payment_failed: false })
            .eq('id', userId), 'subscription.updated: update profile');

          await mustSucceed(supabase.from('credit_transactions').insert({
            user_id: userId,
            amount: credits,
            type: 'subscription',
            description: `Plan updated to ${planId} — ${credits} credits`,
            balance_after: credits,
          }), 'subscription.updated: ledger entry');

          // Track plan change for analytics
          const isUpgrade = (PLANS[planId]?.price || 0) > (PLANS[previousPlan]?.price || 0);
          await supabase.from('subscription_events').insert({
            user_id: userId,
            event_type: isUpgrade ? 'upgrade' : 'downgrade',
            from_plan: previousPlan,
            to_plan: planId,
            stripe_subscription_id: subscription.id,
          }); // non-critical, ignore errors
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
          .select('purchased_credits, plan_id')
          .eq('id', userId)
          .single();

        const cancelledPlan = cancelProfile?.plan_id || 'unknown';

        await mustSucceed(supabase
          .from('profiles')
          .update({
            plan_id: 'free',
            credits_balance: 25,
            stripe_subscription_id: null,
            payment_failed: false,
          })
          .eq('id', userId), 'cancel: downgrade profile');

        await mustSucceed(supabase.from('credit_transactions').insert({
          user_id: userId,
          amount: 0,
          type: 'reset',
          description: `Subscription cancelled — downgraded to Free (purchased: ${cancelProfile?.purchased_credits || 0} kept)`,
          balance_after: 25 + (cancelProfile?.purchased_credits || 0),
        }), 'cancel: ledger entry');

        // Track cancellation for churn analytics
        await supabase.from('subscription_events').insert({
          user_id: userId,
          event_type: 'cancel',
          from_plan: cancelledPlan,
          to_plan: 'free',
          stripe_subscription_id: subscription.id,
        }); // non-critical, ignore errors
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

        await mustSucceed(supabase.from('profiles').update({
          credits_balance: renewalCredits,
          credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          payment_failed: false,
        }).eq('id', renewalProfile.id), 'renewal: reset credits');

        await mustSucceed(supabase.from('credit_transactions').insert({
          user_id: renewalProfile.id,
          amount: renewalCredits,
          type: 'subscription',
          description: `Monthly renewal: ${renewalProfile.plan_id} plan — ${renewalCredits} credits reset`,
          balance_after: renewalCredits + (renewalProfile.purchased_credits || 0),
        }), 'renewal: ledger entry');
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
    // Don't mark as processed — Stripe will retry
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  // Mark as processed AFTER business logic succeeds
  await supabase.from('webhook_events')
    .update({ processed: true })
    .eq('event_id', event.id);

  return NextResponse.json({ received: true });
}
