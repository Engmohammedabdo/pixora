<div align="center">

# Pixora

### المنصة العربية الأولى للتسويق بالذكاء الاصطناعي

**حوّل أي فكرة لحملة تسويقية احترافية في دقائق**

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth+DB-3FCF8E?logo=supabase)](https://supabase.com/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?logo=stripe)](https://stripe.com/)

</div>

---

## Overview

Pixora is an Arabic-first AI marketing SaaS platform with 9 specialized studios, multi-model AI support (Gemini + GPT + Flux), a transparent credit system, and Stripe-powered monetization. It's designed from the ground up for the Arabic market with full RTL support.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router) |
| **Language** | TypeScript (strict mode) |
| **Styling** | Tailwind CSS v3 + CSS Variables |
| **UI Components** | shadcn/ui (manually implemented) |
| **Auth & Database** | Supabase (Auth + PostgreSQL + Storage) |
| **Payments** | Stripe (Subscriptions + One-time payments) |
| **AI Models** | Google Gemini, OpenAI GPT, Replicate Flux |
| **State Management** | Zustand (client) + React Query (server) |
| **i18n** | next-intl (Arabic-first, URL-based locale) |
| **Dark Mode** | next-themes (system detection, no flash) |
| **Animations** | Framer Motion |
| **Validation** | Zod v4 |

---

## Features

### 9 AI Studios

| Studio | Description | Credits |
|--------|-------------|---------|
| **Creator** | Generate marketing images from text prompts | 1-4 |
| **Photoshoot** | Professional product photography (1/3/6 shots) | 2-8 |
| **Campaign Planner** | Generate 9-post campaigns with captions + images | 12 |
| **Marketing Plan** | 30/60/90-day marketing plans with calendar + budget | 5 |
| **Storyboard** | 9-scene video storyboards with camera angles | 14 |
| **Marketing Analysis** | SWOT, personas, competitors, roadmap, KPIs | 3 |
| **Voice Over** | AI voice generation with dialect selection | 1/30s |
| **Edit** | AI-powered image editing (5 edit types) | 1 |
| **Prompt Builder** | Arabic-to-English prompt conversion (3 variations) | FREE |

### Platform Features

- **Multi-model AI Router** — Gemini / GPT / Flux with automatic silent fallback
- **Brand Kit** — Save logo, colors, fonts — auto-applied to all generations
- **Credit System** — Atomic deduction (race-condition safe via PostgreSQL RPC)
- **Arabic-first RTL** — Full right-to-left support with logical CSS properties
- **Dark Mode** — System detection + manual toggle, no flash
- **PDF Export** — Campaign, Analysis, and Storyboard exports
- **Onboarding** — 4-step guided onboarding with bonus credits
- **Assets Gallery** — Filter by studio, multi-select, batch download/delete
- **Projects** — Organize generations into projects

### Monetization

| Plan | Price | Credits/mo | Resolution | Teams |
|------|-------|-----------|------------|-------|
| Free | $0 | 25 | 1080p | - |
| Starter | $12/mo | 200 | 2K | - |
| Pro | $29/mo | 600 | 4K | - |
| Business | $59/mo | 1,500 | 4K | 5 users |
| Agency | $149/mo | 5,000 | 4K | 20 users |

**Top-ups:** 50 ($4.99) / 150 ($12.99) / 500 ($34.99) / 1,000 ($59.99) credits

---

## Project Structure

```
pixora/
├── app/
│   ├── [locale]/
│   │   ├── (auth)/              # Login, Signup, OAuth callback
│   │   ├── (dashboard)/         # All authenticated pages
│   │   │   ├── dashboard/       # Home dashboard
│   │   │   ├── creator/         # Image Creator studio
│   │   │   ├── photoshoot/      # Product Photoshoot studio
│   │   │   ├── campaign/        # Campaign Planner studio
│   │   │   ├── plan/            # Marketing Plan studio
│   │   │   ├── storyboard/      # Storyboard studio
│   │   │   ├── analysis/        # Marketing Analysis studio
│   │   │   ├── voiceover/       # Voice Over studio
│   │   │   ├── edit/            # Image Edit studio
│   │   │   ├── prompt-builder/  # Prompt Builder studio
│   │   │   ├── brand-kit/       # Brand Kit CRUD
│   │   │   ├── assets/          # Assets Gallery
│   │   │   ├── projects/        # Projects
│   │   │   ├── billing/         # Billing & Plans
│   │   │   ├── team/            # Team management
│   │   │   ├── settings/        # Settings
│   │   │   └── onboarding/      # Onboarding flow
│   │   ├── (landing)/           # Landing page
│   │   ├── layout.tsx           # Root layout (i18n + theme)
│   │   └── page.tsx             # Landing page entry
│   ├── api/
│   │   ├── studios/             # 9 studio API routes
│   │   ├── stripe/              # Checkout, top-up, webhook, portal
│   │   ├── credits/             # Balance, transactions
│   │   ├── brand-kits/          # CRUD
│   │   ├── assets/              # CRUD + export
│   │   └── upload/              # File upload
│   ├── globals.css
│   └── sitemap.ts
├── components/
│   ├── ui/                      # shadcn components (11 files)
│   ├── layout/                  # Sidebar, TopBar, CreditsWidget, StudioLayout
│   ├── shared/                  # ModelSelector, CreditCost, ExportMenu, etc.
│   ├── studios/                 # Creator, Campaign, Photoshoot components
│   ├── billing/                 # PlanCard, TopupCard, TransactionTable
│   ├── brand-kit/               # BrandKitForm, ColorPicker, LogoUpload
│   └── providers/               # QueryProvider, ThemeProvider
├── lib/
│   ├── ai/                      # Gemini, OpenAI, Replicate + Router
│   │   ├── prompts/             # System prompts (v1.0) for all studios
│   │   └── router.ts            # Model router with fallback + retry
│   ├── credits/                 # check.ts, deduct.ts (atomic), costs.ts
│   ├── stripe/                  # client.ts, plans.ts (5 plans + 4 top-ups)
│   ├── supabase/                # client.ts, server.ts, types.ts
│   ├── export/                  # pdf.ts (Campaign, Analysis, Storyboard)
│   └── utils.ts                 # cn() helper
├── hooks/                       # useUser, useCredits, useBrandKit
├── store/                       # Zustand stores (credits, ui)
├── types/                       # TypeScript types (studios, api)
├── messages/                    # ar.json, en.json (i18n)
├── supabase/
│   └── migrations/              # 5 SQL migrations
├── i18n/                        # next-intl config + routing
├── middleware.ts                 # Auth + i18n middleware
└── public/
    └── robots.txt
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Supabase account (for auth + database)
- Stripe account (for payments)
- AI API keys (Gemini / OpenAI / Replicate) — optional, mock mode available

### Installation

```bash
# Clone the repository
git clone https://github.com/Engmohammedabdo/pixora.git
cd pixora

# Install dependencies
npm install

# Copy environment variables
cp .env.local.example .env.local
# Edit .env.local with your keys
```

### Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Stripe Price IDs (create in Stripe Dashboard)
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
STRIPE_BUSINESS_PRICE_ID=
STRIPE_AGENCY_PRICE_ID=
STRIPE_TOPUP_SMALL_PRICE_ID=
STRIPE_TOPUP_MEDIUM_PRICE_ID=
STRIPE_TOPUP_LARGE_PRICE_ID=
STRIPE_TOPUP_XL_PRICE_ID=

# AI APIs (leave empty for mock mode)
GOOGLE_GEMINI_API_KEY=
OPENAI_API_KEY=
REPLICATE_API_TOKEN=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_LOCALE=ar
```

### Database Setup

```bash
# Apply migrations to your Supabase project
# Run each file in supabase/migrations/ in order:
# 001_profiles.sql
# 002_brand_kits.sql
# 003_generations_assets.sql
# 004_credit_transactions.sql
# 005_monthly_credits_reset.sql
```

### Development

```bash
# Start development server
npm run dev

# Type check
npx tsc --noEmit

# Build for production
npm run build

# Start production server
npm start
```

The app runs in **mock mode** without API keys — all AI calls return placeholder responses so you can develop and test the full UI flow.

### Stripe Webhooks (Local Testing)

```bash
# Install Stripe CLI
# Listen for webhooks
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Test events
stripe trigger checkout.session.completed
```

---

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `profiles` | Extended user profiles (plan, credits, Stripe IDs) |
| `brand_kits` | Brand identity (logo, colors, fonts, voice) |
| `generations` | AI generation records (input, output, status) |
| `credit_transactions` | Credit ledger (usage, top-ups, subscriptions) |
| `assets` | Generated files (images, audio, video) |

### Key Features

- **Row Level Security (RLS)** enabled on all tables
- **Automatic profile creation** via database trigger on signup
- **Atomic credit deduction** via `deduct_credits()` PostgreSQL function (prevents race conditions)
- **Monthly credit reset** via `pg_cron` scheduled function

---

## API Routes

### Studios (POST)

| Route | Studio | Credits |
|-------|--------|---------|
| `/api/studios/creator` | Image generation | 1-4 |
| `/api/studios/photoshoot` | Product photography | 2-8 |
| `/api/studios/campaign` | Campaign planning | 12 |
| `/api/studios/plan` | Marketing plan | 5 |
| `/api/studios/storyboard` | Video storyboard | 14 |
| `/api/studios/analysis` | Marketing analysis | 3 |
| `/api/studios/voiceover` | Voice generation | 1/30s |
| `/api/studios/edit` | Image editing | 1 |
| `/api/studios/prompt-builder` | Prompt building | 0 |

### Stripe

| Route | Method | Description |
|-------|--------|-------------|
| `/api/stripe/create-checkout` | POST | Create subscription checkout |
| `/api/stripe/create-topup` | POST | Create credit top-up checkout |
| `/api/stripe/portal` | POST | Open customer portal |
| `/api/stripe/webhook` | POST | Handle Stripe events |

### Other

| Route | Method | Description |
|-------|--------|-------------|
| `/api/credits/balance` | GET | Get credit balance |
| `/api/credits/transactions` | GET | Get transaction history |
| `/api/brand-kits` | GET/POST | List/create brand kits |
| `/api/brand-kits/[id]` | PUT/DELETE | Update/delete brand kit |
| `/api/assets` | GET | List assets (with filters) |
| `/api/assets/[id]` | GET/DELETE | Get/delete asset |
| `/api/upload` | POST | Upload files |

---

## AI Model Router

The AI router (`lib/ai/router.ts`) provides:

- **Multi-model support** — Gemini, GPT, Flux
- **Automatic fallback** — If Gemini fails, tries GPT, then Flux
- **Retry logic** — 3 attempts per model with exponential backoff
- **Mock mode** — Returns placeholder responses when API keys are not set
- **Fallback notification** — Returns `usedFallback: true` so the UI can notify the user

```
User selects Gemini
    → Try Gemini (3 retries)
    → If fails → Try GPT (3 retries)
    → If fails → Try Flux (3 retries)
    → If all fail → Return error
```

---

## Credit System

### How It Works

1. User initiates a generation
2. Server checks balance via `checkCredits()`
3. AI generates the content
4. Credits are atomically deducted via `deduct_credits()` PostgreSQL RPC
5. Transaction is logged in `credit_transactions`
6. UI updates via Zustand store

### Atomic Deduction

The `deduct_credits()` function uses `SELECT FOR UPDATE` to lock the user's row during deduction, preventing race conditions in concurrent requests.

### Monthly Reset

- Free/Starter: Credits reset to plan amount (no carryover)
- Pro+: 20% of unused credits carry over (max 200)
- Top-up credits don't expire for 12 months

---

## Internationalization (i18n)

- **Arabic-first** — Default locale is `ar`
- **URL-based** — `/ar/dashboard`, `/en/dashboard`
- **RTL support** — Logical CSS properties (`ps-4` instead of `pl-4`)
- **Fonts** — Cairo (headings) + Tajawal (body) for Arabic, Inter for English
- **Translation files** — `messages/ar.json`, `messages/en.json`

---

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Hero + Features + Studios + Pricing + FAQ |
| Login | `/login` | Email + Google OAuth |
| Signup | `/signup` | Registration + terms |
| Dashboard | `/dashboard` | Quick actions + credits widget |
| Creator | `/creator` | Image generation studio |
| Photoshoot | `/photoshoot` | Product photography studio |
| Campaign | `/campaign` | Campaign planner studio |
| Plan | `/plan` | Marketing plan studio |
| Storyboard | `/storyboard` | Video storyboard studio |
| Analysis | `/analysis` | Marketing analysis studio |
| Voice Over | `/voiceover` | Voice generation studio |
| Edit | `/edit` | Image editing studio |
| Prompt Builder | `/prompt-builder` | Prompt helper (free) |
| Brand Kit | `/brand-kit` | Brand identity CRUD |
| Assets | `/assets` | Generated files gallery |
| Projects | `/projects` | Project organization |
| Billing | `/billing` | Plans + top-ups + transactions |
| Team | `/team` | Team management (UI) |
| Settings | `/settings` | User settings |
| Onboarding | `/onboarding` | 4-step onboarding flow |

---

## Deployment

### Vercel

```bash
# Deploy to Vercel
vercel --prod

# Set environment variables via Vercel Dashboard
```

### Pre-deployment Checklist

- [ ] All environment variables set in Vercel
- [ ] Supabase project created with migrations applied
- [ ] RLS policies enabled on all tables
- [ ] Stripe products/prices created with correct Price IDs
- [ ] Stripe webhook URL configured (`/api/stripe/webhook`)
- [ ] `npm run build` passes with zero errors
- [ ] AI API keys configured (or mock mode accepted)

---

## Development Notes

### Conventions

- **Server Components** by default — `'use client'` only when needed
- **Zod validation** on all API inputs
- **TypeScript strict** — zero `any` types
- **RTL-first CSS** — `ps/pe/ms/me/start/end` instead of `pl/pr/ml/mr/left/right`
- **No inline styles** — Tailwind utilities only
- **shadcn/ui** components in `components/ui/` — extend via wrapping, don't modify

### File Naming

- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts` (prefix: `use`)
- Utils/libs: `camelCase.ts`
- API routes: `route.ts`

---

## License

Proprietary. All rights reserved.
