export interface PlanConfig {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  priceId?: string;
  credits: number;
  resolution: '1080p' | '2K' | '4K';
  watermark: boolean;
  teams: boolean;
  maxMembers: number;
  maxBrandKits: number;
  /** Projects = isolated client workspaces. The main lever that makes higher tiers worth buying for agencies. */
  maxProjects: number;
  features: string[];
  featuresAr: string[];
}

export const PLANS: Record<string, PlanConfig> = {
  free: {
    id: 'free',
    name: 'Free',
    nameAr: 'مجاني',
    price: 0,
    credits: 25,
    resolution: '1080p',
    watermark: true,
    teams: false,
    maxMembers: 1,
    maxBrandKits: 1,
    maxProjects: 1,
    features: ['25 credits/month', '1080p resolution', 'Watermark on images', '1 Brand Kit'],
    featuresAr: ['25 كريدت/شهر', 'دقة 1080p', 'علامة مائية', 'هوية بصرية واحدة'],
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
    teams: false,
    maxMembers: 1,
    maxBrandKits: 3,
    maxProjects: 3,
    features: ['200 credits/month', '2K resolution', 'No watermark', '3 Brand Kits'],
    featuresAr: ['200 كريدت/شهر', 'دقة 2K', 'بدون علامة مائية', '3 هويات بصرية'],
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
    teams: false,
    maxMembers: 1,
    maxBrandKits: 10,
    maxProjects: 10,
    // 'Priority AI' removed: there is no priority queue or per-plan routing anywhere
    // in lib/ai/router.ts — every plan hits the same providers in the same order.
    features: ['600 credits/month', '4K resolution', 'No watermark', '10 Brand Kits'],
    featuresAr: ['600 كريدت/شهر', 'دقة 4K', 'بدون علامة مائية', '10 هويات بصرية'],
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
    teams: true,
    maxMembers: 5,
    maxBrandKits: 25,
    maxProjects: 30,
    // 'Team (5 users)' and 'White-label' removed: neither exists in any of the 52 API
    // routes. Advertising unbuilt features on the checkout screen invites chargebacks
    // and counts as misleading advertising under UAE consumer protection law.
    features: ['1,500 credits/month', '4K resolution', 'No watermark', '25 Brand Kits'],
    featuresAr: ['1,500 كريدت/شهر', 'دقة 4K', 'بدون علامة مائية', '25 هوية بصرية'],
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
    teams: true,
    maxMembers: 20,
    maxBrandKits: 100,
    maxProjects: 100,
    // 'Team (20 users)', 'API Access' and 'White-label' removed — none are implemented.
    // 'Unlimited Brand Kits' corrected to the limit actually enforced in
    // app/api/brand-kits/route.ts, which rejects creation past 100.
    features: ['5,000 credits/month', '4K resolution', 'No watermark', '100 Brand Kits'],
    featuresAr: ['5,000 كريدت/شهر', 'دقة 4K', 'بدون علامة مائية', '100 هوية بصرية'],
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

export interface AnnualPlanConfig {
  planId: string;
  monthlyPrice: number;
  annualPrice: number;
  annualMonthly: number; // effective monthly price
  savings: number; // percentage saved
  annualPriceId: string;
}

export const ANNUAL_PLANS: Record<string, AnnualPlanConfig> = {
  starter: { planId: 'starter', monthlyPrice: 12, annualPrice: 118, annualMonthly: 9.83, savings: 18, annualPriceId: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID || 'price_starter_annual_placeholder' },
  pro: { planId: 'pro', monthlyPrice: 29, annualPrice: 285, annualMonthly: 23.75, savings: 18, annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || 'price_pro_annual_placeholder' },
  business: { planId: 'business', monthlyPrice: 59, annualPrice: 580, annualMonthly: 48.33, savings: 18, annualPriceId: process.env.STRIPE_BUSINESS_ANNUAL_PRICE_ID || 'price_business_annual_placeholder' },
  agency: { planId: 'agency', monthlyPrice: 149, annualPrice: 1466, annualMonthly: 122.17, savings: 18, annualPriceId: process.env.STRIPE_AGENCY_ANNUAL_PRICE_ID || 'price_agency_annual_placeholder' },
};

export function getPlan(planId: string): PlanConfig {
  return PLANS[planId] || PLANS.free;
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
