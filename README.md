<div align="center">

# PyraSuite

### المنصة العربية الأولى للتسويق بالذكاء الاصطناعي

**حوّل أي فكرة لحملة تسويقية احترافية في دقائق**

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth+DB-3FCF8E?logo=supabase)](https://supabase.com/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?logo=stripe)](https://stripe.com/)

**[Live Demo →](https://pyrasuite.pyramedia.cloud/)**

</div>

---

## Overview

PyraSuite is an Arabic-first AI marketing SaaS platform with 9 specialized studios, multi-model AI support (Gemini + GPT + Flux), a transparent credit system, and Stripe-powered monetization. Built from the ground up for the Arabic market with full RTL support, dark mode, and comprehensive i18n.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router) |
| **Language** | TypeScript (strict mode, zero errors) |
| **Styling** | Tailwind CSS v3 + CSS Variables + Dark Mode |
| **UI Components** | shadcn/ui (custom-built) |
| **Auth & Database** | Supabase (Auth + PostgreSQL + Storage + RLS) |
| **Payments** | Stripe (Subscriptions + One-time payments + Webhooks) |
| **AI Models** | Google Gemini, OpenAI GPT, Replicate Flux |
| **State** | Zustand (client) + React Query (server) |
| **i18n** | next-intl (Arabic-first, URL-based locale) |
| **Dark Mode** | next-themes (system detection, no flash) |
| **Validation** | Zod v4 (all API inputs) |

---

## 9 AI Studios

| Studio | Description | Credits |
|--------|-------------|---------|
| **Creator** | Generate marketing images (1 or 4 variations) | 1-4 per image |
| **Photoshoot** | Professional product photography (1/3/6 shots) | 2-8 |
| **Campaign Planner** | 9-post campaigns with captions + images | 12 |
| **Marketing Plan** | 30/60/90-day plans with calendar + budget | 5 |
| **Storyboard** | 9-scene video storyboards with camera angles | 14 |
| **Marketing Analysis** | SWOT, personas, competitors, roadmap, KPIs | 3 |
| **Voice Over** | AI voice with dialect/speed/tone selection | 1/30s |
| **Edit** | AI image editing (5 types: bg replace, remove, color, text, style) | 1 |
| **Prompt Builder** | Arabic→English prompt conversion (3 variations) | FREE |

---

## Platform Features

- **Multi-model AI Router** — Gemini / GPT / Flux with automatic fallback + retry (3 attempts)
- **Brand Kit** — Logo, colors, fonts — auto-applied to all generations
- **Credit System** — Atomic deduction (race-condition safe via PostgreSQL RPC)
- **Watermark** — Automatic for Free plan users
- **Signed URLs** — 15-minute expiry for storage assets
- **Arabic-first RTL** — Full right-to-left with logical CSS properties
- **Dark Mode** — System detection + toggle, no flash
- **PDF Export** — Campaign, Analysis, Storyboard (browser-native)
- **ZIP Export** — Batch download via JSZip
- **Onboarding** — 5-step guided flow with bonus credits
- **Forgot Password + Magic Link** — Complete auth flows
- **Resolution Enforcement** — Per plan (Free=1080p, Starter=2K, Pro+=4K)
- **Rate Limiting** — Supabase-based (20 req/min per user)
- **Accessibility** — aria-pressed on toggles, semantic HTML

---

## Subscription Plans

| Plan | Price | Credits/mo | Resolution | Teams |
|------|-------|-----------|------------|-------|
| Free | $0 | 25 | 1080p | - |
| Starter | $12/mo | 200 | 2K | - |
| Pro | $29/mo | 600 | 4K | - |
| Business | $59/mo | 1,500 | 4K | 5 users |
| Agency | $149/mo | 5,000 | 4K | 20 users |

**Top-ups:** 50 ($4.99) / 150 ($12.99) / 500 ($34.99) / 1,000 ($59.99) — valid 12 months

---

## Project Structure

```
app/
├── [locale]/
│   ├── (auth)/              # Login, Signup, Forgot/Reset Password, Callback
│   ├── (dashboard)/         # 22 authenticated pages
│   │   ├── dashboard/       # Home with quick actions + credits
│   │   ├── creator/         # Image generation (1 or 4 variations)
│   │   ├── photoshoot/      # Product photography
│   │   ├── campaign/        # Campaign planner (9 posts)
│   │   ├── plan/            # Marketing plan
│   │   ├── storyboard/      # Video storyboard
│   │   ├── analysis/        # Marketing analysis
│   │   ├── voiceover/       # Voice generation
│   │   ├── edit/            # Image editing
│   │   ├── prompt-builder/  # Prompt helper (free)
│   │   ├── brand-kit/       # Brand identity CRUD
│   │   ├── assets/          # Generated files gallery
│   │   ├── projects/        # Project organization
│   │   ├── billing/         # Plans + top-ups + transactions
│   │   ├── team/            # Team management
│   │   ├── settings/        # Profile + theme + locale
│   │   ├── onboarding/      # 5-step onboarding
│   │   ├── privacy/         # Privacy policy
│   │   └── terms/           # Terms of service
│   ├── (landing)/           # Public landing page
│   └── layout.tsx           # Root (i18n + theme + query)
├── api/
│   ├── studios/             # 9 studio routes
│   ├── stripe/              # checkout, topup, webhook, portal
│   ├── credits/             # balance, transactions
│   ├── brand-kits/          # CRUD
│   ├── assets/              # CRUD + export (ZIP)
│   └── upload/              # File upload
components/
├── ui/                      # shadcn components (11)
├── layout/                  # Sidebar, TopBar, CreditsWidget, StudioLayout
├── shared/                  # ModelSelector, CreditCost, ExportMenu, etc.
├── studios/                 # Creator, Campaign, Photoshoot forms/previews
├── billing/                 # PlanCard, TopupCard, TransactionTable
├── brand-kit/               # BrandKitForm, ColorPicker, LogoUpload
└── providers/               # QueryProvider, ThemeProvider
lib/
├── ai/                      # Gemini, OpenAI, Replicate + Router + Prompts
├── credits/                 # check, deduct (atomic), costs
├── stripe/                  # client, plans (5 plans + 4 top-ups)
├── supabase/                # client, server, types, signed-url
├── image/                   # watermark
├── export/                  # PDF generation
└── utils.ts                 # cn() helper
supabase/migrations/         # 13 SQL migrations
messages/                    # ar.json + en.json (i18n)
```

---

## Getting Started

```bash
# Clone
git clone https://github.com/Engmohammedabdo/pixora.git
cd pixora

# Install
npm install

# Configure
cp .env.local.example .env.local
# Edit .env.local with your Supabase + Stripe + AI keys

# Apply migrations (via Supabase SQL Editor or psql)
# See supabase/migrations/ (001-013)

# Run
npm run dev
```

The app runs in **mock mode** without AI keys — all AI calls return placeholder responses.

---

## Database Schema

| Table | Description | RLS |
|-------|-------------|-----|
| `profiles` | User profiles (plan, credits, Stripe IDs) | ✅ |
| `brand_kits` | Brand identity (logo, colors, fonts) | ✅ |
| `generations` | AI generation records | ✅ |
| `credit_transactions` | Credit audit ledger | ✅ |
| `assets` | Generated files (image, video, audio) | ✅ |
| `teams` | Team collaboration | ✅ |
| `team_members` | Team membership + roles | ✅ |
| `projects` | Project organization | ✅ |

**Key features:** Atomic credit deduction (SELECT FOR UPDATE), CHECK constraints, auto-triggers, pg_cron monthly reset.

---

## API Routes

### Studios (POST, authenticated, rate-limited)
`/api/studios/{creator,photoshoot,campaign,plan,storyboard,analysis,voiceover,edit,prompt-builder}`

### Stripe
| Route | Description |
|-------|-------------|
| `POST /api/stripe/create-checkout` | Subscription checkout |
| `POST /api/stripe/create-topup` | Credit top-up checkout |
| `POST /api/stripe/portal` | Customer portal |
| `POST /api/stripe/webhook` | Event handler (idempotent) |

### Other
`GET/POST /api/brand-kits` · `GET/POST /api/assets` · `POST /api/assets/export` · `GET /api/credits/balance` · `POST /api/upload`

---

## Quality Metrics

| Metric | Status |
|--------|--------|
| TypeScript errors | **0** |
| Build status | **passes** |
| Code review issues | **55/55 fixed** |
| PRD features | **11/11 implemented** |
| i18n coverage | **Arabic + English complete** |
| Dark mode | **Full coverage** |
| Accessibility | **aria-pressed, semantic HTML** |
| DB Migrations | **13 applied** |

---

## Deployment

Deployed on **Coolify** with Docker at https://pyrasuite.pyramedia.cloud/

```bash
# Build
npm run build

# Verify
npx tsc --noEmit  # zero errors
npm run build     # passes
```

---

## License

Proprietary. All rights reserved. © 2026 PyraSuite by Pyramedia.
