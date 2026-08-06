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
    } else if (process.env.NODE_ENV !== 'production') {
      // Unsigned events are accepted ONLY outside a production build, so that event
      // replay against a dev server does not need a Stripe CLI tunnel.
      //
      // The second half of this condition used to be
      // `process.env.NEXT_PUBLIC_APP_URL?.includes('localhost')`. That made the
      // bypass reachable from a PUBLIC, operator-set string: anyone who deployed
      // with a copied-over localhost URL would disable signature verification on a
      // live endpoint, and this route grants credits. A forged
      // `checkout.session.completed` would then be worth unlimited credits to
      // anybody who could find the URL.
      //
      // NODE_ENV is set by Next itself — `next dev` is development, `next build`
      // and `next start` are production — so it cannot be spoofed by a misconfigured
      // environment variable.
      console.warn('Webhook signature verification skipped — non-production build');
      event = JSON.parse(body) as Stripe.Event;
    } else {
      console.error('STRIPE_WEBHOOK_SECRET not configured in production — refusing to process an unsigned webhook');
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

  /**
   * Return an account to the free plan, and say why in the ledger.
   *
   * Extracted because `customer.subscription.deleted` used to be the ONLY exit from
   * a paid plan, and Stripe does not guarantee it. When smart retries are exhausted,
   * the action is a dashboard setting: cancel the subscription, mark it unpaid, or
   * leave it past_due. Only the first emits `deleted`. Under either of the others
   * the subscription object lives on, `deleted` never arrives, and `plan_id` stays
   * on the paid tier forever — the customer keeps 4K output and the create-checkout
   * guard still 409s them as an existing subscriber.
   *
   * Three callers now share this: `deleted`, a terminal status on `updated`, and a
   * dispute. Sharing one implementation is the point — three copies would drift.
   */
  async function downgradeToFree(
    userId: string,
    reason: string,
    subscriptionId: string | null
  ): Promise<void> {
    const { data: profile } = await supabase
      .from('profiles')
      .select('purchased_credits, plan_id')
      .eq('id', userId)
      .single();

    const previousPlan = profile?.plan_id || 'unknown';
    const freeCredits = getCreditsForPlan('free');

    // Already free: still clear any stale subscription id (so a later upgrade is
    // not blocked by the 409 in create-checkout), but write no ledger or analytics
    // row — nothing changed, and a duplicate `deleted` delivery would otherwise
    // stack identical "downgraded" rows in the customer's history.
    if (previousPlan === 'free') {
      await mustSucceed(supabase
        .from('profiles')
        .update({ stripe_subscription_id: null })
        .eq('id', userId), `${reason}: clear subscription id`);
      console.info(`[webhook] ${reason}: ${userId} is already on free — no downgrade needed`);
      return;
    }

    await mustSucceed(supabase
      .from('profiles')
      .update({
        plan_id: 'free',
        // Was a hardcoded 25. Read from the plan config so this cannot silently
        // diverge from what the free tier actually grants.
        credits_balance: freeCredits,
        stripe_subscription_id: null,
        payment_failed: false,
      })
      .eq('id', userId), `${reason}: downgrade profile`);

    await mustSucceed(supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: 0,
      type: 'reset',
      description: `Downgraded to Free — ${reason} (purchased: ${profile?.purchased_credits || 0} kept)`,
      balance_after: freeCredits + (profile?.purchased_credits || 0),
    }), `${reason}: ledger entry`);

    await supabase.from('subscription_events').insert({
      user_id: userId,
      event_type: 'cancel',
      from_plan: previousPlan,
      to_plan: 'free',
      stripe_subscription_id: subscriptionId,
    }); // non-critical, ignore errors

    console.warn(`[webhook] downgraded ${userId}: ${previousPlan} -> free (${reason})`);
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

          // `.select()` returns the updated row, so the ledger's balance_after can
          // include purchased credits without a second round trip. Writing plain
          // `credits` here (as this did) understates the balance for anyone who has
          // ever bought a top-up, and the ledger then disagrees with the balance
          // widget the customer is looking at.
          const { data: subProfile } = await mustSucceed(supabase
            .from('profiles')
            .update({
              plan_id: planId,
              credits_balance: credits,
              stripe_subscription_id: subscriptionId || null,
              credits_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              payment_failed: false,
            })
            .eq('id', userId)
            .select('purchased_credits')
            .single(), 'subscription: update profile');

          await mustSucceed(supabase.from('credit_transactions').insert({
            user_id: userId,
            amount: credits,
            type: 'subscription',
            description: `Subscription: ${planId} plan — ${credits} credits`,
            balance_after: credits + (subProfile?.purchased_credits || 0),
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
            // One RPC, one transaction, one row lock — see migration 031.
            //
            // This used to be a read-modify-write in Node: read purchased_credits,
            // add in JS, write the sum back. Every other grant in this file assigns
            // absolutely (`credits_balance = <plan amount>`) and so is replay-safe,
            // but a sum written back is not. Stripe delivers at least once, and the
            // guard at the top of this route deliberately re-runs an event whose row
            // exists but is not yet marked processed — so one $59.99 purchase
            // delivered twice granted 2000 credits.
            //
            // The RPC is keyed on the payment intent, so a replay is recognised as
            // the same money and returns `already_granted` without writing.
            const { data: grant } = await mustSucceed(
              supabase.rpc('grant_purchased_credits', {
                p_user_id: userId,
                p_credits: creditsToAdd,
                p_description: `Top-up: ${topupId} — ${creditsToAdd} credits (expires in 12 months)`,
                p_payment_intent_id: typeof session.payment_intent === 'string'
                  ? session.payment_intent : null,
              }),
              'top-up: grant purchased credits'
            );

            // The RPC reports its own domain failures in the payload rather than as
            // a Postgres error, so `mustSucceed` alone would let `user_not_found`
            // through as a success and the customer would pay and receive nothing.
            const result = grant as { success?: boolean; error?: string; already_granted?: boolean } | null;
            if (!result?.success) {
              throw new Error(`top-up: grant rejected: ${result?.error ?? 'unknown'}`);
            }
            if (result.already_granted) {
              console.info(`[webhook] top-up for session ${session.id} was already granted — replay ignored`);
            }
          }
        }
        break;
      }

      // ═══ SUBSCRIPTION UPDATED (plan change) ═══
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) {
          console.warn(`[webhook] subscription ${subscription.id} updated with no userId in metadata — no account can be matched to it`);
          break;
        }

        // A subscription that has stopped paying must lose its plan. Stripe only
        // emits `customer.subscription.deleted` when the dashboard's retry-exhaustion
        // action is "cancel"; under "mark unpaid" or "leave past_due" the object just
        // changes status and `deleted` never comes. Handling status here means the
        // downgrade does not depend on a dashboard setting.
        //
        //  unpaid   — retries exhausted, Stripe gave up collecting
        //  canceled — ended without a `deleted` delivery reaching us
        //  paused   — a trial ended with no payment method on file
        //
        // `past_due` is deliberately absent: that is a soft decline inside the retry
        // window, the customer is likely to recover, and migration 032 already stops
        // any NEW month of credits from being issued while payment_failed is set.
        // `incomplete_expired` is absent because it emits `deleted` on its own.
        const TERMINAL_STATUSES = ['unpaid', 'canceled', 'paused'];
        if (TERMINAL_STATUSES.includes(subscription.status)) {
          await downgradeToFree(userId, `subscription ${subscription.status}`, subscription.id);
          break;
        }

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
        if (!userId) {
          console.warn(`[webhook] subscription ${subscription.id} deleted with no userId in metadata — cannot downgrade anyone. A subscription created in the Stripe Dashboard rather than through checkout will look like this.`);
          break;
        }

        await downgradeToFree(userId, 'subscription cancelled', subscription.id);
        break;
      }

      // ═══ DISPUTE — the money is gone, and no other event will tell us ═══
      //
      // A chargeback is not a soft decline: Stripe pulls the payment back and adds a
      // fee. None of the events handled above fire — the invoice is still `paid` on
      // Stripe's side, so `invoice.payment_failed` never arrives, and the
      // subscription keeps cycling. Without this case the account keeps its paid
      // tier indefinitely while the money has already been returned.
      //
      // Requires `charge.dispute.created` to be enabled on the webhook endpoint in
      // the Stripe Dashboard; the handler cannot fire if the endpoint is not
      // subscribed to the event.
      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        const charge = dispute.charge;
        const chargeId = typeof charge === 'string' ? charge : charge?.id;

        // A Dispute carries no customer field. Resolve through the charge.
        let customerId: string | null = null;
        if (chargeId) {
          const fullCharge = await stripe.charges.retrieve(chargeId);
          customerId = typeof fullCharge.customer === 'string'
            ? fullCharge.customer : fullCharge.customer?.id ?? null;
        }

        if (!customerId) {
          console.error(`[webhook] dispute ${dispute.id} could not be traced to a customer — handle by hand`);
          break;
        }

        const { data: disputedProfile } = await supabase
          .from('profiles')
          .select('id, plan_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!disputedProfile) {
          console.error(`[webhook] dispute ${dispute.id}: no profile for stripe customer ${customerId}`);
          break;
        }

        console.error(`[webhook] DISPUTE ${dispute.id}: ${dispute.amount / 100} ${dispute.currency} on ${disputedProfile.plan_id} — reason "${dispute.reason}"`);
        await downgradeToFree(disputedProfile.id, `payment disputed (${dispute.reason})`, null);
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

        // `mustSucceed`, unlike before. This flag is now load-bearing: migration 032
        // reads it to stop the monthly cron refilling a delinquent account, and the
        // dashboard banner reads it to tell the customer at all. A swallowed failure
        // here used to still mark the event processed, so the flag could silently
        // never be set and nothing would ever notice.
        await mustSucceed(supabase.from('profiles')
          .update({ payment_failed: true })
          .eq('id', failedProfile.id), 'payment failed: set flag');

        // The synthetic ledger row that used to be written here is gone. It recorded
        // `amount: 0, type: 'reset', balance_after: 0` without ever reading the
        // profile — so TransactionTable rendered it as a red "Monthly reset — 0" row,
        // once per Stripe retry attempt, directly above a widget showing the
        // customer's real balance. A failed payment is not a credit transaction; the
        // flag above carries the signal.
        console.warn(`[webhook] payment failed for ${failedProfile.id} on ${failedProfile.plan_id} — flagged`);
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

  // Mark as processed AFTER business logic succeeds.
  //
  // This write is checked for the same reason every other one in this route is: it
  // is the idempotency marker. Swallowed, the route still returns 200 while
  // `processed` stays false forever — and the next at-least-once delivery of the
  // same event sails past the duplicate guard and runs the handler a second time.
  // For a top-up that is now caught by the payment-intent key in migration 031, but
  // returning 500 so Stripe retries is the correct outcome either way.
  try {
    await mustSucceed(supabase.from('webhook_events')
      .update({ processed: true })
      .eq('event_id', event.id), 'mark event processed');
  } catch (error) {
    console.error('Webhook processed-marker error:', error);
    return NextResponse.json({ error: 'Failed to record event as processed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
