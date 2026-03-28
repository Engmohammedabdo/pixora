# Phase 1: Foundation — Tasks

> **Goal:** قاعدة صلبة — Auth + DB + Layout + Credits
> **Duration:** ~2 weeks
> **Demo:** Login → Dashboard → Brand Kit → Credits visible

---

## 1. Project Setup

- [ ] **1.1** `npx create-next-app@latest pixora --typescript --tailwind --app --src-dir=false`
- [ ] **1.2** Install dependencies:
  ```bash
  npm install @supabase/supabase-js @supabase/ssr
  npm install zustand @tanstack/react-query
  npm install next-intl
  npm install stripe @stripe/stripe-js
  npm install zod
  npm install framer-motion
  npm install lucide-react
  npm install class-variance-authority clsx tailwind-merge
  ```
- [ ] **1.3** Setup shadcn/ui: `npx shadcn@latest init`
- [ ] **1.4** Install shadcn components:
  ```bash
  npx shadcn@latest add button input label card dialog sheet dropdown-menu avatar badge progress toast separator skeleton
  ```
- [ ] **1.5** Configure `tsconfig.json`:
  - `"strict": true`
  - Path alias: `"@/*": ["./*"]`
- [ ] **1.6** Configure Tailwind:
  - Add Cairo + Tajawal fonts
  - Add CSS variables للألوان (Indigo Frost scheme)
  - RTL utilities
- [ ] **1.7** Setup `.env.local` من `.env.local.example`
- [ ] **1.8** Setup `.gitignore` (includes `.env.local`)

**Acceptance Criteria:**
- `npm run dev` يشتغل بدون errors
- TypeScript strict mode لا errors
- Tailwind CSS شغال مع custom colors

---

## 2. Supabase Setup

- [ ] **2.1** Create Supabase project
- [ ] **2.2** Enable Google OAuth في Supabase Dashboard
- [ ] **2.3** Create migrations:

  **Migration 001 — profiles:**
  ```sql
  CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    avatar_url TEXT,
    locale TEXT DEFAULT 'ar',
    plan_id TEXT DEFAULT 'free',
    credits_balance INTEGER DEFAULT 25,
    credits_reset_date TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
  CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
  
  -- Auto-create profile on signup
  CREATE OR REPLACE FUNCTION handle_new_user()
  RETURNS trigger AS $$
  BEGIN
    INSERT INTO profiles (id, email, name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
  ```

  **Migration 002 — brand_kits:**
  ```sql
  CREATE TABLE brand_kits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#6366F1',
    secondary_color TEXT DEFAULT '#06B6D4',
    accent_color TEXT DEFAULT '#F59E0B',
    font_primary TEXT DEFAULT 'Cairo',
    font_secondary TEXT DEFAULT 'Tajawal',
    brand_voice TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users manage own brand kits" ON brand_kits FOR ALL USING (auth.uid() = user_id);
  ```

  **Migration 003 — generations + assets:**
  ```sql
  CREATE TABLE generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) NOT NULL,
    studio TEXT NOT NULL,
    model TEXT NOT NULL,
    input JSONB NOT NULL,
    output JSONB,
    credits_used INTEGER NOT NULL DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users view own generations" ON generations FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "Service role insert" ON generations FOR INSERT WITH CHECK (true);
  
  CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) NOT NULL,
    generation_id UUID REFERENCES generations(id),
    type TEXT NOT NULL CHECK (type IN ('image','video','audio')),
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    format TEXT,
    width INTEGER,
    height INTEGER,
    size_bytes INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users manage own assets" ON assets FOR ALL USING (auth.uid() = user_id);
  ```

  **Migration 004 — credit_transactions:**
  ```sql
  CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('subscription','topup','usage','refund','reset')),
    description TEXT,
    generation_id UUID REFERENCES generations(id),
    stripe_payment_intent_id TEXT,
    balance_after INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users view own transactions" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);
  ```

- [ ] **2.4** Apply migrations: `supabase db push`
- [ ] **2.5** Create Storage buckets:
  - `brand-kits` (private) — logos
  - `generations` (private) — generated images
  - `uploads` (private) — user uploads
- [ ] **2.6** Generate TypeScript types: `supabase gen types typescript --local > lib/supabase/types.ts`

**Acceptance Criteria:**
- جميع الجداول موجودة في Supabase
- RLS enabled على كل جدول
- Storage buckets موجودة
- TypeScript types generated

---

## 3. Authentication

- [ ] **3.1** Create `lib/supabase/server.ts` (server client)
- [ ] **3.2** Create `lib/supabase/client.ts` (browser client)
- [ ] **3.3** Create `middleware.ts`:
  - Refresh session
  - Redirect `/` → `/ar/dashboard` if logged in
  - Redirect protected routes → `/ar/login` if not logged in
  - Locale detection
- [ ] **3.4** Create `app/(auth)/login/page.tsx`:
  - Email + Password form
  - Google OAuth button
  - "Don't have account" link
  - RTL layout
- [ ] **3.5** Create `app/(auth)/signup/page.tsx`:
  - Name + Email + Password
  - Google OAuth
  - Terms checkbox
- [ ] **3.6** Create `app/(auth)/callback/route.ts` — OAuth callback
- [ ] **3.7** Create `hooks/useUser.ts` — current user + profile
- [ ] **3.8** Auth state في Zustand store

**Acceptance Criteria:**
- تسجيل بالـ email يشتغل
- تسجيل بـ Google يشتغل
- بعد التسجيل → redirect للـ dashboard
- لو مش مسجل → redirect للـ login
- Profile تُنشأ تلقائياً في قاعدة البيانات

---

## 4. Dashboard Layout

- [ ] **4.1** Create `app/(dashboard)/layout.tsx`:
  - Sidebar + TopBar + main content
  - RTL direction
  - Mobile responsive (drawer على الجوال)
- [ ] **4.2** Create `components/layout/Sidebar.tsx`:
  - Navigation items مع icons
  - Active state highlighting
  - Collapsible على الشاشات الصغيرة
  - Credits balance في الأسفل
- [ ] **4.3** Create `components/layout/TopBar.tsx`:
  - Logo
  - Credits widget (balance + add button)
  - Notification bell
  - User avatar + dropdown (profile, settings, logout)
- [ ] **4.4** Create `components/layout/CreditsWidget.tsx`:
  - رصيد الكريدت
  - Progress bar (used/total)
  - "Add Credits" button
  - Warning state (< 20% remaining)
- [ ] **4.5** Create `components/layout/StudioLayout.tsx`:
  - Input panel (left 40% in LTR / right in RTL)
  - Preview panel (right 60% / left in RTL)
  - History strip in bottom

**Acceptance Criteria:**
- Sidebar يظهر في كل صفحة الـ dashboard
- Credits تظهر وتتحدث realtime
- Mobile: sidebar تنفتح كـ drawer
- RTL layout صح (Arabic-first)

---

## 5. Credits System (Core Logic)

- [ ] **5.1** Create `lib/credits/costs.ts`:
  ```typescript
  export const CREDIT_COSTS = {
    image: { '1080p': 1, '2K': 2, '4K': 4 },
    campaign: 12,
    photoshoot: 8,
    storyboard: 14,
    analysis: 3,
    plan: 5,
    voiceover: 1,
    edit: 1,
    prompt: 0,
    video: 10,
  } as const;
  ```
- [ ] **5.2** Create `lib/credits/check.ts` — check if user has enough
- [ ] **5.3** Create `lib/credits/deduct.ts` — deduct + log transaction (atomic)
- [ ] **5.4** Create `hooks/useCredits.ts` — balance, refetch, optimistic update
- [ ] **5.5** Create `app/api/credits/balance/route.ts`
- [ ] **5.6** Create `app/api/credits/transactions/route.ts`
- [ ] **5.7** Create `components/shared/CreditCost.tsx` — badge يعرض تكلفة العملية

**Acceptance Criteria:**
- `checkAndDeductCredits` atomic (لا race condition)
- لو كريدت ناقص → error واضح مع المطلوب والموجود
- كل deduction تُسجّل في `credit_transactions`
- Balance يتحدث فوراً في الـ UI

---

## 6. Brand Kit

- [ ] **6.1** Create `app/(dashboard)/brand-kit/page.tsx`
- [ ] **6.2** Create `components/brand-kit/BrandKitForm.tsx`
- [ ] **6.3** Create `components/brand-kit/ColorPicker.tsx`
- [ ] **6.4** Create `components/brand-kit/LogoUpload.tsx`
- [ ] **6.5** Create `app/api/brand-kits/route.ts` (GET + POST)
- [ ] **6.6** Create `app/api/brand-kits/[id]/route.ts` (PUT + DELETE)
- [ ] **6.7** Create `hooks/useBrandKit.ts` — active brand kit store
- [ ] **6.8** Brand Kit selector في الـ Sidebar (dropdown أو switcher)

**Acceptance Criteria:**
- إضافة brand kit بالاسم والألوان والـ logo
- تعيين brand kit كـ default
- الـ active brand kit يظهر في الـ sidebar
- الصور المرفوعة تُخزن في Supabase Storage

---

## 7. i18n Setup

- [ ] **7.1** Configure `next-intl` في `next.config.ts`
- [ ] **7.2** Create `messages/ar.json` — all Arabic strings
- [ ] **7.3** Create `messages/en.json` — English fallback
- [ ] **7.4** Language switcher في الـ TopBar
- [ ] **7.5** RTL/LTR يتغير حسب اللغة

**Acceptance Criteria:**
- الواجهة عربية افتراضياً
- Language switcher يغير اللغة والاتجاه
- لا hardcoded strings في الـ components
