# UX/UI Remediation — Design

**Date:** 2026-07-20
**Status:** Approved for planning
**Origin:** Full UI audit (6 parallel audit agents + an 8-agent adversarial verification workflow)

---

## 1. Problem

A full audit of the PyraSuite dashboard found the product is well-disciplined in several
dimensions and broken in three recurring patterns.

**Verified healthy — do not "fix" these:**

| Area | Finding |
|---|---|
| RTL | Zero `pl-/pr-/ml-/mr-/text-left/text-right` across 7 component directories. All 5 `rtl:rotate-180` sites correct. `DirectionProvider` wired at `app/[locale]/layout.tsx:81`. |
| i18n catalogs | `messages/ar.json` and `messages/en.json` both have exactly 715 leaf keys. Zero missing either direction. 546 static `t()` calls all resolve. |
| Color tokens | Exactly one hardcoded color in all of `app/[locale]/`. |
| Typography | Two-tier page-title scale applied uniformly across 21 pages. |
| Animation | Zero `hover:scale` layout shift; 14 of 15 transition durations in the 150–300ms range. |

**The three failure patterns:**

1. **Built-then-abandoned code.** `hooks/useCredits.ts`, `components/shared/UpgradePrompt.tsx`,
   and four dashboard widgets (`ProfileCompletion`, `UsageStats`, `WeeklyChallenge`, `DailyBonus`)
   are complete, correct, and imported by zero files. In each case the thing they would have
   fixed is currently broken.
2. **Errors swallowed into "you have nothing."** A failed fetch renders the empty state, so a
   user with assets sees "no assets", a user who just paid sees "no transactions", and a user
   with five brand kits sees "create your first brand kit."
3. **One token failing contrast in 124 places.** `--color-text-muted` fails WCAG AA in both
   themes and carries real content, not decoration.

### 1.1 The reported symptom

The credit balance rendered an indefinite loading skeleton on the dashboard card, the sidebar
pill, and the topbar badge.

**Verified mechanism** (confirmed independently by three agents; two of three adversarial
skeptics could not refute it):

- `store/credits.ts:14` initializes `loading: true`.
- `setBalance` (`store/credits.ts:15`) is the only mutator that clears it. `setLoading` has zero
  call sites.
- `app/[locale]/(dashboard)/layout.tsx:23-27` is the only load-time caller, guarded by
  `if (profile)` with **no else branch**.
- `hooks/useUser.ts:29` destructures only `{ data }` from the `profiles` query, discarding the
  error. Any failure yields `profile === null` silently.
- Therefore a failed profile read leaves the skeleton up with no error, no retry, no timeout.

**Explicitly corrected during the audit.** An earlier hypothesis held that the browser Supabase
client could not see a session the server could. That was refuted:

- `/api/credits/transactions` reads `credit_transactions` and never touches `profiles`, so its
  success says nothing about `profiles` readability. The discriminating variable is the *table*,
  not server-vs-browser.
- `middleware.ts:149/175` gates every dashboard render on the same cookie-based `getUser()`, so a
  session invisible to the browser client could not reach the dashboard at all.
- `lib/supabase/client.ts` uses `@supabase/ssr` `createBrowserClient` with no options, reading the
  same non-httpOnly `sb-*` cookies the server reads.

**The failure is intermittent** — the user later observed the balance rendering correctly. This
rules out a missing RLS SELECT policy and a missing `profiles` row (both would fail 100% of the
time) and points at either a transient network failure or the middleware defect in §4.2.

**Design consequence:** the fix is resilience, not a database change. The UI must resolve to a
number or a visible error with retry, never an indefinite skeleton, regardless of cause.

---

## 2. Scope

Six independent clusters, split into two specs by risk profile.

| Cluster | Content | Spec |
|---|---|---|
| A | Contrast and design tokens | 1 |
| B | Credit resilience | 2 |
| C | i18n and locale formatting | 1 |
| D | Mobile and layout foundations | 1 |
| E | Conversion and upsell | 2 |
| F | Dashboard composition | 1 |

**Spec 1 — "Safe Sweep"** (A + C + D + F): mechanical, bounded, easily reverted.
**Spec 2 — "Credits & Conversion"** (B + E): behavioral and architectural.

### 2.1 Out of scope

- Adding test infrastructure (no framework exists; deliberately not introduced here).
- `StudioShell` unification of the 9 studio pages — real, large, deferred to its own spec.
- Sidebar IA restructure (19 rows, 3 dead) — deferred to its own spec.
- Full translation of `community`, `portfolio`, `privacy`, `terms` — each needs a new message
  namespace; deferred.
- Admin console retheming (5 light-theme components inside a hard-dark shell) — separate surface,
  separate spec.

### 2.2 Concurrent-session coordination

A second session is active on this repository, holding uncommitted changes to
`app/api/studios/photoshoot/route.ts`, `lib/ai/prompts/photoshoot.ts`, `lib/ai/prompts/versions.ts`,
`lib/download.ts`, and `lib/storage/persist-image.ts`.

No phase in this design touches any of those files. The only adjacency is Phase 2.3, which edits
`app/[locale]/(dashboard)/photoshoot/page.tsx` — a different file from that session's
`photoshoot/route.ts`. Confirm with the user before starting Phase 2.3 if the other session is
still running.

---

## 3. Spec 1 — Safe Sweep

### Phase 1.1 — Contrast and tokens

**`app/globals.css:25,43`** — swap the two values. Light mode currently measures 2.34–2.56:1,
failing even the 3:1 large-text floor.

```css
:root { --color-text-muted: #64748B; }   /* was #94A3B8 → 4.76:1 on white */
.dark { --color-text-muted: #94A3B8; }   /* was #64748B → 5.71:1 on surface */
```

Two lines, 124 call sites, no markup change.

**`components/ui/dropdown-menu.tsx:38`** — `focus:text-primary-900` is a literal hex
(`#312E81`, `tailwind.config.ts:23`) and is not theme-aware. On `bg-surface-2` in dark mode it
measures 1.10:1, and `outline-none` removes the fallback. Affects the TopBar user menu,
`ExportMenu`, and `ShareMenu`.

```
focus:text-primary-900  →  focus:text-[var(--color-text-primary)]
```

**Acceptance:** every `--color-text-muted` usage measures ≥ 4.5:1 in both themes; dropdown keyboard
focus is legible in dark mode.

### Phase 1.2 — i18n and locale formatting

`useFormatter` from next-intl (v4.8.3, installed) is currently used nowhere in the repo.

| File:line | Change |
|---|---|
| `components/dashboard/ActivityTimeline.tsx:78` | `toLocaleDateString('ar-SA', …)` → `useFormatter().dateTime(…)`. Verified in Node: the current call renders `٢٩ مارس، ١١:٥١ م` on the EN page. |
| `app/api/credits/transactions/route.ts:20` | `.select('*', …)` → `.select('*, generations(studio)', …)`. **See §3.2.1 — the row does not carry `studio` today.** |
| `components/dashboard/ActivityTimeline.tsx:75` | `{a.description \|\| a.type}` → studio name from the joined `generations.studio`, falling back to a type label. `description` is an English sentence frozen at insert time by the studio routes (e.g. `app/api/studios/edit/route.ts:70` writes `Image edit - style_transfer`), so it is unlocalizable by design. |
| `components/dashboard/ActivityTimeline.tsx:64` | `STUDIO_ICONS[a.studio]` → same joined value; also extend the map to all 9 studios (it currently has 4). |
| `components/dashboard/ActivityTimeline.tsx:56` | Hardcoded Arabic empty state → translation key. |
| `app/[locale]/(dashboard)/assets/page.tsx:23-32,155` | Delete the Arabic-only `STUDIO_LABELS` map; use `t('nav.' + s)`. |
| `app/[locale]/(dashboard)/assets/page.tsx:63,106,110,113` | Four hardcoded Arabic toasts → keys. |
| `components/billing/TransactionTable.tsx:72` | Second hardcoded `'ar-SA'` → `useFormatter`. |
| `components/shared/ResolutionSelector.tsx:26` | Hardcoded `دقة الصورة` label → `t()`. The file already imports `useTranslations` at line 22. |
| `i18n/request.ts` | Add `timeZone: 'Asia/Riyadh'` and a `formats.dateTime.short` block. Required once `useFormatter` is adopted, or next-intl emits `ENVIRONMENT_FALLBACK` and server/client disagree on timezone. |

`lib/export/pdf.ts:92,132,155` also hardcode `'ar-SA'`, but as a `lib` with no React context it needs
the locale threaded through from its three call sites. **Deferred to Spec 2 Phase 2.3**, which
already touches the studio pages that call it.

#### 3.2.1 `credit_transactions` has no `studio` column — correction

Discovered while planning; it invalidates the obvious fix and must be handled first.

`supabase/migrations/004_credit_transactions.sql:3-13` defines the table with
`user_id, amount, type, description, generation_id, stripe_payment_intent_id, balance_after,
created_at`. There is **no `studio` column**, and `app/api/credits/transactions/route.ts:20`
selects `'*'`.

Consequences in currently-shipped code:

- `ActivityTimeline.tsx:64` — `STUDIO_ICONS[a.studio]` is always `undefined`, so every row falls
  back to the `Clock` icon. This is visible in the reported screenshot: five rows, five identical
  clock icons.
- `UsageStats.tsx:32` — `tx.description.match(/^(\w[\w-]*)/)` captures the first English word of the
  frozen description (`Image`, `Photoshoot`, `Marketing`), never a studio slug, so every
  `STUDIO_LABELS` lookup at `:59` misses and the chart labels render English fragments. **Mounting
  `UsageStats` unchanged would ship visible garbage.**
- A naive `t('nav.' + a.studio)` would evaluate to `t('nav.undefined')`.

**Fix — join through the existing foreign key.** `credit_transactions.generation_id` references
`generations`, and `generations.studio TEXT NOT NULL` exists
(`supabase/migrations/003_generations_assets.sql:6`) with an index at `:32`. `generations` RLS
allows `SELECT` on own rows (`003:18-20`), so the join resolves under the user's own session with no
schema change and no migration.

```ts
// app/api/credits/transactions/route.ts:19-23
const { data, error, count } = await supabase
  .from('credit_transactions')
  .select('*, generations(studio)', { count: 'exact' })
  .eq('user_id', user.id)
  .order('created_at', { ascending: false })
  .range(offset, offset + limit - 1);
```

Not every transaction has a generation: `subscription`, `topup`, `reset`, `referral`, and
`admin_adjustment` rows have `generation_id IS NULL`. Those must fall back to a type label rather
than rendering blank. Both `ActivityTimeline` and `UsageStats` consume the same shape.

**New message keys required (both locales):** `dashboard.noActivity`, `assets.loadFailed`,
`assets.deleted`, `assets.deleteFailed`, `assets.deleteError`, `credits.resolutionLabel`,
and a `credits.txType.*` group covering all seven transaction types for the null-generation
fallback.

**Acceptance:** `/en` dashboard shows Latin-digit dates and English studio names; `/ar` unchanged;
each activity row shows its own studio's icon rather than a uniform clock; a topup row renders a
type label instead of a blank.

### Phase 1.3 — Mobile and layout foundations

Root cause of several findings: `components/ui/button.tsx:7` carries `whitespace-nowrap`, so any
Button in a flex row cannot shrink below its Arabic label width.

| File:line | Change | Why |
|---|---|---|
| `components/ui/input.tsx:10` | `text-sm` → `text-base sm:text-sm`; `h-10` → `h-11` | Any field under 16px triggers iOS Safari auto-zoom. Desktop appearance unchanged. |
| 11 hand-rolled textareas + 2 selects | same `text-base sm:text-sm` | `CreatorForm:126`, `CampaignForm:84`, `PhotoshootForm:170`, `voiceover:107`, `storyboard:76`, `analysis:88`, `edit:96`, `prompt-builder:87`, `BrandKitForm:97`, `ProjectSelector:101`, `projects:265` |
| `app/[locale]/(dashboard)/referrals/page.tsx:110` | `text-xs` → `text-base sm:text-xs` | 12px field holding a long referral URL |
| `components/ui/dialog.tsx:37` | add `w-[calc(100%-2rem)] max-h-[85dvh] overflow-y-auto`, `p-4 sm:p-6` | A centered fixed box taller than the viewport bleeds off both edges with no scroll — including its own close button. Two call sites already patch this locally, confirming the base is wrong. |
| `components/ui/dialog.tsx:43` | close button → `h-11 w-11` flex-centered | Currently a 16×16 hit area; the primary dismissal affordance on every modal. |
| `tailwind.config.ts` | add `zIndex: { header:30, nav:35, scrim:40, drawer:50, modal:60, toast:70 }` | No scale exists. `BottomNav` (`z-40`) equals the sidebar scrim (`z-40`) and renders later in the DOM (`layout.tsx:42` vs `:31`), so it paints above the scrim and stays tappable while the drawer is modal. |
| `components/layout/BottomNav.tsx:22`, `Sidebar.tsx:218,226`, `ui/dialog.tsx:20,37` | apply the scale | |
| `app/[locale]/(dashboard)/layout.tsx:36` | `pb-14` → `pb-[calc(3.5rem+env(safe-area-inset-bottom))]` | Nav's real height is 56px + inset (34px on a home-indicator iPhone); only 56px is reserved. |
| `app/[locale]/(dashboard)/layout.tsx:32` | add `min-w-0` | Without it, a wide child widens the page column instead of scrolling inside it — this is what turns local overflows into page-level horizontal scroll. Only 3 `min-w-0` exist in the entire repo. |
| `components/layout/Sidebar.tsx:224` | add `role="dialog" aria-modal="true"`, `inert={!sidebarOpen \|\| undefined}`, Escape handler, body scroll lock | Closed drawer is only CSS-translated, so ~18 offscreen links stay tabbable on mobile. |
| `components/shared/ResolutionSelector.tsx:27` | `flex gap-2` → `grid grid-cols-3 gap-2`, stacked label over cost | Measures ~425–469px against 311px available; overflows the Creator studio. |
| `flex` → `flex flex-wrap items-center justify-between gap-2` | `CreatorPreview:142`, `onboarding:158`, `assets:124`, `community:35`, `team:63`, plus the 9 studio submit rows: `CreatorForm:236`, `PhotoshootForm:176`, `CampaignForm:181`, `plan:98`, `storyboard:89`, `analysis:92`, `edit:97`, `voiceover:221`, `prompt-builder:107` | Unshrinkable Buttons opposite Arabic headings. The submit rows are worst while generating, when the button reads "بايرا تشتغل... 🦊" — much wider than "توليد". |
| `app/[locale]/(dashboard)/edit/page.tsx:112` | `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` | 148px per image is unusable for judging an edit |
| `app/[locale]/(dashboard)/storyboard/page.tsx:97` | match the result grid at line 109 | Skeleton is `grid-cols-3`, result is `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` |

**Acceptance:** no horizontal scroll at 375px on dashboard, all 9 studios, billing, assets,
onboarding, referrals; no input under 16px on mobile; dialogs scroll internally; bottom nav sits
below the scrim when the drawer is open.

### Phase 1.4 — Dashboard composition

`app/[locale]/(dashboard)/dashboard/page.tsx` is 89 lines and terminates around 500px, leaving
~55% of a 1080p screen empty. `ActivityTimeline` is the only import from `components/dashboard/`.

1. Mount `ProfileCompletion` (self-hides at 100%, `:25`) above `CreditsWidget`; mount `UsageStats`
   below Quick Actions. Two prerequisites, both inside this phase:
   - **Both contain hardcoded Arabic** (`ProfileCompletion` 5 strings, `UsageStats` 5) — translate
     them as part of this phase.
   - **`UsageStats` aggregation is broken** and must be rewritten onto the §3.2.1 join before it is
     mounted. Replace the `description` regex at `:30-35` with a count keyed on
     `tx.generations?.studio`, skipping rows where it is null. Without this it renders English
     fragments as labels.
2. Add `items-start` to the grid at `:47` so the short right column stops stretching.
3. Quick Actions: add the 3 missing studios (`storyboard`, `edit`, `prompt-builder`) to the array
   at `:20-27`; grid `grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4`.
4. `:57` icon wrapper gets `shrink-0`, `:60` label gets `min-w-0` — at `grid-cols-2` on 375px the
   icon is squeezed instead of the text wrapping.
5. `UsageStats.tsx:59` — `text-[10px] w-16 truncate` → `text-xs w-24 shrink-0 truncate`.
6. `tailwind.config.ts` — add `screens: { xs: '400px' }`.

`WeeklyChallenge` is **not** mounted: `progress = 0; // TODO` at line 20 means it would render a
permanently empty bar. `DailyBonus` is not mounted: the daily-bonus grant path does not exist, and
`022:241` explicitly warns it would become a credit-minting hole.

**Acceptance:** dashboard fills a 1440px viewport with real content; all 9 studios reachable from
Quick Actions; no clipped labels at 375px.

---

## 4. Spec 2 — Credits & Conversion

### Phase 2.1 — Credit resilience

Chosen approach: server-authed React Query as the balance source, **without** touching `useUser`.
`useUser` deduplication is Phase 2.5, deferred, because it is a performance concern rather than a
correctness one and carries a much larger blast radius.

**`store/credits.ts`** — replace the boolean with a tri-state:

```ts
type CreditsStatus = 'loading' | 'ready' | 'error';

interface CreditsState {
  balance: number;
  status: CreditsStatus;
  updatedAt: number;
  setBalance: (balance: number) => void;
  setError: () => void;
  deductCredits: (amount: number) => void;
  addCredits: (amount: number) => void;
}

setBalance: (balance) => set({ balance, status: 'ready', updatedAt: Date.now() }),
// Never downgrade a number we already know. A failed background poll must not
// replace a good balance with an error card — it would flash every 30s on a
// weak connection. Errors surface only when we never had a number.
setError: () => set((s) => (s.status === 'ready' ? s : { ...s, status: 'error' })),
```

Removing `loading` is deliberate: TypeScript strict then forces every reader to be updated, which
is how the workflow caught that `Sidebar.tsx` had been missed.

**`hooks/useCredits.ts`** — make polling an explicit single-owner opt-in:

```ts
interface UseCreditsOptions { /** Only the dashboard layout owns the poll. */ poll?: boolean }

const query = useQuery({
  queryKey: CREDITS_BALANCE_QUERY_KEY,
  queryFn: async () => {
    const res = await fetch('/api/credits/balance');
    if (!res.ok) throw new Error('balance_unavailable');
    const json = await res.json() as CreditBalanceResponse;
    // success:false resolves the promise; without this throw React Query's
    // error state never engages and the UI cannot distinguish failure.
    if (!json.success || !json.data) throw new Error('balance_unavailable');
    return json;
  },
  refetchInterval: poll ? 30_000 : false,
  refetchOnWindowFocus: poll,
});
```

`app/[locale]/(dashboard)/layout.tsx` calls `useCredits({ poll: true })`; every widget calls
`useCredits()` for read + retry with no timer of its own.

**Consumers** — each gets a third branch with a retry button, modelled on the existing correct
implementations in `components/shared/ProjectSelector.tsx:38-83` and
`components/studios/creator/CreatorPreview.tsx:44-70`:

`components/layout/CreditsWidget.tsx:28`, `components/layout/Sidebar.tsx:77,178-186,194-202`,
`components/layout/TopBar.tsx:73`, `components/shared/LowCreditsBanner.tsx:13`,
`app/[locale]/(dashboard)/billing/page.tsx:25,34,134`.

`LowCreditsBanner` matters disproportionately: `if (loading || balance > 5) return null` means the
low-credit warning is currently suppressed for the entire session whenever the latch holds — a user
can reach zero credits with no warning.

`billing/page.tsx` must not be skipped: it currently renders `{balance} / {currentPlan.credits}` as
a confident `0 / 200` while loading, on the exact page a worried user navigates to.

**`CreditsWidget.tsx:29-35`** — reshape the skeleton to the loaded card's ~150px height. It
currently reserves ~68px and everything below it jumps on resolve.

**Defects to avoid** (each found by an adversarial critic against a draft of this design):

1. `Sidebar.tsx:77` must be updated in the same commit or the build fails with TS2339.
2. `refetchInterval` inside the hook with N mounted instances creates N independent poll timers —
   React Query keeps the interval per *observer*, not per query. Hence the `poll` flag.
3. Do not add a `SessionSync` provider in this phase. It belongs to the `useUser` refactor, and the
   naive version double-fetches on `INITIAL_SESSION` (delivered to every new subscriber on
   subscribe) and fires authenticated queries at a destroyed session during `signOut`.
4. The stale-write guard must be symmetric. Both writers carry the timestamp at which their request
   *departed*, and a write is dropped if the store was updated after that:

   ```ts
   // in useCredits' queryFn: capture before the fetch, compare after it resolves
   const startedAt = Date.now();
   // ...await fetch...
   if (startedAt < useCreditsStore.getState().updatedAt) return; // a newer write won
   setBalance(json.data.balance);
   ```

   The studio pages need the same guard: `reserveCredits` snapshots the balance *before* the
   generation runs (`supabase/migrations/018_fix_reserve_credits_expiry.sql`), so a slow generation
   can return a `newBalance` that is older than a poll that has already landed. Without the guard in
   both directions the displayed number can go backwards.
5. Preserve all 8 studio pages' optimistic `setBalance(newBalance)` calls — `creator:69`,
   `photoshoot:54`, `campaign:59`, `plan:67`, `storyboard:62`, `analysis:65`, `voiceover:83`,
   `edit:59`. The signature `(balance: number) => void` is unchanged, so their `useCallback` dep
   arrays stay valid.

**New message keys (both locales):** `credits.loadFailed`, `credits.loadFailedHint`,
`credits.retry`, `credits.unavailable`. Arabic copy must be real Arabic — a draft of this design
shipped a placeholder string into `ar.json`.

**Acceptance:** with `/api/credits/balance` forced to 500, every credit surface shows an error with
a working retry and none shows a fabricated `0`; with it restored, all surfaces resolve; exactly one
network request per 30s per tab regardless of how many widgets are mounted.

### Phase 2.2 — Middleware cookie propagation (isolated commit)

`middleware.ts:91-98` — the `/api/*` branch builds a Supabase client whose `setAll` writes only to
`request.cookies` and returns a bare `NextResponse.next()` at `:108`. Rotated refresh tokens are
never written to the response, so the browser keeps a consumed token. The page branch
(`:135-145`) does this correctly.

Fix: mirror the page branch — write to both `request.cookies` and `response.cookies`.

Shipped as its own commit with nothing else in it. If a mass logout follows, the cause is
unambiguous and revert is one command. Phase 2.1 must land first so that even if this fix is
reverted, the user-visible symptom stays fixed.

**Acceptance:** no `400 Invalid Refresh Token: Already Used` on `/auth/v1/token`; session survives
repeated API-heavy navigation; existing sessions are not invalidated on deploy.

### Phase 2.3 — Conversion and upsell

Today, running out of credits mid-flow produces HTTP 402 → `mapApiError` → the string
*"رصيدك من الكريدت غير كافٍ — اشحن رصيدك من صفحة الفواتير"* rendered as plain red text with **no
link**, at 8 sites. The message instructs the user to navigate to billing and does not take them
there. `components/shared/UpgradePrompt.tsx` implements exactly this — all three variants and a
`/billing` CTA — and is imported by zero files.

1. **Wire `UpgradePrompt`** into the shared studio error path for the four gate codes already in
   `lib/studio-errors.ts:1-18`: `insufficient_credits`, `resolution_not_available`,
   `voice_not_available`, `dialect_not_available`.
2. **Fix `UpgradePrompt.tsx:68`** — hardcoded English `credits` → translation key.
3. **`components/shared/CreditCost.tsx`** — currently takes only `cost`. Add `balance` from the
   store: render `🪙 5 · لديك 42` normally, amber `🪙 14 · لديك 2 — غير كافٍ` when short.
4. **Pre-flight gate.** Every studio's Generate button is `disabled={!isValid || isLoading}`, never
   `cost > balance`. Add the affordability check; when short, relabel to "اشحن رصيدك" linking to
   `/billing`. This removes the 402 round-trip entirely.
5. **Gate resolution client-side** in `ResolutionSelector` the way `voiceover` already gates voices
   (`voiceover/page.tsx:118-210`, with `Lock` icons and disabled options). Creator's resolution
   limit is currently enforced server-side only (`app/api/studios/creator/route.ts:65-71`), so a
   free user picks 4K, waits, and gets an error.
6. **`lib/export/pdf.ts:92,132,155`** — thread the active locale through from the three call sites;
   the PDF chrome is currently Arabic-only regardless of locale.

**Acceptance:** a user with 2 credits cannot start a 14-credit generation; the insufficient-credits
path presents a modal with a working billing link; resolution options above the user's plan are
visibly locked before submission.

### Phase 2.4 — Onboarding

Step 5 promises *"أضفنا 5 كريدت مجانية لحسابك"*. `app/api/user/onboarding/route.ts:10-13` only sets
`onboarding_completed: true`. No credit grant exists anywhere. Decision: **honour the promise.**

**Security constraint.** `022:57` grants users `UPDATE` on `onboarding_completed`. Idempotency
guarded on that flag alone would be an unlimited credit-minting path: set it false, re-POST, repeat.
The guard must live in a record the user cannot write.

**New migration `027_onboarding_bonus.sql`:**

```sql
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN ('subscription','topup','usage','refund','reset','referral',
                  'admin_adjustment','onboarding'));

-- The idempotency guard. INSERT on this table is service_role-only (022), so a
-- user cannot forge or delete the row that blocks a second grant.
CREATE UNIQUE INDEX IF NOT EXISTS credit_tx_one_onboarding_per_user
  ON credit_transactions (user_id) WHERE type = 'onboarding';
```

Plus `grant_onboarding_bonus(p_user_id uuid, p_credits int)`, `SECURITY DEFINER SET search_path =
public`, following `026_referral_abuse_controls.sql:99-131`:

- Award into **`purchased_credits`**, never `credits_balance`. Per the comment at `026:108`,
  `credits_balance` is overwritten on every renewal and plan change, so a bonus written there
  evaporates. Set `purchased_credits_expires_at` consistently with the referral grant.
- Insert the `credit_transactions` row inside the same transaction; catch `unique_violation` and
  return `{ success: false, error: 'already_granted' }` rather than raising.
- Return the new total balance so the client can `setBalance` without a refetch.

**`middleware.ts:160`** — add `onboarding_completed` to the existing `banned` profile select and
redirect to `/onboarding` when false. Today the redirect exists only in
`app/[locale]/(auth)/callback/route.ts:93-97` (OAuth and magic link);
`app/[locale]/(auth)/login/page.tsx:41` goes straight to `/dashboard`. A user who signs up by email
and closes the tab mid-flow never sees onboarding again.

**Acceptance:** completing onboarding increases the balance by exactly 5 and writes one
`credit_transactions` row; a second POST returns `already_granted` and grants nothing; manually
resetting `onboarding_completed` to false and re-POSTing grants nothing; an email signup that
abandons onboarding is returned to it on next login.

### Phase 2.5 — `useUser` deduplication (deferred)

`useUser()` is instantiated in 10 components — `layout:19`, `TopBar:27`, `Sidebar:78`,
`CreditsWidget:21`, `dashboard/page:31` all mount simultaneously, plus `billing:24`, `settings:23`,
`voiceover:42`, `portfolio:11`, `ProfileCompletion:16`. Each runs its own `auth.getUser()` network
call, its own `profiles` select, and its own `onAuthStateChange` subscription.

Convert to a React Query hook so all consumers share one cache entry, preserving the existing
`signOut` behaviour and all 10 call-site contracts.

Deferred deliberately: this is the most likely *cause* of the intermittent profile-read failure, but
Phase 2.1 makes that failure invisible to users, which converts this from an urgent fix into a
considered performance improvement.

---

## 5. Verification

No test framework exists in this repository and none is introduced here. Every phase gates on:

```
npx tsc --noEmit  →  npx next lint  →  npx next build  →  browser verification
```

Browser verification runs the dev server and checks the affected surfaces across light/dark ×
375px/desktop × `ar`/`en`, with screenshots provided to the user. A phase is not complete until all
four gates pass. Type-checking alone cannot catch contrast, overflow, or z-index regressions, which
is most of Spec 1.

## 6. Sequencing

Spec 1 → Spec 2, phases in numeric order, one commit per phase.

Spec 1 first for two reasons. It is near-zero risk with immediate visible payoff — Phase 1.1 alone
is two lines and fixes 124 sites. And it is a real dependency, not just an ordering preference:
`UpgradePrompt.tsx:56` renders inside `Dialog`, so without the Phase 1.3 `max-h` fix the Phase 2.3
upsell modal would overflow the viewport on mobile and its billing CTA would be unreachable.

Within Spec 2, Phase 2.1 precedes Phase 2.2 so the user-visible symptom is fixed independently of
the middleware change and survives a revert of it.
