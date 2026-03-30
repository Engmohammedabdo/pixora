# Phase 4: Generations + Transactions — View + Filter + Manage

> **Goal:** Admin can view, filter, and manage all generations and credit transactions.
> **Estimate:** 1-2 days
> **Dependency:** Phase 1 + DataTable component from Phase 2

---

## Task 4.1: Generations List API

**File:** `app/api/admin/generations/route.ts`

```typescript
// GET /api/admin/generations?studio=&model=&status=&user_id=&from=&to=&page=1&limit=20&sort=created_at&order=desc

export async function GET(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const supabase = createAdminClient();
  const url = new URL(request.url);

  const studio = url.searchParams.get('studio');
  const model = url.searchParams.get('model');
  const status = url.searchParams.get('status');
  const userId = url.searchParams.get('user_id');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const sort = url.searchParams.get('sort') || 'created_at';
  const order = url.searchParams.get('order') === 'asc';
  const offset = (page - 1) * limit;

  let query = supabase
    .from('generations')
    .select('id, studio, model, status, credits_used, error, created_at, input, output, user_id, profiles(name, email)', { count: 'exact' });

  if (studio) query = query.eq('studio', studio);
  if (model) query = query.eq('model', model);
  if (status) query = query.eq('status', status);
  if (userId) query = query.eq('user_id', userId);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  query = query
    .order(sort, { ascending: order })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  return NextResponse.json({
    success: true,
    data: data || [],
    pagination: { page, limit, total: count || 0 },
  });
}

// DELETE /api/admin/generations?id=xxx

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const supabase = createAdminClient();
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });

  // Delete associated assets first
  await supabase.from('assets').delete().eq('generation_id', id);

  // Delete generation
  const { error } = await supabase.from('generations').delete().eq('id', id);

  if (error) return serverError(error.message);

  await logAdminAction('generation_delete', 'generation', id, null, getClientIP(request));

  return NextResponse.json({ success: true });
}
```

- [ ] Create `app/api/admin/generations/route.ts` with GET + DELETE
- [ ] Test all filters: studio, model, status, user_id, date range
- [ ] Test DELETE: removes generation + associated assets

---

## Task 4.2: Transactions List API

**File:** `app/api/admin/transactions/route.ts`

```typescript
// GET /api/admin/transactions?type=&user_id=&from=&to=&direction=&page=1&limit=20

export async function GET(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const supabase = createAdminClient();
  const url = new URL(request.url);

  const type = url.searchParams.get('type');
  const userId = url.searchParams.get('user_id');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const direction = url.searchParams.get('direction'); // 'positive', 'negative', null=all
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  let query = supabase
    .from('credit_transactions')
    .select('id, amount, type, description, balance_after, created_at, user_id, profiles(name, email)', { count: 'exact' });

  if (type) query = query.eq('type', type);
  if (userId) query = query.eq('user_id', userId);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);
  if (direction === 'positive') query = query.gt('amount', 0);
  if (direction === 'negative') query = query.lt('amount', 0);

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  // Also fetch summary totals (all matching, no pagination)
  let summaryQuery = supabase
    .from('credit_transactions')
    .select('amount');

  if (type) summaryQuery = summaryQuery.eq('type', type);
  if (userId) summaryQuery = summaryQuery.eq('user_id', userId);
  if (from) summaryQuery = summaryQuery.gte('created_at', from);
  if (to) summaryQuery = summaryQuery.lte('created_at', to);

  const { data: summaryData } = await summaryQuery;

  const totalIn = summaryData?.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0) || 0;
  const totalOut = summaryData?.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0) || 0;

  return NextResponse.json({
    success: true,
    data: data || [],
    summary: { totalIn, totalOut, net: totalIn - totalOut },
    pagination: { page, limit, total: count || 0 },
  });
}
```

- [ ] Create `app/api/admin/transactions/route.ts` with GET
- [ ] Test filters: type, user_id, date range, direction
- [ ] Test summary totals are correct

---

## Task 4.3: ExpandableRow Component

**File:** `components/admin/ExpandableRow.tsx`

Used in the Generations table to show full JSONB data on click.

```typescript
interface ExpandableRowProps {
  data: Record<string, any>;  // The JSONB to display
  imageUrl?: string;          // If output has an image URL, show preview
}

// Renders:
// - Formatted JSON with syntax highlighting (use <pre> with Tailwind colors)
// - Image preview if URL detected (max 300px width)
// - Copy button for the JSON
```

- [ ] Create `components/admin/ExpandableRow.tsx`

---

## Task 4.4: Generations Page

**File:** `app/admin/generations/page.tsx`

```typescript
// Layout:
// ┌──────────────────────────────────────────────────────┐
// │ Generations                                           │
// │                                                       │
// │ [Studio ▼] [Model ▼] [Status ▼] [From] [To] [Search] │
// │                                                       │
// │ ┌────┬────────┬──────┬───────┬────────┬──────┬──────┐│
// │ │User│ Studio │Model │Status │Credits │ Time │  ⋮   ││
// │ ├────┼────────┼──────┼───────┼────────┼──────┼──────┤│
// │ │Ali │creator │gemini│  ✅   │  2     │ 5m   │ View ││
// │ │... │        │      │       │        │      │      ││
// │ └────┴────────┴──────┴───────┴────────┴──────┴──────┘│
// │                                                       │
// │ Showing 1-20 of 1,234    [← Prev] [Page 1] [Next →]  │
// └──────────────────────────────────────────────────────┘
```

Columns:
| Column | Render |
|--------|--------|
| User | `profiles.name` (link to `/admin/users/[id]`) |
| Studio | Badge with icon |
| Model | Text |
| Status | Color badge: pending=yellow, processing=blue, completed=green, failed=red |
| Credits | Number |
| Time | Relative ("5m ago") |
| Actions | Expand (show I/O) + Delete button |

Filter dropdowns:
- Studio: all + each studio name
- Model: all + gemini/gpt/flux
- Status: all + pending/processing/completed/failed
- Date range: from/to date pickers

- [ ] Create `app/admin/generations/page.tsx`
- [ ] Expandable rows show input/output JSONB
- [ ] Delete with confirm dialog
- [ ] All filters work

---

## Task 4.5: Transactions Page

**File:** `app/admin/transactions/page.tsx`

```typescript
// Layout:
// ┌──────────────────────────────────────────────────────┐
// │ Transactions                    [Manual Adjustment]   │
// │                                                       │
// │ ┌─────────────┬─────────────┬─────────────┐          │
// │ │ Credits In  │ Credits Out │    Net       │          │
// │ │  +12,345    │  -8,901     │   +3,444     │          │
// │ └─────────────┴─────────────┴─────────────┘          │
// │                                                       │
// │ [Type ▼] [Direction ▼] [From] [To] [Search user]     │
// │                                                       │
// │ ┌─────┬────────┬──────┬─────────────┬────────┬──────┐│
// │ │User │Amount  │Type  │Description  │Balance │ Time ││
// │ ├─────┼────────┼──────┼─────────────┼────────┼──────┤│
// │ │Ali  │ +200   │sub   │Monthly Pro  │  650   │ 1h   ││
// │ │Sara │  -12   │usage │Campaign gen │  188   │ 2h   ││
// │ └─────┴────────┴──────┴─────────────┴────────┴──────┘│
// └──────────────────────────────────────────────────────┘
```

Summary cards at top:
- Credits Added (green, positive sum)
- Credits Used (red, absolute negative sum)
- Net (blue or red based on sign)

Amount column: green text for positive, red for negative.

Type badges:
- subscription: indigo
- topup: green
- usage: slate
- refund: amber
- reset: gray

"Manual Adjustment" button → opens `CreditAdjustModal` with user search autocomplete.

- [ ] Create `app/admin/transactions/page.tsx`
- [ ] Summary cards show correct totals
- [ ] Filters work
- [ ] Manual adjustment button works (search user → adjust)

---

## Verification Checklist

- [ ] Generations page loads with all data
- [ ] All 4 filters work (studio, model, status, date range)
- [ ] User filter works (from user detail or direct URL param)
- [ ] Expand row shows formatted JSON + image preview
- [ ] Delete generation removes it + associated assets
- [ ] Transactions page loads with summary cards
- [ ] Transaction filters work
- [ ] Amount colors: green for positive, red for negative
- [ ] Manual credit adjustment from transactions page works
- [ ] Pagination works on both pages
- [ ] `npm run build` passes
