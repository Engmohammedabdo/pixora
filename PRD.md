# Pixora — Product Requirements Document (PRD)

> **Version:** 1.0 | **Date:** 2026-03-28 | **Status:** Ready for Development

---

## 1. Vision & Mission

### Vision
أن تكون Pixora المنصة العربية الأولى للتسويق بالذكاء الاصطناعي — أداة تحوّل أي فكرة إلى حملة تسويقية احترافية في دقائق.

### Mission
تمكين المسوّقين والعلامات التجارية العربية من إنتاج محتوى تسويقي عالي الجودة بتقنية AI متعددة النماذج، بواجهة عربية أولاً وبنظام تسعير شفاف يناسب كل الأحجام.

### Key Differentiators vs Jenta.pro
| Feature | Pixora | Jenta.pro |
|---------|--------|-----------|
| AI Models | Gemini + GPT-4o + Flux | Gemini فقط |
| Business Model | Credits + Subscriptions | مجاني تماماً |
| Language | Arabic-first (RTL) | English-first |
| Brand Kit | ✅ مخزون دائم | ❌ |
| Team Collaboration | ✅ Multi-user | ❌ Single user |
| Layout | Sidebar + Workspace | Tabs |
| Export | PNG, JPG, PDF, ZIP | محدود |
| White-label | ✅ Business+ | ❌ |

---

## 2. Target Users (Personas)

### Persona 1 — "سارة المسوّقة" 👩‍💼
- **العمر:** 26-35
- **الدور:** Marketing Manager في شركة متوسطة
- **الألم:** تحتاج محتوى يومي، الوكالات غالية، المصمم مشغول
- **الهدف:** تنتج حملات احترافية بنفسها بدون تصميم
- **الخطة:** Starter أو Pro
- **الاستخدام:** Campaign Planner + Creator + Edit

### Persona 2 — "خالد الفريلانسر" 👨‍💻
- **العمر:** 22-30
- **الدور:** Social Media Manager / Freelancer
- **الألم:** يخدم 5-10 عملاء، كل واحد بـ brand مختلف
- **الهدف:** إنتاج ضخم بسرعة لعملاء متعددين
- **الخطة:** Pro أو Business
- **الاستخدام:** Brand Kit + Photoshoot + Campaign + Storyboard

### Persona 3 — "أحمد صاحب العمل" 🏪
- **العمر:** 30-45
- **الدور:** مالك مطعم / متجر / كلينك
- **الألم:** ما عنده فريق تسويق، يعتمد على إنستغرام
- **الهدف:** حملات سريعة لمنتجاته ومناسباته
- **الخطة:** Free → Starter
- **الاستخدام:** Creator + Campaign Planner + Voice Over

---

## 3. Core Features

### 3.1 Brand Kit 🗂️
- رفع لوقو (SVG, PNG)
- اختيار ألوان العلامة (primary, secondary, accent)
- رفع fonts
- Brand guidelines نصية
- الـ Kit يُستخدم تلقائياً في كل استوديو
- Multi-brand support (للـ Business plan)

### 3.2 Studio: Creator 🎨
**الوظيفة:** توليد صور تسويقية احترافية من نص أو صورة مرجعية

**المدخلات:**
- Product image (اختياري)
- Brand Kit تلقائي
- Prompt نصي أو اختيار من templates
- AI Model: Gemini Flash Image / GPT-Image-1 / Flux

**المخرجات:**
- صورة واحدة أو 4 variations
- تكلفة: 1 credit (1080p) | 2 credits (2K) | 4 credits (4K)

**Prompt System:**
```
You are a professional commercial photographer. Create: {user_prompt}
Brand: {brand_name}. Colors: {brand_colors}.
STRICTLY PRESERVE all original branding elements.
Style: {selected_style}. Resolution: {resolution}.
NO EXTRA text or logos not in the original.
```

### 3.3 Studio: Photoshoot 📸
**الوظيفة:** تصوير منتج احترافي في بيئات مختلفة

**المدخلات:**
- صورة المنتج (إلزامي)
- اختيار الـ environment (White Studio, Lifestyle, Outdoor, etc.)
- عدد الـ shots: 1, 3, 6

**المخرجات:**
- 6 صور بزوايا وإضاءات مختلفة
- تكلفة: 8 credits (6 shots)

### 3.4 Studio: Campaign Planner 📋
**الوظيفة:** توليد حملة كاملة من 9 posts

**المدخلات:**
- نبذة عن المنتج/الخدمة
- الجمهور المستهدف
- اللهجة (سعودية، إماراتية، مصرية، خليجية، فصحى)
- Platform (Instagram, TikTok, LinkedIn, Twitter)
- مناسبة (اختياري): رمضان، نيو يير، بلاك فرايدي...

**المخرجات:**
- 9 posts كاملة: visual scenario + caption + TOV hook + schedule
- تكلفة: 12 credits

**System Prompt:**
```
Act as a professional Creative Director specializing in {dialect} market.
Product: {product_description}
Target Market: {target_market}
Platform: {platform}
Occasion: {occasion}

Generate exactly 9 campaign posts. Each post must include:
1. scenario: English visual prompt for image generation (detailed, photographic)
2. caption: In {dialect} dialect, engaging, with emojis, 150-200 chars
3. tov: Hook phrase 5-7 words in {dialect}
4. schedule: Suggested posting day and time
5. hashtags: 10 relevant hashtags

Return as valid JSON array.
```

### 3.5 Studio: Plan 🗺️
**الوظيفة:** خطة تسويقية شهرية/فصلية

**المدخلات:**
- نوع العمل
- الأهداف
- الميزانية الإعلانية
- المدة (30/60/90 يوم)

**المخرجات:**
- خطة مفصّلة: Objectives, Channels, Content Calendar, Budget Allocation, KPIs
- تكلفة: 5 credits

### 3.6 Studio: Storyboard 🎬
**الوظيفة:** ستوري بورد لفيديو تسويقي

**المدخلات:**
- فكرة الفيديو
- المدة (15s, 30s, 60s)
- الأسلوب (Cinematic, UGC, Animation)

**المخرجات:**
- 9 scenes مع: visual description + dialogue + camera angle + duration
- تصميم بصري للـ storyboard
- تكلفة: 14 credits

### 3.7 Studio: Marketing Analysis 📊
**الوظيفة:** تحليل تسويقي شامل للعلامة أو المنتج

**المخرجات:**
- SWOT Analysis
- Buyer Persona (3 personas)
- Competitor Analysis
- USP & Positioning
- GTM Strategy
- Pricing Recommendations
- 30-60-90 Day Roadmap
- KPI Dashboard

**تكلفة:** 3 credits

**System Prompt:**
```
Act as a world-class CMO with 20+ years in {market} market.
Business: {business_name}
Industry: {industry}
Current Stage: {stage}
Market: {target_market}

Provide comprehensive marketing analysis in Arabic:
1. SWOT Analysis (detailed, actionable)
2. 3 Detailed Buyer Personas
3. Top 3 Competitor Analysis
4. Unique Selling Proposition
5. Go-To-Market Strategy
6. Pricing Strategy Recommendations
7. 30-60-90 Day Action Roadmap
8. KPI Dashboard with targets

Format as structured sections with emojis and clear headers.
```

### 3.8 Studio: Voice Over 🎙️
**الوظيفة:** توليد صوت احترافي للإعلانات

**المدخلات:**
- نص الـ voice over
- الصوت (Male/Female/Brand voice)
- اللهجة
- السرعة والنبرة

**المخرجات:**
- ملف MP3
- تكلفة: 1 credit/30 ثانية

### 3.9 Studio: Edit ✏️
**الوظيفة:** تعديل الصور الموجودة بالـ AI

**المدخلات:**
- صورة أصلية
- وصف التعديل
- Mask (اختياري)

**المخرجات:**
- صورة معدّلة
- تكلفة: 1 credit

### 3.10 Studio: Prompt Builder 💡
**الوظيفة:** مساعد لكتابة prompts احترافية

**المدخلات:**
- وصف بسيط بالعربية
- نوع المحتوى المطلوب

**المخرجات:**
- Prompt احترافي بالإنجليزية جاهز للاستخدام
- مجاني (0 credit)

### 3.11 Studio: Video 🎥
**الوظيفة:** توليد فيديو قصير (future)

**المدخلات:**
- نص أو صورة
- مدة (5-15 ثانية)

**المخرجات:**
- MP4
- تكلفة: 10 credits (Phase 5)

---

## 4. Credit System

### Plans
| Plan | Price | Credits/mo | Resolution | Watermark | Teams | Extra |
|------|-------|------------|------------|-----------|-------|-------|
| Free | $0 | 25 | 1080p | ✅ | ❌ | — |
| Starter | $12/mo | 200 | 2K | ❌ | ❌ | — |
| Pro | $29/mo | 600 | 4K | ❌ | ❌ | Priority AI |
| Business | $59/mo | 1,500 | 4K | ❌ | ✅ 5 users | White-label |
| Agency | $149/mo | 5,000 | 4K | ❌ | ✅ 20 users | API Access |

### Credit Top-ups (One-time)
| Pack | Credits | Price |
|------|---------|-------|
| Small | 50 | $4.99 |
| Medium | 150 | $12.99 |
| Large | 500 | $34.99 |
| XL | 1,000 | $59.99 |

### Credit Costs per Action
| Action | Credits |
|--------|---------|
| Image 1080p | 1 |
| Image 2K | 2 |
| Image 4K | 4 |
| Campaign (9 posts) | 12 |
| Photoshoot (6 shots) | 8 |
| Storyboard (9 scenes) | 14 |
| Marketing Analysis | 3 |
| Marketing Plan | 5 |
| Voice Over (30s) | 1 |
| Edit | 1 |
| Prompt Builder | 0 |
| Video (15s) | 10 |

### Credit Rules
- Credits لا تُجمع بين الأشهر (Free/Starter)
- Pro+ يحتفظ بـ 20% من الكريدت غير المستخدم للشهر القادم (max 200)
- Top-up credits لا تنتهي (لمدة 12 شهر)
- لو الكريدت ناقص → يعرض رسالة واضحة مع زر top-up

---

## 5. Tech Stack

### Frontend
- **Next.js 15** (App Router) — SSR/SSG + API Routes + Streaming
- **TypeScript** — Type safety كاملة
- **Tailwind CSS v4** — Utility-first styling
- **shadcn/ui** — Component library قابلة للتخصيص
- **Framer Motion** — Animations
- **Zustand** — Global state (credits, user, brand kit)
- **React Query (TanStack)** — Server state + caching + optimistic updates
- **next-intl** — i18n (Arabic/English)

### Backend
- **Next.js API Routes** — Backend endpoints
- **Supabase** — Auth + PostgreSQL + Storage + Realtime
- **Stripe** — Subscriptions + One-time payments + Webhooks

### AI APIs
- **Google Gemini** — gemini-2.5-flash-image (images) + gemini-2.5-pro (text)
- **OpenAI** — gpt-image-1 (images) + gpt-4o (text/vision)
- **Replicate** — Flux 1.1 Pro (images)

### Infrastructure
- **Vercel** — Deployment + Edge Functions
- **Supabase** — Database + Storage
- **Cloudflare** — CDN + DDoS protection

---

## 6. Database Schema

### users (managed by Supabase Auth)
```sql
-- Extended profile
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  locale TEXT DEFAULT 'ar',
  plan_id TEXT DEFAULT 'free',
  credits_balance INTEGER DEFAULT 25,
  credits_reset_date TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### brand_kits
```sql
CREATE TABLE brand_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  accent_color TEXT,
  font_primary TEXT,
  font_secondary TEXT,
  brand_voice TEXT, -- brand guidelines
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### projects
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams(id),
  name TEXT NOT NULL,
  brand_kit_id UUID REFERENCES brand_kits(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### generations
```sql
CREATE TABLE generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  project_id UUID REFERENCES projects(id),
  studio TEXT NOT NULL, -- creator, photoshoot, campaign, etc.
  model TEXT NOT NULL, -- gemini, gpt, flux
  input JSONB NOT NULL,
  output JSONB, -- URLs + metadata
  credits_used INTEGER NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### credit_transactions
```sql
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  amount INTEGER NOT NULL, -- positive = add, negative = deduct
  type TEXT NOT NULL, -- subscription, topup, usage, refund
  description TEXT,
  generation_id UUID REFERENCES generations(id),
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### teams
```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  plan_id TEXT,
  credits_balance INTEGER DEFAULT 0,
  max_members INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- owner, admin, member
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  UNIQUE(team_id, user_id)
);
```

### assets
```sql
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  generation_id UUID REFERENCES generations(id),
  type TEXT NOT NULL, -- image, video, audio
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  format TEXT,
  width INTEGER,
  height INTEGER,
  size_bytes INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. API Routes

### Auth
- `POST /api/auth/signup`
- `POST /api/auth/signin`
- `POST /api/auth/signout`
- `GET /api/auth/session`

### Credits
- `GET /api/credits/balance`
- `POST /api/credits/deduct` (internal)
- `GET /api/credits/transactions`

### Brand Kit
- `GET /api/brand-kits`
- `POST /api/brand-kits`
- `PUT /api/brand-kits/:id`
- `DELETE /api/brand-kits/:id`

### Studios
- `POST /api/studios/creator` — image generation
- `POST /api/studios/photoshoot`
- `POST /api/studios/campaign`
- `POST /api/studios/plan`
- `POST /api/studios/storyboard`
- `POST /api/studios/analysis`
- `POST /api/studios/voiceover`
- `POST /api/studios/edit`
- `POST /api/studios/prompt-builder`

### Stripe
- `POST /api/stripe/create-checkout` — subscription
- `POST /api/stripe/create-topup` — one-time credits
- `POST /api/stripe/webhook` — handle events
- `POST /api/stripe/portal` — customer portal

### Assets
- `GET /api/assets`
- `GET /api/assets/:id`
- `DELETE /api/assets/:id`
- `POST /api/assets/export` — batch export

### Teams
- `GET /api/teams`
- `POST /api/teams`
- `PUT /api/teams/:id`
- `POST /api/teams/:id/invite`
- `DELETE /api/teams/:id/members/:userId`

---

## 8. UI/UX Guidelines

### Layout Architecture
```
┌─────────────────────────────────────────────────────┐
│  Top Bar: Logo | Credits Badge | Notifications | Avatar│
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ Sidebar  │         Main Workspace                  │
│ (240px)  │                                         │
│          │  ┌──────────────────────────────────┐  │
│ Navigation│  │     Studio Active Area           │  │
│ Studios  │  │                                  │  │
│ Projects │  │  Input Panel | Preview Panel     │  │
│ Assets   │  │                                  │  │
│ Brand Kit│  └──────────────────────────────────┘  │
│ Settings │                                         │
│          │                                         │
└──────────┴─────────────────────────────────────────┘
```

### Sidebar Navigation
- Home / Dashboard
- ──── Studios ────
  - 🎨 Creator
  - 📸 Photoshoot
  - 📋 Campaign Planner
  - 🗺️ Plan
  - 🎬 Storyboard
  - 📊 Marketing Analysis
  - 🎙️ Voice Over
  - ✏️ Edit
  - 💡 Prompt Builder
  - 🎥 Video *(soon)*
- ──── Workspace ────
  - 📁 Projects
  - 🖼️ My Assets
  - 🗂️ Brand Kit
- ──── Account ────
  - 👥 Team
  - ⚙️ Settings
  - 💳 Billing

### Studio Workspace Layout
- **Left Panel (40%):** Input controls — form fields, dropdowns, file upload
- **Right Panel (60%):** Preview + Generated results
- **Bottom Bar:** History of last 5 generations

### Color Scheme 🎨
**اسم الـ palette:** "Indigo Frost" — حديث، ثقة، إبداع

```css
/* Primary — Deep Indigo */
--color-primary-50: #EEF2FF;
--color-primary-100: #E0E7FF;
--color-primary-500: #6366F1;  /* Main */
--color-primary-600: #4F46E5;  /* Hover */
--color-primary-900: #312E81;

/* Accent — Teal/Cyan */
--color-accent-400: #22D3EE;
--color-accent-500: #06B6D4;

/* Surface */
--color-bg: #F8FAFC;           /* Light background */
--color-surface: #FFFFFF;
--color-surface-2: #F1F5F9;
--color-border: #E2E8F0;

/* Dark Mode */
--color-bg-dark: #0F172A;
--color-surface-dark: #1E293B;
--color-surface-2-dark: #334155;

/* Text */
--color-text-primary: #0F172A;
--color-text-secondary: #475569;
--color-text-muted: #94A3B8;

/* Status */
--color-success: #10B981;
--color-warning: #F59E0B;
--color-error: #EF4444;
```

### Typography
- **Arabic:** Cairo (headings) + Tajawal (body)
- **English:** Inter (all)
- **Font sizes:** 12/14/16/18/24/32/48px
- **Direction:** RTL للعربية، LTR للإنجليزية

### Animation Principles
- Subtle + purposeful (لا مبالغة)
- Loading skeletons بدل spinners
- Optimistic updates
- Page transitions: 200ms fade
- Hover: 150ms ease
- Generation progress: animated progress bar

---

## 9. Security & Auth

### Authentication
- Supabase Auth (Email/Password + Google OAuth + Magic Link)
- JWT tokens (auto-refresh)
- Session persistence (localStorage)
- Rate limiting: 5 failed attempts → 15 min lockout

### Authorization
- Row Level Security (RLS) على كل جدول
- API routes تتحقق من الـ session server-side
- Credits check قبل كل generation
- Webhook signature verification (Stripe)

### Data Security
- صور المستخدمين في Supabase Storage (private buckets)
- Signed URLs للوصول للصور (15 min expiry)
- لا نخزن الـ API keys للـ AI في الـ frontend
- Environment variables فقط للـ API keys

---

## 10. Analytics & Monitoring

### Metrics to Track
- MAU / DAU
- Credits consumed per studio
- Conversion rate (Free → Paid)
- Average credits used before upgrade
- Churn rate
- Revenue per user (ARPU)

### Tools
- **PostHog** — Product analytics + feature flags
- **Sentry** — Error tracking
- **Vercel Analytics** — Core Web Vitals
- **Stripe Dashboard** — Revenue metrics

---

## 11. Success Metrics (KPIs)

### Month 1
- 500 signups
- 50 paying users
- $500 MRR

### Month 3
- 2,000 signups
- 200 paying users
- $3,000 MRR
- <2s generation time (average)

### Month 6
- 5,000 signups
- 500 paying users
- $10,000 MRR
- NPS > 50

### Month 12
- 20,000 signups
- 2,000 paying users
- $40,000 MRR

---

## 12. Competitive Advantages vs Jenta

1. **Multi-model AI** — المستخدم يختار: Gemini للسرعة، GPT للجودة، Flux للإبداع
2. **Sustainable Business** — نظام كريدت واضح، مش "مجاني حتى إشعار آخر"
3. **Brand Kit** — الهوية البصرية محفوظة تلقائياً في كل generation
4. **Arabic RTL** — مصمم للعرب من البداية، مش ترجمة
5. **Team Collaboration** — مناسب للوكالات والفرق
6. **Export متقدم** — ZIP للحملة كاملة، PDF للعروض
7. **White-label** — الوكالات تبيع الخدمة تحت اسمها
8. **API Access** — للمطورين والتكاملات (Agency plan)
