import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getCreditsForPlan, PLANS } from '@/lib/stripe/plans';
import { sendPaymentFailedEmail } from '@/lib/email/send';
import { planSwitchBalance } from '@/lib/credits/plan-switch';
import { trackEventWithIds } from '@/lib/analytics/track';
import { gaIdsFromMetadata, metaIdsFromMetadata } from '@/lib/analytics/stripe-attribution';
import { sendMetaCapiEvent } from '@/lib/analytics/meta-capi';
import { EVENTS } from '@/lib/analytics/events';
import { REFERRAL_CREDITS } from '@/lib/credits/offer';
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

  /**
   * Which plan a completed SUBSCRIPTION checkout paid for — refused, never guessed.
   *
   * This read `session.metadata?.planId || 'starter'`. The only writer of that
   * metadata is create-checkout, which always sets it, so the fallback never ran
   * — until a payment link, a dashboard-created session or a mistyped metadata
   * key reached it, and then it booked the customer onto Starter with 200
   * credits whatever they had paid. The $2 plan made that concrete: a $2 payment
   * without metadata would have been granted a $12 month.
   *
   * So metadata is trusted only when it names a plan this product SELLS (in
   * PLANS, price > 0 — `free` is not something a checkout can buy). Otherwise the
   * plan is read off the subscription's price, the rule `subscription.updated`
   * already uses. If neither names one, throw: the route answers 500, the event
   * stays unprocessed and visible, and Stripe keeps retrying while a person
   * grants it by hand. A loud retry is recoverable; money taken for the wrong
   * plan is a refund conversation.
   */
  async function resolveCheckoutPlan(
    session: Stripe.Checkout.Session,
    subscriptionId: string | undefined
  ): Promise<string> {
    const named = session.metadata?.planId;
    if (named && Object.hasOwn(PLANS, named) && PLANS[named].price > 0) return named;

    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = sub.items.data[0]?.price?.id;
      const byPrice = priceId
        ? Object.values(PLANS).find((p) => p.price > 0 && p.priceId === priceId)
        : undefined;
      if (byPrice) {
        console.warn(`[webhook] checkout ${session.id}: metadata planId=${named ?? 'absent'} — plan resolved from price ${priceId} as ${byPrice.id}`);
        return byPrice.id;
      }
    }

    throw new Error(`subscription: checkout ${session.id} names no plan this product sells (metadata planId=${named ?? 'absent'}) — refusing to guess; grant it by hand`);
  }

  /**
   * Pay the referral reward, if this account was referred and has never paid.
   * Migration 048 moved the reward here from signup, where it made a shared link
   * worth more than the $2 plan.
   *
   * NOT wrapped in mustSucceed, deliberately. The customer's own purchase is
   * already granted when this runs, and a 500 would make Stripe re-run all of it
   * for the sake of a bonus. `reward_referral_on_payment()` pays at most once per
   * referral (row lock + `rewarded_at`), so calling it on every first delivery is
   * safe; a failure is logged as OWED — the tag the credit reconciler uses for a
   * debt a person must settle — and is paid by hand.
   */
  async function rewardReferral(userId: string): Promise<void> {
    try {
      const { data, error } = await supabase.rpc('reward_referral_on_payment', {
        p_referee_id: userId,
        p_credits: REFERRAL_CREDITS,
      });
      if (error) {
        // Migration 048 not applied yet: the function does not exist, and every
        // referral from before it was already paid at signup by 026 — so nothing
        // is owed. Tagging these OWED would send an operator to pay a pair twice.
        if (error.code === 'PGRST202' || error.code === '42883') {
          console.warn(`[referral] reward system not installed yet (migration 048) — nothing owed for ${userId}`);
          return;
        }
        console.error(`[referral][OWED] reward for referee ${userId} not paid: ${error.message}`);
        return;
      }
      const result = data as { rewarded?: boolean } | null;
      if (result?.rewarded) {
        console.info(`[webhook] referral reward paid: referee ${userId}, ${REFERRAL_CREDITS} credits to each side`);
      }
    } catch (e) {
      console.error(`[referral][OWED] reward for referee ${userId} threw:`, e);
    }
  }

  /**
   * Take a paid referral reward back from both sides when the referee's payment
   * is disputed. Without this, "pay $2, collect 25 + 25, charge back" minted
   * credits for nothing. Never fatal, for the reason rewardReferral gives; a
   * failure is logged for a person to settle by hand.
   */
  async function revokeReferral(refereeId: string): Promise<void> {
    try {
      const { data, error } = await supabase.rpc('revoke_referral_reward', { p_referee_id: refereeId });
      if (error) {
        if (error.code === 'PGRST202' || error.code === '42883') return; // 048 not applied: nothing was paid on payment yet
        console.error(`[referral][CLAWBACK] could not reverse the reward for referee ${refereeId}: ${error.message}`);
        return;
      }
      if ((data as { revoked?: boolean } | null)?.revoked) {
        console.warn(`[webhook] referral reward reversed for referee ${refereeId} after a dispute`);
      }
    } catch (e) {
      console.error(`[referral][CLAWBACK] could not reverse the reward for referee ${refereeId}:`, e);
    }
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

        // ── REVENUE REPORTING ────────────────────────────────────────────
        // Decided per branch below, sent once at the end of the case, and only
        // after the credits it paid for have actually been granted. Reporting
        // before the grant would mean a run that throws on the grant still books
        // the revenue, and GA4 has no retraction.
        let purchase: { itemId: string; itemName: string } | null = null;

        if (session.mode === 'subscription') {
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
          // Refused, not guessed — see resolveCheckoutPlan() above.
          const planId = await resolveCheckoutPlan(session, subscriptionId);
          const credits = getCreditsForPlan(planId);

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

          purchase = { itemId: `plan_${planId}`, itemName: `${planId} subscription` };
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
            } else {
              // Only a first delivery is revenue. `already_granted` is migration
              // 031's replay verdict, and the guard at the top of this route
              // deliberately re-runs an event whose row exists but is unfinished,
              // so this branch is reached on real retries — not a hypothetical.
              purchase = { itemId: `topup_${topupId}`, itemName: `${topupId} top-up` };
            }
          }
        }

        if (purchase) {
          const currency = (session.currency || 'usd').toUpperCase();
          // Stripe reports minor units (fils, cents). GA4 wants a major-unit
          // decimal; sending 5999 for a $59.99 sale overstates revenue 100x and
          // the mistake is invisible until someone compares GA4 to Stripe.
          const value = (session.amount_total ?? 0) / 100;

          await trackEventWithIds(
            userId,
            EVENTS.PURCHASE,
            {
              // GA4 deduplicates `purchase` on transaction_id. The checkout
              // session id is stable across Stripe's at-least-once delivery, so a
              // retry that reaches here twice is collapsed rather than counted
              // twice — the one safeguard this path cannot provide for itself.
              transaction_id: session.id,
              value,
              currency,
              plan: session.metadata?.planId ?? null,
              mode: session.mode ?? null,
              items: [{
                item_id: purchase.itemId,
                item_name: purchase.itemName,
                price: value,
                quantity: 1,
              }],
            },
            // No _ga cookie exists on a Stripe request. These were captured in the
            // checkout route — see lib/analytics/stripe-attribution.ts.
            gaIdsFromMetadata(session.metadata)
          );

          // Meta's copy of the same sale, inside the same guard — so a replay
          // that the `already_granted` branch absorbed reports to neither sink.
          // event_id is the session id: Meta dedups on (event_name, event_id)
          // for 48h, which covers both Stripe's at-least-once delivery and the
          // idempotency guard's deliberate re-run of an unfinished event.
          // Awaited like the GA send: this request is Stripe's, not a
          // customer's, and delivery matters more than latency here.
          await sendMetaCapiEvent({
            eventName: 'Purchase',
            eventId: session.id,
            // The email Stripe verified at payment — present on every
            // completed checkout, and worth more to matching than fbp alone.
            email: session.customer_details?.email,
            userId,
            ...metaIdsFromMetadata(session.metadata),
            customData: {
              currency,
              value,
              content_name: purchase.itemId,
            },
          });

          // Inside the same guard: a replay the grant absorbed pays nothing here
          // either, and the RPC pays at most once per referral. SUBSCRIPTIONS
          // only — the referral page, the share message and the ledger line all
          // promise the reward "when your friend subscribes", and a top-up is not
          // that. Paying on one would make every surface that says so wrong.
          if (session.mode === 'subscription') await rewardReferral(userId);
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
        //
        // And read that price from STRIPE, not from this event's own payload.
        // Webhook delivery is at-least-once and UNORDERED, and the billing portal
        // makes two switches in one visit an ordinary thing to do: entry -> pro,
        // then pro -> agency, thirty seconds apart. Delivered out of order, the
        // agency event lands first and the pro event then reads its own stale price
        // and writes plan_id='pro' over it — so Stripe bills agency forever while
        // the app grants pro, and NOTHING corrects it, because the renewal branch
        // below reads plan_id from the profile too. Re-reading collapses both events
        // onto the subscription's current price: whichever runs first does the
        // switch, the other finds previousPlan === planId and stops.
        //
        // A failed retrieve is deliberately not caught: the route answers 500, the
        // event stays unprocessed, and Stripe redelivers. Falling back to the event
        // payload would restore the defect silently, which is the shape this repo
        // keeps recording.
        const currentSubscription = await stripe.subscriptions.retrieve(subscription.id);
        const priceId = currentSubscription.items?.data?.[0]?.price?.id;
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
            .select('plan_id, credits_balance, purchased_credits, credits_reset_date')
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

          // ═══ What a plan switch is allowed to do to the balance ═══
          //
          // This used to ASSIGN the new plan's whole month (`credits_balance =
          // getCreditsForPlan(planId)`), guarded only by the no-op check above. But
          // Stripe merely PRORATES a mid-period switch: a down-then-up cycle in the
          // billing portal costs the customer close to nothing in money — the
          // downgrade issues customer credit, the upgrade spends it again — while
          // every upward switch re-issued a full month of credits. Repeatable for as
          // long as the portal is open. The same absolute write also DESTROYED the
          // unused balance of a month the customer had already paid for whenever
          // they switched down.
          //
          // The rule has to be stated on WHAT THE PERIOD HAS BEEN PAID FOR, and on
          // nothing else. Two earlier attempts stated it on quantities the customer
          // controls, and both were still taps:
          //
          //   - stating it on the event (has this exact switch granted before?)
          //     fails because every switch in the cycle is a genuine, distinct tier
          //     change and looks identical to honest churn;
          //   - stating it on the resulting BALANCE fails because balance is a
          //     number the customer moves at will. Cap the balance at the new
          //     allowance and a lap that ends at zero simply re-earns the whole
          //     difference: spend 600, drop to starter, return to pro, collect 400,
          //     repeat for as long as the portal is open.
          //
          // Credits already granted this period is the one quantity spending cannot
          // move, so that is what the ceiling is measured against.
          //
          //   1. an upgrade may add at most the DIFFERENCE between the allowances,
          //      and never more than the period has left before it has issued one
          //      full allowance of the tier being moved to;
          //   2. the balance is clamped to the new tier's allowance in BOTH
          //      directions. Clamping DOWN matters as much as clamping up: Stripe
          //      prorates a mid-period downgrade, so it hands the customer back the
          //      money for the part of the month they are giving up. Leaving the
          //      higher tier's credits in place as well would pay them twice —
          //      buy Agency, downgrade a minute later, keep the whole allowance.
          //
          // purchased_credits is a separate pool (031) and is never touched here, so
          // a top-up the customer actually bought survives every switch.
          const previousAllowance = getCreditsForPlan(previousPlan);
          const newAllowance = getCreditsForPlan(planId);
          const balance = prevProfile.credits_balance || 0;

          // When the current period began, and how much of it is left.
          //
          // Every path that PAYS for a month — checkout.session.completed above and
          // the subscription_cycle branch of invoice.payment_succeeded below — sets
          // credits_reset_date to 30 days out. The DATABASE cron
          // (reset_monthly_credits, migration 048) sets `NOW() + INTERVAL '1 month'`,
          // which is 28-31 days. So the LEDGER LOOKBACK uses the wider 31 while the
          // period WIDTH stays 30: counting a grant that belonged to the previous
          // period costs an honest upgrader credits the next renewal restores;
          // missing one mints them against a live Stripe account.
          const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
          const LEDGER_LOOKBACK_MS = 31 * 24 * 60 * 60 * 1000;
          const resetAt = prevProfile.credits_reset_date
            ? new Date(prevProfile.credits_reset_date).getTime()
            : null;

          // `credits_reset_date` is NULLABLE (001:12). The previous version invented
          // `Date.now() + PERIOD_MS` for a missing one, which made periodStart equal
          // to NOW — so the ledger window was EMPTY, alreadyGranted read 0, and the
          // ceiling opened to a whole allowance. Its own comment claimed that
          // fallback erred toward counting MORE grants; it erred the other way, and
          // it was the one arm no test covered. An unknown period is not a full one.
          let alreadyGranted: number;
          let periodRemaining: number;

          if (resetAt === null) {
            console.error(`[webhook] subscription.updated: ${userId} has no credits_reset_date — granting nothing on this switch; the next renewal restores the tier allowance`);
            alreadyGranted = newAllowance;
            periodRemaining = 0;
          } else {
            const periodStart = new Date(resetAt - LEDGER_LOOKBACK_MS).toISOString();

            // How much plan allowance this period has already handed out — from
            // EVERY writer, not only this webhook. The paid grants write
            // type='subscription'; the monthly cron writes type='reset' with a
            // POSITIVE amount, and a read filtered to 'subscription' alone saw 0 for
            // any period the cron paid for, opening the ceiling to a second full
            // allowance. Negative rows are floored at 0 rather than subtracted: a
            // clamp-down also writes 'reset', and letting it reduce this mark is
            // exactly how the lap gets its second chance back.
            const { data: priorGrants, error: grantsError } = await supabase
              .from('credit_transactions')
              .select('amount')
              .eq('user_id', userId)
              .in('type', ['subscription', 'reset'])
              .gte('created_at', periodStart);

            // Fail CLOSED. Getting this read wrong in the generous direction mints
            // credits against a live Stripe account; getting it wrong in the mean
            // direction costs an honest upgrader credits that the next renewal
            // restores anyway. Only one of those is recoverable.
            if (grantsError) {
              console.error(`[webhook] subscription.updated: could not read prior grants for ${userId} — granting nothing on this switch: ${grantsError.message}`);
            }
            alreadyGranted = grantsError
              ? newAllowance
              : (priorGrants ?? []).reduce((sum, row) => sum + Math.max(0, row.amount || 0), 0);

            // Stripe prorates the MONEY by time remaining, so the credits are
            // prorated the same way — see lib/credits/plan-switch.ts. Without this,
            // an upgrade in the last hour of the month costs a few cents and
            // delivered the whole tier difference, every month, forever.
            periodRemaining = (resetAt - Date.now()) / PERIOD_MS;
          }

          // The arithmetic lives in lib/credits/plan-switch.ts so it can be proved
          // against the attack SEQUENCES rather than argued about here — see
          // scripts/tests/plan-switch.test.ts. `granted` is negative on a clamp-down,
          // and the ledger row below records it as such.
          const { newBalance, granted } = planSwitchBalance({
            balance,
            previousAllowance,
            newAllowance,
            alreadyGrantedThisPeriod: alreadyGranted,
            periodRemaining,
          });

          const isUpgrade = (PLANS[planId]?.price || 0) > (PLANS[previousPlan]?.price || 0);

          // plan_id and credits_balance move in ONE write, and that is also what
          // makes an additive grant replay-safe here. Stripe delivers at least once
          // and this route deliberately re-runs an event whose row exists but is not
          // yet marked processed; a redelivery re-reads the profile, finds
          // `previousPlan === planId` and stops above. Splitting the two columns
          // across two writes would lose that property.
          // `payment_failed` is deliberately NOT cleared here. It means "a charge
          // failed and has not been recovered", and only a payment recovers it —
          // invoice.payment_succeeded below, a fresh checkout, or downgradeToFree.
          // Clearing it on a plan change let a delinquent customer switch tier in the
          // portal and silently turn the cron guard (migration 032) back on for
          // themselves; and once proration is invoiced immediately, the
          // invoice.payment_failed for a switch that could NOT collect may be
          // delivered before this event, so this write would have erased the very
          // flag that switch had just raised.
          await mustSucceed(supabase
            .from('profiles')
            .update({ plan_id: planId, credits_balance: newBalance })
            .eq('id', userId), 'subscription.updated: update profile');

          await mustSucceed(supabase.from('credit_transactions').insert({
            user_id: userId,
            amount: granted,
            // A plan change that grants nothing is bookkeeping, not a credit
            // purchase — same shape downgradeToFree() writes, so the two read alike
            // in the customer's history.
            type: granted > 0 ? 'subscription' : 'reset',
            description: granted > 0
              ? `Plan changed ${previousPlan} -> ${planId} — ${granted} credits added (difference between allowances)`
              : `Plan changed ${previousPlan} -> ${planId} — balance ${granted === 0 ? `kept at ${newBalance}` : `adjusted by ${granted} to ${newBalance} (new tier allowance)`}`,
            // Purchased credits are a separate pool and a plan change does not touch
            // them, but the balance the customer is looking at includes them — the
            // ledger has to agree with that widget. The old row wrote the plan
            // allowance alone and disagreed for anyone who had ever bought a top-up.
            balance_after: newBalance + (prevProfile.purchased_credits || 0),
          }), 'subscription.updated: ledger entry');

          // Track plan change for analytics
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
        await revokeReferral(disputedProfile.id);
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

        // A renewal that lands on an account already downgraded to free (retries
        // exhausted, then an old invoice paid) would record "free plan — 0 credits"
        // and grant nothing for money taken. Grant nothing, and say so loudly.
        if (renewalProfile.plan_id === 'free') {
          console.error(`[credits][OWED] renewal payment ${invoice.id} (${(invoice.amount_paid ?? 0) / 100} ${invoice.currency}) landed on ${renewalProfile.id}, which is on the free plan — nothing granted; resolve by hand`);
          break;
        }

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
          .select('id, plan_id, email, payment_failed, locale')
          .eq('stripe_customer_id', customerId)
          .single();
        if (!failedProfile) break;

        // Stripe's smart retries fire this event once per attempt — four or more
        // times over ~3 weeks. Read the flag BEFORE writing it so the email goes out
        // on the transition only. Four identical "your payment failed" emails is how
        // a recoverable card problem turns into an unsubscribe.
        const alreadyFlagged = failedProfile.payment_failed === true;

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

        // NOT wrapped in mustSucceed, and deliberately so. `sendPaymentFailedEmail`
        // never throws; if the provider is down it returns a failure we log. Letting
        // an email outage return 500 here would make Stripe retry the event, and the
        // retry would re-run everything above it. A notification must not be able to
        // destabilise the money path.
        if (!alreadyFlagged && failedProfile.email) {
          const mail = await sendPaymentFailedEmail({
            email: failedProfile.email,
            planId: failedProfile.plan_id,
            locale: failedProfile.locale,
          });
          if (mail.status !== 'sent') {
            console.error(`[webhook] dunning email not delivered (${mail.status}) for ${failedProfile.id} — the in-app banner is the only remaining signal`);
          }
        }
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
