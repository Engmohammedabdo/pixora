# Pixora — Bug Fix & Improvement Plan

> Generated from full code review on 2026-03-29
> This file tracks ALL issues. Mark [x] when fixed. Never delete entries.

---

## Wave 1: CRITICAL Security & Billing (BLOCKS PRODUCTION)

- [x] **C1** Credit deduction `deductResult.success` never checked in ALL studio routes
  - Files: All `/app/api/studios/*/route.ts`
  - Fix: Check `deductResult.success`, return error + refund generation if fails

- [x] **C2** Stripe webhook — no signature verification in production
  - File: `/app/api/stripe/webhook/route.ts:15-20`
  - Fix: Only bypass verification when `NODE_ENV === 'development'`

- [x] **C3** Stripe webhook — no idempotency protection
  - File: `/app/api/stripe/webhook/route.ts`
  - Fix: Check `event.id` against processed events (use Set or DB table)

- [x] **C4** Webhook top-up balance calculation double-counts purchased_credits
  - File: `/app/api/stripe/webhook/route.ts:82-84`
  - Fix: `newBalance = credits_balance + creditsToAdd` (not `+ newPurchased`)

- [x] **C5** `deduct_credits` SQL allows zero/negative amounts
  - File: `supabase/migrations/` (new migration)
  - Fix: Add `IF p_amount <= 0 THEN RETURN error`

---

## Wave 2: CRITICAL Frontend Bugs

- [x] **C6** Hardcoded `/ar/` locale in all auth redirects
  - Files: `login/page.tsx:37,44`, `signup/page.tsx:34,52`, `useUser.ts:64`
  - Fix: Use `useLocale()` or extract from URL

- [x] **C7** Landing page blocked by middleware (unreachable for visitors)
  - File: `middleware.ts:55-58`
  - Fix: Add `/` to `publicPaths`, skip auth for landing routes

- [x] **C8** `useUser` creates new Supabase client every render → infinite loop
  - File: `hooks/useUser.ts:20`
  - Fix: Move `createBrowserClient()` into `useMemo` or module-level singleton

- [x] **C9** Dark mode broken — `bg-white` hardcoded in ALL textareas (9+ files)
  - Fix: Replace `bg-white` → `bg-[var(--color-surface)]` in all textarea classes

- [x] **C10** Edit studio doesn't pass source image to AI
  - File: `/api/studios/edit/route.ts:41-42`
  - Fix: Pass `input.imageUrl` as `referenceImageUrl`

- [x] **C11** Photoshoot never passes product image to AI
  - File: `/api/studios/photoshoot/route.ts`
  - Fix: Pass `input.productImageUrl` as `referenceImageUrl` in each shot

---

## Wave 3: HIGH — User-Facing Bugs

- [x] **H1** Upload route accepts arbitrary bucket name (storage injection)
  - File: `/api/upload/route.ts:19`
  - Fix: Validate against allowlist `['uploads', 'brand-kits', 'generations']`

- [x] **H2** Gemini API key in URL — leaks in error messages
  - File: `lib/ai/gemini.ts:44,88`
  - Fix: Strip URL from error messages

- [ ] **H3** Rate limiter is in-memory — useless on serverless
  - File: `lib/rate-limit.ts`
  - Fix: Replace with Supabase-based rate limiting or remove false sense of security

- [x] **H4** Credits balance API doesn't include `purchased_credits`
  - File: `/api/credits/balance/route.ts:14`
  - Fix: Add `purchased_credits` to select, return total

- [x] **H5** Photoshoot charges full cost even when shots fail
  - File: `/api/studios/photoshoot/route.ts:91,103`
  - Fix: Count successful shots, charge proportionally or refund

- [x] **H6** Sidebar credits progress hardcoded to `/25`
  - File: `Sidebar.tsx:147`
  - Fix: Read plan credits from profile

- [x] **H7** CreditsWidget maxCredits defaults to 25
  - File: `CreditsWidget.tsx:16`
  - Fix: Pass actual plan credits from parent

- [x] **H8** Brand kit creation — no plan-based limit
  - File: `/api/brand-kits/route.ts`
  - Fix: Check count vs plan limit before insert

- [x] **H9** No resolution enforcement — free users can request 4K
  - File: `/api/studios/creator/route.ts`
  - Fix: Check `getMaxResolution(profile.plan_id)` before generation

- [ ] **H10** `blob:` URLs sent to API — server can't access
  - Files: `edit/page.tsx`, `PhotoshootForm`, `CreatorForm`
  - Fix: Upload image first, then send Storage URL

- [ ] **H11** 80+ hardcoded Arabic strings — English locale broken
  - Files: 20+ pages and components
  - Fix: Move all strings to `messages/ar.json` + `messages/en.json`

- [ ] **H12** Projects page is local state only — data lost on refresh
  - File: `projects/page.tsx`
  - Fix: Connect to Supabase (needs projects table migration)

- [x] **H13** OpenAI `1536x1536` invalid size
  - File: `lib/ai/openai.ts:44`
  - Fix: Change to `1536x1024` or `auto`

- [ ] **H14** Missing `teams` + `projects` DB tables
  - Fix: Create migrations when ready for implementation

---

## Wave 4: MEDIUM — Quality & Correctness

- [ ] **M1** Webhook subscription.updated overwrites credits
- [ ] **M2** Prompt builder no generation record
- [x] **M3** Assets filter doesn't work with PostgREST joins
- [ ] **M4** Voiceover credit cost uses char count instead of time
- [x] **M5** Delete operations don't clean up Storage files
- [ ] **M6** Gemini referenceImageUrl never used in API call
- [x] **M7** Missing updated_at on brand_kits
- [ ] **M8** No watermark for Free plan
- [ ] **M9** No signed URLs (public forever)
- [x] **M10** Missing index on profiles.stripe_customer_id
- [x] **M11** TypeScript types loose (string instead of unions)
- [x] **M12** Dark mode missing for colored backgrounds
- [ ] **M13** Missing aria-labels on toggle buttons
- [x] **M14** credit_transactions missing INSERT policy
- [ ] **M15** credit_transactions CASCADE destroys audit trail
- [ ] **M16** No Suspense boundaries for AI streaming
- [ ] **M17** Creator generates 1 image — PRD says 1 or 4
- [ ] **M18** Free-user monthly reset no transaction log

---

## Wave 5: LOW — Polish

- [x] **L1** Hardcoded `/ar/billing` in Stripe redirects
- [ ] **L2** Badge variant "success"/"warning" not defined
- [ ] **L3** Replicate timeout misleading error
- [ ] **L4** `confirm()` for delete — use Dialog
- [ ] **L5** No React.memo on list items
- [ ] **L6** createServiceRoleClient no validation
- [ ] **L7** Missing format:'mp3' on voiceover asset
- [ ] **L8** No CORS headers on API routes
- [x] **L9** QueryProvider only wraps dashboard
- [ ] **L10** No Framer Motion animations
- [ ] **L11** No forgot-password flow
- [ ] **L12** No CHECK constraints on studio/plan_id columns
