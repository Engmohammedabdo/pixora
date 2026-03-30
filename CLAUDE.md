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

## Project Status: ✅ ALL PHASES COMPLETE

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ | Foundation — Auth + DB + Layout + Credits |
| Phase 2 | ✅ | Core AI Studios — Creator + Photoshoot + Campaign |
| Phase 3 | ✅ | Advanced Studios — Plan + Storyboard + Analysis + VoiceOver + Edit + Prompt Builder |
| Phase 4 | ✅ | Monetization — Stripe subscriptions + top-ups + webhooks |
| Phase 5 | ✅ | Polish — Dark Mode + Landing Page + Export + Onboarding + SEO |
| Code Review | ✅ | 55/55 bugs fixed (CRITICAL + HIGH + MEDIUM + LOW) |
| PRD Features | ✅ | 11/11 missing features implemented |
| ROADMAP | ✅ | 40/40 UX features (Phases A-D) |
| VoiceOver | ✅ | Tiered TTS (OpenAI + ElevenLabs) with plan-based features |

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
