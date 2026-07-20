# Credits & Conversion Implementation Plan (Spec 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the credit balance impossible to leave in an unresolved state, fix the auth-cookie defect that most likely causes it, and turn the "you're out of credits" dead end into a working top-up path.

**Architecture:** Six tasks, one commit each. The balance moves to a server-authed React Query source with a tri-state store; the middleware fix ships isolated so a revert is unambiguous; conversion work wires up components that already exist but are imported nowhere.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind v3, shadcn/ui, next-intl, Supabase (RLS + SECURITY DEFINER RPCs), Zustand, React Query v5.

**Spec:** `docs/superpowers/specs/2026-07-20-ux-remediation-design.md` §4

## Global Constraints

- TypeScript strict. Zero `any`. Zero build errors.
- RTL-first: `ps/pe/ms/me/start/end` only — never `pl/pr/ml/mr/left/right`.
- Colors via CSS variables. For primary-coloured **text** use `var(--color-brand)` or `var(--color-link)` — never `text-primary-500/600`, which are fixed hexes that do not flip with the theme.
- All user-facing strings via next-intl. Every key added to `messages/ar.json` must be added to `messages/en.json` at the same path. Parity is verified每 task.
- Arabic copy calls the AI **بايرا**, never a model name.
- Icons from `lucide-react`. No emoji in an icon slot.
- A concurrent session owns `app/api/studios/*`, `app/api/user/profile`, `lib/ai/*`, `lib/download.ts`, `lib/image/*`, `lib/storage/*`, `package.json`. **Read them freely; never modify or stage them.**
- Commit explicit paths only. Never `git add -A`.
- Never run `npx next build` while the dev server is running — it clobbers `.next`.

## Verification Gate (every task)

```bash
npx tsc --noEmit          # exit 0
npx next lint             # zero warnings
# message parity
python -c "import json;a=json.load(open('messages/ar.json',encoding='utf-8'));e=json.load(open('messages/en.json',encoding='utf-8'));f=lambda d,p='':[k for kk,v in d.items() for k in (f(v,p+kk+'.') if isinstance(v,dict) else [p+kk])];A,E=set(f(a)),set(f(e));print('ar-only:',sorted(A-E));print('en-only:',sorted(E-A));print('counts:',len(A),len(E))"
```

---

### Task 1: Tri-state credit store and a server-authed balance

**Files:**
- Modify: `store/credits.ts`
- Modify: `hooks/useCredits.ts`
- Modify: `app/[locale]/(dashboard)/layout.tsx`
- Modify: `components/layout/CreditsWidget.tsx`, `components/layout/Sidebar.tsx`, `components/layout/TopBar.tsx`, `components/shared/LowCreditsBanner.tsx`, `app/[locale]/(dashboard)/billing/page.tsx`
- Modify: `messages/ar.json`, `messages/en.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `useCredits(opts?: { poll?: boolean }): { balance: number; status: 'loading'|'ready'|'error'; refetch: () => void }`, and a store exposing `status`/`setError` instead of `loading`. **Every later task reads `status`.**

**Why:** `store/credits.ts` initialises `loading: true` and `setBalance` is the only mutator that clears it. The only load-time caller is the dashboard layout, guarded by `if (profile)` with no else, fed by a `profiles` read in `hooks/useUser.ts` whose error is discarded. Any failure leaves every credit surface on a skeleton forever — including `LowCreditsBanner`, which returns `null` while loading and therefore suppresses the out-of-credits warning for the whole session. `hooks/useCredits.ts` already polls the server-authed `/api/credits/balance` but is imported by **zero** files.

- [ ] **Step 1: Replace the boolean with a tri-state store**

`store/credits.ts` — full new contents:

```ts
import { create } from 'zustand';

export type CreditsStatus = 'loading' | 'ready' | 'error';

interface CreditsState {
  balance: number;
  status: CreditsStatus;
  /** Timestamp of the last successful write. Used to drop stale writes. */
  updatedAt: number;
  setBalance: (balance: number) => void;
  setError: () => void;
  deductCredits: (amount: number) => void;
  addCredits: (amount: number) => void;
}

export const useCreditsStore = create<CreditsState>((set) => ({
  balance: 0,
  status: 'loading',
  updatedAt: 0,
  setBalance: (balance) => set({ balance, status: 'ready', updatedAt: Date.now() }),
  // Never downgrade a number we already know. A failed background poll must not
  // replace a good balance with an error card — that would flash every 30s on a
  // weak connection. Errors surface only when we never had a number at all.
  setError: () => set((s) => (s.status === 'ready' ? s : { ...s, status: 'error' })),
  deductCredits: (amount) =>
    set((state) => ({ balance: Math.max(0, state.balance - amount), updatedAt: Date.now() })),
  addCredits: (amount) =>
    set((state) => ({ balance: state.balance + amount, updatedAt: Date.now() })),
}));
```

Removing `loading` is deliberate: strict TypeScript then forces every reader to be updated, which is how a missed consumer gets caught at compile time rather than in production.

- [ ] **Step 2: Make polling a single-owner opt-in**

`hooks/useCredits.ts` — full new contents:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useCreditsStore, type CreditsStatus } from '@/store/credits';

export const CREDITS_BALANCE_QUERY_KEY = ['credits-balance'] as const;

interface CreditBalanceResponse {
  success: boolean;
  data?: { balance: number; planId: string };
}

interface UseCreditsOptions {
  /** Only the dashboard layout owns the poll. See the comment below. */
  poll?: boolean;
}

interface UseCreditsReturn {
  balance: number;
  status: CreditsStatus;
  refetch: () => void;
}

export function useCredits({ poll = false }: UseCreditsOptions = {}): UseCreditsReturn {
  const { balance, status, setBalance, setError } = useCreditsStore();

  const query = useQuery({
    queryKey: CREDITS_BALANCE_QUERY_KEY,
    queryFn: async () => {
      // Capture BEFORE the request departs. A generation that finishes while
      // this is in flight writes a newer balance; without this guard the slower
      // response wins and the number visibly goes backwards.
      const startedAt = Date.now();
      const res = await fetch('/api/credits/balance');
      if (!res.ok) throw new Error('balance_unavailable');
      const json = (await res.json()) as CreditBalanceResponse;
      // success:false still resolves the promise. Without this throw, React
      // Query's error state never engages and the UI cannot tell failure apart
      // from success.
      if (!json.success || !json.data) throw new Error('balance_unavailable');
      return { balance: json.data.balance, startedAt };
    },
    // React Query keeps refetchInterval per OBSERVER, not per query. With five
    // widgets mounting this hook that would be five independent timers, drifting
    // out of phase on every remount. Exactly one caller polls.
    refetchInterval: poll ? 30_000 : false,
    refetchOnWindowFocus: poll,
  });

  useEffect(() => {
    if (!query.data) return;
    if (query.data.startedAt < useCreditsStore.getState().updatedAt) return;
    setBalance(query.data.balance);
  }, [query.data, setBalance]);

  useEffect(() => {
    if (query.isError) setError();
  }, [query.isError, setError]);

  return { balance, status, refetch: () => { void query.refetch(); } };
}
```

- [ ] **Step 3: Mount the poll in the dashboard layout**

`app/[locale]/(dashboard)/layout.tsx` — replace the `useUser`/`setBalance` effect. Delete the `useCreditsStore` and `useUser` imports if nothing else in the file uses them (check first — `useUser` may still be needed).

```tsx
  // The server route is cookie-authenticated and is the same path that already
  // works for every other dashboard fetch, so the balance no longer depends on
  // the browser Supabase client's profile read succeeding.
  useCredits({ poll: true });
```

- [ ] **Step 4: Add the error-state message keys**

`messages/ar.json` → inside `"credits"`:

```json
    "loadFailed": "تعذّر تحميل رصيدك",
    "loadFailedHint": "رصيدك محفوظ — دي مشكلة في العرض بس.",
    "retry": "إعادة المحاولة",
    "unavailable": "غير متاح"
```

`messages/en.json` → inside `"credits"`:

```json
    "loadFailed": "Couldn't load your balance",
    "loadFailedHint": "Your credits are safe — this is a display problem only.",
    "retry": "Try again",
    "unavailable": "Unavailable"
```

The hint matters: the whole failure mode this task fixes is a user believing their credits vanished.

- [ ] **Step 5: Give every consumer a third branch**

Each of these currently renders `loading ? skeleton : value`. Add an error branch with a working retry. Use `components/shared/ProjectSelector.tsx` and `components/studios/creator/CreatorPreview.tsx` as the in-repo reference for this pattern.

`components/layout/CreditsWidget.tsx` — replace the `if (loading)` block. Also reshape the skeleton to the loaded card's height (~150px); it currently reserves ~68px and everything below it jumps on resolve:

```tsx
  const { balance, status, refetch } = useCredits();

  if (status === 'loading') {
    return (
      <div className={cn('rounded-lg border p-4 space-y-3 min-h-[150px]', className)}>
        <div className="flex items-center justify-between">
          <div className="h-5 w-24 animate-pulse rounded bg-surface-2" />
          <div className="h-6 w-12 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-2 w-full animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-20 animate-pulse rounded bg-surface-2" />
        <div className="h-9 w-full animate-pulse rounded bg-surface-2" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={cn('rounded-lg border p-4 space-y-3 min-h-[150px]', className)}>
        <div className="flex items-center gap-2 text-sm text-[var(--color-error)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{t('loadFailed')}</span>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">{t('loadFailedHint')}</p>
        <Button size="sm" variant="outline" className="w-full" onClick={refetch}>
          <RefreshCw className="h-3 w-3 me-1" />
          {t('retry')}
        </Button>
      </div>
    );
  }
```

Import `RefreshCw` from lucide-react alongside the existing icons.

`components/layout/TopBar.tsx` (~line 72) — the badge:

```tsx
          {status === 'loading' ? (
            <Skeleton className="h-5 w-10" />
          ) : status === 'error' ? (
            <span className="text-xs">{tCredits('unavailable')}</span>
          ) : (
            <AnimatedNumber value={balance} className="font-semibold" />
          )}
```

`components/layout/Sidebar.tsx` — both the collapsed branch (~line 204) and the expanded branch (~line 218), plus the `Progress` at ~line 226. On error show a compact retry button rather than a bare dash.

`components/shared/LowCreditsBanner.tsx:13` — currently `if (loading || balance > 5) return null;`. It must not stay silent forever on error, but it also must not claim a balance it does not have:

```tsx
  const { balance, status } = useCredits();
  // Only assert "you are low" when we actually know the number.
  if (status !== 'ready' || balance > 5) return null;
```

`app/[locale]/(dashboard)/billing/page.tsx:25,34,135` — this page currently renders a confident `0 / 200` while loading, on the exact page a worried user opens:

```tsx
const { balance, status: creditsStatus } = useCredits();
const creditPercentage =
  creditsStatus === 'ready' && currentPlan.credits > 0
    ? Math.min((balance / currentPlan.credits) * 100, 100)
    : 0;
```
and at the render site show `tCredits('unavailable')` unless `creditsStatus === 'ready'`.

- [ ] **Step 6: Confirm the 8 studio optimistic writes still compile**

The studio pages call `useCreditsStore((s) => s.setBalance)` and then `setBalance(data.data.newBalance)`. The signature `(balance: number) => void` is unchanged, so their `useCallback` dep arrays stay valid. Verify all 8 still typecheck — `creator:69`, `photoshoot:54`, `campaign:59`, `plan:67`, `storyboard:62`, `analysis:65`, `voiceover:83`, `edit:59`:

```bash
grep -rn "setBalance" --include=*.tsx "app/[locale]/(dashboard)" | grep -v layout.tsx
```
Expected: 8 pages × 2 lines (selector + call). Do not change them.

- [ ] **Step 7: Verification gate**

Run the gate. Then in the browser, with the dev server running and logged in, force a failure and confirm no surface fabricates a `0`:

```js
// in the page console: make the balance route fail, then click any retry
const orig = window.fetch;
window.fetch = (u, o) => String(u).includes('/api/credits/balance')
  ? Promise.resolve(new Response('{"success":false}', {status:500}))
  : orig(u, o);
```
Expect: sidebar, topbar, dashboard card and billing all show an error with a retry; none shows `0`. Restore with `window.fetch = orig` and confirm retry recovers.

- [ ] **Step 8: Commit**

```bash
git add store/credits.ts hooks/useCredits.ts "app/[locale]/(dashboard)/layout.tsx" "app/[locale]/(dashboard)/billing/page.tsx" components/layout/CreditsWidget.tsx components/layout/Sidebar.tsx components/layout/TopBar.tsx components/shared/LowCreditsBanner.tsx messages/ar.json messages/en.json
git commit -m "fix(credits): balance can no longer hang on an unresolved skeleton

The store initialised loading:true and setBalance was the only mutator that
cleared it. The sole load-time caller was the dashboard layout, guarded by
if (profile) with no else branch, fed by a profiles read whose error was
discarded. Any failure left every credit surface skeletonised for the whole
session — including LowCreditsBanner, which returns null while loading and so
suppressed the out-of-credits warning entirely.

hooks/useCredits already polled the cookie-authenticated /api/credits/balance
and was imported by nothing. It is now the source of truth, mounted once in
the layout. Polling is a single-owner opt-in because React Query keeps
refetchInterval per observer, not per query.

Status is now loading|ready|error. setError never downgrades a balance we
already know, so a failed background poll cannot flash an error over a good
number. A stale-write guard drops any response that departed before a newer
write landed."
```

---

### Task 2: Middleware cookie propagation (isolated commit)

**Files:** Modify `middleware.ts` (the `/api/*` branch, ~lines 90-108)

**Interfaces:** Consumes nothing, produces nothing. Deliberately isolated.

**Why:** The `/api/*` branch builds a Supabase client whose `setAll` writes **only** to `request.cookies`, then returns a bare `NextResponse.next()`. Rotated refresh tokens are never written to the response, so the browser keeps a consumed token. The page branch does this correctly. This is the strongest candidate for the intermittent balance failure Task 1 papers over.

- [ ] **Step 1: Propagate refreshed cookies onto the response**

```ts
    if (!isPublicApi) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseKey) {
        // getUser() can rotate the refresh token. Both the outgoing request AND
        // the response must carry the new values, or the browser keeps a token
        // the server has already consumed and its next refresh fails. The page
        // branch below already does this; this branch did not.
        let response = NextResponse.next({ request });

        const supabase = createServerClient(supabaseUrl, supabaseKey, {
          cookies: {
            getAll() { return request.cookies.getAll(); },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => { request.cookies.set(name, value); });
              response = NextResponse.next({ request });
              cookiesToSet.forEach(({ name, value, options }) => {
                response.cookies.set(name, value, options);
              });
            },
          },
        });

        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
        }

        return response;
      }
    }

    return NextResponse.next();
```

Read the page branch (~lines 135-145) first and mirror its exact shape rather than inventing a variant.

- [ ] **Step 2: Verification gate + a session-survival check**

Run the gate. Then, logged in, navigate the dashboard through several API-heavy pages and confirm in the Network tab that no request to `/auth/v1/token?grant_type=refresh_token` returns `400 Invalid Refresh Token: Already Used`, and that the session survives a hard reload.

- [ ] **Step 3: Commit — this file and nothing else**

```bash
git add middleware.ts
git commit -m "fix(auth): propagate rotated refresh tokens on API requests

The /api/* branch built a Supabase client whose setAll wrote only to
request.cookies and then returned a bare NextResponse.next(), so tokens
rotated by getUser() never reached the browser. Every API call could
therefore leave the client holding a consumed refresh token, whose next
refresh fails — while the page branch, which does propagate cookies, kept
working. That asymmetry is the most likely cause of the intermittent
credit-balance failures.

Shipped alone so that if a mass logout follows, the cause is unambiguous
and the revert is one commit."
```

---

### Task 3: Show the balance next to the cost, and gate Generate on affordability

**Files:**
- Modify: `components/shared/CreditCost.tsx`
- Modify: the 9 studio submit rows: `components/studios/creator/CreatorForm.tsx`, `components/studios/photoshoot/PhotoshootForm.tsx`, `components/studios/campaign/CampaignForm.tsx`, and `app/[locale]/(dashboard)/{plan,storyboard,analysis,voiceover,edit,prompt-builder}/page.tsx`
- Modify: `messages/ar.json`, `messages/en.json`

**Interfaces:** Consumes `useCredits()` from Task 1.

**Why:** `CreditCost` takes only `cost` and has no access to the balance. Every studio's Generate button is `disabled={!isValid || isLoading}` — never `cost > balance`. A user with 2 credits can start a 14-credit storyboard, wait, and receive a 402. `CreditCost` also renders a hardcoded English `"Free"` (line 17) in an Arabic-first product.

- [ ] **Step 1: New message keys**

`ar.json` → `credits`: `"free": "مجاناً"`, `"youHave": "لديك {balance}"`, `"notEnough": "غير كافٍ"`, `"topUpShort": "اشحن رصيدك"`
`en.json` → `credits`: `"free": "Free"`, `"youHave": "You have {balance}"`, `"notEnough": "Not enough"`, `"topUpShort": "Top up"`

- [ ] **Step 2: Teach CreditCost about the balance**

```tsx
export function CreditCost({ cost, className }: CreditCostProps): React.ReactElement {
  const t = useTranslations('credits');
  const { balance, status } = useCredits();
  const known = status === 'ready';
  const short = known && cost > balance;

  if (cost === 0) {
    return <Badge variant="success" className={className}>{t('free')}</Badge>;
  }

  return (
    <Badge variant={short ? 'destructive' : 'secondary'} className={className}>
      <Coins className="h-3 w-3 me-1 shrink-0" />
      {cost} {t('cost')}
      {/* Only assert a balance we actually have — Task 1's error state must not
          become a silent "you have 0". */}
      {known && <span className="ms-1 opacity-80">· {t('youHave', { balance })}</span>}
      {short && <span className="ms-1 font-medium">· {t('notEnough')}</span>}
    </Badge>
  );
}
```

Confirm `Badge` has a `destructive` variant; if not, use the existing warning styling rather than inventing one.

- [ ] **Step 3: Gate each Generate button**

At each of the 9 submit rows, add the affordability condition. Read each site first — the cost expression differs (creator computes from resolution × variations, photoshoot from shot count, voiceover via `calculateVoiceoverCost`, the rest are constants from `CREDIT_COSTS`).

```tsx
const { balance, status: creditsStatus } = useCredits();
const cannotAfford = creditsStatus === 'ready' && cost > balance;
// ...
<Button disabled={!isValid || isLoading || cannotAfford}>…</Button>
{cannotAfford && (
  <Button asChild variant="default" size="sm">
    <Link href="/billing">{t('topUpShort')}</Link>
  </Button>
)}
```

Note `cannotAfford` is false while status is `loading`/`error` — never block a user because we failed to read their balance.

- [ ] **Step 4: Verification gate + browser check**

Gate, then in the browser: on `/ar/storyboard` with a low balance, confirm Generate is disabled and a top-up link appears; confirm the badge reads `14 التكلفة · لديك 2 · غير كافٍ`.

- [ ] **Step 5: Commit** (name the 10 modified paths explicitly)

---

### Task 4: Wire UpgradePrompt into the studio error path

**Files:**
- Modify: `components/shared/UpgradePrompt.tsx` (line 68 hardcoded English)
- Modify: the 9 studio pages' error render sites
- Modify: `components/shared/ResolutionSelector.tsx`
- Modify: `messages/ar.json`, `messages/en.json`

**Interfaces:** Consumes `useCredits()` from Task 1.

**Why:** Running out mid-flow returns HTTP 402 → `mapApiError` → *"رصيدك من الكريدت غير كافٍ — اشحن رصيدك من صفحة الفواتير"* rendered as **plain red text with no link**, at 8 sites. The message tells the user to go to billing and does not take them there. `components/shared/UpgradePrompt.tsx` implements exactly this — all three variants plus a `/billing` CTA — and is imported by **zero** files.

- [ ] **Step 1: Fix the hardcoded English inside UpgradePrompt**

`UpgradePrompt.tsx:68` renders `{availableCredits} / {requiredCredits} credits`. Replace `credits` with the existing `credits.creditsCount` key or a new one; do not leave an English literal.

- [ ] **Step 2: Render the modal for the four gate codes**

`lib/studio-errors.ts` already knows all four: `insufficient_credits`, `resolution_not_available`, `voice_not_available`, `dialect_not_available`. At each studio's error site, when the raw code is one of these, render `<UpgradePrompt>` instead of inert text, mapping code → variant (`insufficient_credits` → `insufficient_credits`; `resolution_not_available` → `resolution_locked`; the two voice ones → `feature_locked`).

The studio pages currently store the **mapped message**, not the code. You will need to keep the raw code in state alongside it. Read one studio page fully before editing all nine, and apply one consistent shape.

- [ ] **Step 3: Gate resolution client-side**

`app/api/studios/creator/route.ts:65-71` returns `resolution_not_available` (403) — server-side only. A free user picks 4K, waits, and gets an error. `ResolutionSelector` must disable options above the user's plan with a `Lock` icon, the way `voiceover/page.tsx:118-210` already gates voices. Do **not** modify the route (concurrent session owns it) — read it to learn the plan limits.

- [ ] **Step 4: Verification gate + browser check**

With a low balance, trigger a generation and confirm a modal appears with a working "اشحن رصيدك" link to `/billing` — not red text.

- [ ] **Step 5: Commit**

---

### Task 5: Grant the onboarding bonus the product already promises

**Files:**
- Create: `supabase/migrations/027_onboarding_bonus.sql`
- Modify: `app/api/user/onboarding/route.ts`
- Modify: `middleware.ts`
- Modify: `messages/ar.json`, `messages/en.json` (only if copy changes)

**Interfaces:** Consumes nothing. The RPC returns the new total balance so the client can `setBalance` without a refetch.

**Why:** Onboarding step 5 says *"أضفنا 5 كريدت مجانية لحسابك"*. `app/api/user/onboarding/route.ts` only sets `onboarding_completed: true`. **No credit grant exists anywhere.** The user's balance visibly does not move.

**Security constraint — read this before writing the guard.** `supabase/migrations/022_privilege_lockdown.sql:57` grants authenticated users `UPDATE` on `onboarding_completed`. Idempotency keyed on that flag would be an unlimited credit-minting path: set it false, re-POST, repeat. The guard must live in a row the user cannot write.

- [ ] **Step 1: Write the migration**

```sql
-- Migration 027: onboarding welcome bonus

ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('subscription','topup','usage','refund','reset','referral',
                  'admin_adjustment','onboarding'));

-- THE IDEMPOTENCY GUARD. Users hold UPDATE on profiles.onboarding_completed
-- (022:57), so guarding on that flag alone would let anyone reset it and
-- re-claim the bonus indefinitely. INSERT on credit_transactions is
-- service_role-only, so this row cannot be forged or deleted by its owner.
CREATE UNIQUE INDEX IF NOT EXISTS credit_tx_one_onboarding_per_user
  ON credit_transactions (user_id) WHERE type = 'onboarding';

CREATE OR REPLACE FUNCTION grant_onboarding_bonus(p_user_id UUID, p_credits INT)
RETURNS JSONB AS $$
DECLARE
  v_balance INT;
BEGIN
  -- Award into purchased_credits, NOT credits_balance. Per 026:108,
  -- credits_balance is overwritten on every renewal and plan change, so a
  -- bonus written there evaporates at the next billing cycle.
  UPDATE public.profiles
  SET purchased_credits = COALESCE(purchased_credits, 0) + p_credits,
      purchased_credits_expires_at = NOW() + INTERVAL '365 days',
      onboarding_completed = TRUE
  WHERE id = p_user_id
  RETURNING COALESCE(credits_balance, 0) + COALESCE(purchased_credits, 0) INTO v_balance;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
  VALUES (p_user_id, p_credits, 'onboarding', 'Onboarding welcome bonus', v_balance);

  RETURN jsonb_build_object('success', true, 'credits_awarded', p_credits, 'new_balance', v_balance);
EXCEPTION WHEN unique_violation THEN
  -- Already granted. A repeat POST is a normal outcome, not a 500.
  RETURN jsonb_build_object('success', false, 'error', 'already_granted');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION grant_onboarding_bonus(UUID, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION grant_onboarding_bonus(UUID, INT) TO service_role;
```

**Note the `UPDATE` also sets `onboarding_completed`, and the transaction rolls back on `unique_violation`** — so a re-claim attempt grants nothing *and* leaves the profile untouched. Verify that behaviour explicitly in Step 3.

- [ ] **Step 2: Call the RPC from the route**

`app/api/user/onboarding/route.ts` — use the **service-role** client (the function is service_role-only) and return `new_balance` so the client can update without a refetch. Handle `already_granted` as a success-shaped response, not an error.

- [ ] **Step 3: Prove idempotency against the real database**

Apply the migration, then with a test user:
1. POST once → balance +5, exactly one `credit_transactions` row with `type='onboarding'`.
2. POST again → `already_granted`, balance unchanged, still one row.
3. `UPDATE profiles SET onboarding_completed = false WHERE id = <test user>;` then POST again → still `already_granted`, balance still unchanged. **This is the security test; it must pass.**

Use `npm run db:query -- <file.sql>` for any SQL containing non-ASCII.

- [ ] **Step 4: Close the onboarding-skip hole**

`middleware.ts` (~line 160) already selects `banned` from `profiles`. Add `onboarding_completed` to that same select and redirect to `/onboarding` when it is false. Today the redirect exists only in `app/[locale]/(auth)/callback/route.ts:93-97` (OAuth and magic link); `app/[locale]/(auth)/login/page.tsx:41` goes straight to `/dashboard`, so an email signup that closes the tab mid-flow never sees onboarding again.

Guard against a redirect loop: exclude `/onboarding` itself and any public path from the redirect.

- [ ] **Step 5: Verification gate + commit**

---

### Task 6: Deduplicate `useUser`

**Files:** Modify `hooks/useUser.ts`; verify all 10 call sites still compile.

**Why:** `useUser()` is instantiated in 10 components — `layout`, `TopBar`, `Sidebar`, `CreditsWidget`, `dashboard/page` all mount simultaneously, plus `billing`, `settings`, `voiceover`, `portfolio`, `ProfileCompletion`. Each runs its own `auth.getUser()` network call, its own `profiles` select, and its own `onAuthStateChange` subscription. That is the most likely cause of the intermittent profile-read failure — but Task 1 already makes that failure invisible, so this is a considered performance improvement rather than an urgent fix.

- [ ] **Step 1: Convert to React Query, preserving the public shape**

Keep the returned object shape (`user`, `profile`, `loading`, `signOut`) so all 10 call sites compile unchanged; add `isError` and `refetch`. Preserve `signOut`'s `localStorage.removeItem('pyra.selectedProject')` and its hard `window.location.href` navigation.

**Do not** add a `SessionSync` provider that invalidates on every `onAuthStateChange` event: `supabase-js` delivers `INITIAL_SESSION` to every new subscriber on subscribe, so an unfiltered handler doubles every page load's requests, and firing invalidations during `signOut` sends authenticated queries at a destroyed session. If you need session reactivity, filter to actual identity changes only.

- [ ] **Step 2: Verification gate + browser check**

In the Network tab, load `/ar/dashboard` and count requests to `/api/user/profile` (or the Supabase `profiles` REST call). Expect **1**, not 5.

- [ ] **Step 3: Commit**

---

## Self-Review

**Spec coverage.** Spec §4.1 → Task 1. §4.2 → Task 2. §4.3 → Tasks 3 and 4. §4.4 → Task 5. §4.5 → Task 6. §5 verification gate is embedded in every task.

**Ordering dependencies.** Tasks 3 and 4 consume `useCredits()`'s `status` from Task 1 and must not run before it. Task 2 is deliberately independent and ships alone. Task 5 is independent. Task 6 is last because it has the widest blast radius and the least urgency.

**Newly found during planning, folded in:** `components/shared/CreditCost.tsx:17` renders a hardcoded English `"Free"` — fixed in Task 3 Step 2.

**Risks.**
1. Task 4 requires studio pages to retain the raw error code, not just the mapped message. Read one page fully and settle the shape before editing nine.
2. Task 5's migration must be applied to the deployed database before the route change ships, or every onboarding completion 500s. Apply migration first, verify, then deploy the route.
3. `Badge` may not have a `destructive` variant; check before relying on it in Task 3.
