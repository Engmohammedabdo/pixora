# خطة تطوير لوحة التحكم — PyraSuite Admin Upgrade Plan
# Orchestra-Style Implementation Plan

> **Date:** 2026-03-30 | **Version:** 1.0
> **Architecture:** Next.js 15 + Supabase + Recharts + Tailwind
> **Approach:** Orchestra — كل مرحلة تُبنى على السابقة

---

## Architecture Overview

```
المراحل الخمس:

Phase A ─── SaaS Analytics ──────── صفحة /admin/analytics (جديدة)
  │                                  + migration 018 (aggregation tables)
  │                                  + 3 API routes
  │                                  + 5 components
  │
Phase B ─── User Intelligence ───── تحسين /admin/users
  │                                  + migration 019 (user_events)
  │                                  + 2 API routes
  │                                  + 4 components
  │
Phase C ─── Performance Monitor ─── صفحة /admin/health (جديدة)
  │                                  + 2 API routes
  │                                  + 3 components
  │
Phase D ─── Global Search ────────── component + API
  │                                  + command palette
  │
Phase E ─── UX Polish ───────────── trend badges, comparison mode
                                     + keyboard shortcuts
                                     + mobile responsive
```

---

## Phase A: SaaS Analytics Dashboard

> **الهدف:** MRR, Churn, Retention, Conversion — أرقام الأعمال الأساسية
> **الملفات الجديدة:** ~15 ملف

### A.1 — Database Migration

**File:** `supabase/migrations/018_analytics_aggregates.sql`

```sql
-- Daily aggregated metrics (populated by cron or on-demand)
CREATE TABLE IF NOT EXISTS daily_metrics (
  date DATE PRIMARY KEY,
  total_users INTEGER DEFAULT 0,
  new_signups INTEGER DEFAULT 0,
  active_users INTEGER DEFAULT 0,          -- users with >= 1 generation
  paying_users INTEGER DEFAULT 0,          -- plan_id != 'free'
  churned_users INTEGER DEFAULT 0,         -- cancelled subscription today
  mrr_cents INTEGER DEFAULT 0,             -- monthly recurring revenue in cents
  revenue_cents INTEGER DEFAULT 0,         -- actual revenue today (subscriptions + topups)
  total_generations INTEGER DEFAULT 0,
  failed_generations INTEGER DEFAULT 0,
  credits_consumed INTEGER DEFAULT 0,
  credits_purchased INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User events for timeline & engagement tracking
CREATE TABLE IF NOT EXISTS user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,     -- 'signup', 'generation', 'upgrade', 'downgrade', 'cancel', 'login', 'topup'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_events_user ON user_events(user_id, created_at DESC);
CREATE INDEX idx_user_events_type ON user_events(event_type, created_at DESC);
CREATE INDEX idx_daily_metrics_date ON daily_metrics(date DESC);

-- Subscription history for churn tracking
CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,     -- 'subscribe', 'upgrade', 'downgrade', 'cancel', 'renew'
  from_plan TEXT,
  to_plan TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sub_events_user ON subscription_events(user_id, created_at DESC);
CREATE INDEX idx_sub_events_type ON subscription_events(event_type, created_at DESC);
```

### A.2 — Analytics API Routes

**File:** `app/api/admin/analytics/mrr/route.ts`
```
GET /api/admin/analytics/mrr?months=12

Returns:
- current MRR (sum of plan prices for active subscribers)
- MRR trend (last 12 months)
- MRR by plan breakdown
- MRR growth rate (MoM%)
- New MRR (from new subscriptions this month)
- Churned MRR (from cancellations this month)
- Net New MRR

Data source: profiles table (plan_id + stripe_subscription_id) + PLANS config
```

**File:** `app/api/admin/analytics/churn/route.ts`
```
GET /api/admin/analytics/churn?months=6

Returns:
- Monthly churn rate (cancelled / total paying at start of month)
- Churned users list (recent cancellations)
- Churn by plan (which plan loses most users)
- Revenue churn (MRR lost to cancellations)
- Time-to-churn (avg days from signup to cancel)

Data source: subscription_events table + profiles
```

**File:** `app/api/admin/analytics/retention/route.ts`
```
GET /api/admin/analytics/retention?cohorts=6

Returns:
- Cohort retention table (signup month × months active)
- Activity defined as: >= 1 generation in the month
- Each cell = % of cohort still active

Data source: profiles.created_at (cohort) + generations.created_at (activity)
```

**File:** `app/api/admin/analytics/funnel/route.ts`
```
GET /api/admin/analytics/funnel?days=30

Returns:
- Funnel steps: signup → first_generation → second_generation → upgrade
- Count + conversion rate at each step
- Drop-off percentages

Data source: profiles + generations + subscription_events
```

**File:** `app/api/admin/analytics/overview/route.ts`
```
GET /api/admin/analytics/overview

Returns:
- MRR, ARR
- Total paying users, total free users
- Average Revenue Per User (ARPU)
- Estimated LTV (ARPU × avg lifetime months)
- DAU, WAU, MAU
- DAU/MAU ratio (engagement indicator)
- Revenue this month vs last month (% change)
- Signups this month vs last month (% change)

Data source: profiles + generations + credit_transactions
```

### A.3 — Analytics Components

**File:** `components/admin/MRRChart.tsx`
- Area chart showing MRR over time
- Stacked by plan (Starter, Pro, Business, Agency)
- MoM growth indicator
- Hover shows breakdown

**File:** `components/admin/ChurnCard.tsx`
- Churn rate with trend arrow
- Mini sparkline chart
- Churned users count
- Revenue lost badge

**File:** `components/admin/RetentionTable.tsx`
- Cohort retention heatmap table
- Rows = signup month, Columns = month 0, 1, 2...
- Color gradient: green (high retention) → red (low)
- Hover shows exact % and user count

**File:** `components/admin/FunnelChart.tsx`
- Horizontal funnel visualization
- Steps: Signup → Generate → Repeat → Pay
- Conversion % between each step
- Drop-off highlighted in red

**File:** `components/admin/MetricCard.tsx`
- Enhanced KPICard with:
  - Trend arrow (▲ +12% or ▼ -5%)
  - vs. last period comparison
  - Mini sparkline inside the card
  - Color coding: green for growth, red for decline

### A.4 — Analytics Page

**File:** `app/admin/analytics/page.tsx`
```
Layout:
┌──────────────────────────────────────────────────────────┐
│ Analytics                                [30d ▼] [Export] │
│                                                           │
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│ │ MRR  │ │ ARR  │ │Churn │ │ ARPU │ │ LTV  │ │ DAU  │  │
│ │$2.4K │ │$28K  │ │ 4.2% │ │$18.5 │ │ $222 │ │ 145  │  │
│ │▲ +8% │ │▲ +8% │ │▼ -1% │ │▲ +3% │ │▲ +5% │ │▲ +12%│  │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘  │
│                                                           │
│ ┌────────────────────────┐ ┌────────────────────────────┐ │
│ │   MRR Trend (12mo)     │ │    Revenue by Plan         │ │
│ │   [Area chart]         │ │    [Stacked bar]           │ │
│ └────────────────────────┘ └────────────────────────────┘ │
│                                                           │
│ ┌────────────────────────┐ ┌────────────────────────────┐ │
│ │   Conversion Funnel    │ │    Churn Trend (6mo)       │ │
│ │   [Funnel viz]         │ │    [Line chart]            │ │
│ └────────────────────────┘ └────────────────────────────┘ │
│                                                           │
│ ┌──────────────────────────────────────────────────────┐  │
│ │             Retention Cohort Table                    │  │
│ │ ┌───────┬──────┬──────┬──────┬──────┬──────┐        │  │
│ │ │ Cohort│ Mo 0 │ Mo 1 │ Mo 2 │ Mo 3 │ Mo 4 │        │  │
│ │ │ Jan26 │ 100% │  72% │  58% │  45% │  40% │        │  │
│ │ │ Feb26 │ 100% │  68% │  51% │  42% │      │        │  │
│ │ │ Mar26 │ 100% │  75% │  60% │      │      │        │  │
│ │ └───────┴──────┴──────┴──────┴──────┴──────┘        │  │
│ └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### A.5 — Sidebar Update

Add "Analytics" link to AdminSidebar between Dashboard and Users:
```typescript
{ href: '/admin/analytics', label: 'Analytics', icon: TrendingUp },
```

### A.6 — Webhook Integration

Update `app/api/stripe/webhook/route.ts` to log subscription events:
- On `customer.subscription.created` → insert `subscription_events` (subscribe)
- On `customer.subscription.updated` → insert (upgrade/downgrade)
- On `customer.subscription.deleted` → insert (cancel)

---

## Phase B: User Intelligence

> **الهدف:** تصنيف المستخدمين وكشف المعرضين للخطر
> **الملفات الجديدة:** ~10 ملفات

### B.1 — User Segments API

**File:** `app/api/admin/users/segments/route.ts`
```
GET /api/admin/users/segments

Returns user counts per segment:
- power_users: >= 20 generations/month
- active: 5-19 generations/month
- low_activity: 1-4 generations/month
- dormant: 0 generations in last 30 days, signed up > 7 days ago
- at_risk: paying user + activity dropped > 50% vs previous month
- new: signed up < 7 days ago
- vip: business or agency plan
- free_only: free plan, > 30 days old, never upgraded
```

### B.2 — User Timeline API

**File:** `app/api/admin/users/[id]/timeline/route.ts`
```
GET /api/admin/users/[id]/timeline?page=1&limit=50

Returns chronological events:
- Pulls from user_events + generations + credit_transactions + subscription_events
- Unified timeline format: { type, description, metadata, created_at }
```

### B.3 — Engagement Score

**File:** `lib/admin/engagement.ts`
```typescript
Calculate engagement score (0-100) based on:
- Generations frequency (0-30 points)
- Studio diversity (0-15 points) — uses multiple studios
- Brand kit usage (0-10 points)
- Login frequency (0-15 points)
- Credit purchasing (0-15 points)
- Feature adoption (0-15 points) — voiceover, storyboard, etc.
```

### B.4 — Enhanced User Detail Page

Update `app/admin/users/[id]/page.tsx`:
- Add engagement score badge
- Add user segment tag
- Add activity timeline tab
- Add "at-risk" warning banner
- Add user tags (admin-assignable labels)
- Add internal notes section

### B.5 — User Segments Page

**File:** `app/admin/users/segments/page.tsx`
```
Layout:
┌──────────────────────────────────────────────────────────┐
│ User Segments                                             │
│                                                           │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│ │ ⭐ VIP  │ │ 🔥 Power│ │ ⚡ Active│ │ 💤 Dorm │        │
│ │   12    │ │   45    │ │   123   │ │   67    │        │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘        │
│                                                           │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│ │ ⚠️ Risk │ │ 🆕 New  │ │ 🆓 Free │ │ 📊 Total│        │
│ │   23    │ │   34    │ │   89    │ │   345   │        │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘        │
│                                                           │
│ Click segment → filtered user list                       │
└──────────────────────────────────────────────────────────┘
```

### B.6 — Bulk Actions Component

**File:** `components/admin/BulkActions.tsx`
- Checkbox selection on user list
- Action bar appears at bottom: "X users selected"
- Actions: Bulk credit adjust, Bulk plan change, Bulk ban, Export selected

---

## Phase C: Performance Monitor

> **الهدف:** مراقبة صحة Studios و AI Models
> **الملفات الجديدة:** ~8 ملفات

### C.1 — Health API

**File:** `app/api/admin/health/route.ts`
```
GET /api/admin/health

Returns per-studio metrics (last 24h, 7d, 30d):
- Total generations
- Success rate %
- Average response time (from created_at → completed status update)
- Error rate
- Most common error messages
- Credits consumed

Returns per-model metrics (last 24h, 7d, 30d):
- Same as above per model
- Fallback usage rate (how often was this model used as fallback)
- API cost estimate (based on API pricing per call)
```

### C.2 — Error Trends API

**File:** `app/api/admin/health/errors/route.ts`
```
GET /api/admin/health/errors?days=30

Returns:
- Error count by day (for line chart)
- Error breakdown by studio
- Error breakdown by model
- Top 10 recurring error messages with count
- Error rate trend (is it getting better or worse?)
```

### C.3 — Health Dashboard Page

**File:** `app/admin/health/page.tsx`
```
Layout:
┌──────────────────────────────────────────────────────────┐
│ System Health                           [24h] [7d] [30d]  │
│                                                           │
│ ── Overall ──────────────────────────────────────────     │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐             │
│ │ Uptime │ │Success │ │ Errors │ │ Avg RT │             │
│ │ 99.8%  │ │ 97.2% │ │  156   │ │ 3.2s  │             │
│ └────────┘ └────────┘ └────────┘ └────────┘             │
│                                                           │
│ ── Error Trend ──────────────────────────────────────    │
│ [Line chart: errors over time]                           │
│                                                           │
│ ── Studio Health Grid ───────────────────────────────    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│ │ Creator  │ │ Campaign │ │ Photo    │                  │
│ │ 🟢 98.5% │ │ 🟢 96.1% │ │ 🟡 89.3% │                  │
│ │ 2.1s avg │ │ 4.5s avg │ │ 5.8s avg │                  │
│ └──────────┘ └──────────┘ └──────────┘                  │
│                                                           │
│ ── Top Errors ───────────────────────────────────────    │
│ [Table: error message, count, studio, last seen]         │
└──────────────────────────────────────────────────────────┘
```

### C.4 — Health Status Components

**File:** `components/admin/HealthCard.tsx`
- Studio/Model health card
- Status indicator: 🟢 > 95%, 🟡 80-95%, 🔴 < 80%
- Success rate progress bar
- Avg response time
- Trend arrow

**File:** `components/admin/ErrorTrendChart.tsx`
- Line chart of errors over time
- Split by studio (toggle)
- Threshold line at 5% error rate

---

## Phase D: Global Search

> **الهدف:** بحث شامل من أي صفحة في لوحة التحكم
> **الملفات الجديدة:** ~4 ملفات

### D.1 — Search API

**File:** `app/api/admin/search/route.ts`
```
GET /api/admin/search?q=mohammed&limit=10

Searches across:
- profiles (name, email) → returns as "user" results
- generations (id, studio) → returns as "generation" results
- credit_transactions (description) → returns as "transaction" results
- admin_logs (action, details) → returns as "log" results

Response: grouped by type, max 5 per type
```

### D.2 — Command Palette

**File:** `components/admin/AdminCommandPalette.tsx`
- Opens with `Ctrl+K` or `/`
- Uses `cmdk` (already installed in project)
- Search box at top
- Results grouped: Users, Generations, Transactions, Quick Actions
- Quick actions: Go to Dashboard, Go to Users, Toggle Maintenance, etc.
- Recent searches

### D.3 — Integration

- Add `AdminCommandPalette` to `AdminLayout.tsx`
- Add keyboard shortcut listener
- Add search icon to `AdminTopBar.tsx`

---

## Phase E: UX Polish

> **الهدف:** تحسينات تجربة المستخدم
> **الملفات المعدلة:** ~10 ملفات

### E.1 — Enhanced MetricCard with Trends

Update `components/admin/KPICard.tsx`:
- Add `trend` prop: `{ value: number, direction: 'up' | 'down' }`
- Show "▲ +12% vs last month" or "▼ -5%"
- Green for positive trends, red for negative
- Add optional mini sparkline (last 7 data points)

### E.2 — Date Range Picker

**File:** `components/admin/DateRangePicker.tsx`
- Preset ranges: Today, 7d, 30d, 90d, This Month, Last Month, Custom
- Custom: two date inputs (from/to)
- Used across all pages that have date filters

### E.3 — Dashboard Trend Comparison

Update `app/admin/dashboard/page.tsx`:
- All KPI cards show vs. yesterday / vs. last week
- Charts show comparison overlay (this period vs. previous)

### E.4 — Mobile Responsive

Update `components/admin/AdminSidebar.tsx`:
- On mobile: sidebar becomes bottom sheet or overlay
- Hamburger menu button in TopBar
- Content area full width on mobile

### E.5 — Keyboard Shortcuts

**File:** `hooks/admin/useAdminShortcuts.ts`
```typescript
Shortcuts:
- Ctrl+K → Command palette / Search
- g d → Go to Dashboard
- g u → Go to Users
- g a → Go to Analytics
- g s → Go to Settings
- Escape → Close modals/palette
```

### E.6 — Toast Notifications

Add success/error toasts using `sonner` (already installed) for:
- Settings saved
- User banned/unbanned
- Credits adjusted
- Studio config saved
- Model config saved

---

## Sidebar Navigation (Updated)

```typescript
const navItems = [
  // Data
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/analytics', label: 'Analytics', icon: TrendingUp },      // NEW
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/generations', label: 'Generations', icon: Palette },
  { href: '/admin/transactions', label: 'Transactions', icon: CreditCard },
  // God Mode
  { href: '/admin/studios', label: 'Studios', icon: SlidersHorizontal },
  { href: '/admin/models', label: 'AI Models', icon: Bot },
  { href: '/admin/prompts', label: 'Prompts', icon: FileText },
  // System
  { href: '/admin/health', label: 'Health', icon: Activity },              // NEW
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/logs', label: 'Logs', icon: ScrollText },
];
```

---

## Database Migrations Summary

| Migration | Content |
|-----------|---------|
| `018_analytics_aggregates.sql` | daily_metrics, user_events, subscription_events tables + indexes |

---

## New Dependencies

```bash
# None required — all features built with existing stack:
# - recharts (charts) ✅ already installed
# - cmdk (command palette) ✅ already installed
# - sonner (toasts) ✅ already installed
# - lucide-react (icons) ✅ already installed
# - date-fns (date formatting) — may add for cohort date calculations
```

Optional:
```bash
npm install date-fns    # Date manipulation for cohort analysis
```

---

## Files Summary per Phase

| Phase | New Files | Modified Files | Total |
|-------|-----------|---------------|-------|
| A — SaaS Analytics | 12 | 3 | 15 |
| B — User Intelligence | 8 | 3 | 11 |
| C — Performance Monitor | 6 | 1 | 7 |
| D — Global Search | 4 | 2 | 6 |
| E — UX Polish | 3 | 8 | 11 |
| **Total** | **33** | **17** | **50** |

---

## Execution Order

```
Phase A (SaaS Analytics) ←── START HERE
  ↓ يعتمد عليه B
Phase B (User Intelligence)
  ↓ مستقل
Phase C (Performance Monitor) ←── يمكن تنفيذه بالتوازي مع B
  ↓
Phase D (Global Search) ←── يمكن تنفيذه بعد A
  ↓
Phase E (UX Polish) ←── آخر مرحلة
```

**Phase A هي الأساس** — كل التحليلات الأخرى تعتمد على الجداول والبيانات التي تُنشأ فيها.
