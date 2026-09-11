import { PLANS } from '@/lib/stripe/plans';
import { campaignCostBands } from '@/lib/credits/campaign-cost';

/**
 * What a stranger is offered — stated ONCE, because five surfaces quote it.
 *
 * Since 2026-09-11 the account is free and holds NO monthly credits
 * (`PLANS.free.credits` is 0). The 25-credit month that used to be free is the
 * Entry plan, `PLANS.entry`, at $2. What a new account gets instead of a free
 * month is a TRIAL: `TRIAL_CREDITS`, granted by `grant_onboarding_bonus()` (027)
 * into `purchased_credits` when onboarding is finished or skipped — so the
 * monthly reset never takes it back.
 *
 * The trial is sized against the one thing the product most needs a stranger
 * to see before it asks for money: one complete nine-post Arabic campaign
 * (`campaignCostBands().text`). `scripts/tests/segment-pages.test.ts` fails the
 * build if a price change ever makes the trial smaller than that, because every
 * surface below says "try a full campaign free" in words, not in numbers.
 *
 * The hero, the FAQ (HTML and JSON-LD), the stats band, the studio pages, the
 * segment page, the dashboard banner and the $2 button all read this — so the
 * arithmetic in the copy cannot drift from the arithmetic in the reservation.
 */
export const TRIAL_CREDITS = 5;

/**
 * Credits BOTH sides receive when a referred account makes its FIRST payment.
 *
 * Until migration 048 this was paid at signup, and after the free month ended
 * that became the cheapest way into the product: sign up through anyone's shared
 * link and receive 25 credits — the whole Entry plan — for nothing, repeatable
 * with throwaway addresses up to the referrer's lifetime cap. Now
 * `claim_referral()` only records who referred whom, and the Stripe webhook pays
 * both sides through `reward_referral_on_payment()` once the friend has paid.
 */
export const REFERRAL_CREDITS = 25;

export interface EntryOffer {
  /** `PLANS.entry.price`, dollars per month. */
  price: number;
  /** `PLANS.entry.credits`, per month. */
  credits: number;
  /** Complete text campaigns one Entry month pays for. */
  campaigns: number;
  /** Posts in a campaign. */
  posts: number;
  /** Trial credits a new account receives. */
  trial: number;
  /** Complete text campaigns the trial pays for. */
  trialCampaigns: number;
}

export function entryOffer(): EntryOffer {
  const bands = campaignCostBands();
  return {
    price: PLANS.entry.price,
    credits: PLANS.entry.credits,
    // Integer division, deliberately: the sentence promises what a customer can
    // actually FINISH, so a partial campaign is never counted.
    campaigns: Math.floor(PLANS.entry.credits / bands.text),
    posts: bands.posts,
    trial: TRIAL_CREDITS,
    trialCampaigns: Math.floor(TRIAL_CREDITS / bands.text),
  };
}
