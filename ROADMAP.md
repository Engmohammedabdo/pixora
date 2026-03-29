# PyraSuite — Feature Roadmap & UX Enhancement Plan

> Generated: 2026-03-29 | Based on full codebase analysis + UX research
> Current status: 149 files, 25 pages, 21 API routes, 13 migrations — LIVE

---

## Part 1: Current Gaps Analysis

### A. UX Pain Points (what frustrates users NOW)

| # | Issue | Severity | Description |
|---|-------|----------|-------------|
| U1 | No Toast Notifications | CRITICAL | Zero success/error feedback. User clicks "Generate" and gets no confirmation. Download, delete, copy — all silent. |
| U2 | No Generation Progress | HIGH | Just a skeleton + "جاري التوليد". No step indicators, no ETA, no "Step 2/3: Generating..." |
| U3 | No Micro-interactions | MEDIUM | No button press animation, no card lift on hover, no icon spin during loading |
| U4 | Mobile UX Gaps | MEDIUM | No bottom nav, studio panels stack vertically with no swipe, asset grid too dense |
| U5 | No Confirmation Dialogs | MEDIUM | Batch delete assets with no "Are you sure?" (brand-kit fixed, assets not) |
| U6 | Poor Empty States | MEDIUM | Dashboard "no generations" is just text — no CTA to start generating |
| U7 | Loading Inconsistencies | LOW | Login shows "..." hardcoded, some routes show skeleton, others nothing |

### B. Missing SaaS Features

| # | Feature | Priority | Description |
|---|---------|----------|-------------|
| S1 | Email Notifications | CRITICAL | No welcome email, no low credit warning, no invoice receipt, no security alerts |
| S2 | Dashboard Analytics | HIGH | No usage charts, no studio breakdown, no credits/day graph |
| S3 | Activity Feed | HIGH | Dashboard shows hardcoded "no generations" — need live recent activity |
| S4 | Search Functionality | MEDIUM | No search across generations/assets by prompt text |
| S5 | Favorites / Bookmarking | MEDIUM | No way to favorite images or save prompts |
| S6 | User Profile Edit | MEDIUM | Can't change name, upload avatar, set preferences |
| S7 | Annual Billing | MEDIUM | Only monthly — missing 18% annual discount |
| S8 | Referral Program | MEDIUM | No "invite friend, earn credits" |
| S9 | Collaboration Features | MEDIUM | No comments on generations, no approval workflow |
| S10 | Credit Usage Breakdown | MEDIUM | No per-studio credit analytics |

### C. AI Experience Gaps

| # | Gap | Priority | Description |
|---|-----|----------|-------------|
| A1 | No Prompt Suggestions | HIGH | Empty textarea with no help — need clickable suggestion chips |
| A2 | No Prompt Templates Library | HIGH | No categorized templates (Food, Fashion, Real Estate...) |
| A3 | No Model Comparison | MEDIUM | Can't compare Gemini vs GPT vs Flux side-by-side |
| A4 | No "Surprise Me" | MEDIUM | No random generation for exploring |
| A5 | No Prompt Enhancement | MEDIUM | No "improve my prompt" button in Creator |
| A6 | No Quality Rating | MEDIUM | No thumbs up/down on outputs |
| A7 | No Sample Gallery | MEDIUM | No before/after examples on studio pages |

### D. Monetization Gaps

| # | Gap | Priority | Description |
|---|-----|----------|-------------|
| M1 | No Trial Period | HIGH | No "7-day Pro trial" |
| M2 | No Annual Billing | MEDIUM | Only monthly pricing |
| M3 | No Auto Top-up | MEDIUM | No "auto buy credits when < 10" |
| M4 | No Referral System | MEDIUM | Missing viral growth loop |
| M5 | No Value Translation | MEDIUM | "600 credits" means nothing — need "= ~50 campaigns" |

### E. Trust & Social Proof

| # | Gap | Priority | Description |
|---|-----|----------|-------------|
| T1 | No Testimonials | HIGH | Landing page has zero social proof |
| T2 | No Live Demo | HIGH | Must signup to see any output |
| T3 | No Showcase Gallery | MEDIUM | No "made with PyraSuite" examples |
| T4 | No Social Sharing | MEDIUM | No share buttons on generated content |
| T5 | No Usage Stats | LOW | No "10,000+ generations" counter |

---

## Part 2: Feature Roadmap (Prioritized Phases)

### Phase A: "WOW Factor" — Quick Wins (1-2 weeks)
> Goal: Make users feel the app is premium in the first 60 seconds

| # | Feature | Complexity | Impact | Files |
|---|---------|-----------|--------|-------|
| A1 | **Toast Notification System** | S | HIGH | New `hooks/useToast.ts`, wire into all studio pages |
| A2 | **Multi-Stage Generation Progress** | M | HIGH | New `components/shared/GenerationProgress.tsx` — "Step 1/3: Analyzing..." |
| A3 | **Image Reveal Animation** | S | HIGH | `CreatorPreview.tsx` — blur(20px) → blur(0) with framer-motion |
| A4 | **Confetti on First Generation** | S | HIGH | canvas-confetti on first-ever successful generation |
| A5 | **Page Transitions** | M | HIGH | AnimatePresence wrapper in dashboard layout |
| A6 | **Button Click Feedback** | S | MEDIUM | `whileTap={{ scale: 0.97 }}` on Button component |
| A7 | **Staggered Card Entrance** | S | MEDIUM | Framer-motion stagger on dashboard + landing grids |
| A8 | **Smooth Credit Number Animation** | S | MEDIUM | New `AnimatedNumber.tsx` — count up/down on balance change |
| A9 | **"Surprise Me" Random Generation** | S | HIGH | Dice button in CreatorForm — random template + style |
| A10 | **Smart Defaults from Brand Kit** | S | HIGH | Auto-enable brand kit in all forms when one exists |

### Phase B: "Core Experience" — Major Features (2-4 weeks)
> Goal: Make the platform feel like a mature, trustworthy SaaS

| # | Feature | Complexity | Impact | Description |
|---|---------|-----------|--------|-------------|
| B1 | **Command Palette (Cmd+K)** | M | HIGH | Search studios, navigate, find generations. Radix Dialog + fuzzy search |
| B2 | **Recent Activity Timeline** | M | HIGH | Live dashboard feed from generations table |
| B3 | **Prompt Templates Library** | M | HIGH | Categorized templates (Food, Fashion, Real Estate, Healthcare...) |
| B4 | **Prompt History + Favorites** | M | HIGH | Save, star, reuse prompts. New `saved_prompts` table |
| B5 | **Bottom Navigation (Mobile)** | M | HIGH | 5-item bottom nav replacing sidebar on mobile |
| B6 | **Social Share Buttons** | M | HIGH | Twitter, LinkedIn, WhatsApp share on all outputs |
| B7 | **WhatsApp Quick Share** | S | HIGH | Prominent green button — critical for Arab market |
| B8 | **Interactive Landing Demo** | M | HIGH | "Try it now" on landing — generates mock without signup |
| B9 | **Dashboard Usage Stats** | M | MEDIUM | Credits/studio chart, daily usage graph |
| B10 | **Collapsible Sidebar** | S | MEDIUM | Icon-only mode at 64px width (already have state in store) |
| B11 | **Smart Prompt Suggestions** | M | HIGH | Suggestion chips below textarea based on brand/season |
| B12 | **Keyboard Shortcuts** | M | MEDIUM | G+C=Creator, G+P=Photoshoot, ?=help modal |

### Phase C: "Retention Engine" — Gamification & Growth (4-6 weeks)
> Goal: Make users come back daily and invite friends

| # | Feature | Complexity | Impact | Description |
|---|---------|-----------|--------|-------------|
| C1 | **Daily Login Bonus** | M | HIGH | 1-3 bonus credits/day. Animated coin collection modal |
| C2 | **Achievement Badges** | L | HIGH | 15-20 badges: "First Gen", "Campaign Master", "Night Owl", "Explorer" |
| C3 | **Usage Streak Counter** | M | MEDIUM | Flame icon + streak in TopBar. 7-day = 5 credits, 30-day = 25 credits |
| C4 | **Referral System** | L | HIGH | Unique referral code, both users get 25 credits. Dashboard page |
| C5 | **Level Progression** | M | MEDIUM | Beginner → Creator → Pro → Master based on total generations |
| C6 | **Weekly Challenge** | M | MEDIUM | "Create a Ramadan campaign, earn 10 credits" |
| C7 | **Profile Completion Bar** | S | MEDIUM | Persistent checklist: avatar, brand kit, first gen, billing |
| C8 | **Persona-Based Onboarding** | M | HIGH | 3 personas (Marketer/Freelancer/Owner) auto-configure dashboard |

### Phase D: "Premium Features" — Differentiation (6-8 weeks)
> Goal: Features that no competitor has

| # | Feature | Complexity | Impact | Description |
|---|---------|-----------|--------|-------------|
| D1 | **Side-by-Side Model Comparison** | L | MEDIUM | Same prompt across Gemini/GPT/Flux in 3-column grid |
| D2 | **Community Prompts Gallery** | L | MEDIUM | Users publish prompts, others can use them |
| D3 | **Public Portfolio Page** | L | MEDIUM | `/portfolio/[username]` showing selected generations |
| D4 | **Prompt Enhancement** | M | HIGH | "Improve my prompt" button using GPT inline |
| D5 | **PWA Support** | M | MEDIUM | manifest.json + service worker + "Add to Home Screen" |
| D6 | **Before/After Slider (Edit)** | M | MEDIUM | Draggable comparison slider in Edit studio |
| D7 | **Output Quality Rating** | S | MEDIUM | Thumbs up/down on each generation |
| D8 | **Email Notification System** | L | HIGH | SendGrid/Resend integration for all transactional emails |
| D9 | **Annual Billing Toggle** | S | MEDIUM | 18% discount on yearly plans |
| D10 | **Auto Top-up** | M | MEDIUM | "Auto-buy 50 credits when balance < 10" |

---

## Part 3: Database Extensions Needed

```sql
-- Gamification
ALTER TABLE profiles ADD COLUMN persona TEXT; -- marketer/freelancer/owner
ALTER TABLE profiles ADD COLUMN last_login_date TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN current_streak INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN longest_streak INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN referral_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN sound_enabled BOOLEAN DEFAULT true;

-- Achievements
CREATE TABLE achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- first_gen, campaign_master, explorer, etc.
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, type)
);

-- Saved Prompts
CREATE TABLE saved_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  studio TEXT NOT NULL,
  is_favorite BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prompt Templates (admin-managed)
CREATE TABLE prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL, -- food, fashion, real_estate, healthcare
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  studio TEXT NOT NULL,
  preview_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Referrals
CREATE TABLE referral_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES profiles(id),
  referee_id UUID REFERENCES profiles(id),
  credits_awarded INTEGER NOT NULL DEFAULT 25,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quality Ratings
ALTER TABLE generations ADD COLUMN user_rating INTEGER; -- 1=thumbs down, 5=thumbs up
```

---

## Part 4: New NPM Dependencies Needed

| Package | Purpose | Size |
|---------|---------|------|
| `sonner` | Toast notifications (best for Next.js) | 5KB |
| `canvas-confetti` | Confetti celebration | 3KB |
| `cmdk` | Command palette (Cmd+K) | 8KB |
| `lottie-react` | Animated illustrations | 15KB |
| `recharts` | Usage charts on dashboard | 45KB |

---

## Part 5: Implementation Priority Summary

```
Week 1-2:  Phase A (Quick Wins)     → 10 features, instant WOW
Week 3-6:  Phase B (Core)           → 12 features, mature SaaS
Week 7-10: Phase C (Retention)      → 8 features, daily engagement
Week 11+:  Phase D (Premium)        → 10 features, market differentiation
```

### Top 10 Highest ROI Features:

1. **Toast Notifications** (S/HIGH) — literally zero feedback right now
2. **Generation Progress Indicator** (M/HIGH) — skeleton feels broken
3. **Prompt Templates Library** (M/HIGH) — removes "blank page" problem
4. **WhatsApp Share** (S/HIGH) — viral loop for Arab market
5. **Daily Login Bonus** (M/HIGH) — immediate retention boost
6. **Confetti + Image Reveal** (S/HIGH) — emotional dopamine hit
7. **Command Palette** (M/HIGH) — power user magnet
8. **Referral System** (L/HIGH) — organic growth engine
9. **Interactive Landing Demo** (M/HIGH) — conversion doubler
10. **Achievement Badges** (L/HIGH) — long-term engagement
