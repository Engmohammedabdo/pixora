import { PLANS } from '@/lib/stripe/plans';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { campaignCostBands } from '@/lib/credits/campaign-cost';

/**
 * The values `landing.faq.a*` interpolates — stated ONCE, for the two readers
 * that must agree.
 *
 * The landing FAQ is rendered twice: as HTML by `components/landing/FaqSection.tsx`
 * (next-intl ICU) and as `FAQPage` JSON-LD by `lib/seo/schema.ts` (a hand-rolled
 * `replaceAll`). They are different substitution mechanisms over the same
 * strings, so a placeholder added for one and not the other does not error — it
 * SHIPS, as a literal `{name}`, to whichever reader was forgotten.
 *
 * That is not hypothetical. CLAUDE.md records the live `/ar` serving the literal
 * `{credits}` eleven times, because the schema builder read the raw message. The
 * fix at the time added `.replaceAll('{credits}', …)` — correct for that one
 * placeholder, and a shape that silently breaks on the next one.
 *
 * So both readers now spread this object, and `buildFaqSchema()` substitutes
 * every key in it and then asserts nothing `{like_this}` survived. Adding a
 * value here is the whole change; forgetting a reader is no longer possible.
 */
export function faqParams(): Record<string, string | number> {
  const campaign = campaignCostBands();
  return {
    /** The free plan's monthly allowance — the figure a2/a5 promise. */
    credits: PLANS.free.credits,
    /** One 1080p image, the cheapest generation the product sells. */
    image: CREDIT_COSTS.image['1080p'],
    /** Posts in a campaign (EXPECTED_POSTS), so the sentence cannot say "9"
     *  while the parser requires a different count. */
    posts: campaign.posts,
    /** The campaign's two REAL prices. The route reserves
     *  `input.generateImages ? full : text`; quoting only `full` overstates the
     *  cheaper path by 4x, and that path is one this page advertises. */
    campaignText: campaign.text,
    campaignFull: campaign.full,
  };
}
