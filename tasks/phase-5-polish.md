# Phase 5: Polish & Launch — Tasks

> **Goal:** Production-ready — Analytics + Teams + Export + Dark Mode + Launch
> **Duration:** ~2 weeks
> **Demo:** Full product — onboarding → brand kit → campaign → export → share

---

## Prerequisites
- [ ] Phase 4 مكتمل
- [ ] All studios working
- [ ] Stripe live mode configured

---

## 1. Analytics & Monitoring

- [ ] **1.1** Setup PostHog:
  ```bash
  npm install posthog-js posthog-node
  ```
  
- [ ] **1.2** Create `lib/analytics/posthog.ts`:
  ```typescript
  import PostHog from 'posthog-js';
  export function track(event: string, properties?: Record<string, unknown>) {
    PostHog.capture(event, properties);
  }
  ```

- [ ] **1.3** Track key events:
  ```typescript
  // Signup
  track('user_signed_up', { method: 'email' | 'google' });
  
  // Generation
  track('generation_completed', {
    studio,
    model,
    resolution,
    credits_used,
    plan,
  });
  
  // Upgrade
  track('plan_upgraded', { from_plan, to_plan, revenue });
  
  // Top-up
  track('credits_purchased', { pack, credits, revenue });
  
  // Export
  track('assets_exported', { format, count });
  ```

- [ ] **1.4** Setup Sentry:
  ```bash
  npm install @sentry/nextjs
  npx @sentry/wizard@latest -i nextjs
  ```

- [ ] **1.5** Error boundaries في كل studio
- [ ] **1.6** Vercel Analytics: `npm install @vercel/analytics`
- [ ] **1.7** Create internal analytics dashboard (optional):
  - `/admin/analytics` — Supabase queries
  - MAU, credits used, revenue, top studios

**Acceptance Criteria:**
- كل generation يُسجّل في PostHog
- Errors يذهبون لـ Sentry مع context
- Core Web Vitals Green في Vercel

---

## 2. Team Collaboration

- [ ] **2.1** Create Teams migrations:
  ```sql
  CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES profiles(id) NOT NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    plan_id TEXT DEFAULT 'business',
    credits_balance INTEGER DEFAULT 1500,
    max_members INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  
  CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    invited_email TEXT,
    invite_token TEXT,
    joined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(team_id, user_id)
  );
  ```

- [ ] **2.2** Create `app/(dashboard)/team/page.tsx`:
  - Current members list
  - Invite by email
  - Role management (admin can invite)
  - Remove member
  - Credits usage per member (Pro feature)

- [ ] **2.3** Create `app/api/teams/route.ts`
- [ ] **2.4** Create `app/api/teams/[id]/invite/route.ts`:
  - Send invite email
  - Generate secure token
  
- [ ] **2.5** Create `app/(auth)/accept-invite/page.tsx`:
  - Accept invite link
  - Signup if new user
  - Join team

- [ ] **2.6** Team credits pool:
  - Business/Agency: shared credit pool
  - Credits deducted from team pool, not individual
  - Admin sees team-wide usage

- [ ] **2.7** Team context في الـ Studio:
  - Selector: Personal / Team
  - Generations can be tagged to team

**Acceptance Criteria:**
- Owner يقدر يدعو members بالـ email
- Team members يشتركون بنفس الـ credit pool
- Team generations تظهر لكل الأعضاء
- Max members حسب الـ plan

---

## 3. Advanced Export

- [ ] **3.1** Create `components/shared/ExportMenu.tsx`:
  - Single export: PNG / JPG / WebP / PDF
  - Quality slider (80-100%)
  - Size options

- [ ] **3.2** Create `app/api/assets/export/route.ts`:
  - Batch: multiple asset IDs
  - Format: PNG / JPG / PDF / ZIP
  - ZIP: all selected assets
  - PDF: assets in a document layout

- [ ] **3.3** Campaign Export:
  - Export full campaign as ZIP (9 images + captions .txt)
  - Export as PDF deck (presentation format)
  - Export captions only (.txt or .csv)

- [ ] **3.4** Storyboard Export:
  - PDF with proper storyboard layout
  - Scene images + descriptions + dialogue

- [ ] **3.5** Marketing Analysis Export:
  - Professional PDF report
  - Cover page + sections
  - Charts/visuals للـ SWOT

**Acceptance Criteria:**
- Single image: PNG/JPG download
- Campaign: ZIP with all assets + captions
- PDF exports يظهرون احترافيين
- Batch export < 10 ثواني لـ 9 images

---

## 4. Dark Mode

- [ ] **4.1** `ThemeProvider` مع `next-themes`
- [ ] **4.2** Theme toggle في الـ TopBar
- [ ] **4.3** Dark mode CSS variables في `globals.css`
- [ ] **4.4** Test كل component في dark mode
- [ ] **4.5** System preference detection (auto)
- [ ] **4.6** Persist preference في localStorage

**Acceptance Criteria:**
- Dark mode يشتغل على كل الصفحات
- لا flash of wrong theme
- System preference يُطبّق تلقائياً

---

## 5. Onboarding Flow

- [ ] **5.1** Create `app/(dashboard)/onboarding/page.tsx`:
  - Step 1: Welcome + product intro (30 ثانية video أو animated steps)
  - Step 2: Create first Brand Kit
  - Step 3: Choose first studio (Creator recommended)
  - Step 4: Generate first image (free — no credits deducted)
  - Step 5: Plan selector (optional upgrade)

- [ ] **5.2** Onboarding state في profiles:
  ```sql
  ALTER TABLE profiles ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;
  ALTER TABLE profiles ADD COLUMN onboarding_step INTEGER DEFAULT 0;
  ```

- [ ] **5.3** After onboarding → welcome bonus: 5 extra credits

- [ ] **5.4** Skip button (للمستخدمين المتقدمين)

**Acceptance Criteria:**
- New users يرون onboarding تلقائياً
- يمكن skip في أي خطوة
- Completion → 5 bonus credits + dismiss

---

## 6. White-Label (Business+)

- [ ] **6.1** White-label settings في `app/(dashboard)/settings/white-label/page.tsx`:
  - Custom brand name
  - Custom logo
  - Custom primary color
  - Remove "Powered by Pixora" watermark

- [ ] **6.2** Custom domain support (via Vercel subdomain delegation)
- [ ] **6.3** White-label CSS override في exported PDFs/images

**Acceptance Criteria:**
- Business users يخفون Pixora branding
- Custom logo في الـ header

---

## 7. API Access (Agency)

- [ ] **7.1** Create API key management:
  ```sql
  CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL, -- first 8 chars for display
    last_used TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```

- [ ] **7.2** API Key generation UI في Settings
- [ ] **7.3** API authentication middleware:
  ```typescript
  // Check X-API-Key header for /api/v1/* routes
  ```

- [ ] **7.4** Public API docs page: `app/api-docs/page.tsx`
- [ ] **7.5** Rate limiting: 100 req/min per API key

**Acceptance Criteria:**
- Agency users يولّدون API keys
- API key authentication يشتغل
- Rate limiting فعّال

---

## 8. Performance & SEO

- [ ] **8.1** Core Web Vitals optimization:
  - LCP < 2.5s
  - FID < 100ms
  - CLS < 0.1

- [ ] **8.2** Image optimization:
  - WebP conversion لكل generated images
  - Thumbnails 300px للـ gallery
  - Progressive loading

- [ ] **8.3** Code splitting:
  - Dynamic imports لكل studio
  - لا heavy libraries في الـ main bundle

- [ ] **8.4** Landing page (`app/page.tsx`):
  - Hero section
  - Features showcase
  - Pricing table
  - Testimonials (placeholder)
  - CTA: Start Free

- [ ] **8.5** SEO meta tags (Arabic + English)
- [ ] **8.6** Open Graph images

---

## 9. Testing & QA

- [ ] **9.1** Write unit tests للـ critical paths:
  - `lib/credits/deduct.ts`
  - `lib/ai/router.ts`
  - Stripe webhook handlers

- [ ] **9.2** E2E tests (Playwright):
  - Signup → onboarding → generate → download
  - Free → upgrade → credits added
  - Top-up flow

- [ ] **9.3** Manual QA checklist:
  - [ ] All 8 studios work end-to-end
  - [ ] Credits deducted correctly
  - [ ] Stripe live mode tested
  - [ ] RTL layout on all pages
  - [ ] Dark mode on all pages
  - [ ] Mobile responsive
  - [ ] Error states (AI failure, network, insufficient credits)

---

## 10. Launch Checklist

- [ ] **10.1** Environment variables in Vercel (production)
- [ ] **10.2** Stripe live mode keys
- [ ] **10.3** Supabase production project
- [ ] **10.4** Custom domain + SSL
- [ ] **10.5** Email templates (welcome, credits low, invoice)
- [ ] **10.6** Error monitoring live (Sentry)
- [ ] **10.7** Analytics live (PostHog)
- [ ] **10.8** Rate limiting on all AI endpoints
- [ ] **10.9** `robots.txt` and `sitemap.xml`
- [ ] **10.10** Privacy Policy + Terms of Service pages
- [ ] **10.11** Cookie consent banner
- [ ] **10.12** Final performance test (Lighthouse > 90)
- [ ] **10.13** Load test (k6 or Artillery)
- [ ] **10.14** Backup strategy for Supabase DB

**Launch Target Criteria:**
- Lighthouse score > 90 (all categories)
- All E2E tests pass
- Stripe live mode verified with real payment
- Zero TypeScript errors
- Zero ESLint errors
