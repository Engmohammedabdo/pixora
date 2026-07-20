# Safe Sweep Implementation Plan (Spec 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix contrast, locale formatting, mobile layout, and dashboard emptiness in PyraSuite without changing any product behaviour.

**Architecture:** Seven independent tasks, each one commit. No new dependencies, no schema migrations, no API contract changes except one additive Supabase join. Every task is revertible on its own.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, Tailwind v3, shadcn/ui, next-intl v4.8.3, Supabase, Zustand, React Query.

**Spec:** `docs/superpowers/specs/2026-07-20-ux-remediation-design.md`

## Global Constraints

- TypeScript strict. Zero `any`. Zero build errors.
- RTL-first: use `ps/pe/ms/me/start/end`, never `pl/pr/ml/mr/left/right`.
- Colors via CSS variables (`bg-[var(--color-surface)]`), never `bg-white` / `bg-gray-*`.
- No inline `style={{}}` unless the value is genuinely dynamic.
- All user-facing strings via next-intl. Every new key added to **both** `messages/ar.json` and `messages/en.json`.
- Arabic copy refers to the AI as **بايرا**, never a model name.
- Icons from `lucide-react`. No emoji in an icon slot.
- Do not touch these files — a concurrent session holds uncommitted changes in them:
  `app/api/studios/{campaign,creator,edit,photoshoot}/route.ts`, `app/api/user/profile/route.ts`,
  `lib/ai/prompts/photoshoot.ts`, `lib/ai/prompts/versions.ts`, `lib/download.ts`,
  `lib/image/watermark.ts`, `lib/storage/persist-image.ts`, `package.json`.
- Commit only the files a task names. Never `git add -A` — it would sweep up the other session's work.

## Verification Gate (every task)

```bash
npx tsc --noEmit          # expect: exit 0, no output
npx next lint             # expect: no new warnings beyond the pre-existing
                          #   jsx-a11y/alt-text at components/layout/Sidebar.tsx:47
```

Then browser verification per the task's own acceptance criteria. A task is not done until both pass.

---

### Task 1: Contrast tokens and dropdown focus

**Files:**
- Modify: `app/globals.css:25` and `app/globals.css:43`
- Modify: `components/ui/dropdown-menu.tsx:38`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Pure CSS values; no symbol changes.

**Why:** `--color-text-muted` measures 2.34–2.56:1 in light mode (fails even the 3:1 large-text floor) and 3.07–3.75:1 in dark. It carries real content across 124 sites — credit costs, character counters, timestamps, prices, and every studio-form placeholder. `focus:text-primary-900` is a literal hex (`#312E81`, `tailwind.config.ts:23`) that is not theme-aware; on `bg-surface-2` in dark mode it measures 1.10:1, and `outline-none` removes the fallback affordance.

- [ ] **Step 1: Swap the light-mode muted token**

In `app/globals.css`, inside the `:root` block, change line 25:

```css
    --color-text-muted: #64748B;
```

(was `#94A3B8`. New ratio on `--color-surface` `#FFFFFF`: 4.76:1 ✓)

- [ ] **Step 2: Swap the dark-mode muted token**

In `app/globals.css`, inside the `.dark` block, change line 43:

```css
    --color-text-muted: #94A3B8;
```

(was `#64748B`. New ratio on `--color-surface` `#1E293B`: 5.71:1 ✓)

- [ ] **Step 3: Make dropdown focus text theme-aware**

In `components/ui/dropdown-menu.tsx`, in `DropdownMenuItem`, replace `focus:text-primary-900` with the token. The full className string becomes:

```tsx
      'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-surface-2 focus:text-[var(--color-text-primary)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
```

- [ ] **Step 4: Run the verification gate**

```bash
npx tsc --noEmit && npx next lint
```
Expected: exit 0; no new lint warnings.

- [ ] **Step 5: Browser verification**

Start the dev server via the preview tool (never `npm run dev` in a shell). Then check:
1. `/ar/dashboard` in **light** mode — the "Credit Balance" caption, activity timestamps, and form placeholders are legibly grey, not washed out.
2. Toggle to **dark** mode — same text is still legible and has not become too bright against `#1E293B`.
3. Open the TopBar avatar menu, press `ArrowDown` — the focused row's text is readable in **dark** mode (this is the 1.10:1 fix).

- [ ] **Step 6: Commit**

```bash
git add app/globals.css components/ui/dropdown-menu.tsx
git commit -m "fix(a11y): meet WCAG AA on muted text and dropdown focus

--color-text-muted measured 2.34-2.56:1 in light and 3.07-3.75:1 in dark,
failing AA in both themes across 124 usages that carry real content. The
two theme values were simply inverted; swapping them yields 4.76:1 light
and 5.71:1 dark with no markup change.

DropdownMenuItem focused text used primary-900, a literal hex that does
not flip with the theme: 1.10:1 on bg-surface-2 in dark mode, with
outline-none removing the only fallback."
```

---

### Task 2: Join studio through generations, and fix the activity feed

**Files:**
- Modify: `app/api/credits/transactions/route.ts:19-23`
- Modify: `components/dashboard/ActivityTimeline.tsx` (imports, `Activity` interface, icon map, lines 30-37, 56, 64, 74-84)
- Modify: `messages/ar.json`, `messages/en.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the `/api/credits/transactions` response rows now carry
  `generations: { studio: string } | null`. **Task 7 (`UsageStats`) depends on this field.**

**Why:** `credit_transactions` has no `studio` column (`supabase/migrations/004_credit_transactions.sql:3-13`). `ActivityTimeline.tsx:64` reads `a.studio`, which is always `undefined`, so every row renders the same `Clock` icon. Line 75 renders `a.description`, an English sentence frozen at insert time by the studio routes (`Image edit - style_transfer`), which is unlocalizable. Line 78 hardcodes `'ar-SA'`, so the EN page shows Arabic-Indic digits. `generations.studio` exists (`003_generations_assets.sql:6`, indexed at `:32`, own-row SELECT policy at `:18-20`) and `credit_transactions.generation_id` already references it.

- [ ] **Step 1: Add the join to the transactions route**

In `app/api/credits/transactions/route.ts`, change the select on line 20:

```ts
    const { data, error, count } = await supabase
      .from('credit_transactions')
      // credit_transactions has no studio column; the studio lives on the
      // generation this transaction paid for. Rows with no generation
      // (subscription, topup, reset, referral, admin_adjustment) join to null
      // and fall back to a transaction-type label in the UI.
      .select('*, generations(studio)', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
```

- [ ] **Step 2: Add the transaction-type message keys**

In `messages/ar.json`, inside the existing `"credits"` object, add a `txType` group after `"creditsCount"`. (`usage`, `subscription`, `topup`, `refund` already exist as siblings but are used as history filters; this group is a complete set for the fallback label.)

```json
    "txType": {
      "usage": "استخدام",
      "subscription": "اشتراك",
      "topup": "شحن رصيد",
      "refund": "استرداد",
      "reset": "تجديد شهري",
      "referral": "مكافأة دعوة",
      "admin_adjustment": "تعديل إداري",
      "onboarding": "مكافأة ترحيب"
    }
```

In `messages/en.json`, inside `"credits"`:

```json
    "txType": {
      "usage": "Usage",
      "subscription": "Subscription",
      "topup": "Top-up",
      "refund": "Refund",
      "reset": "Monthly reset",
      "referral": "Referral bonus",
      "admin_adjustment": "Admin adjustment",
      "onboarding": "Welcome bonus"
    }
```

- [ ] **Step 3: Rewrite ActivityTimeline**

Replace the whole of `components/dashboard/ActivityTimeline.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Image, Camera, LayoutGrid, BarChart3, Clock, Map, Film, Mic, Pencil, Lightbulb,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// All 9 studios. The previous map had 4, but it was keyed on a field that was
// always undefined, so every row fell back to Clock regardless.
const STUDIO_ICONS: Record<string, LucideIcon> = {
  creator: Image,
  photoshoot: Camera,
  campaign: LayoutGrid,
  plan: Map,
  storyboard: Film,
  analysis: BarChart3,
  voiceover: Mic,
  edit: Pencil,
  'prompt-builder': Lightbulb,
};

type TxType =
  | 'usage' | 'subscription' | 'topup' | 'refund'
  | 'reset' | 'referral' | 'admin_adjustment' | 'onboarding';

interface Activity {
  id: string;
  type: TxType;
  amount: number | null;
  created_at: string;
  // Supabase returns an embedded object for a to-one relation; it is null when
  // generation_id is null.
  generations: { studio: string } | null;
}

export function ActivityTimeline(): React.ReactElement {
  const t = useTranslations();
  const format = useFormatter();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/credits/transactions?limit=10')
      .then((r) => r.json())
      .then((d: { success?: boolean; data?: Activity[] }) => {
        if (d.success) setActivities(d.data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-surface-2 animate-pulse" />
        ))}
      </div>
    );

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-[var(--color-text-muted)]">
        <Clock className="h-8 w-8 mb-2" />
        <p className="text-sm">{t('dashboard.noGenerations')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {activities.slice(0, 5).map((a) => {
        const studio = a.generations?.studio;
        const Icon = (studio && STUDIO_ICONS[studio]) || Clock;
        // A studio generation names its studio; everything else (topups,
        // renewals, referral bonuses) names its transaction type.
        const label = studio ? t(`nav.${studio}`) : t(`credits.txType.${a.type}`);
        return (
          <div
            key={a.id}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-2/50"
          >
            <div className="h-8 w-8 shrink-0 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
              <Icon className="h-4 w-4 text-primary-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate">{label}</p>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {format.dateTime(new Date(a.created_at), {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <Badge variant="secondary" className="text-[9px] shrink-0">
              {(a.amount ?? 0) > 0 ? `+${a.amount}` : a.amount}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
```

**Slug→key mapping is resolved, not assumed.** Verified against both message files and all 9 studio
routes: 8 stored slugs match a `nav` key exactly (`creator`, `photoshoot`, `campaign`, `plan`,
`storyboard`, `analysis`, `voiceover`, `edit`), but `app/api/studios/prompt-builder/route.ts:48`
stores `'prompt-builder'` while the message key is `nav.promptBuilder`. Interpolating would produce
`nav.prompt-builder`, which exists in neither locale.

Add this map above the component and use it instead of raw interpolation:

```tsx
// generations.studio stores route slugs; nav keys are camelCase. Only
// prompt-builder diverges, but interpolating would silently miss it.
const STUDIO_NAV_KEY: Record<string, string> = {
  creator: 'creator', photoshoot: 'photoshoot', campaign: 'campaign',
  plan: 'plan', storyboard: 'storyboard', analysis: 'analysis',
  voiceover: 'voiceover', edit: 'edit', 'prompt-builder': 'promptBuilder',
};
```

and in the render:

```tsx
        const navKey = studio ? STUDIO_NAV_KEY[studio] : undefined;
        const label = navKey ? t(`nav.${navKey}`) : t(`credits.txType.${a.type}`);
```

This also makes an unrecognised future slug fall back to the type label rather than throwing.

- [ ] **Step 4: Add the timezone config**

`useFormatter` without a configured timezone makes next-intl emit an `ENVIRONMENT_FALLBACK` warning and lets server and client disagree. In `i18n/request.ts`, extend the returned object:

```ts
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Without an explicit zone, next-intl falls back to the runtime's zone —
    // the server's on SSR and the browser's on hydration — which both warns
    // and can render two different times for the same row.
    timeZone: 'Asia/Riyadh',
  };
```

- [ ] **Step 5: Run the verification gate**

```bash
npx tsc --noEmit && npx next lint
```
Expected: exit 0.

- [ ] **Step 6: Browser verification**

1. `/en/dashboard` — "Recent Generations" timestamps use **Latin** digits and English month names. This is the reported bug.
2. Row labels read as studio names ("Image Creator", "Image Edit"), **not** `Image edit - style_tr…`.
3. Each row shows its own studio icon; they are no longer all clocks.
4. `/ar/dashboard` — same rows in Arabic with Arabic-Indic digits.
5. If the account has a topup or subscription row, it renders a type label, not a blank.

- [ ] **Step 7: Commit**

```bash
git add app/api/credits/transactions/route.ts components/dashboard/ActivityTimeline.tsx i18n/request.ts messages/ar.json messages/en.json
git commit -m "fix(dashboard): localize the activity feed and give it real studio data

credit_transactions has no studio column, so ActivityTimeline's icon lookup
read undefined and every row rendered the same Clock. The label rendered
credit_transactions.description — an English sentence frozen at insert time
by the studio routes ('Image edit - style_transfer') and unlocalizable by
construction. The timestamp hardcoded 'ar-SA', so the EN dashboard showed
Arabic-Indic digits.

Joins through the existing generation_id FK to generations.studio, which is
indexed and already covered by an own-row SELECT policy, so no schema change
is needed. Rows with no generation fall back to a transaction-type label.
Adds an explicit timeZone so useFormatter does not fall back to the runtime
zone and disagree between server and client."
```

---

### Task 3: Remaining hardcoded locale strings and formats

**Files:**
- Modify: `app/[locale]/(dashboard)/assets/page.tsx:23-32, 63, 106, 110, 113, 155`
- Modify: `components/billing/TransactionTable.tsx:72`
- Modify: `components/shared/ResolutionSelector.tsx:26`
- Modify: `messages/ar.json`, `messages/en.json`

**Interfaces:**
- Consumes: `credits.txType.*` from Task 2 (already added).
- Produces: nothing.

**Why:** `assets/page.tsx:23-32` hardcodes an Arabic-only `STUDIO_LABELS` map, so `/en` renders Arabic filter pills. Four toasts in the same file are hardcoded Arabic. `TransactionTable.tsx:72` is the second hardcoded `'ar-SA'`. `ResolutionSelector.tsx:26` hardcodes `دقة الصورة` even though the file already imports `useTranslations` at line 22.

- [ ] **Step 1: Add the new message keys**

In `messages/ar.json`, inside `"assets"`:

```json
    "loadFailed": "فشل تحميل الملفات. حاول مرة أخرى.",
    "deleted": "تم حذف {count} ملف",
    "deleteFailed": "فشل الحذف",
    "deleteError": "حدث خطأ في الحذف"
```

Inside `"credits"`, add:

```json
    "resolutionLabel": "دقة الصورة"
```

In `messages/en.json`, inside `"assets"`:

```json
    "loadFailed": "Could not load your files. Please try again.",
    "deleted": "Deleted {count} file(s)",
    "deleteFailed": "Delete failed",
    "deleteError": "Something went wrong while deleting"
```

Inside `"credits"`:

```json
    "resolutionLabel": "Image resolution"
```

- [ ] **Step 2: Replace the assets studio-label map**

In `app/[locale]/(dashboard)/assets/page.tsx`, delete the `STUDIO_LABELS` constant (lines 23-32) entirely, keeping `STUDIOS` (line 22). Then at line 155 replace the label expression:

```tsx
            {s === 'all' ? t('all') : tNav(s)}
```

This requires a `nav` translator in the component. Next to the existing `useTranslations('assets')` call, add:

```tsx
  const tNav = useTranslations('nav');
```

(`assets.all` already exists in both locales; the 8 studio keys already exist under `nav`.)

- [ ] **Step 3: Replace the assets toasts**

Line 63:
```tsx
      toast.error(t('loadFailed'));
```

Line 106:
```tsx
        toast.success(t('deleted', { count: selectedIds.size }));
```

Line 110:
```tsx
        toast.error(t('deleteFailed'));
```

Line 113:
```tsx
      toast.error(t('deleteError'));
```

- [ ] **Step 4: Localize the resolution label**

In `components/shared/ResolutionSelector.tsx`, line 26:

```tsx
      <label className="text-sm font-medium">{t('resolutionLabel')}</label>
```

(The `t` binding already exists at line 22: `const t = useTranslations('credits');`)

- [ ] **Step 5: Fix the second hardcoded locale**

In `components/billing/TransactionTable.tsx`, add the formatter import alongside the existing next-intl import:

```tsx
import { useTranslations, useFormatter } from 'next-intl';
```

Add the binding next to the existing `useTranslations` call in the component body:

```tsx
  const format = useFormatter();
```

Then replace line 72's `toLocaleDateString('ar-SA', {...})` call with:

```tsx
                  {format.dateTime(new Date(tx.created_at), { year: 'numeric', month: 'short', day: 'numeric' })}
```

Read the surrounding lines first and preserve the exact option object already in use.

- [ ] **Step 6: Run the verification gate**

```bash
npx tsc --noEmit && npx next lint
```
Expected: exit 0.

- [ ] **Step 7: Browser verification**

1. `/en/assets` — filter pills read "All / Image Creator / Product Photoshoot / …" in English.
2. `/ar/assets` — same pills in Arabic, unchanged from before.
3. `/en/billing` — transaction dates use Latin digits.
4. `/en/creator` — the resolution field label reads "Image resolution".

- [ ] **Step 8: Commit**

```bash
git add "app/[locale]/(dashboard)/assets/page.tsx" components/billing/TransactionTable.tsx components/shared/ResolutionSelector.tsx messages/ar.json messages/en.json
git commit -m "i18n: remove hardcoded Arabic strings and locales from live surfaces

The assets filter pills came from an Arabic-only STUDIO_LABELS map and
rendered Arabic on /en; the eight studio names already existed under nav.
Four assets toasts were hardcoded Arabic. TransactionTable carried the
second hardcoded 'ar-SA'. ResolutionSelector hardcoded its label despite
already importing useTranslations."
```

---

### Task 4: 16px form fields (stop iOS auto-zoom)

**Files:**
- Modify: `components/ui/input.tsx:10`
- Modify: `components/studios/creator/CreatorForm.tsx:126`, `components/studios/campaign/CampaignForm.tsx:84`, `components/studios/photoshoot/PhotoshootForm.tsx:170`, `components/brand-kit/BrandKitForm.tsx:97`
- Modify: `app/[locale]/(dashboard)/voiceover/page.tsx:107`, `storyboard/page.tsx:76`, `analysis/page.tsx:88`, `edit/page.tsx:96`, `prompt-builder/page.tsx:87`, `referrals/page.tsx:110`, `projects/page.tsx:265`
- Modify: `components/shared/ProjectSelector.tsx:101`

**Interfaces:**
- Consumes: nothing. Produces: nothing.

**Why:** iOS Safari auto-zooms the page whenever a focused field's font-size is below 16px, leaving the user zoomed in on a horizontally scrolling page. `text-sm` is 14px and `text-xs` is 12px. `text-base sm:text-sm` restores 16px on phones while leaving every desktop breakpoint pixel-identical.

- [ ] **Step 1: Fix the base Input**

In `components/ui/input.tsx`, change `h-10` to `h-11` and `text-sm` to `text-base sm:text-sm`. The full className becomes:

```tsx
          'flex h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base sm:text-sm ring-offset-[var(--color-surface)] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
```

`h-11` is 44px, which also satisfies the WCAG 2.5.5 touch-target minimum.

- [ ] **Step 2: Fix each hand-rolled textarea and select**

For each file:line listed under **Files** above, locate the `<textarea>` or `<select>` element and replace its `text-sm` with `text-base sm:text-sm`. Read each line before editing — the surrounding classes differ per site and must be preserved exactly.

For `app/[locale]/(dashboard)/referrals/page.tsx:110` the current class is `text-xs font-mono` on an `<Input>`; change it to:

```tsx
className="text-base sm:text-xs font-mono"
```

- [ ] **Step 3: Confirm no field is left under 16px on mobile**

```bash
grep -rn "text-sm\|text-xs" --include="*.tsx" components/ui/input.tsx components/shared/ProjectSelector.tsx components/brand-kit/BrandKitForm.tsx | grep -i "textarea\|select\|input"
```
Expected: every hit is paired with a `text-base` mobile-first prefix.

- [ ] **Step 4: Run the verification gate**

```bash
npx tsc --noEmit && npx next lint
```
Expected: exit 0.

- [ ] **Step 5: Browser verification**

Resize the preview to **mobile (375px)**, then:
1. `/ar/creator` — tap into the prompt textarea. The page must **not** zoom.
2. `/ar/settings` — tap the display-name input. No zoom.
3. `/ar/referrals` — the referral link field is readable and does not zoom.
4. Resize to **desktop** and confirm `/ar/creator` looks pixel-identical to before (the `sm:` breakpoint restores 14px).

- [ ] **Step 6: Commit**

```bash
git add components/ui/input.tsx components/studios components/brand-kit/BrandKitForm.tsx components/shared/ProjectSelector.tsx "app/[locale]/(dashboard)"
git commit -m "fix(mobile): 16px form fields so iOS stops auto-zooming

Every input and textarea in the product was 14px (12px on the referral
link). iOS Safari zooms the viewport whenever a focused field is under
16px, stranding the user zoomed in on a horizontally scrolling page.
text-base sm:text-sm restores 16px on phones and leaves every desktop
breakpoint unchanged. Input also goes h-10 -> h-11, meeting the 44px
touch-target minimum."
```

---

### Task 5: Dialog viewport fit and a z-index scale

**Files:**
- Modify: `components/ui/dialog.tsx:20, 37, 43-46`
- Modify: `tailwind.config.ts`
- Modify: `components/layout/BottomNav.tsx:22`, `components/layout/Sidebar.tsx:218, 226`
- Modify: `messages/ar.json`, `messages/en.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the Tailwind `zIndex` scale `header|nav|scrim|drawer|modal|toast`. Task 6 uses `z-drawer` and `z-scrim`.

**Why:** `DialogContent` is a centered `position: fixed` box with no `max-height`; taller than the viewport it bleeds off **both** edges with no way to scroll to either — including its own close button. Two call sites already patch this locally (`brand-kit/page.tsx:162,172`, `PromptTemplateLibrary.tsx:45`), which confirms the base is wrong. Separately there is no z-index scale: `BottomNav` is `z-40`, the same as the sidebar scrim, and it renders **later** in the DOM (`layout.tsx:42` vs `:31`), so it paints above the scrim and stays tappable while the drawer is modal.

- [ ] **Step 1: Add the z-index scale**

In `tailwind.config.ts`, inside `theme.extend`, add alongside `colors` and `fontFamily`:

```ts
      zIndex: {
        header: '30',
        nav: '35',
        scrim: '40',
        drawer: '50',
        modal: '60',
        toast: '70',
      },
```

- [ ] **Step 2: Make the dialog fit the viewport**

In `components/ui/dialog.tsx`, change the overlay class (line 20) `z-50` to `z-modal`, and replace the `DialogContent` className (line 37) with:

```tsx
        'fixed left-[50%] top-[50%] z-modal grid w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 border bg-surface p-4 sm:p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg',
```

Changes: `z-50`→`z-modal`, `w-full`→`w-[calc(100%-2rem)]` (stops edge-to-edge square corners on a phone), added `max-h-[85dvh] overflow-y-auto`, `p-6`→`p-4 sm:p-6`, `sm:rounded-lg`→`rounded-lg`.

`left-[50%] translate-x-[-50%]` is **correct as-is** — it is symmetric viewport centering, direction-independent. Do not "fix" it to a logical property.

- [ ] **Step 3: Enlarge the close button and localize its label**

Replace the `DialogPrimitive.Close` block (lines 43-46):

```tsx
      <DialogPrimitive.Close className="absolute end-2 top-2 flex h-11 w-11 items-center justify-center rounded-sm opacity-70 ring-offset-[var(--color-surface)] transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-surface-2">
        <X className="h-4 w-4" />
        <span className="sr-only">{t('close')}</span>
      </DialogPrimitive.Close>
```

`dialog.tsx` is already a client component, so add at the top of `DialogContent`'s body:

```tsx
  const t = useTranslations('common');
```

and import it: `import { useTranslations } from 'next-intl';`

`common.close` already exists in both locales (`إغلاق` / `Close`) — verified. No new key needed.

- [ ] **Step 4: Apply the scale to the nav and drawer**

`components/layout/BottomNav.tsx:22` — `z-40` → `z-nav` (35, below the scrim).
`components/layout/Sidebar.tsx:218` — the scrim's `z-40` → `z-scrim`.
`components/layout/Sidebar.tsx:226` — the drawer `<aside>`'s `z-50` → `z-drawer`.
`components/layout/TopBar.tsx:54` — `z-30` → `z-header`.

- [ ] **Step 5: Run the verification gate**

```bash
npx tsc --noEmit && npx next lint
```
Expected: exit 0.

- [ ] **Step 6: Browser verification**

At **mobile (375px)**:
1. `/ar/brand-kit` → open the create dialog. It fits the screen with a gutter on both sides, scrolls internally, and the close button is reachable.
2. `/ar/projects` → open the create dialog (this one had **no** local `max-h` patch, so it is the real regression test). Same result.
3. Open the sidebar drawer. The bottom nav is now **behind** the dark scrim and not tappable.
4. Tab into the dialog and press `Escape` — it closes.

- [ ] **Step 7: Commit**

```bash
git add components/ui/dialog.tsx tailwind.config.ts components/layout/BottomNav.tsx components/layout/Sidebar.tsx components/layout/TopBar.tsx messages/ar.json messages/en.json
git commit -m "fix(mobile): dialogs fit the viewport; introduce a z-index scale

DialogContent was a centered fixed box with no max-height, so any dialog
taller than the viewport bled off both edges with no way to scroll to
either one — including its own close button. Two call sites already
patched this locally, which is the tell that the base was wrong.

There was no z-index scale at all. BottomNav sat at z-40, equal to the
sidebar scrim, and renders later in the DOM, so it painted above the
scrim and stayed tappable while the drawer was supposedly modal.

Close button goes from a 16x16 to a 44x44 hit area and stops announcing
a hardcoded English 'Close' in an Arabic UI."
```

---

### Task 6: Page-level overflow and the mobile drawer

**Files:**
- Modify: `app/[locale]/(dashboard)/layout.tsx:32, 36`
- Modify: `components/layout/Sidebar.tsx` (drawer `<aside>`, plus a new effect)
- Modify: `components/shared/ResolutionSelector.tsx:27-45`
- Modify: `components/studios/creator/CreatorPreview.tsx:142`, `app/[locale]/(dashboard)/onboarding/page.tsx:158`, `assets/page.tsx:124`, `community/page.tsx:35`, `team/page.tsx:63`
- Modify: the 9 studio submit rows: `CreatorForm.tsx:236`, `PhotoshootForm.tsx:176`, `CampaignForm.tsx:181`, `plan/page.tsx:98`, `storyboard/page.tsx:89`, `analysis/page.tsx:92`, `edit/page.tsx:97`, `voiceover/page.tsx:221`, `prompt-builder/page.tsx:107`
- Modify: `app/[locale]/(dashboard)/edit/page.tsx:112`, `storyboard/page.tsx:97`
- Modify: `messages/ar.json`, `messages/en.json`

**Interfaces:**
- Consumes: `z-drawer` / `z-scrim` from Task 5.
- Produces: nothing.

**Why:** `components/ui/button.tsx:7` carries `whitespace-nowrap`, so any Button in a flex row cannot shrink below its Arabic label width — this is the shared root cause of the overflowing rows below. `min-w-0` appears only 3 times in the whole repo; without it on the main page column, a wide child **widens the container** instead of scrolling inside it, which is what turns a local overflow into page-level horizontal scroll. The closed mobile drawer is only CSS-translated, so ~18 offscreen links stay tabbable.

- [ ] **Step 1: Stop the page column from being widened**

`app/[locale]/(dashboard)/layout.tsx:32`:

```tsx
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
```

- [ ] **Step 2: Reserve the real bottom-nav height**

`app/[locale]/(dashboard)/layout.tsx:36` — the nav is `56px + env(safe-area-inset-bottom)` (34px on a home-indicator iPhone) but only 56px was reserved:

```tsx
        <main className="flex-1 bg-[var(--color-bg)] pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
```

- [ ] **Step 3: Make the closed drawer inert, and add Escape + scroll lock**

In `components/layout/Sidebar.tsx`, add to the component body (it already imports `useUIStore`; add `useEffect` to the React import):

```tsx
  // The closed drawer is only translated off-screen, so without `inert` its
  // ~18 links stay in the tab order on mobile. Escape and the scroll lock are
  // what make it behave like the modal it already looks like.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('overflow-hidden');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('overflow-hidden');
    };
  }, [sidebarOpen, setSidebarOpen]);
```

Then on the mobile drawer `<aside>` add `role`, `aria-modal`, `aria-label`, and `inert`:

```tsx
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('a11y.mainNav')}
        inert={!sidebarOpen || undefined}
        className={cn(
          'fixed inset-y-0 start-0 z-drawer w-64 max-w-[85vw] bg-surface border-e transition-transform duration-300 lg:hidden',
          sidebarOpen ? 'translate-x-0 rtl:-translate-x-0' : '-translate-x-full rtl:translate-x-full'
        )}
      >
```

Add `aria-hidden="true"` to the scrim div at line 218.

`nav.a11y` exists in both locales with `toggleMenu`, `toggleTheme`, `switchLanguage`,
`closeSidebar`, `toggleSidebar` — but **no `mainNav`** (verified). Add it to the `a11y` group in
both files:

`messages/ar.json` → `"mainNav": "القائمة الرئيسية"`
`messages/en.json` → `"mainNav": "Main navigation"`

**TypeScript note:** React 19 types accept `inert` as `boolean | undefined`. If `tsc` rejects it, use `{...(!sidebarOpen ? { inert: '' as unknown as boolean } : {})}` rather than suppressing the error.

- [ ] **Step 4: Fix the resolution selector overflow**

`components/shared/ResolutionSelector.tsx` — the row measures ~425–469px against 311px available inside a studio panel, and its inner spans are flex children so nothing wraps. Replace the container and button contents (lines 27-45):

```tsx
      <div className="grid grid-cols-3 gap-2">
        {resolutions.map((res) => (
          <button
            key={res.id}
            type="button"
            onClick={() => onChange(res.id)}
            aria-pressed={value === res.id}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
              value === res.id
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                : 'border-[var(--color-border)] hover:border-primary-300 hover:bg-surface-2'
            )}
          >
            <span className="font-medium">{res.label}</span>
            <span className="flex items-center gap-0.5 text-[11px] text-[var(--color-text-muted)]">
              <Coins className="h-3 w-3 shrink-0" />
              {CREDIT_COSTS.image[res.id]} {t('cost')}
            </span>
          </button>
        ))}
      </div>
```

- [ ] **Step 5: Let the overflowing rows wrap**

For each of the 5 header/action rows and 9 studio submit rows listed under **Files**, add `flex-wrap` and a gap. The submit rows become:

```tsx
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
```

The header rows become:

```tsx
        <div className="flex flex-wrap items-center justify-between gap-3">
```

Read each line first and preserve any other classes already present.

The submit rows are worst **while generating**, when the button reads `بايرا تشتغل... 🦊` — far wider than `توليد`.

- [ ] **Step 6: Fix two mobile grids**

`app/[locale]/(dashboard)/edit/page.tsx:112` — 148px per image is unusable for judging an edit:
```tsx
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

`app/[locale]/(dashboard)/storyboard/page.tsx:97` — the skeleton must match the result grid at line 109:
```tsx
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 py-6">
```

- [ ] **Step 7: Run the verification gate**

```bash
npx tsc --noEmit && npx next lint
```
Expected: exit 0.

- [ ] **Step 8: Browser verification — the core regression test**

At **mobile (375px)**, on each of `/ar/dashboard`, `/ar/creator`, `/ar/photoshoot`, `/ar/campaign`, `/ar/plan`, `/ar/storyboard`, `/ar/analysis`, `/ar/voiceover`, `/ar/edit`, `/ar/prompt-builder`, `/ar/assets`, `/ar/billing`, `/ar/onboarding`, `/ar/referrals`, run:

```js
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```
Expected: `true` on every page. This is the objective pass/fail for "no horizontal scroll".

Also confirm: on `/ar/creator` the three resolution buttons sit in one row without overflow; opening the drawer and pressing `Escape` closes it; while the drawer is open the page behind does not scroll.

- [ ] **Step 9: Commit**

```bash
git add "app/[locale]/(dashboard)" components/layout/Sidebar.tsx components/shared/ResolutionSelector.tsx components/studios messages/ar.json messages/en.json
git commit -m "fix(mobile): eliminate horizontal scroll and make the drawer modal

Button carries whitespace-nowrap, so any Button in a flex row cannot
shrink below its Arabic label — the shared cause of the overflowing
header and submit rows. ResolutionSelector was the worst: ~425-469px of
content in 311px, which made the Creator studio scroll sideways.

min-w-0 existed only 3 times in the repo and was missing on the main page
column, so a wide child widened the container instead of scrolling inside
it — that is what promoted local overflows to page-level scroll.

main reserved 56px for a bottom nav that is 56px + safe-area-inset, so
the last ~34px of every page sat under it on notched phones.

The closed drawer was only CSS-translated, leaving ~18 offscreen links in
the tab order, with no Escape handler and no scroll lock."
```

---

### Task 7: Dashboard composition

**Files:**
- Modify: `app/[locale]/(dashboard)/dashboard/page.tsx`
- Modify: `components/dashboard/ProfileCompletion.tsx`
- Modify: `components/dashboard/UsageStats.tsx`
- Modify: `tailwind.config.ts`
- Modify: `messages/ar.json`, `messages/en.json`

**Interfaces:**
- Consumes: `generations: { studio: string } | null` on transaction rows, from **Task 2**. `UsageStats` is rewritten onto it.
- Produces: nothing.

**Why:** the dashboard is 89 lines and terminates around 500px, leaving ~55% of a 1080p screen empty. `ActivityTimeline` is the only import from `components/dashboard/`; `ProfileCompletion` and `UsageStats` are complete and imported nowhere. Quick Actions exposes 6 of 9 studios. `UsageStats` cannot be mounted as-is: line 32 parses the studio out of the frozen English description with `/^(\w[\w-]*)/`, capturing `Image`/`Photoshoot`/`Marketing`, so every `STUDIO_LABELS` lookup misses.

`WeeklyChallenge` and `DailyBonus` are deliberately **not** mounted: the former has `progress = 0; // TODO` and would render a permanently empty bar; the latter's grant path does not exist and `022:241` warns it would become a credit-minting hole.

- [ ] **Step 1: Add the `xs` breakpoint**

In `tailwind.config.ts`, inside `theme.extend`:

```ts
      screens: {
        xs: '400px',
      },
```

- [ ] **Step 2: Add the widget message keys**

In `messages/ar.json`, add a new top-level `"widgets"` object:

```json
  "widgets": {
    "completeProfile": "أكمل ملفك الشخصي",
    "stepProfile": "إنشاء حساب",
    "stepBrandKit": "إضافة هوية بصرية",
    "stepGeneration": "أول إنشاء",
    "stepBilling": "اختيار خطة",
    "studioUsage": "استخدام الاستوديوهات",
    "usageEmpty": "ابدأ بإنشاء محتوى لتظهر الإحصائيات"
  }
```

In `messages/en.json`:

```json
  "widgets": {
    "completeProfile": "Complete your profile",
    "stepProfile": "Create account",
    "stepBrandKit": "Add a brand kit",
    "stepGeneration": "First creation",
    "stepBilling": "Choose a plan",
    "studioUsage": "Studio usage",
    "usageEmpty": "Create something to see your stats here"
  }
```

- [ ] **Step 3: Localize ProfileCompletion**

In `components/dashboard/ProfileCompletion.tsx`, replace the `labelAr` fields with translation keys and add the translator. `STEPS` becomes:

```tsx
const STEPS = [
  { key: 'profile', labelKey: 'stepProfile', check: () => true },
  { key: 'brandKit', labelKey: 'stepBrandKit', check: (ctx: { brandKits: number }) => ctx.brandKits > 0 },
  { key: 'generation', labelKey: 'stepGeneration', check: (ctx: { onboardingStep: number }) => ctx.onboardingStep >= 3 },
  { key: 'billing', labelKey: 'stepBilling', check: (ctx: { planId: string }) => ctx.planId !== 'free' },
];
```

Add `import { useTranslations } from 'next-intl';` and, in the component body **above the `if (!profile) return null;` early return** (hooks must not sit after a conditional return):

```tsx
  const t = useTranslations('widgets');
```

Heading (line 30) → `{t('completeProfile')}`. Step label (line 40) → `{t(step.labelKey)}`. Add `shrink-0` to both icons on line 39:

```tsx
              {done ? <Check className="h-3 w-3 shrink-0" /> : <Circle className="h-3 w-3 shrink-0" />}
```

- [ ] **Step 4: Rewrite UsageStats onto the join**

In `components/dashboard/UsageStats.tsx`: delete the Arabic-only `STUDIO_LABELS` map (lines 8-12), keep `STUDIO_COLORS`, and replace the fetch handler (lines 24-41) and label rendering.

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

interface StudioStat { studio: string; count: number; }

interface TxRow { type: string; generations: { studio: string } | null; }

const STUDIO_COLORS: Record<string, string> = {
  creator: 'bg-purple-500', photoshoot: 'bg-blue-500', campaign: 'bg-green-500',
  plan: 'bg-amber-500', storyboard: 'bg-rose-500', analysis: 'bg-cyan-500',
  voiceover: 'bg-orange-500', edit: 'bg-pink-500', 'prompt-builder': 'bg-yellow-500',
};

export function UsageStats(): React.ReactElement {
  const t = useTranslations('widgets');
  const tNav = useTranslations('nav');
  const [stats, setStats] = useState<StudioStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/credits/transactions?limit=100')
      .then((r) => r.json())
      .then((d: { success?: boolean; data?: TxRow[] }) => {
        if (!d.success || !d.data) return;
        // The studio comes from the joined generation. The previous version
        // regex-matched the frozen English description and captured "Image" /
        // "Photoshoot", which never matched a studio slug.
        const counts: Record<string, number> = {};
        d.data.forEach((tx) => {
          const studio = tx.generations?.studio;
          if (tx.type === 'usage' && studio) counts[studio] = (counts[studio] || 0) + 1;
        });
        setStats(
          Object.entries(counts)
            .map(([studio, count]) => ({ studio, count }))
            .sort((a, b) => b.count - a.count)
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const maxCount = Math.max(...stats.map((s) => s.count), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary-500 shrink-0" />
          {t('studioUsage')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-6 bg-surface-2 rounded animate-pulse" />)}</div>
        ) : stats.length === 0 ? (
          <p className="text-xs text-center text-[var(--color-text-muted)] py-4">{t('usageEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {stats.slice(0, 6).map((s) => (
              <div key={s.studio} className="flex items-center gap-2">
                <span className="text-xs w-24 shrink-0 truncate text-[var(--color-text-muted)]">{tNav(s.studio)}</span>
                <div className="flex-1 min-w-0 h-5 bg-surface-2 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${STUDIO_COLORS[s.studio] || 'bg-primary-500'} transition-all`} style={{ width: `${(s.count / maxCount) * 100}%` }} />
                </div>
                <span className="text-xs font-medium w-6 shrink-0 text-end">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

Apply the same `nav` slug reconciliation decided in Task 2 Step 5 (`prompt-builder` vs `promptBuilder`).

- [ ] **Step 5: Recompose the dashboard page**

In `app/[locale]/(dashboard)/dashboard/page.tsx`, add the three missing studios to `quickActions` (after the `voiceover` entry):

```tsx
  { href: '/storyboard', labelKey: 'storyboard', icon: Film, color: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300' },
  { href: '/edit', labelKey: 'edit', icon: Pencil, color: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300' },
  { href: '/prompt-builder', labelKey: 'promptBuilder', icon: Lightbulb, color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-300' },
```

Extend the lucide import with `Film, Pencil, Lightbulb`, and add:

```tsx
import { ProfileCompletion } from '@/components/dashboard/ProfileCompletion';
import { UsageStats } from '@/components/dashboard/UsageStats';
```

Replace the grid block (lines 47-86) with:

```tsx
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Quick Actions */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-4">{t('dashboard.quickActions')}</h2>
            <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {quickActions.map((action) => (
                <motion.div key={action.href} variants={fadeInUp}>
                  <Link href={action.href}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="flex items-center gap-3 p-4">
                        <div className={`shrink-0 p-2 rounded-lg ${action.color}`}>
                          <action.icon className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-medium min-w-0">
                          {t(`nav.${action.labelKey}`)}
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <UsageStats />
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <ProfileCompletion />
          <div>
            <h2 className="text-lg font-semibold mb-4">{t('credits.balance')}</h2>
            <CreditsWidget />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dashboard.recentGenerations')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline />
            </CardContent>
          </Card>
        </div>
      </div>
```

`items-start` stops the short right column from stretching to the left column's height.

- [ ] **Step 6: Run the verification gate**

```bash
npx tsc --noEmit && npx next lint
```
Expected: exit 0.

- [ ] **Step 7: Browser verification**

1. `/ar/dashboard` at **desktop 1440px** — the page fills the viewport; no large empty band below the fold.
2. All **9** studios appear in Quick Actions.
3. `UsageStats` labels read as Arabic studio names ("منشئ الصور", "تصوير المنتجات") — **not** "Image" or "Photoshoot". If the account has no generations yet, the empty-state line shows instead.
4. `/en/dashboard` — the same widgets in English.
5. At **375px** — Quick Action cards are one per row, icons are not squeezed, and labels are not clipped mid-word.
6. `ProfileCompletion` is absent for a fully-onboarded paid account (it self-hides at 100%).

- [ ] **Step 8: Commit**

```bash
git add "app/[locale]/(dashboard)/dashboard/page.tsx" components/dashboard/ProfileCompletion.tsx components/dashboard/UsageStats.tsx tailwind.config.ts messages/ar.json messages/en.json
git commit -m "feat(dashboard): fill the page with the widgets that already existed

The dashboard ended around 500px, leaving over half a 1080p screen empty,
while ProfileCompletion and UsageStats sat complete and imported nowhere.
Quick Actions exposed 6 of 9 studios.

UsageStats could not be mounted as written: it parsed the studio out of
the frozen English description with /^(\\w[\\w-]*)/, capturing 'Image' and
'Photoshoot' rather than a slug, so every label lookup missed. Rewritten
onto the generations join added earlier in this series.

WeeklyChallenge stays unmounted (progress is hardcoded 0) and DailyBonus
stays unmounted (its grant path does not exist and 022 warns it would be
a credit-minting hole)."
```

---

## Self-Review

**Spec coverage.** Phase 1.1 → Task 1. Phase 1.2 (incl. §3.2.1) → Tasks 2 and 3. Phase 1.3 → Tasks 4, 5, 6. Phase 1.4 → Task 7. Spec §5 verification gate is embedded in every task. No Spec 1 requirement is unassigned.

**Deliberate deferrals**, each recorded in the spec rather than silently dropped: `lib/export/pdf.ts` locale threading (Spec 2 Phase 2.3, which already edits its call sites); `CardTitle`'s unused `text-2xl` default and the 9 overrides; the four emoji empty states; admin console retheming; `community`/`portfolio`/`privacy`/`terms` full translation.

**Ordering dependency.** Task 7 consumes the `generations(studio)` join produced by Task 2 and must not run before it. Tasks 1, 3, 4, 5 are order-independent. Task 6 consumes the z-index scale from Task 5.

**Resolved during planning** (no longer risks):
- The prompt-builder slug mismatch is real and is handled by an explicit `STUDIO_NAV_KEY` map in Task 2, reused in Task 7. Verified against all 9 routes and both message files.
- `common.close` already exists in both locales — Task 5 needs no new key.
- `nav.a11y` exists but has no `mainNav` — Task 6 adds exactly that one key.

**Known risks to watch during execution.**
1. `inert` typing varies by React version; Task 6 Step 3 gives the fallback.
2. Tasks 4 and 6 both touch files under `app/[locale]/(dashboard)/`. Commit explicit paths, never `-A`, so the concurrent session's work is never swept in.
3. `deduct_credits` accepts a `p_studio` argument (`004:29`) and never stores it — the INSERT at `004:65` has no studio column. Do not "fix" this by adding a column; the join in Task 2 is the chosen solution and requires no migration.
