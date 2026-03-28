# Phase 4: Monetization — Tasks

> **Goal:** Stripe + Credits + Plans — الـ revenue machine
> **Duration:** ~1.5 weeks
> **Demo:** Free user → Upgrade → Credits added → Top-up

---

## Prerequisites
- [ ] Phase 3 مكتمل
- [ ] Stripe account موجود (Test mode)
- [ ] Stripe CLI installed: `brew install stripe/stripe-cli/stripe`

---

## 1. Stripe Setup

- [ ] **1.1** Create Products في Stripe Dashboard:
  - Free (no product — default)
  - Starter: $12/month, recurring
  - Pro: $29/month, recurring
  - Business: $59/month, recurring
  - Agency: $149/month, recurring

- [ ] **1.2** Create One-time Products (top-ups):
  - 50 credits: $4.99
  - 150 credits: $12.99
  - 500 credits: $34.99
  - 1,000 credits: $59.99

- [ ] **1.3** Create `lib/stripe/client.ts`:
  ```typescript
  import Stripe from 'stripe';
  export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2024-11-20.acacia',
  });
  ```

- [ ] **1.4** Create `lib/stripe/plans.ts`:
  ```typescript
  export const PLANS = {
    free: {
      id: 'free',
      name: 'مجاني',
      price: 0,
      credits: 25,
      resolution: '1080p' as const,
      watermark: true,
      teams: false,
      maxBrandKits: 1,
    },
    starter: {
      id: 'starter',
      name: 'ستارتر',
      price: 12,
      priceId: process.env.STRIPE_STARTER_PRICE_ID!,
      credits: 200,
      resolution: '2K' as const,
      watermark: false,
      teams: false,
      maxBrandKits: 3,
    },
    // ... pro, business, agency
  } as const;
  
  export const TOPUPS = {
    small: { credits: 50, price: 4.99, priceId: '...' },
    medium: { credits: 150, price: 12.99, priceId: '...' },
    large: { credits: 500, price: 34.99, priceId: '...' },
    xl: { credits: 1000, price: 59.99, priceId: '...' },
  };
  ```

- [ ] **1.5** Store Price IDs في `.env.local`

**Acceptance Criteria:**
- Products موجودة في Stripe
- Price IDs موجودة في `.env.local`
- `lib/stripe/plans.ts` كاملة

---

## 2. Subscription Checkout

- [ ] **2.1** Create `app/api/stripe/create-checkout/route.ts`:
  ```typescript
  // POST { planId: 'starter' | 'pro' | 'business' | 'agency' }
  // 1. Auth check
  // 2. Get or create Stripe customer
  // 3. Check not already subscribed to same plan
  // 4. Create checkout session (subscription mode)
  // 5. Return checkout URL
  
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: `${APP_URL}/ar/billing?success=true`,
    cancel_url: `${APP_URL}/ar/billing`,
    metadata: { userId, planId },
  });
  ```

- [ ] **2.2** Update `profiles` table: add `stripe_customer_id` on first checkout

**Acceptance Criteria:**
- Checkout URL يُنشأ ويشغل
- User redirect لـ Stripe checkout page
- بعد النجاح → redirect للـ billing page

---

## 3. Credit Top-up Checkout

- [ ] **3.1** Create `app/api/stripe/create-topup/route.ts`:
  ```typescript
  // POST { topupId: 'small' | 'medium' | 'large' | 'xl' }
  // Create one-time payment checkout session
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'payment',
    line_items: [{ price: topup.priceId, quantity: 1 }],
    success_url: ...,
    metadata: { userId, topupId, credits: topup.credits },
  });
  ```

**Acceptance Criteria:**
- Top-up checkout يشتغل
- بعد الدفع → credits تُضاف فوراً

---

## 4. Stripe Webhooks

- [ ] **4.1** Create `app/api/stripe/webhook/route.ts`:
  ```typescript
  // Handle events:
  // checkout.session.completed → add credits / update plan
  // customer.subscription.updated → update plan
  // customer.subscription.deleted → downgrade to free
  // invoice.payment_failed → notify user
  ```

- [ ] **4.2** Webhook handler: `checkout.session.completed`:
  ```typescript
  if (session.mode === 'subscription') {
    // Update profile: plan_id, stripe_subscription_id, credits
    // Log transaction type: 'subscription'
  }
  if (session.mode === 'payment') {
    // Add credits from metadata.credits
    // Log transaction type: 'topup'
  }
  ```

- [ ] **4.3** Webhook handler: `customer.subscription.deleted`:
  ```typescript
  // Set plan_id = 'free'
  // Set credits = 25 (reset to free tier)
  // Log transaction
  ```

- [ ] **4.4** Test webhooks locally:
  ```bash
  stripe listen --forward-to localhost:3000/api/stripe/webhook
  stripe trigger checkout.session.completed
  ```

**Acceptance Criteria:**
- Webhooks يستقبلون ويعالجون الـ events
- Credits تُضاف بعد payment مباشرة (< 5 ثواني)
- Signature verification يشتغل
- Failed webhooks تُسجّل في logs

---

## 5. Customer Portal

- [ ] **5.1** Create `app/api/stripe/portal/route.ts`:
  ```typescript
  // Create billing portal session
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${APP_URL}/ar/billing`,
  });
  return { url: portalSession.url };
  ```

- [ ] **5.2** "Manage Subscription" button في الـ Billing page → يفتح Stripe Portal

**Acceptance Criteria:**
- Portal يفتح
- User يقدر يلغي الاشتراك من Portal
- إلغاء → webhook يُعالج → plan يرجع Free

---

## 6. Billing Page

- [ ] **6.1** Create `app/(dashboard)/billing/page.tsx`:
  
  **Current Plan Section:**
  - Plan name + features
  - Next billing date
  - Credits: used / total (progress bar)
  - "Upgrade" / "Manage" buttons
  
  **Plans Comparison Section:**
  - 5 plan cards
  - Current plan highlighted
  - Features comparison
  - CTA buttons
  
  **Top-up Section:**
  - 4 credit pack cards
  - Credits amount + price + cost-per-credit
  - "Buy Now" button
  
  **Transaction History:**
  - Table: date, type, description, amount, balance
  - Pagination

- [ ] **6.2** Create `components/billing/PlanCard.tsx`
- [ ] **6.3** Create `components/billing/TopupCard.tsx`
- [ ] **6.4** Create `components/billing/TransactionTable.tsx`
- [ ] **6.5** Success state بعد الـ checkout

**Acceptance Criteria:**
- Billing page يعرض الـ plan الحالي
- Upgrade flow يشتغل
- Top-up flow يشتغل
- Transaction history تظهر

---

## 7. Credit Gates (Upgrade Prompts)

- [ ] **7.1** Create `components/shared/UpgradePrompt.tsx`:
  - يظهر لما user يحاول action محظور
  - Shows: current plan, what they need, upgrade button
  - Variants: "Not enough credits", "Feature not in plan", "Upgrade for higher resolution"

- [ ] **7.2** Resolution gate:
  - Free user يحاول 4K → modal مع upgrade prompt
  - Starter يحاول 4K → upgrade to Pro

- [ ] **7.3** Low credits warning:
  - < 5 credits → yellow banner في الـ TopBar
  - < 0 credits → red banner + disable generate buttons

- [ ] **7.4** Credits hook يعرض:
  ```typescript
  const { balance, isLow, isEmpty, planLimit } = useCredits();
  ```

**Acceptance Criteria:**
- كل credit-gated action يعرض upgrade prompt واضح
- Low credits warning تظهر تلقائياً
- Generate button disabled لما credits = 0

---

## 8. Monthly Credits Reset

- [ ] **8.1** Supabase cron (pg_cron extension):
  ```sql
  -- Run on the 1st of each month
  SELECT cron.schedule('monthly-credits-reset', '0 0 1 * *', $$
    UPDATE profiles
    SET credits_balance = (
      CASE plan_id
        WHEN 'free' THEN 25
        WHEN 'starter' THEN 200
        WHEN 'pro' THEN 600
        WHEN 'business' THEN 1500
        WHEN 'agency' THEN 5000
      END
    ),
    credits_reset_date = NOW() + INTERVAL '1 month'
    WHERE plan_id != 'free' OR credits_reset_date < NOW();
  $$);
  ```

- [ ] **8.2** Log reset transactions
- [ ] **8.3** Email notification قبل الـ reset بـ 3 أيام (اختياري)

**Acceptance Criteria:**
- Credits تُعاد تلقائياً في بداية كل شهر
- كل reset مسجّل في `credit_transactions`
