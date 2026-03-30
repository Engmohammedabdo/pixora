# Phase 6: Settings + Logs — Feature Flags + Audit Trail

> **Goal:** Admin can toggle feature flags, configure rate limits, and view all logs.
> **Estimate:** 1-2 days
> **Dependency:** Phase 1, `lib/admin/settings.ts` from Phase 5

---

## Task 6.1: Settings API

**File:** `app/api/admin/settings/route.ts`

```typescript
// GET /api/admin/settings — returns all settings

export async function GET(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const [featureFlags, rateLimits, appConfig] = await Promise.all([
    getFeatureFlags(),
    getRateLimits(),
    getSetting('app_config'),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      featureFlags,
      rateLimits,
      appConfig: appConfig || { watermark_text: 'PyraSuite', default_locale: 'ar' },
    },
  });
}

// PUT /api/admin/settings — update a settings group

export async function PUT(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const { group, value } = await request.json();
  // group: 'feature_flags' | 'rate_limits' | 'app_config'

  const validGroups = ['feature_flags', 'rate_limits', 'app_config'];
  if (!validGroups.includes(group)) {
    return NextResponse.json({ success: false, error: 'Invalid settings group' }, { status: 400 });
  }

  const success = await setSetting(group, value);
  if (!success) return serverError('Failed to save');

  await logAdminAction('setting_update', 'setting', group, value, getClientIP(request));

  return NextResponse.json({ success: true });
}
```

- [ ] Create `app/api/admin/settings/route.ts` with GET + PUT
- [ ] Test: GET returns all 3 settings groups
- [ ] Test: PUT updates a group and logs

---

## Task 6.2: Logs API

**File:** `app/api/admin/logs/route.ts`

```typescript
// GET /api/admin/logs?tab=admin|errors&from=&to=&action=&page=1&limit=20

export async function GET(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const supabase = createAdminClient();
  const url = new URL(request.url);

  const tab = url.searchParams.get('tab') || 'admin';
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const action = url.searchParams.get('action');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  if (tab === 'admin') {
    // Admin action logs
    let query = supabase
      .from('admin_logs')
      .select('*', { count: 'exact' });

    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    if (action) query = query.eq('action', action);

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    // Get unique action types for filter dropdown
    const { data: actionTypes } = await supabase
      .from('admin_logs')
      .select('action')
      .limit(100);

    const uniqueActions = [...new Set(actionTypes?.map(a => a.action) || [])];

    return NextResponse.json({
      success: true,
      data: data || [],
      actionTypes: uniqueActions,
      pagination: { page, limit, total: count || 0 },
    });
  }

  if (tab === 'errors') {
    // Generation errors
    let query = supabase
      .from('generations')
      .select('id, studio, model, error, input, created_at, user_id, profiles(name, email)', { count: 'exact' })
      .eq('status', 'failed');

    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: { page, limit, total: count || 0 },
    });
  }

  return NextResponse.json({ success: false, error: 'Invalid tab' }, { status: 400 });
}
```

- [ ] Create `app/api/admin/logs/route.ts` with GET
- [ ] Test: `?tab=admin` returns admin action logs
- [ ] Test: `?tab=errors` returns generation errors
- [ ] Test: filters work (date range, action type)

---

## Task 6.3: Settings Page

**File:** `app/admin/settings/page.tsx`

**File:** `components/admin/SettingsToggle.tsx`

```typescript
interface SettingsToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  dangerous?: boolean;  // Red styling for maintenance_mode etc.
}

// UI:
// Row layout:
// [Toggle] Label
//          Description text in gray
```

Page layout:

```
┌──────────────────────────────────────────────────────────┐
│ Settings                                      [Save All]  │
│                                                           │
│ ── Feature Flags ──────────────────────────────────────── │
│                                                           │
│ [🔴] Maintenance Mode                                     │
│      Disables all studios. Shows maintenance message.     │
│                                                           │
│ [🟢] Registration Enabled                                 │
│      Allow new users to sign up.                          │
│                                                           │
│ [🟢] Free Plan Enabled                                    │
│      Allow users to use the free tier.                    │
│                                                           │
│ [🟢] Referral System                                      │
│      Enable "invite friend, earn credits" feature.        │
│                                                           │
│ [🟢] Daily Bonus                                          │
│      Give 1-3 bonus credits for daily login.              │
│                                                           │
│ ── Rate Limits ────────────────────────────────────────── │
│                                                           │
│ Max Requests/Minute per User: [10]                        │
│                                                           │
│ Daily Generation Limits by Plan:                          │
│   Free:     [10 ]                                         │
│   Starter:  [50 ]                                         │
│   Pro:      [100]                                         │
│   Business: [200]                                         │
│   Agency:   [500]                                         │
│                                                           │
│ ── App Config ─────────────────────────────────────────── │
│                                                           │
│ Watermark Text: [PyraSuite          ]                     │
│ Default Locale: [ar ▼]                                    │
│                                                           │
│                                              [Save All]   │
└──────────────────────────────────────────────────────────┘
```

- [ ] Create `app/admin/settings/page.tsx`
- [ ] Create `components/admin/SettingsToggle.tsx`
- [ ] Feature flags toggles work
- [ ] Rate limit inputs work (number validation)
- [ ] App config inputs work
- [ ] Save All → PUTs all 3 groups
- [ ] Success toast after save

---

## Task 6.4: Logs Page

**File:** `app/admin/logs/page.tsx`

```
┌──────────────────────────────────────────────────────────┐
│ Logs                                                      │
│                                                           │
│ [Admin Actions] [Generation Errors]          ← Tab bar    │
│                                                           │
│ [Action ▼] [From date] [To date]             ← Filters    │
│                                                           │
│ ┌────────┬──────────┬──────────┬──────┬──────────────┐   │
│ │ Action │ Target   │ Details  │  IP  │    Time      │   │
│ ├────────┼──────────┼──────────┼──────┼──────────────┤   │
│ │credit_ │user:abc  │+50 creds │x.x.x│ 5 min ago    │   │
│ │adjust  │          │reason:.. │      │              │   │
│ ├────────┼──────────┼──────────┼──────┼──────────────┤   │
│ │setting │setting:  │{maint..} │x.x.x│ 1 hour ago   │   │
│ │_update │feat_flags│          │      │              │   │
│ └────────┴──────────┴──────────┴──────┴──────────────┘   │
│                                                           │
│ Showing 1-20 of 156    [← Prev] [Page 1] [Next →]       │
└──────────────────────────────────────────────────────────┘
```

**Admin Actions tab columns:**
| Column | Render |
|--------|--------|
| Action | Badge (color-coded by action type) |
| Target | `target_type: target_id` (link to user if target_type=user) |
| Details | Formatted JSONB (collapsible if long) |
| IP | Text |
| Time | Relative + tooltip with full timestamp |

**Generation Errors tab columns:**
| Column | Render |
|--------|--------|
| User | Name + email (link to `/admin/users/[id]`) |
| Studio | Badge with icon |
| Model | Text |
| Error | Truncated text (expandable on click) |
| Input | Expandable JSONB |
| Time | Relative |

Action type color coding:
| Action | Color |
|--------|-------|
| login_* | blue |
| user_* | indigo |
| credit_* | green |
| setting_* | yellow |
| studio_* | purple |
| model_* | cyan |
| prompt_* | orange |
| generation_* | red |

- [ ] Create `app/admin/logs/page.tsx`
- [ ] Admin Actions tab works with filters
- [ ] Generation Errors tab works with filters
- [ ] Tab switching works
- [ ] Pagination works
- [ ] Action filter dropdown populated from actual data

---

## Task 6.5: Feature Flag Integration

The feature flags need to actually affect the app behavior.

### Maintenance Mode
In each studio API route (`app/api/studios/*/route.ts`), add at the top:

```typescript
const flags = await getFeatureFlags();
if (flags.maintenance_mode) {
  return NextResponse.json(
    { success: false, error: 'maintenance_mode', message: 'Platform is under maintenance. Please try again later.' },
    { status: 503 }
  );
}
```

### Registration Disabled
In the signup route/middleware:

```typescript
const flags = await getFeatureFlags();
if (!flags.registration_enabled) {
  return NextResponse.json(
    { success: false, error: 'registration_disabled' },
    { status: 403 }
  );
}
```

### Free Plan Disabled
In signup flow, if `!flags.free_plan_enabled`, don't allow new accounts to be created with free plan — or redirect to pricing page after signup.

### Rate Limit Integration
In `lib/rate-limit.ts`, read limits from settings:

```typescript
const limits = await getRateLimits();
// Use limits.requests_per_minute instead of hardcoded value
// Use limits.daily_generations[userPlan] for daily cap
```

- [ ] Add maintenance mode check to at least 3 studio routes
- [ ] Add registration check to signup flow
- [ ] Document pattern for remaining routes
- [ ] Add rate limit integration

---

## Verification Checklist

- [ ] Settings page loads with all current values
- [ ] Toggle maintenance mode → studios return 503
- [ ] Toggle maintenance mode off → studios work again
- [ ] Toggle registration → signup blocked/allowed
- [ ] Rate limit changes → take effect on next request
- [ ] Save All → all 3 groups persisted to DB
- [ ] Logs page: Admin Actions tab shows all past actions
- [ ] Logs page: Generation Errors tab shows failed generations
- [ ] Filters work on both tabs
- [ ] Pagination works
- [ ] All setting changes are logged in admin_logs
- [ ] `npm run build` passes

---

## 🎉 Phase 6 Complete = Admin Dashboard Complete!

At this point, the full admin dashboard is functional:
1. ✅ Auth + Layout (Phase 1)
2. ✅ Dashboard KPIs + Charts (Phase 2)
3. ✅ User Management (Phase 3)
4. ✅ Generations + Transactions (Phase 4)
5. ✅ God Mode: Studios, Models, Prompts (Phase 5)
6. ✅ Settings + Logs (Phase 6)

### Post-launch improvements (optional, future):
- [ ] Email notifications when critical errors spike
- [ ] Export data to CSV
- [ ] Bulk actions (ban multiple users, delete old generations)
- [ ] Dashboard dark mode
- [ ] API response time monitoring
- [ ] Real-time updates via Supabase Realtime subscriptions
