# CLAUDE.md — PyraSuite Project Instructions

> هذا الملف للـ Claude Code. اقرأه كاملاً قبل أي كود.

---

## Project Overview

**PyraSuite** — أول منصة عربية تحوّل أي فكرة لحملة تسويقية كاملة — بقوة بايرا 🦊

**Live URL:** https://pyrasuite.pyramedia.cloud/
**Stack:** Next.js 15 + TypeScript + Tailwind v3 + shadcn/ui + Supabase + Stripe + Pyra AI 🦊

---

## ⚠️ الهوية التسويقية — إلزامي!

### مين بايرا 🦊؟
**بايرا (Pyra AI)** هي الاسم التسويقي لمحرك الذكاء الاصطناعي الخاص بـ PyraSuite.

- **تسويقياً:** بايرا هي اللي تولّد الصور، تكتب الخطط، تحلل المنافسين
- **تقنياً:** بايرا هي router يدير عدة نماذج AI (Gemini + GPT + Flux + ElevenLabs)
- **المستخدم يتعامل مع "بايرا" كشخصية واحدة** — مش مع APIs مختلفة

### قواعد الهوية التسويقية:
1. **لا تذكر أسماء الـ models مباشرة للمستخدم** — قل "بايرا" أو "محرك Pyra AI"
2. **الـ multi-model routing = "ذكاء متعدد الطبقات"** — مش "Gemini fallback to GPT"
3. **الـ fallback = "بايرا تجرّب مسار ثاني"** — مش "model failed, trying another"
4. **في الكود:** متغيرات الـ models تبقى كما هي (gemini/gpt/flux) — التغيير في UI/UX فقط
5. **في الـ UI:**
   - Loading state: "بايرا تشتغل..." بدل "جاري التوليد"
   - Fallback notice: "بايرا استخدمت مسار بديل" بدل "تم استخدام نموذج بديل"
   - Model selector (داخلي): "سرعة / جودة / إبداع" بدل "Gemini / GPT / Flux"
6. **في الـ Landing page:** "محرك Pyra AI 🦊" — ذكاء متعدد الطبقات
7. **في الـ README:** كل الـ AI features تُنسب لبايرا

### أمثلة:
```
❌ "Powered by Gemini + GPT + Flux"
✅ "بقوة بايرا 🦊"

❌ "Gemini failed, falling back to GPT"
✅ "بايرا تجرّب مسار بديل"

❌ "Choose AI model: Gemini / GPT / Flux"
✅ "مسار بايرا: سرعة / جودة / إبداع"

❌ "Generated with OpenAI TTS"
✅ "تعليق صوتي من بايرا 🎙️"
```

---

## Project Status — verified against code, not against intent

> **Read this before trusting any ✅ in this repo.** A July 2026 audit read 100
> documented claims and checked each one against the source. Result: 14 were UI
> with no backend, 32 half-built, 16 absent entirely. The docs were not stale —
> they recorded intent at the moment of writing and were never re-checked.
>
> **Rule from here on: a ✅ must be able to name a file:line that proves it.
> Otherwise write the real state.** A doc that lies is worse than a missing
> feature — the feature gets discovered, the doc misdirects every later decision.

### Shippable today

| Area | State | Proof |
|------|-------|-------|
| Auth + DB + RLS | ✅ built | 30 migrations; every public table has RLS |
| 9 studios generate | ✅ built | `app/api/studios/*` — all 9 return real output |
| Credits: reserve → deduct → refund | ✅ built | atomic RPCs, `SELECT … FOR UPDATE` |
| Projects (client workspaces) | ✅ built | wired into all 9 studios + asset filter |
| Stripe money path | ✅ hardened | see "Money path" below |
| Pre-launch waitlist | ✅ built | `/[locale]/waitlist`, migration 030 applied |
| Admin dashboard | ✅ built | real funnel/MRR/churn/retention queries |
| i18n ar/en + RTL | ✅ built | key sets verified identical |

### Money path — round 1 fixed 2026-07-21, round 2 fixed 2026-08-02

Round 1 — money that arrived:

| Defect | State |
|--------|-------|
| Webhook ignored all 23 DB writes → paid customer got no credits, Stripe never retried | ✅ fixed — critical writes throw via `mustSucceed` |
| Upgrade created a SECOND parallel subscription → double billing | ✅ fixed — 409 + billing-portal route |
| `subscription.updated` granted a full month on ANY update | ✅ fixed — reads plan from price, requires live status + tier change |
| Credits granted before payment settled | ✅ fixed — requires `payment_status === 'paid'` |
| Annual billing sold with placeholder price ids → every purchase 500'd | ✅ removed entirely (not deferred — deleted) |

Round 2 — money delivered twice, money that stops, money taken back:

| Defect | State |
|--------|-------|
| One top-up delivered twice granted the credits twice | ✅ fixed — `grant_purchased_credits` RPC, keyed on payment intent (031) |
| Monthly cron refilled non-paying accounts forever (job is LIVE, `cron.job` jobid 1) | ✅ fixed — reset skips `payment_failed` (032) |
| Nothing downgraded a subscriber who stopped paying — `deleted` was the only exit | ✅ fixed — status branch shares `downgradeToFree()` |
| A chargeback fired no handled event; account kept its paid tier | ✅ fixed — `charge.dispute.created` handler† |
| Refunds destroyed credits the customer had bought | ✅ fixed — refund returns to its source pool (033) |
| `payment_failed` was written by the webhook and read by NOTHING | ✅ fixed — drives the cron guard + a dashboard banner |
| Post-checkout screen showed "Success" over a `Free` badge | ✅ fixed — plan comes from the server poll, amber pending state |
| Portal unreachable for top-up-only and churned customers | ✅ fixed — gated on `stripe_customer_id`, not plan |
| Every Stripe route returned English users to `/ar/billing` | ✅ fixed — locale passed by the caller (`profiles.locale` is a dead column) |
| Raw error codes (`portal_failed`) shown to Arabic customers | ✅ fixed |

† Requires `charge.dispute.created` to be enabled on the webhook endpoint in the
Stripe Dashboard — the handler cannot fire if the endpoint is not subscribed to it.

**Verification:** `scripts/db/tests/money-path.sql` runs 12 assertions against the
live database inside a rolled-back transaction. The webhook paths were verified by
replaying events at a running dev server. See `docs/CHANGELOG.md` for the evidence.

### Not built — do not describe these as done

| Item | Real state |
|------|-----------|
| Transactional email | ❌ none. No provider, no SMTP, no template. Password reset is broken in production. |
| Support channel | ❌ none. No contact page, no support email, no widget. |
| Tax invoice / VAT | ❌ none — and correctly so. Below the AED 375,000 threshold there is no TRN and it is *prohibited* to issue a document stating VAT. Becomes real work at registration. Credit refunds/clawback are handled (see money path round 2). |
| Teams | ❌ UI shell. Mock members, invite button shows "coming soon", zero API routes. |
| Gamification (achievements, levels, streaks) | ❌ dead code. Zero importers, table never written. |
| Community / Portfolio | ❌ fabricated data. Invented names and like counts. |
| Prompt templates + history | ⚠️ components written (242 lines), zero imports. Cheap to activate. |
| API access (sold on Agency tier) | ❌ absent — and correctly removed from the plan features. |
| Arabic text inside generated images | ❌ not handled; prompts actively forbid it. |
| Brand kit logo/fonts reaching the model | ❌ zero references to `logo` anywhere in `lib/ai/`. |
| Error tracking (Sentry) / product analytics (PostHog) | ❌ env vars declared, empty, never read by any line of code. |

---

## Key Files

| File | Purpose |
|------|---------|
| `PRD.md` | Original product requirements (reference) |
| `PHASES.md` | Development roadmap with completion status |
| `RULES.md` | Coding conventions and rules |
| `FIXPLAN.md` | Code review bug tracking (55/55 resolved) |
| `ROADMAP.md` | Feature roadmap & UX enhancement plan |
| `docs/VOICEOVER_UPGRADE_PLAN.md` | VoiceOver studio upgrade plan |

---

## Tech Stack

- **Framework:** Next.js 15 (App Router), TypeScript (strict)
- **Styling:** Tailwind CSS v3, CSS Variables, Framer Motion, shadcn/ui
- **Auth & DB:** Supabase (Auth + PostgreSQL + Storage + RLS)
- **Payments:** Stripe (Subscriptions + One-time + Webhooks)
- **AI Engine:** Pyra AI 🦊 (multi-layer router with auto-fallback)
  - Image: Gemini Flash Image / GPT Image / Flux 1.1 Pro
  - Text: Gemini Pro / GPT-4o
  - Voice: OpenAI TTS (Free/Starter) / ElevenLabs (Pro+)
- **State:** Zustand (client) + React Query (server)
- **i18n:** next-intl (Arabic-first, URL-based `[locale]`)
- **Theme:** next-themes (dark mode, system detection)

---

## Architecture

```
app/
├── [locale]/
│   ├── (auth)/          # Login, Signup, Forgot/Reset Password, Callback
│   ├── (dashboard)/     # 25+ authenticated pages (9 studios + billing + team + etc.)
│   ├── page.tsx         # Landing page (public)
│   └── layout.tsx       # Root: i18n + theme + query + toast providers
├── api/
│   ├── studios/         # 9 studio API routes
│   ├── stripe/          # 4 Stripe routes (checkout, topup, webhook, portal)
│   ├── credits/         # Balance + transactions
│   ├── brand-kits/      # CRUD
│   ├── assets/          # CRUD + export (ZIP)
│   └── upload/          # File upload to Supabase Storage
├── globals.css          # Tailwind + CSS variables + fonts
└── sitemap.ts

lib/
├── ai/
│   ├── router.ts        # Pyra AI image/text router (multi-model + fallback)
│   ├── tts-router.ts    # Pyra AI voice router (OpenAI + ElevenLabs)
│   ├── elevenlabs.ts    # ElevenLabs Arabic voices client
│   ├── gemini.ts        # Gemini API client
│   ├── openai.ts        # OpenAI API client
│   ├── replicate.ts     # Flux API client
│   └── prompts/         # System prompts v2.0 + safety filters + versioning
├── credits/
│   ├── costs.ts         # Credit costs per studio
│   ├── voiceover-costs.ts # Tiered voiceover pricing per plan
│   ├── check.ts         # Balance check
│   └── deduct.ts        # Atomic deduction via RPC
├── stripe/              # Plans + topups + client
├── supabase/            # Server/client + types + signed URLs
├── image/               # Watermark
├── export/              # PDF generation
├── gamification/        # Achievements + levels
└── animations.ts        # Framer Motion shared variants
```

---

## Development Conventions

### Must Follow
- **Server Components** by default — `'use client'` only when needed
- **TypeScript strict** — zero `any`, zero errors
- **Zod validation** on all API inputs (import from `zod/v4`)
- **RTL-first CSS** — use `ps/pe/ms/me/start/end` (NOT `pl/pr/ml/mr/left/right`)
- **CSS Variables** for colors — NOT hardcoded `bg-white` (use `bg-[var(--color-surface)]`)
- **No inline styles** — Tailwind utilities only
- **shadcn/ui** in `components/ui/` — extend via wrapping, don't modify directly
- **Rate limiting** via Supabase query (NOT in-memory) — see `lib/rate-limit.ts`
- **Safety filters** — all user prompts pass through `sanitizePrompt()` before AI
- **Pyra AI branding** — user-facing text refers to "بايرا" not model names

### File Naming
- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts` (prefix: `use`)
- API routes: `route.ts`
- Utils/libs: `camelCase.ts`

### API Route Pattern
```typescript
// 1. Auth check
// 2. Rate limit check (await checkRateLimit(supabase, user.id))
// 3. Validate input (Zod) + sanitize prompt
// 4. Check plan limits (resolution, duration, features)
// 5. Check credits
// 6. Generate via Pyra AI router (handles model selection + fallback)
// 7. Apply watermark (maybeWatermark for free plan)
// 8. Deduct credits + CHECK deductResult.success
// 9. Save generation + assets
// 10. Return response
```

### VoiceOver Tiered Pricing
```
Free/Starter → OpenAI TTS → 1 credit / 15 seconds
Pro+         → ElevenLabs → 3 credits / 20 seconds
```

### Supabase
- **RLS on every table** — no exceptions
- **Service role** only in webhooks and admin operations
- **Atomic credit deduction** via `deduct_credits()` RPC
- **Signed URLs** for storage assets (15-min expiry)

### Credits System
- Check balance → Generate → Deduct (atomic) → Log transaction
- `deductResult.success` MUST be checked after every deduction
- Free plan: watermark on images
- Resolution enforcement per plan
- VoiceOver: tiered pricing based on plan (see `lib/credits/voiceover-costs.ts`)

### Database Migrations
- 14 migrations in `supabase/migrations/`
- Tables: profiles, brand_kits, generations, credit_transactions, assets, teams, team_members, projects, achievements, saved_prompts
- Apply via Supabase SQL Editor or `scripts/apply-migrations.sh`

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
STRIPE_BUSINESS_PRICE_ID=
STRIPE_AGENCY_PRICE_ID=
STRIPE_TOPUP_SMALL_PRICE_ID=
STRIPE_TOPUP_MEDIUM_PRICE_ID=
STRIPE_TOPUP_LARGE_PRICE_ID=
STRIPE_TOPUP_XL_PRICE_ID=

# AI APIs (Pyra AI Engine)
GOOGLE_GEMINI_API_KEY=
OPENAI_API_KEY=
REPLICATE_API_TOKEN=
ELEVENLABS_API_KEY=

# App
NEXT_PUBLIC_APP_URL=https://pyrasuite.pyramedia.cloud
NEXT_PUBLIC_DEFAULT_LOCALE=ar
```

---

## Commands

```bash
npm run dev      # Development server
npm run build    # Production build
npm run lint     # ESLint
npx tsc --noEmit # TypeScript check
```
