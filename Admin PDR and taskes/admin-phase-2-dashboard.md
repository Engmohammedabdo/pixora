# Phase 2: Dashboard Home — KPIs + Charts + Recent Activity

> **Goal:** Admin dashboard home page shows real-time business metrics.
> **Estimate:** 2-3 days
> **Dependency:** Phase 1 complete, `recharts` installed

---

## Task 2.1: KPI Overview API

**File:** `app/api/admin/stats/overview/route.ts`

Returns all KPI card data in one request.

**Queries (via Supabase JS client with service_role):**

```typescript
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  // Run all queries in parallel
  const [
    totalUsers,
    newUsersToday,
    revenueResult,
    gensToday,
    failedToday,
    zeroCreditUsers,
    activeSubs,
  ] = await Promise.all([
    // Total users
    supabase.from('profiles').select('*', { count: 'exact', head: true }),

    // New users today
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO),

    // Revenue this month (positive amounts from subscription + topup)
    supabase.from('credit_transactions')
      .select('amount')
      .in('type', ['subscription', 'topup'])
      .gt('amount', 0)
      .gte('created_at', firstOfMonth),

    // Generations today (total)
    supabase.from('generations').select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO),

    // Failed generations today
    supabase.from('generations').select('*', { count: 'exact', head: true })
      .gte('created_at', todayISO)
      .eq('status', 'failed'),

    // Users with 0 credits (both balances)
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .eq('credits_balance', 0)
      .eq('purchased_credits', 0),

    // Active subscriptions by plan
    supabase.from('profiles').select('plan_id')
      .neq('plan_id', 'free'),
  ]);

  // Calculate revenue total from transactions
  const revenueTotalCredits = revenueResult.data?.reduce((sum, t) => sum + t.amount, 0) || 0;

  // Count subs per plan
  const subsByPlan: Record<string, number> = {};
  activeSubs.data?.forEach((p) => {
    subsByPlan[p.plan_id] = (subsByPlan[p.plan_id] || 0) + 1;
  });

  const totalGens = gensToday.count || 0;
  const failedGens = failedToday.count || 0;
  const errorRate = totalGens > 0 ? ((failedGens / totalGens) * 100).toFixed(1) : '0.0';

  return NextResponse.json({
    success: true,
    data: {
      totalUsers: totalUsers.count || 0,
      newUsersToday: newUsersToday.count || 0,
      revenueThisMonth: revenueTotalCredits, // in credits, not dollars
      generationsToday: totalGens,
      errorRate: parseFloat(errorRate),
      failedToday: failedGens,
      zeroCreditUsers: zeroCreditUsers.count || 0,
      activeSubscriptions: subsByPlan,
    },
  });
}
```

- [ ] Create `app/api/admin/stats/overview/route.ts`
- [ ] Test: `GET /api/admin/stats/overview` returns all KPIs

---

## Task 2.2: Charts API

**File:** `app/api/admin/stats/charts/route.ts`

Returns chart data for 4 charts.

```typescript
// Query param: ?chart=signups|revenue|generations|models

// signups: Last 7 days, count per day
// SELECT DATE(created_at) as date, COUNT(*) as count
// FROM profiles
// WHERE created_at >= NOW() - 7 days
// GROUP BY DATE(created_at)
// ORDER BY date

// revenue: Last 30 days, daily sum of positive transactions
// SELECT DATE(created_at) as date, SUM(amount) as total
// FROM credit_transactions
// WHERE type IN ('subscription','topup') AND amount > 0 AND created_at >= NOW() - 30 days
// GROUP BY DATE(created_at)
// ORDER BY date

// generations: Last 7 days, per studio per day
// SELECT DATE(created_at) as date, studio, COUNT(*) as count
// FROM generations
// WHERE created_at >= NOW() - 7 days
// GROUP BY DATE(created_at), studio
// ORDER BY date

// models: All-time, count per model
// SELECT model, COUNT(*) as count
// FROM generations
// GROUP BY model
```

**Note:** Supabase JS client doesn't support GROUP BY directly. Use `.rpc()` with a DB function, or fetch raw data and aggregate in JS. For simplicity, **fetch raw data with date filter and aggregate in the API route.**

Example for signups:
```typescript
const { data: signupData } = await supabase
  .from('profiles')
  .select('created_at')
  .gte('created_at', sevenDaysAgo);

// Aggregate in JS
const signupsByDay: Record<string, number> = {};
signupData?.forEach(p => {
  const day = p.created_at.split('T')[0];
  signupsByDay[day] = (signupsByDay[day] || 0) + 1;
});

// Fill missing days with 0
const result = last7Days.map(day => ({
  date: day,
  count: signupsByDay[day] || 0,
}));
```

- [ ] Create `app/api/admin/stats/charts/route.ts`
- [ ] Test all 4 chart types: `?chart=signups`, `revenue`, `generations`, `models`

---

## Task 2.3: Recent Activity API

**File:** `app/api/admin/stats/recent/route.ts`

Returns 3 tables: recent generations, recent errors, low credit users.

```typescript
const [recentGens, recentErrors, lowCreditUsers] = await Promise.all([
  // Last 20 generations with user info
  supabase
    .from('generations')
    .select('id, studio, model, status, credits_used, created_at, user_id, profiles(name, email)')
    .order('created_at', { ascending: false })
    .limit(20),

  // Last 10 failed generations
  supabase
    .from('generations')
    .select('id, studio, model, error, created_at, user_id, profiles(name, email)')
    .eq('status', 'failed')
    .order('created_at', { ascending: false })
    .limit(10),

  // Users with balance < 5
  supabase
    .from('profiles')
    .select('id, name, email, plan_id, credits_balance, purchased_credits')
    .lt('credits_balance', 5)
    .order('credits_balance', { ascending: true })
    .limit(20),
]);
```

- [ ] Create `app/api/admin/stats/recent/route.ts`
- [ ] Test response includes all 3 arrays

---

## Task 2.4: KPI Card Component

**File:** `components/admin/KPICard.tsx`

```typescript
interface KPICardProps {
  icon: React.ReactNode;       // Lucide icon
  label: string;               // "Total Users"
  value: string | number;      // "1,234"
  badge?: string;              // "+12 today"
  badgeColor?: 'green' | 'red' | 'blue' | 'yellow';
  loading?: boolean;
}
```

Design:
- White card with subtle shadow
- Icon in colored circle (top-left)
- Value: large bold number
- Label: small gray text below value
- Badge: small pill in top-right corner
- Loading: pulse skeleton animation

- [ ] Create `components/admin/KPICard.tsx`

---

## Task 2.5: StatChart Component

**File:** `components/admin/StatChart.tsx`

Wrapper around recharts with consistent styling.

```typescript
interface StatChartProps {
  title: string;
  type: 'bar' | 'line' | 'pie' | 'stacked-bar';
  data: any[];
  dataKeys?: string[];     // For bar/line charts
  xAxisKey?: string;       // "date"
  colors?: string[];       // Custom colors per series
  loading?: boolean;
  height?: number;         // Default 300
}
```

Colors:
- Indigo-500 (primary)
- Cyan-500 (secondary)
- Amber-500 (tertiary)
- Rose-500 (quaternary)

- [ ] Create `components/admin/StatChart.tsx`
- [ ] Support all 4 chart types: bar, line, pie, stacked-bar

---

## Task 2.6: Dashboard Page

**File:** `app/admin/dashboard/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import KPICard from '@/components/admin/KPICard';
import StatChart from '@/components/admin/StatChart';
// ... imports

export default function AdminDashboardPage() {
  // Fetch data from 3 API endpoints on mount
  // /api/admin/stats/overview
  // /api/admin/stats/charts?chart=signups (and others)
  // /api/admin/stats/recent

  // Auto-refresh every 60 seconds

  return (
    <AdminLayout>
      {/* Page Title */}
      <h1>Dashboard</h1>

      {/* KPI Cards Row — 6 cards in 3-column grid (2 rows) */}
      <div className="grid grid-cols-3 gap-4">
        <KPICard icon={<Users />} label="Total Users" value={stats.totalUsers} badge={`+${stats.newUsersToday} today`} />
        <KPICard icon={<DollarSign />} label="Revenue (MTD)" value={`$${stats.revenueThisMonth}`} />
        <KPICard icon={<Zap />} label="Generations Today" value={stats.generationsToday} />
        <KPICard icon={<AlertTriangle />} label="Error Rate" value={`${stats.errorRate}%`} badgeColor={stats.errorRate > 5 ? 'red' : 'green'} />
        <KPICard icon={<CreditCard />} label="Zero Credits" value={stats.zeroCreditUsers} />
        <KPICard icon={<Crown />} label="Active Subscriptions" value={totalSubs} />
      </div>

      {/* Charts — 2x2 grid */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <StatChart title="User Signups (7d)" type="bar" data={charts.signups} />
        <StatChart title="Revenue Trend (30d)" type="line" data={charts.revenue} />
        <StatChart title="Generations by Studio (7d)" type="stacked-bar" data={charts.generations} />
        <StatChart title="Model Usage" type="pie" data={charts.models} />
      </div>

      {/* Tables — Full width, stacked */}
      <div className="mt-6 space-y-6">
        {/* Recent Generations table */}
        {/* Recent Errors table */}
        {/* Low Credit Users table */}
      </div>
    </AdminLayout>
  );
}
```

- [ ] Create `app/admin/dashboard/page.tsx`
- [ ] Wire all 3 API calls
- [ ] Add auto-refresh (60s interval)
- [ ] Loading skeletons while data loads
- [ ] Test with real data

---

## Task 2.7: DataTable Component (Reusable)

**File:** `components/admin/DataTable.tsx`

Reusable table used across all admin pages.

```typescript
interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;  // Custom cell renderer
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  pagination?: {
    page: number;
    total: number;
    limit: number;
    onPageChange: (page: number) => void;
  };
  onRowClick?: (row: T) => void;
  expandable?: boolean;
  renderExpanded?: (row: T) => React.ReactNode;
  emptyMessage?: string;
}
```

Features:
- Sortable columns (click header to toggle asc/desc)
- Pagination controls (Previous / Page X of Y / Next)
- Loading skeleton rows
- Expandable rows (click to show details)
- Empty state message
- Row click handler

- [ ] Create `components/admin/DataTable.tsx`
- [ ] Test with dummy data

---

## Verification Checklist

- [ ] Dashboard shows 6 KPI cards with real data
- [ ] All 4 charts render correctly
- [ ] Charts handle empty data gracefully (no crashes)
- [ ] Recent generations table shows last 20
- [ ] Recent errors table shows last 10 failed
- [ ] Low credit users table shows users with < 5 credits
- [ ] Auto-refresh works (values update every 60s)
- [ ] Loading skeletons show while data loads
- [ ] `npm run build` passes
