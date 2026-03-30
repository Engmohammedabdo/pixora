# Phase 3: User Management — List + Detail + Actions

> **Goal:** Admin can search, view, and manage all users and their data.
> **Estimate:** 2-3 days
> **Dependency:** Phase 1 + Phase 2 (DataTable component)

---

## Task 3.1: Users List API

**File:** `app/api/admin/users/route.ts`

```typescript
// GET /api/admin/users?search=&plan=&page=1&limit=20&sort=created_at&order=desc

export async function GET(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const supabase = createAdminClient();
  const url = new URL(request.url);

  // Parse query params
  const search = url.searchParams.get('search') || '';
  const plan = url.searchParams.get('plan') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const sort = url.searchParams.get('sort') || 'created_at';
  const order = url.searchParams.get('order') === 'asc' ? true : false;
  const offset = (page - 1) * limit;

  // Build query
  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' });

  // Search by name or email
  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  // Filter by plan
  if (plan) {
    query = query.eq('plan_id', plan);
  }

  // Sort + paginate
  query = query
    .order(sort, { ascending: order })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  // For each user, get generation count
  // Option A: Separate count queries (simple but N+1)
  // Option B: Use a DB function (better performance)
  // For MVP, just return the profiles without gen count.
  // Gen count can be added later via RPC or when viewing detail.

  return NextResponse.json({
    success: true,
    data: data || [],
    pagination: { page, limit, total: count || 0 },
  });
}
```

- [ ] Create `app/api/admin/users/route.ts` with GET handler
- [ ] Support search, plan filter, sort, pagination

---

## Task 3.2: User Detail API

**File:** `app/api/admin/users/[id]/route.ts`

```typescript
// GET /api/admin/users/[id] — full user detail with stats

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const supabase = createAdminClient();
  const { id } = params;

  // Fetch user profile
  const { data: user, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (!user) return notFound();

  // Fetch related counts in parallel
  const [genCount, transCount, brandKitCount, assetCount] = await Promise.all([
    supabase.from('generations').select('*', { count: 'exact', head: true }).eq('user_id', id),
    supabase.from('credit_transactions').select('*', { count: 'exact', head: true }).eq('user_id', id),
    supabase.from('brand_kits').select('*', { count: 'exact', head: true }).eq('user_id', id),
    supabase.from('assets').select('*', { count: 'exact', head: true }).eq('user_id', id),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      ...user,
      stats: {
        generations: genCount.count || 0,
        transactions: transCount.count || 0,
        brandKits: brandKitCount.count || 0,
        assets: assetCount.count || 0,
      },
    },
  });
}

// PATCH /api/admin/users/[id] — update user (plan, banned, etc.)

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const supabase = createAdminClient();
  const { id } = params;
  const body = await request.json();

  // Allowed fields to update
  const allowedFields = ['plan_id', 'banned', 'banned_at', 'ban_reason', 'name', 'email'];
  const updates: Record<string, any> = {};

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  // If banning, set banned_at
  if (updates.banned === true) {
    updates.banned_at = new Date().toISOString();
  }
  if (updates.banned === false) {
    updates.banned_at = null;
    updates.ban_reason = null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return serverError(error.message);

  // Log action
  await logAdminAction('user_update', 'user', id, updates, getClientIP(request));

  return NextResponse.json({ success: true, data });
}

// DELETE /api/admin/users/[id] — delete user account

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const supabase = createAdminClient();
  const { id } = params;

  // Delete from Supabase Auth (cascades to profiles via FK)
  const { error } = await supabase.auth.admin.deleteUser(id);

  if (error) return serverError(error.message);

  await logAdminAction('user_delete', 'user', id, null, getClientIP(request));

  return NextResponse.json({ success: true });
}
```

- [ ] Create `app/api/admin/users/[id]/route.ts` with GET, PATCH, DELETE

---

## Task 3.3: Manual Credit Adjustment API

**File:** `app/api/admin/users/[id]/credits/route.ts`

```typescript
// POST /api/admin/users/[id]/credits
// Body: { amount: number, reason: string }

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const supabase = createAdminClient();
  const { id } = params;
  const { amount, reason } = await request.json();

  if (!amount || typeof amount !== 'number') {
    return NextResponse.json({ success: false, error: 'Amount required' }, { status: 400 });
  }
  if (!reason?.trim()) {
    return NextResponse.json({ success: false, error: 'Reason required' }, { status: 400 });
  }

  // Get current balance
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits_balance')
    .eq('id', id)
    .single();

  if (!profile) return notFound();

  const newBalance = profile.credits_balance + amount;
  if (newBalance < 0) {
    return NextResponse.json({ success: false, error: 'Would result in negative balance' }, { status: 400 });
  }

  // Update balance
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ credits_balance: newBalance })
    .eq('id', id);

  if (updateError) return serverError(updateError.message);

  // Log transaction
  await supabase.from('credit_transactions').insert({
    user_id: id,
    amount,
    type: amount > 0 ? 'refund' : 'usage',  // refund for positive, usage for negative
    description: `[Admin] ${reason}`,
    balance_after: newBalance,
  });

  // Log admin action
  await logAdminAction('credit_adjustment', 'user', id, { amount, reason, newBalance }, getClientIP(request));

  return NextResponse.json({ success: true, data: { newBalance } });
}
```

- [ ] Create `app/api/admin/users/[id]/credits/route.ts`
- [ ] Test: positive adjustment, negative adjustment, insufficient balance

---

## Task 3.4: User Tabs Data APIs

The user detail page has tabs. Each tab fetches data separately via query params.

**Generations tab:** `GET /api/admin/generations?user_id={id}&page=1&limit=20` (reuse from Phase 4)

**Transactions tab:** `GET /api/admin/transactions?user_id={id}&page=1&limit=20` (reuse from Phase 4)

**Brand Kits tab:**
```typescript
// Add to app/api/admin/users/[id]/route.ts or create new endpoint
// GET /api/admin/users/[id]?tab=brand_kits
const { data: brandKits } = await supabase
  .from('brand_kits')
  .select('*')
  .eq('user_id', id)
  .order('created_at', { ascending: false });
```

**Assets tab:**
```typescript
const { data: assets } = await supabase
  .from('assets')
  .select('*')
  .eq('user_id', id)
  .order('created_at', { ascending: false })
  .limit(50);
```

- [ ] Ensure generation/transaction APIs support `user_id` filter
- [ ] Add brand_kits and assets to user detail API or separate endpoints

---

## Task 3.5: Users List Page

**File:** `app/admin/users/page.tsx`

```typescript
'use client';

import AdminLayout from '@/components/admin/AdminLayout';
import DataTable from '@/components/admin/DataTable';
import FilterBar from '@/components/admin/FilterBar';

// State: search, plan filter, page, sort
// Fetch: /api/admin/users with params
// Display: DataTable with columns

// Columns:
// - Avatar (image, 32x32 circle)
// - Name (text, clickable → /admin/users/[id])
// - Email (text)
// - Plan (badge: free=gray, starter=blue, pro=indigo, business=purple, agency=amber)
// - Credits (number: balance + purchased)
// - Joined (relative date)
// - Status (green "Active" / red "Banned" badge)
// - Actions (View button)

// FilterBar:
// - Search input (debounced 300ms)
// - Plan dropdown
// - Sort by dropdown
```

**File:** `components/admin/FilterBar.tsx`

```typescript
interface FilterBarProps {
  onSearchChange: (value: string) => void;
  filters: Array<{
    key: string;
    label: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
  }>;
}
```

- [ ] Create `app/admin/users/page.tsx`
- [ ] Create `components/admin/FilterBar.tsx`
- [ ] Test: search filters users, plan filter works, pagination works

---

## Task 3.6: User Detail Page

**File:** `app/admin/users/[id]/page.tsx`

```typescript
// Layout:
// ┌─────────────────────────────────────────────────────┐
// │ ← Back to Users                                     │
// │                                                      │
// │ ┌──────────┐  Name                                  │
// │ │  Avatar  │  email@example.com                     │
// │ │          │  Plan: Pro  |  Joined: Mar 15, 2026    │
// │ └──────────┘  Stripe: cus_xxx (link)                │
// │                                                      │
// │ [Adjust Credits]  [Change Plan ▼]  [Ban]  [Delete]  │
// │                                                      │
// │ Credits: 450 monthly + 100 purchased = 550 total    │
// │                                                      │
// │ ┌────────────────────────────────────────────────┐  │
// │ │ Generations │ Transactions │ Brand Kits │ Assets│  │
// │ ├────────────────────────────────────────────────┤  │
// │ │                                                │  │
// │ │  (Tab content - DataTable)                     │  │
// │ │                                                │  │
// │ └────────────────────────────────────────────────┘  │
// └─────────────────────────────────────────────────────┘
```

**File:** `components/admin/UserDetailCard.tsx`
- Profile info display
- Stripe links (opens in new tab)
- Quick stats (generations, transactions, etc.)

**File:** `components/admin/CreditAdjustModal.tsx`
```typescript
interface CreditAdjustModalProps {
  userId: string;
  currentBalance: number;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
}

// UI:
// - Amount input (number, positive or negative)
// - Quick buttons: +10, +50, +100, -10, -50
// - Reason textarea (required)
// - Preview: "Balance will change: 450 → 500"
// - Submit button
```

- [ ] Create `app/admin/users/[id]/page.tsx`
- [ ] Create `components/admin/UserDetailCard.tsx`
- [ ] Create `components/admin/CreditAdjustModal.tsx`
- [ ] Tabs work: Generations, Transactions, Brand Kits, Assets
- [ ] Credit adjustment modal works end-to-end
- [ ] Plan change dropdown works
- [ ] Ban/unban toggle with confirm dialog

---

## Task 3.7: ConfirmDialog Component

**File:** `components/admin/ConfirmDialog.tsx`

```typescript
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;      // "Delete" / "Ban" / "Confirm"
  confirmVariant?: 'danger' | 'primary';
  requireInput?: string;      // If set, user must type this to confirm (e.g. email for delete)
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}
```

- Use Radix Dialog (already in project via shadcn/ui)
- Red button for danger actions
- Optional "type X to confirm" field for destructive actions

- [ ] Create `components/admin/ConfirmDialog.tsx`

---

## Verification Checklist

- [ ] Users list shows all profiles with correct data
- [ ] Search filters by name and email (case-insensitive)
- [ ] Plan filter works
- [ ] Pagination: shows correct page/total, nav works
- [ ] Click user → navigates to detail page
- [ ] User detail shows correct profile info
- [ ] Credit adjustment: +50 → balance increases, logged in transactions
- [ ] Plan change: free → pro → shows correct badge
- [ ] Ban user: shows "Banned" badge, ban_reason stored
- [ ] Unban user: badge returns to "Active"
- [ ] Delete user: confirm dialog, then user removed
- [ ] All tabs load correct data
- [ ] Stripe links open correct URLs
- [ ] All admin actions logged to admin_logs
- [ ] `npm run build` passes
