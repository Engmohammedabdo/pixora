# PRD: PyraSuite Admin Dashboard — God Mode 🛡️

> **Version:** 1.0 | **Date:** 2026-03-30 | **Status:** Ready for Development
> **Author:** بايرا 🦊

---

## 1. Overview & Goals

### Vision
لوحة تحكم إدارية شاملة (God Mode) تمنح المدير (محمد) رؤية كاملة وتحكم مطلق في كل جانب من جوانب منصة PyraSuite — من المستخدمين والإيرادات حتى نماذج الـ AI وsystem prompts.

### Goals
1. **Full Visibility** — شاشة واحدة تعرض كل شي: مستخدمين، إيرادات، generations، أخطاء
2. **Full Control** — تعديل credits يدوي، تغيير خطط، ban/unban، تحكم بالـ AI models
3. **God Mode** — تفعيل/تعطيل studios، تغيير costs، تعديل system prompts، feature flags
4. **Audit Trail** — كل إجراء إداري يُسجّل في logs

### What It's NOT
- ليس dashboard للمستخدمين العاديين (هذا للمدير فقط)
- لا يتعامل مع Stripe مباشرة (إحصائيات فقط — refunds/cancellations تتم من Stripe Dashboard)
- لا يحتاج i18n (English/LTR فقط)

---

## 2. Authentication

### Flow
```
Admin opens /admin → Middleware checks JWT cookie → 
  ✓ Valid → Show admin page
  ✗ Invalid/missing → Redirect to /admin/login

Admin submits login form →
  POST /api/admin/auth/login { username, password } →
  Server verifies against env vars →
  ✓ Match → Set httpOnly JWT cookie (24h) → Redirect to /admin/dashboard
  ✗ No match → Return 401 → Show error
```

### Environment Variables
```bash
# Add to .env.local.example
ADMIN_USERNAME=admin
ADMIN_PASSWORD=                    # Strong password, 16+ chars
ADMIN_JWT_SECRET=                  # Random 64-char string for JWT signing
```

### JWT Cookie Spec
| Property | Value |
|----------|-------|
| Name | `admin_session` |
| Value | Signed JWT with `{ role: 'admin', iat, exp }` |
| httpOnly | `true` |
| secure | `true` (production) |
| sameSite | `strict` |
| path | `/` |
| maxAge | `86400` (24 hours) |

### Rate Limiting
- 5 failed login attempts per 15 minutes
- Simple in-memory Map: `{ ip: { count, resetAt } }`
- After limit: return 429 with "Too many attempts, try again later"

### Library
- Use `jose` (already edge-compatible, no native deps)
- `new SignJWT({}).setExpirationTime('24h').sign(secret)`
- `jwtVerify(token, secret)` for verification

---

## 3. Routing & Middleware

### Route Structure
```
app/
├── admin/
│   ├── login/
│   │   └── page.tsx              # Login page (public)
│   ├── layout.tsx                # Admin layout (sidebar + topbar)
│   ├── dashboard/
│   │   └── page.tsx              # KPI cards + charts + tables
│   ├── users/
│   │   ├── page.tsx              # User list
│   │   └── [id]/
│   │       └── page.tsx          # User detail
│   ├── generations/
│   │   └── page.tsx              # All generations
│   ├── transactions/
│   │   └── page.tsx              # All transactions
│   ├── studios/
│   │   └── page.tsx              # Studio config (god mode)
│   ├── models/
│   │   └── page.tsx              # AI model config (god mode)
│   ├── prompts/
│   │   └── page.tsx              # System prompts editor (god mode)
│   ├── settings/
│   │   └── page.tsx              # Feature flags + rate limits
│   └── logs/
│       └── page.tsx              # Admin audit logs + error logs
```

**IMPORTANT:** Admin routes are at `app/admin/*` — NOT inside `app/[locale]/`. This avoids i18n middleware conflicts. Admin is always English/LTR.

### Middleware Changes

In `middleware.ts`, add admin handling BEFORE the intl middleware:

```typescript
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // ===== ADMIN ROUTES (handle BEFORE intl) =====
  if (pathname.startsWith('/admin')) {
    // Admin login page — allow through
    if (pathname === '/admin/login') {
      // If already authenticated, redirect to dashboard
      const adminToken = request.cookies.get('admin_session')?.value;
      if (adminToken) {
        try {
          await jwtVerify(adminToken, new TextEncoder().encode(process.env.ADMIN_JWT_SECRET));
          return NextResponse.redirect(new URL('/admin/dashboard', request.url));
        } catch { /* invalid token, show login */ }
      }
      return NextResponse.next();
    }

    // All other admin routes — require auth
    const adminToken = request.cookies.get('admin_session')?.value;
    if (!adminToken) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    try {
      await jwtVerify(adminToken, new TextEncoder().encode(process.env.ADMIN_JWT_SECRET));
      return NextResponse.next();
    } catch {
      // Invalid/expired token
      const response = NextResponse.redirect(new URL('/admin/login', request.url));
      response.cookies.delete('admin_session');
      return response;
    }
  }

  // ===== EXISTING CODE BELOW (intl + supabase auth) =====
  // ... (unchanged)
}

// Update matcher to include admin routes
export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
```

---

## 4. Admin Layout

### Visual Design
```
┌──────────────────────────────────────────────────────────────┐
│  ⚡ PyraSuite Admin                    🔴 Admin    [Logout]  │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                    │
│ 📊 Dash  │         Main Content Area                         │
│ 👥 Users │                                                    │
│ 🎨 Gens  │  ┌─────────────────────────────────────────────┐  │
│ 💳 Trans │  │                                             │  │
│ ──────── │  │     Page Content                            │  │
│ 🎛 Studio│  │                                             │  │
│ 🤖 Models│  │                                             │  │
│ 📝 Promps│  └─────────────────────────────────────────────┘  │
│ ──────── │                                                    │
│ ⚙ Settng │                                                    │
│ 📋 Logs  │                                                    │
│          │                                                    │
└──────────┴───────────────────────────────────────────────────┘
```

### Design Specs
| Property | Value |
|----------|-------|
| Sidebar width | 240px |
| Sidebar bg | `slate-900` |
| Sidebar text | `slate-300` (inactive), `white` (active) |
| Active item bg | `slate-800` with `indigo-500` left border |
| TopBar bg | `slate-950` |
| Content bg | `slate-50` (light) |
| Direction | LTR always |
| Font | Inter (system) |

### Admin Layout Component
- `components/admin/AdminLayout.tsx` — wraps all admin pages
- Client component (needs state for sidebar collapse)
- Children receive full remaining width
- Sidebar collapsible to 64px (icon-only) via toggle button
- No i18n, no RTL, no theme switching — always LTR light content with dark sidebar

---

## 5. Dashboard Home (`/admin/dashboard`)

### KPI Cards (Top Row — 6 cards in 3x2 or 6x1 grid)

| Card | Query | Badge |
|------|-------|-------|
| **Total Users** | `SELECT COUNT(*) FROM profiles` | `+X today` (created_at >= today) |
| **Revenue MTD** | `SELECT SUM(amount) FROM credit_transactions WHERE type IN ('subscription','topup') AND amount > 0 AND created_at >= first_of_month` | Formatted as `$X,XXX` |
| **Generations Today** | `SELECT COUNT(*) FROM generations WHERE created_at >= today` | — |
| **Error Rate** | `failed / total generations today` | Show as `X%` with red if > 5% |
| **Zero Credits** | `SELECT COUNT(*) FROM profiles WHERE credits_balance = 0 AND purchased_credits = 0` | — |
| **Active Subs** | `SELECT plan_id, COUNT(*) FROM profiles WHERE plan_id != 'free' GROUP BY plan_id` | Show breakdown |

### Charts (2x2 Grid)

| Chart | Type | Data |
|-------|------|------|
| **User Signups** | Bar chart | Last 7 days, count per day |
| **Revenue Trend** | Line chart | Last 30 days, daily revenue |
| **Generations/Studio** | Stacked bar | Last 7 days, grouped by studio |
| **Model Usage** | Pie chart | All-time count by model (gemini/gpt/flux) |

### Tables (Below Charts)

**Recent Generations** (last 20):
| Column | Source |
|--------|--------|
| User | `profiles.name` (join) |
| Studio | `generations.studio` |
| Model | `generations.model` |
| Status | `generations.status` |
| Credits | `generations.credits_used` |
| Time | `generations.created_at` (relative: "2m ago") |

**Recent Errors** (last 10 failed):
| Column | Source |
|--------|--------|
| User | `profiles.name` |
| Studio | `generations.studio` |
| Model | `generations.model` |
| Error | `generations.error` (truncated) |
| Time | `generations.created_at` |

**Low Credit Users** (balance < 5):
| Column | Source |
|--------|--------|
| User | `profiles.name` |
| Email | `profiles.email` |
| Plan | `profiles.plan_id` |
| Balance | `profiles.credits_balance` |
| Purchased | `profiles.purchased_credits` |

---

## 6. User Management

### List Page (`/admin/users`)

**Search:** by name or email (case-insensitive `ilike`)

**Filters:**
| Filter | Type | Options |
|--------|------|---------|
| Plan | select | free, starter, pro, business, agency |
| Credits | range | min/max inputs |
| Signup date | date range | from/to date pickers |
| Has subscription | toggle | Yes/No |

**Table Columns:**
| Column | Source | Sortable |
|--------|--------|----------|
| Avatar | `profiles.avatar_url` | No |
| Name | `profiles.name` | Yes |
| Email | `profiles.email` | Yes |
| Plan | `profiles.plan_id` | Yes |
| Credits | `profiles.credits_balance + purchased_credits` | Yes |
| Generations | COUNT from `generations` | Yes |
| Joined | `profiles.created_at` | Yes |
| Actions | View / Quick edit | No |

**Pagination:** 20 per page, with page number + total count.

### Detail Page (`/admin/users/[id]`)

**Profile Section:**
- Avatar, Name, Email
- Plan badge (colored)
- Joined date, last generation date
- Stripe Customer ID (link to Stripe dashboard: `https://dashboard.stripe.com/customers/{id}`)
- Stripe Subscription ID (link)

**Quick Actions (buttons):**
| Action | UI | API |
|--------|-----|-----|
| Adjust Credits | Modal: amount input (+/-) + reason textarea | `POST /api/admin/users/[id]/credits` |
| Change Plan | Dropdown select | `PATCH /api/admin/users/[id]` |
| Ban/Unban | Toggle with confirm dialog | `PATCH /api/admin/users/[id]` (set `banned: true`) |
| Delete Account | Red button with "type email to confirm" | `DELETE /api/admin/users/[id]` |

**Tabs:**
| Tab | Content |
|-----|---------|
| Generations | This user's generations table (studio, model, status, date) |
| Transactions | This user's credit_transactions (amount, type, date) |
| Brand Kits | This user's brand_kits (name, colors, default) |
| Assets | This user's assets (thumbnail grid, type, date) |

---

## 7. Generations Management (`/admin/generations`)

**Filters:**
| Filter | Type | Options |
|--------|------|---------|
| Studio | multi-select | creator, photoshoot, campaign, plan, storyboard, analysis, voiceover, edit, prompt-builder |
| Model | multi-select | gemini, gpt, flux |
| Status | multi-select | pending, processing, completed, failed |
| Date range | date range | from/to |
| User | text search | by name/email |

**Table Columns:**
| Column | Sortable |
|--------|----------|
| User (name + email) | Yes |
| Studio | Yes |
| Model | Yes |
| Status (color-coded badge) | Yes |
| Credits Used | Yes |
| Created At | Yes |

**Expand Row:** Click row to expand and show:
- Full `input` JSONB (formatted)
- Full `output` JSONB (formatted)
- Error message if failed
- Output image preview (if URL exists in output)

**Actions:**
- Delete generation (with confirm dialog)
- View output (opens image/text in modal)

---

## 8. Transactions (`/admin/transactions`)

**Filters:**
| Filter | Type | Options |
|--------|------|---------|
| Type | multi-select | subscription, topup, usage, refund, reset |
| Date range | date range | from/to |
| User | text search | by name/email |
| Amount direction | select | Positive (credit), Negative (debit), All |

**Table Columns:**
| Column | Sortable |
|--------|----------|
| User (name) | Yes |
| Amount (green if +, red if -) | Yes |
| Type (badge) | Yes |
| Description | No |
| Balance After | Yes |
| Date | Yes |

**Summary Row (top):**
- Total Credits Added: `SUM(amount) WHERE amount > 0`
- Total Credits Used: `SUM(ABS(amount)) WHERE amount < 0`
- Net: difference

**Action Button:**
- "Manual Credit Adjustment" → opens modal:
  - User search (autocomplete by name/email)
  - Amount input (+/-)
  - Reason textarea (required)
  - Submit → `POST /api/admin/users/[id]/credits`

---

## 9. God Mode: Studios Control (`/admin/studios`)

**Layout:** Grid of cards (one per studio)

**Per Studio Card:**
```
┌──────────────────────────────┐
│ 🎨 Creator           [ON/OFF]│
│                               │
│ Credit Costs:                 │
│   1080p: [1] credits          │
│   2K:    [2] credits          │
│   4K:    [4] credits          │
│                               │
│ Total Generations: 1,234      │
│ Today: 56                     │
│                               │
│ [Save Changes]                │
└──────────────────────────────┘
```

**Studios List:**
| Studio | Icon | Default Costs |
|--------|------|---------------|
| creator | 🎨 | 1/2/4 per resolution |
| photoshoot | 📸 | 8 (6 shots) |
| campaign | 📋 | 12 (9 posts) |
| plan | 🗺️ | 5 |
| storyboard | 🎬 | 14 |
| analysis | 📊 | 3 |
| voiceover | 🎙️ | 1 per 30s |
| edit | ✏️ | 1 |
| prompt-builder | 💡 | 0 (free) |

**Save Flow:**
1. Read current defaults from `lib/credits/costs.ts` (imported at build time)
2. Read overrides from `system_settings` WHERE key = `studio_config`
3. Display merged values
4. On save → `PUT /api/admin/studios` → updates `system_settings`
5. Log action to `admin_logs`

---

## 10. God Mode: AI Models (`/admin/models`)

**Layout:** 3 large cards (Gemini, GPT, Flux)

**Per Model Card:**
```
┌──────────────────────────────────┐
│ 🤖 Gemini                [ON/OFF]│
│                                   │
│ Stats (last 7 days):              │
│   Total Generations: 890          │
│   Success Rate: 97.2%             │
│   Avg Response Time: 3.2s         │
│                                   │
│ Recent Errors: 24                 │
│ [View Error Log]                  │
│                                   │
│ [Test Model]                      │
└──────────────────────────────────┘
```

**Fallback Order:**
- Display: Numbered list with up/down arrows or dropdown
- Default: `["gemini", "gpt", "flux"]`
- Saved to `system_settings.model_config`

**Test Model:**
- Click "Test Model" → sends predefined prompt
- Shows: result (image URL or text), response time, status
- Endpoint: `POST /api/admin/models/test { model: "gemini" }`

**Stats Queries:**
```sql
-- Per model stats (last 7 days)
SELECT
  model,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'completed') as success,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_time
FROM generations
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY model;
```

---

## 11. God Mode: System Prompts (`/admin/prompts`)

**Layout:** Accordion or card list — one entry per studio prompt

**Per Prompt:**
| Field | Value |
|-------|-------|
| Studio | e.g. "creator" |
| File | `lib/ai/prompts/creator.ts` (reference only) |
| Variables | `{user_prompt}`, `{brand_colors}`, `{brand_name}`, `{selected_style}`, `{resolution}` |
| Default Prompt | Read-only display of current code value |
| Override | Editable textarea (empty = use default) |
| Status | "Using Default" / "Using Override" badge |

**Actions:**
- Save Override → `PUT /api/admin/prompts` → stores in `system_settings.prompt_overrides`
- Reset to Default → deletes the override for this studio

**Integration Pattern:**
```typescript
// In lib/admin/settings.ts (new file)
export async function getEffectivePrompt(studio: string): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'prompt_overrides')
    .single();

  const overrides = data?.value as Record<string, string> || {};
  if (overrides[studio]) return overrides[studio];

  // Fall back to code defaults
  return getDefaultPrompt(studio);
}
```

---

## 12. Settings (`/admin/settings`)

### Feature Flags
| Flag | Default | Description |
|------|---------|-------------|
| `maintenance_mode` | `false` | يعطّل كل الـ studios — يعرض رسالة "Under Maintenance" |
| `registration_enabled` | `true` | يسمح/يمنع التسجيل الجديد |
| `free_plan_enabled` | `true` | يفعّل/يعطّل الخطة المجانية |
| `referral_enabled` | `true` | يفعّل/يعطّل نظام الإحالة |
| `daily_bonus_enabled` | `true` | يفعّل/يعطّل البونص اليومي |

### Rate Limits
| Setting | Default | Description |
|---------|---------|-------------|
| `requests_per_minute` | 10 | Max API requests per user per minute |
| Daily generations per plan | `{free:10, starter:50, pro:100, business:200, agency:500}` | Max generations per day |

### App Config
| Setting | Default | Description |
|---------|---------|-------------|
| `watermark_text` | "PyraSuite" | Watermark text on free plan images |
| `default_locale` | "ar" | Default language |

**Save:** All saved to `system_settings` table as JSONB.

---

## 13. Logs (`/admin/logs`)

### Two Tabs

**Tab 1: Admin Actions**
| Column | Source |
|--------|--------|
| Action | `admin_logs.action` (e.g. "credit_adjustment", "user_ban", "setting_change") |
| Target | `admin_logs.target_type` + `target_id` (e.g. "user:uuid") |
| Details | `admin_logs.details` JSONB (formatted) |
| IP | `admin_logs.ip_address` |
| Time | `admin_logs.created_at` |

**Tab 2: Generation Errors**
| Column | Source |
|--------|--------|
| User | `profiles.name` (join) |
| Studio | `generations.studio` |
| Model | `generations.model` |
| Error | `generations.error` |
| Input | `generations.input` (expandable) |
| Time | `generations.created_at` |

**Auto-Logging:**
Every admin write action logs to `admin_logs`:
```typescript
async function logAdminAction(supabase: any, action: string, target_type: string, target_id: string, details: any, ip: string) {
  await supabase.from('admin_logs').insert({
    action,
    target_type,
    target_id,
    details,
    ip_address: ip,
  });
}
```

---

## 14. Database Migration

```sql
-- Migration 015: Admin Dashboard Support
-- Apply via Supabase SQL Editor

-- System Settings (key-value store for admin overrides)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT DEFAULT 'admin'
);

-- Seed defaults
INSERT INTO system_settings (key, value) VALUES
  ('studio_config', '{}'),
  ('model_config', '{"enabled": ["gemini", "gpt", "flux"], "fallback_order": ["gemini", "gpt", "flux"]}'),
  ('prompt_overrides', '{}'),
  ('feature_flags', '{"maintenance_mode": false, "registration_enabled": true, "free_plan_enabled": true, "referral_enabled": true, "daily_bonus_enabled": true}'),
  ('rate_limits', '{"requests_per_minute": 10, "daily_generations": {"free": 10, "starter": 50, "pro": 100, "business": 200, "agency": 500}}'),
  ('app_config', '{"watermark_text": "PyraSuite", "default_locale": "ar"}')
ON CONFLICT (key) DO NOTHING;

-- Admin Logs (audit trail)
CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  target_type TEXT, -- 'user', 'studio', 'model', 'setting'
  target_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);

-- Add banned column to profiles if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ban_reason TEXT;

-- No RLS on admin tables — accessed only via service_role key
```

---

## 15. API Routes

```
app/api/admin/
├── auth/
│   ├── login/route.ts       # POST: verify creds → set JWT cookie
│   └── logout/route.ts      # POST: clear JWT cookie
├── stats/
│   ├── overview/route.ts    # GET: KPI numbers for dashboard cards
│   ├── charts/route.ts      # GET: chart data (signups, revenue, gens, models)
│   └── recent/route.ts      # GET: recent generations + errors + low-credit users
├── users/
│   ├── route.ts             # GET: list users (search, filter, paginate)
│   └── [id]/
│       ├── route.ts         # GET: user detail | PATCH: update | DELETE: remove
│       └── credits/route.ts # POST: manual credit adjustment
├── generations/
│   └── route.ts             # GET: list (filter, paginate) | DELETE: remove
├── transactions/
│   └── route.ts             # GET: list (filter, paginate)
├── studios/
│   └── route.ts             # GET: config | PUT: update config
├── models/
│   ├── route.ts             # GET: config + stats | PUT: update config
│   └── test/route.ts        # POST: test model with sample prompt
├── prompts/
│   └── route.ts             # GET: all prompts + overrides | PUT: save override
├── settings/
│   └── route.ts             # GET: all settings | PUT: update
└── logs/
    └── route.ts             # GET: admin logs + generation errors
```

### API Pattern (every admin route):
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';
import { logAdminAction } from '@/lib/admin/logger';

export async function GET(request: NextRequest) {
  // 1. Auth check
  const admin = await verifyAdminSession(request);
  if (!admin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  // 2. Create service_role client (bypasses RLS)
  const supabase = createAdminClient();

  // 3. Query data
  const { data, error, count } = await supabase
    .from('table')
    .select('*', { count: 'exact' })
    .range(offset, offset + limit - 1);

  // 4. Return standardized response
  return NextResponse.json({
    success: true,
    data,
    pagination: { page, limit, total: count },
  });
}
```

---

## 16. UI Components

```
components/admin/
├── AdminLayout.tsx          # Sidebar + TopBar + Content wrapper
├── AdminSidebar.tsx         # Dark sidebar with navigation links
├── AdminTopBar.tsx          # Top bar with admin badge + logout
├── KPICard.tsx              # Single KPI card (icon, label, value, badge)
├── DataTable.tsx            # Reusable sortable/filterable/paginated table
├── StatChart.tsx            # Recharts wrapper (bar, line, pie)
├── UserDetailCard.tsx       # User profile info card
├── CreditAdjustModal.tsx    # Modal for manual credit adjustment
├── StudioConfigCard.tsx     # Studio card with toggle + cost editor
├── ModelConfigCard.tsx      # Model card with toggle + stats
├── PromptEditor.tsx         # Textarea editor for system prompts
├── SettingsToggle.tsx       # Toggle switch with label and description
├── ConfirmDialog.tsx        # "Are you sure?" confirmation dialog
├── AdminBadge.tsx           # Red "Admin" badge
├── FilterBar.tsx            # Reusable filter bar (search + dropdowns + date range)
└── ExpandableRow.tsx        # Table row that expands to show JSONB details
```

---

## 17. New Dependencies

```bash
npm install recharts jose
```

| Package | Purpose | Size |
|---------|---------|------|
| `recharts` | Dashboard charts (bar, line, pie) | ~45KB gzipped |
| `jose` | JWT sign/verify (edge-compatible) | ~8KB gzipped |

---

## 18. Integration with Existing Code

### 18.1 — Credit Costs Override

**File:** `lib/credits/costs.ts`

Add:
```typescript
import { createAdminClient } from '@/lib/admin/db';

// Existing CREDIT_COSTS stays as-is (defaults)

export async function getEffectiveCosts(): Promise<typeof CREDIT_COSTS> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'studio_config')
      .single();

    if (!data?.value || Object.keys(data.value).length === 0) {
      return CREDIT_COSTS;
    }

    // Deep merge: overrides win, defaults fill gaps
    return deepMerge(CREDIT_COSTS, data.value);
  } catch {
    return CREDIT_COSTS;
  }
}
```

Then update studio API routes to use `getEffectiveCosts()` instead of `CREDIT_COSTS` directly.

### 18.2 — Model Enable/Disable

**File:** `lib/ai/router.ts`

Add:
```typescript
export async function getEnabledModels(): Promise<AIModel[]> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'model_config')
      .single();

    const config = data?.value as { enabled: string[], fallback_order: string[] };
    return (config?.fallback_order || IMAGE_FALLBACK_ORDER)
      .filter(m => (config?.enabled || IMAGE_FALLBACK_ORDER).includes(m)) as AIModel[];
  } catch {
    return [...IMAGE_FALLBACK_ORDER];
  }
}
```

Then update `generateImage()` to use `getEnabledModels()` for fallback chain.

### 18.3 — System Prompt Override

**File:** `lib/admin/settings.ts` (new)

```typescript
export async function getEffectivePrompt(studio: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'prompt_overrides')
      .single();

    const overrides = data?.value as Record<string, string> || {};
    return overrides[studio] || null; // null = use default from code
  } catch {
    return null;
  }
}
```

Then in each studio's prompt builder, check override first:
```typescript
const override = await getEffectivePrompt('creator');
const systemPrompt = override || buildCreatorPrompt(input);
```

### 18.4 — Feature Flags

**File:** `lib/admin/settings.ts`

```typescript
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const defaults = {
    maintenance_mode: false,
    registration_enabled: true,
    free_plan_enabled: true,
    referral_enabled: true,
    daily_bonus_enabled: true,
  };

  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'feature_flags')
      .single();
    return { ...defaults, ...(data?.value || {}) };
  } catch {
    return defaults;
  }
}
```

Then check in middleware or studio routes:
- `maintenance_mode` → return 503 from studio API routes
- `registration_enabled` → block signup route
- etc.

---

## 19. Security Summary

| Concern | Solution |
|---------|----------|
| Admin auth separate from users | JWT cookie, env var creds, no Supabase auth |
| DB access | `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) |
| Cookie security | httpOnly, secure, sameSite=strict |
| Rate limiting (login) | In-memory counter, 5/15min |
| Audit trail | Every write action → `admin_logs` |
| No user exposure | Admin API routes not accessible to regular users |
| JWT expiry | 24 hours, auto-redirect on expire |

---

## 20. File Summary (Total New Files)

| Category | Count | Files |
|----------|-------|-------|
| Pages | 11 | login, layout, dashboard, users, users/[id], generations, transactions, studios, models, prompts, settings, logs |
| API Routes | 14 | auth(2), stats(3), users(3), generations(1), transactions(1), studios(1), models(2), prompts(1), settings(1), logs(1) |
| Components | 16 | See section 16 |
| Lib files | 4 | admin/auth.ts, admin/db.ts, admin/logger.ts, admin/settings.ts |
| Migration | 1 | 015_admin_dashboard.sql |
| **Total** | **46** | |
