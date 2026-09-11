export interface PlanConfig {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  priceId?: string;
  credits: number;
  resolution: '1080p' | '2K' | '4K';
  watermark: boolean;
  maxBrandKits: number;
  /** Projects = isolated client workspaces. The main lever that makes higher tiers worth buying for agencies. */
  maxProjects: number;
  features: string[];
  featuresAr: string[];
}

export const PLANS: Record<string, PlanConfig> = {
  /**
   * The account itself — signed up, not paying. Holds NO monthly credits since
   * 2026-09-11; the 25-credit month it used to give away is `entry`, below, at $2.
   *
   * A new account is not empty-handed: it receives `TRIAL_CREDITS`
   * (lib/credits/offer.ts) on finishing or skipping onboarding, enough for one
   * complete campaign. That grant is a separate pool (`purchased_credits`), so
   * `credits: 0` here is exactly what the monthly reset and a downgrade write.
   *
   * The 0 is also stated in the DATABASE, where two of the three grants lived:
   * migration 048 sets `profiles.credits_balance DEFAULT 0` and removes the free
   * refill from `reset_monthly_credits()`. This constant alone changed neither.
   *
   * Not shown on either pricing grid (`price > 0` filters it out): a $0 card
   * holding 0 credits beside a $2 card holding 25 reads as a trick. /billing
   * describes it in the current-plan card instead.
   */
  free: {
    id: 'free',
    name: 'Free account',
    nameAr: 'حساب مجاني',
    price: 0,
    credits: 0,
    resolution: '1080p',
    watermark: true,
    maxBrandKits: 1,
    maxProjects: 1,
    features: ['No monthly credits', 'Free Prompt Assistant', '1080p, watermarked', '1 Brand Kit'],
    featuresAr: ['بدون رصيد شهري', 'مساعد البرومبت مجاناً', 'دقة 1080p مع علامة مائية', 'هوية بصرية واحدة'],
  },
  /**
   * The paid entry tier. $2/month for what `free` used to give away.
   *
   * Every gate here is field-for-field what `free` carries: 1080p, watermark,
   * one brand kit, one project. Only the price and the credits move — the point
   * of the change is that the 25 credits stop being free, not that the tier
   * becomes different.
   *
   * `free` kept its id and its gates and lost its credits (deploy B, migration
   * 048). It stays the "signed up, not paying" state: 62 places in this
   * codebase compare against the literal 'free' and in every one of them it
   * already means "not a paying customer". Renaming it would be a 62-site edit
   * to the gating layer of a live product for no benefit.
   *
   * Stripe: price_1UE2543HV9MX1JIk0qq7wwCj, product Pixora Entry, metadata
   * plan_id=entry. The CHECK constraint on profiles.plan_id was widened by
   * migration 047 BEFORE this row existed — a paid customer whose plan cannot be
   * written is money taken with nothing granted, and Stripe retries that forever.
   */
  entry: {
    id: 'entry',
    name: 'Entry',
    nameAr: 'البداية',
    price: 2,
    priceId: process.env.STRIPE_ENTRY_PRICE_ID || 'price_entry_placeholder',
    credits: 25,
    resolution: '1080p',
    watermark: true,
    maxBrandKits: 1,
    maxProjects: 1,
    features: ['25 credits/month', '1080p resolution', 'Watermark on images', '1 Brand Kit'],
    featuresAr: ['25 كريدت/شهر', 'دقة 1080p', 'علامة مائية على الصور', 'هوية بصرية واحدة'],
  },

  starter: {
    id: 'starter',
    name: 'Starter',
    nameAr: 'ستارتر',
    price: 12,
    priceId: process.env.STRIPE_STARTER_PRICE_ID || 'price_starter_placeholder',
    credits: 200,
    resolution: '2K',
    watermark: false,
    maxBrandKits: 3,
    maxProjects: 3,
    features: ['200 credits/month', '2K resolution (Creator & Photoshoot)', 'No watermark', '3 Brand Kits'],
    featuresAr: ['200 كريدت/شهر', 'دقة 2K (الاستوديو والجلسة التصويرية)', 'بدون علامة مائية', '3 هويات بصرية'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    nameAr: 'احترافي',
    price: 29,
    priceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro_placeholder',
    credits: 600,
    resolution: '4K',
    watermark: false,
    maxBrandKits: 10,
    maxProjects: 10,
    // 'Priority AI' removed: there is no priority queue or per-plan routing anywhere
    // in lib/ai/router.ts — every plan hits the same providers in the same order.
    features: ['600 credits/month', '4K resolution (Creator & Photoshoot)', 'No watermark', '10 Brand Kits'],
    featuresAr: ['600 كريدت/شهر', 'دقة 4K (الاستوديو والجلسة التصويرية)', 'بدون علامة مائية', '10 هويات بصرية'],
  },
  business: {
    id: 'business',
    name: 'Business',
    nameAr: 'أعمال',
    price: 59,
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID || 'price_business_placeholder',
    credits: 1500,
    resolution: '4K',
    watermark: false,
    maxBrandKits: 25,
    maxProjects: 30,
    // 'Team (5 users)' and 'White-label' removed: neither exists in any of the 52 API
    // routes. Advertising unbuilt features on the checkout screen invites chargebacks
    // and counts as misleading advertising under UAE consumer protection law.
    features: ['1,500 credits/month', '4K resolution (Creator & Photoshoot)', 'No watermark', '25 Brand Kits'],
    featuresAr: ['1,500 كريدت/شهر', 'دقة 4K (الاستوديو والجلسة التصويرية)', 'بدون علامة مائية', '25 هوية بصرية'],
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    nameAr: 'وكالة',
    price: 149,
    priceId: process.env.STRIPE_AGENCY_PRICE_ID || 'price_agency_placeholder',
    credits: 5000,
    resolution: '4K',
    watermark: false,
    maxBrandKits: 100,
    maxProjects: 100,
    // 'Team (20 users)', 'API Access' and 'White-label' removed — none are implemented.
    // 'Unlimited Brand Kits' corrected to the limit actually enforced in
    // app/api/brand-kits/route.ts, which rejects creation past 100.
    features: ['5,000 credits/month', '4K resolution (Creator & Photoshoot)', 'No watermark', '100 Brand Kits'],
    featuresAr: ['5,000 كريدت/شهر', 'دقة 4K (الاستوديو والجلسة التصويرية)', 'بدون علامة مائية', '100 هوية بصرية'],
  },
};

export interface TopupConfig {
  id: string;
  credits: number;
  price: number;
  priceId: string;
  perCredit: string;
}

export const TOPUPS: Record<string, TopupConfig> = {
  small: {
    id: 'small',
    credits: 50,
    price: 4.99,
    priceId: process.env.STRIPE_TOPUP_SMALL_PRICE_ID || 'price_topup_small_placeholder',
    perCredit: '$0.10',
  },
  medium: {
    id: 'medium',
    credits: 150,
    price: 12.99,
    priceId: process.env.STRIPE_TOPUP_MEDIUM_PRICE_ID || 'price_topup_medium_placeholder',
    perCredit: '$0.087',
  },
  large: {
    id: 'large',
    credits: 500,
    price: 34.99,
    priceId: process.env.STRIPE_TOPUP_LARGE_PRICE_ID || 'price_topup_large_placeholder',
    perCredit: '$0.07',
  },
  xl: {
    id: 'xl',
    credits: 1000,
    price: 59.99,
    priceId: process.env.STRIPE_TOPUP_XL_PRICE_ID || 'price_topup_xl_placeholder',
    perCredit: '$0.06',
  },
};

export function getPlan(planId: string): PlanConfig {
  // Object.hasOwn, not a bare index: `PLANS['constructor']` (and toString,
  // valueOf, hasOwnProperty, __proto__) resolve to TRUTHY prototype members, so
  // `|| PLANS.free` would be skipped and the caller would get an object whose
  // `.watermark` is undefined — i.e. no watermark, plus undefined resolution
  // and credit limits. Nothing writes those values into profiles.plan_id today
  // (022_privilege_lockdown.sql:40 revokes UPDATE on that column and :86
  // re-grants only profile fields), but the free-plan watermark gate should not
  // rest on that staying true.
  return Object.hasOwn(PLANS, planId) ? PLANS[planId] : PLANS.free;
}

export function getCreditsForPlan(planId: string): number {
  return getPlan(planId).credits;
}

export function getMaxResolution(planId: string): '1080p' | '2K' | '4K' {
  return getPlan(planId).resolution;
}

// Warn if placeholder price IDs are used in production
if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
  Object.entries(PLANS).forEach(([id, plan]) => {
    if (plan.priceId?.includes('placeholder')) {
      console.warn(`⚠️ Stripe price ID for "${id}" plan is a placeholder. Set STRIPE_${id.toUpperCase()}_PRICE_ID env var.`);
    }
  });
  Object.entries(TOPUPS).forEach(([id, topup]) => {
    if (topup.priceId?.includes('placeholder')) {
      console.warn(`⚠️ Stripe top-up price ID for "${id}" is a placeholder. Set STRIPE_TOPUP_${id.toUpperCase()}_PRICE_ID env var.`);
    }
  });
}
