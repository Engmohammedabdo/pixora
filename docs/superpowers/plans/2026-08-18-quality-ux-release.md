# Quality, UX, and Release Confidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make network/API failures visible, finish customer localization and accessibility, remove fabricated UI, and automate deterministic quality gates for the final program release.

**Architecture:** Extend the existing test harness, standardize API transport and React Query state, remediate customer-facing debt in reviewable batches, then lock behavior with Playwright, CI, and accurate onboarding/runbooks.

**Tech Stack:** Next.js 15, React 19, TypeScript strict, next-intl 4, TanStack React Query 5, Vitest, Testing Library, axe, Playwright, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-18-quality-ux-release-design.md`

## Global Constraints

- Execute after the security, financial, and storage/AI contracts are stable.
- Do not change credit economics, Stripe behavior, RLS, AI routing, or migration SQL in this plan.
- Customer empty states render only after a validated successful empty response.
- Studio generation mutations never retry automatically.
- Every customer string is added to Arabic and English catalogs in the same task.
- Community, Team, and Portfolio keep their routes but contain no fabricated data or no-op action.
- RTL uses logical properties; do not introduce left/right layout utilities.
- Stage only named files; never use `git add -A`.
- Hand cumulative Production ownership to
  `docs/superpowers/plans/2026-08-18-program-integration-release.md`; this plan
  records Quality Staging evidence but does not declare the whole program done.

---

### Task 1: Complete deterministic tooling and one-command verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/setup.ts`
- Create: `.nvmrc`
- Create: `playwright.config.ts`
- Test: `tests/tooling/package-contract.test.ts`

**Interfaces:**
- Consumes: base Vitest/Testing Library harness from the Security plan.
- Produces Node 22 pinning, `npm run verify`, Staging-only `npm run test:e2e`, and declared accessibility/browser dependencies.

- [ ] **Step 1: Write a package contract test**

Read `package.json` and assert direct `sharp`, direct dev `tsx`, Node `22.x`,
scripts for test/typecheck/verify/e2e, and no script containing `npx tsx`.

- [ ] **Step 2: Verify the final tooling assertions fail**

```powershell
npm run test -- tests/tooling/package-contract.test.ts
```

Expected: FAIL until the final scripts and browser/a11y tools exist.

- [ ] **Step 3: Install the remaining declared tools**

```powershell
npm install --save-dev vitest-axe @playwright/test
npm exec -- playwright install chromium
```

- [ ] **Step 4: Set final scripts**

```json
{
  "lint": "eslint . --max-warnings=0",
  "test:e2e": "playwright test",
  "verify": "npm run check:invariants && npm run typecheck && npm run lint && npm run test"
}
```

Preserve the test/scripts established earlier.

- [ ] **Step 5: Configure Playwright for local or Staging use**

Append the `vitest-axe` matcher import to the existing `tests/setup.ts`; do not
create a second setup file or redefine the Security-owned Vitest harness.

`playwright.config.ts` requires an HTTPS `PLAYWRIGHT_BASE_URL`, uses Chromium,
retains traces/screenshots only on failure, and has no `webServer` auto-start.
Stateful specs must run only against the provisioned Staging environment and the
config must never contain credentials.

- [ ] **Step 6: Run and commit**

```powershell
npm run test -- tests/tooling/package-contract.test.ts
npm run verify
git add package.json package-lock.json tests/setup.ts .nvmrc playwright.config.ts tests/tooling/package-contract.test.ts
git commit -m "test: complete deterministic release tooling"
```

---

### Task 2: Shared API transport and resource contracts

**Files:**
- Create: `lib/api/fetch-json.ts`
- Create: `lib/contracts/resources.ts`
- Test: `tests/api/fetch-json.test.ts`
- Test: `tests/api/resource-contracts.test.ts`

**Interfaces:**
- Consumes: `ApiSuccess/ApiFailure` envelope and generic schema factory from the Storage/AI plan; existing `types/api.ts` stays untouched for compatibility.
- Produces `ApiClientError`, `fetchJson`, and Zod schemas for projects, assets, credits, transactions, and brand kits.

- [ ] **Step 1: Write transport failure tests**

Cover HTTP 500 with/without JSON, network rejection, `success:false` with HTTP 200, malformed envelope, malformed data, valid success, 204 where not allowed, and retryable classification. Assert error messages never include an HTML response body or secret-bearing details.

- [ ] **Step 2: Write resource fixtures**

For each first-batch API, add valid current response and malformed versions. Asset contract supports canonical signed delivery and preserved legacy URL. Project and transaction arrays have bounded fields matching current APIs.

- [ ] **Step 3: Confirm tests fail**

```powershell
npm run test -- tests/api/fetch-json.test.ts tests/api/resource-contracts.test.ts
```

- [ ] **Step 4: Implement exact transport behavior**

```ts
export async function fetchJson<T>(input: {
  url: string;
  init?: RequestInit;
  dataSchema: z.ZodType<T>;
}): Promise<T>;
```

Parse response text once, validate envelope, throw typed errors, and return only validated `data`. Map 408/425/429/5xx and network failures as retryable; authentication, validation, quota, credit, and business errors are not automatically retryable.

- [ ] **Step 5: Run and commit**

```powershell
npm run test -- tests/api/fetch-json.test.ts tests/api/resource-contracts.test.ts
npm run typecheck
git add lib/api/fetch-json.ts lib/contracts/resources.ts tests/api/fetch-json.test.ts tests/api/resource-contracts.test.ts
git commit -m "feat(api): validate customer response contracts"
```

---

### Task 3: React Query collections and honest async states

**Files:**
- Create: `lib/query/keys.ts`
- Create: `components/shared/AsyncState.tsx`
- Create: `hooks/useProjects.ts`
- Create: `hooks/useAssets.ts`
- Create: `hooks/useTransactions.ts`
- Modify: `hooks/useBrandKit.ts`
- Modify: `hooks/useCredits.ts`
- Modify: `hooks/useUser.ts`
- Modify: `app/[locale]/(dashboard)/projects/page.tsx`
- Modify: `app/[locale]/(dashboard)/assets/page.tsx`
- Modify: `components/shared/ProjectSelector.tsx`
- Modify: `components/shared/AssetProjectFilter.tsx`
- Modify: `components/dashboard/UsageStats.tsx`
- Modify: `components/dashboard/ActivityTimeline.tsx`
- Modify: `messages/ar.json`
- Modify: `messages/en.json`
- Test: `tests/query/async-state.test.tsx`
- Test: `tests/query/collection-hooks.test.tsx`

**Interfaces:**
- Consumes: Task 2 `fetchJson` and resource schemas.
- Produces stable query keys, collection hooks, and four-state UI.

- [ ] **Step 1: Write state component tests**

Assert loading has `aria-busy`, error has localized retry and `aria-live`, empty is unavailable during loading/error, successful empty displays its child, and successful content preserves it.

- [ ] **Step 2: Write hook behavior tests**

Cover success, validated empty, HTTP/network failure, retry success, no retry on 401/validation, and exact invalidation after project/asset/brand-kit mutations. Generation success invalidates credits/assets/transactions; mutation failure preserves cache.

- [ ] **Step 3: Verify current error-as-empty behavior fails**

```powershell
npm run test -- tests/query/async-state.test.tsx tests/query/collection-hooks.test.tsx
```

- [ ] **Step 4: Implement query keys and hooks**

Use these exact factories:

```ts
export const queryKeys = {
  projects: () => ['projects'] as const,
  assets: (filters: AssetFilters) => ['assets', filters] as const,
  transactions: (limit: number) => ['transactions', { limit }] as const,
  brandKits: () => ['brand-kits'] as const,
  credits: () => ['credits-balance'] as const,
  user: () => ['auth-user'] as const,
};
```

Use `fetchJson` and resource schemas. `useUser` and `useCredits` alias their
exported constants to these exact factories in the same commit; the existing
auth-listener and credits invalidations therefore keep observing the same cache.
Add a regression test for auth-state invalidation. Set bounded retry only when
`ApiClientError.retryable` is true.

- [ ] **Step 5: Migrate surfaces without visual redesign**

Replace local fetch/effect state with hooks and `AsyncState`. Remove every fallback that assigns `[]` after failure. Keep current loading skeletons and empty copy, but show empty only after a successful response.

- [ ] **Step 6: Run and commit**

```powershell
npm run test -- tests/query/async-state.test.tsx tests/query/collection-hooks.test.tsx
npm run typecheck
npm run check:invariants
git --literal-pathspecs add lib/query/keys.ts components/shared/AsyncState.tsx hooks/useProjects.ts hooks/useAssets.ts hooks/useTransactions.ts hooks/useBrandKit.ts hooks/useCredits.ts hooks/useUser.ts "app/[locale]/(dashboard)/projects/page.tsx" "app/[locale]/(dashboard)/assets/page.tsx" components/shared/ProjectSelector.tsx components/shared/AssetProjectFilter.tsx components/dashboard/UsageStats.tsx components/dashboard/ActivityTimeline.tsx messages/ar.json messages/en.json tests/query/async-state.test.tsx tests/query/collection-hooks.test.tsx
git commit -m "fix(ui): distinguish loading errors and empty data"
```

---

### Task 4: Exposed localization, watermark disclosure, and honest placeholder routes

**Files:**
- Modify: `app/global-error.tsx`
- Modify: `app/[locale]/(auth)/error.tsx`
- Modify: `app/[locale]/(dashboard)/error.tsx`
- Modify: `app/[locale]/(dashboard)/community/page.tsx`
- Modify: `app/[locale]/(dashboard)/portfolio/page.tsx`
- Modify: `app/[locale]/(dashboard)/team/page.tsx`
- Create: `components/shared/ComingSoonState.tsx`
- Create: `components/shared/WatermarkNotice.tsx`
- Modify: `components/studios/creator/CreatorPreview.tsx`
- Modify: `components/studios/photoshoot/PhotoshootPreview.tsx`
- Modify: `components/studios/campaign/CampaignPlanDisplay.tsx`
- Modify: `app/[locale]/(dashboard)/edit/page.tsx`
- Modify: `messages/ar.json`
- Modify: `messages/en.json`
- Test: `tests/i18n/exposed-pages.test.tsx`
- Test: `tests/i18n/watermark-notice.test.tsx`

**Interfaces:**
- Consumes: server `watermark` response metadata and locale routing.
- Produces localized errors, truthful Coming Soon routes, and visible free-plan policy.

- [ ] **Step 1: Write English/Arabic render tests**

Assert each locale-scoped error and placeholder route displays only the selected language, correct locale home link, no mock member/prompt/like/portfolio URL, and no enabled no-op action.

For global error, set `window.history` to `/ar/...` then `/en/...` and assert its
local fallback dictionary/link follows the first valid pathname segment without
an intl provider. Set a malformed/unprefixed path and assert the documented
Arabic default; do not use `document.documentElement.lang` as the test fixture.

- [ ] **Step 2: Write watermark disclosure tests**

Assert notice appears only when the final Storage/Financial response contract
says `watermark.applied=true`; plan cache alone cannot claim it. Consume the
shared descriptor/type rather than defining another watermark shape. Add
pre-generation free-plan copy stating that upgrade affects future outputs only.

- [ ] **Step 3: Verify failures**

```powershell
npm run test -- tests/i18n/exposed-pages.test.tsx tests/i18n/watermark-notice.test.tsx
```

- [ ] **Step 4: Replace fake pages with one localized component**

`ComingSoonState` accepts translation keys, icon, and optional safe navigation. Community, Team, and Portfolio retain routes but remove all fabricated arrays, fake counters, imaginary links, dialogs, and toast actions.

- [ ] **Step 5: Add watermark UI using server truth**

Wire `WatermarkNotice` to creator/photoshoot/campaign/edit response metadata. Add Arabic and English keys in the same change.

- [ ] **Step 6: Run and commit**

```powershell
npm run test -- tests/i18n/exposed-pages.test.tsx tests/i18n/watermark-notice.test.tsx
npm run typecheck
npm run check:invariants
git --literal-pathspecs add app/global-error.tsx "app/[locale]/(auth)/error.tsx" "app/[locale]/(dashboard)/error.tsx" "app/[locale]/(dashboard)/community/page.tsx" "app/[locale]/(dashboard)/portfolio/page.tsx" "app/[locale]/(dashboard)/team/page.tsx" "app/[locale]/(dashboard)/edit/page.tsx" components/shared/ComingSoonState.tsx components/shared/WatermarkNotice.tsx components/studios/creator/CreatorPreview.tsx components/studios/photoshoot/PhotoshootPreview.tsx components/studios/campaign/CampaignPlanDisplay.tsx messages/ar.json messages/en.json tests/i18n/exposed-pages.test.tsx tests/i18n/watermark-notice.test.tsx
git commit -m "fix(i18n): show truthful localized customer states"
```

---

### Task 5: Eliminate remaining customer Arabic-literal debt

**Files:**
- Modify: `app/[locale]/(dashboard)/brand-kit/page.tsx`
- Modify: `app/[locale]/(landing)/privacy/page.tsx`
- Modify: `app/[locale]/(landing)/terms/page.tsx`
- Modify: `app/[locale]/layout.tsx`
- Modify: `app/[locale]/not-found.tsx`
- Modify: `app/not-found.tsx`
- Modify: `components/billing/AutoTopup.tsx`
- Modify: `components/billing/PlanCard.tsx`
- Modify: `components/billing/TopupCard.tsx`
- Modify: `components/dashboard/WeeklyChallenge.tsx`
- Modify: `components/layout/TopBar.tsx`
- Modify: `components/shared/DailyBonus.tsx`
- Modify: `components/shared/ModelSelector.tsx`
- Modify: `components/shared/PersonaSelector.tsx`
- Modify: `components/shared/PromptEnhancer.tsx`
- Modify: `components/shared/PromptSuggestions.tsx`
- Modify: `components/shared/PromptTemplateLibrary.tsx`
- Modify: `components/shared/ShareMenu.tsx`
- Modify: `messages/ar.json`
- Modify: `messages/en.json`
- Modify: `scripts/invariants-baseline.json`
- Modify: `scripts/check-invariants.ts`
- Modify: `docs/INVARIANTS.md`
- Test: `tests/i18n/customer-literal-debt.test.ts`

**Interfaces:**
- Consumes: next-intl conventions and Task 4 namespaces.
- Produces zero customer Arabic literal violations outside intentionally English-only Admin.

- [ ] **Step 1: Record the real starting inventory**

Run:

```powershell
npm run check:invariants -- --only=no-arabic-literals-in-tsx
```

The checked-in audit snapshot contains approximately 131 entries while an old
comment says 130. Record that immutable starting count and the smaller current
violation count after Task 4. Do not regenerate or expand the baseline.

- [ ] **Step 2: Add a zero-debt test**

The test invokes the invariant checker and fails while any customer TSX
violation or any entry for this invariant remains in the baseline.

- [ ] **Step 3: Add a prune-only baseline command**

Add `--prune-resolved-baseline`: it may only remove entries that no longer exist
and exits nonzero if a current violation is not already known. For this invariant,
the general `--update-baseline` path must refuse to add entries. CI never runs an
update command.

- [ ] **Step 4: Convert by reviewable namespace batches**

Use four exact batches:

1. Billing/dashboard: the three `components/billing/*` files,
   `WeeklyChallenge.tsx`, and `DailyBonus.tsx`.
2. Layout/errors: locale layout, both not-found files, and `TopBar.tsx`.
3. Shared controls: Model/Persona selectors, Prompt Enhancer/Suggestions/Template
   Library, and Share Menu.
4. Brand/legal: brand-kit page, privacy, and terms.

For each source string, add semantic keys to both catalogs and preserve
parameters/plurals. After each focused tests pass, stage only that batch plus the
catalogs and pruned baseline, and commit it separately. Do not translate
English-only Admin files under `app/admin` or `components/admin` in this task.
Run the prune after each batch and inspect that the JSON diff
contains deletions only. The final baseline entries and current violations for
this rule are both zero.

- [ ] **Step 5: Run final localization gate and commit final batch**

```powershell
npm run test -- tests/i18n/customer-literal-debt.test.ts
npm run check:invariants
npm run typecheck
git add messages/ar.json messages/en.json scripts/invariants-baseline.json scripts/check-invariants.ts docs/INVARIANTS.md tests/i18n/customer-literal-debt.test.ts
git commit -m "fix(i18n): eliminate customer literal debt"
```

---

### Task 6: Keyboard, focus, status, and generated-image accessibility

**Files:**
- Modify: `components/admin/DataTable.tsx`
- Modify: `components/layout/Sidebar.tsx`
- Create: `components/layout/MobileSidebarDialog.tsx`
- Create: `components/shared/GeneratedImage.tsx`
- Modify: `components/shared/GenerationProgress.tsx`
- Modify: `components/studios/creator/CreatorPreview.tsx`
- Modify: `components/shared/GenerationHistory.tsx`
- Modify: `messages/ar.json`
- Modify: `messages/en.json`
- Test: `tests/a11y/admin-data-table.test.tsx`
- Test: `tests/a11y/mobile-sidebar.test.tsx`
- Test: `tests/a11y/generation-media.test.tsx`

**Interfaces:**
- Produces semantic sort/expand controls, trapped drawer focus, live generation status, and named media controls.

- [ ] **Step 1: Write keyboard and axe tests**

Assert Tab reaches sort and expand controls; Enter/Space activates one intended action; `aria-sort` changes; drawer moves/traps/returns focus and closes with Escape; generation progress announces status; image-only buttons have accessible names; axe reports no serious/critical violations.

- [ ] **Step 2: Verify current components fail**

```powershell
npm run test -- tests/a11y/admin-data-table.test.tsx tests/a11y/mobile-sidebar.test.tsx tests/a11y/generation-media.test.tsx
```

- [ ] **Step 3: Implement semantic controls**

Put a `<button type="button">` inside sortable headers and a dedicated expand button in a cell. Set `aria-sort` on the header; use row ID for expansion. Remove click behavior from `<tr>`.

Create `MobileSidebarDialog.tsx` with Radix primitives, a visually hidden
`DialogTitle`, and a docked panel using logical geometry
`fixed inset-y-0 start-0 w-64`. Render mobile navigation only inside it and
desktop navigation only in the desktop branch so two focusable copies do not
coexist. Do not modify the shared centered `components/ui/dialog.tsx`. Preserve
RTL placement and desktop behavior.

Add `role="status"`, `aria-live="polite"`, and progress values to
`GenerationProgress`. `GeneratedImage` validates the source and uses Next Image
for HTTPS signed/canonical URLs; a bounded plain image branch handles preserved
data-URI legacy content. Both branches have explicit dimensions/`sizes`,
translated alt text, and accessible control names. Consume the final Storage
descriptor and do not reintroduce a persistence fallback.

- [ ] **Step 4: Run and commit**

```powershell
npm run test -- tests/a11y/admin-data-table.test.tsx tests/a11y/mobile-sidebar.test.tsx tests/a11y/generation-media.test.tsx
npm run typecheck
npm run build
git add components/admin/DataTable.tsx components/layout/Sidebar.tsx components/layout/MobileSidebarDialog.tsx components/shared/GeneratedImage.tsx components/shared/GenerationProgress.tsx components/studios/creator/CreatorPreview.tsx components/shared/GenerationHistory.tsx messages/ar.json messages/en.json tests/a11y/admin-data-table.test.tsx tests/a11y/mobile-sidebar.test.tsx tests/a11y/generation-media.test.tsx
git commit -m "fix(a11y): add keyboard and focus-safe interactions"
```

---

### Task 7: Browser regression suite and CI

**Files:**
- Create: `tests/e2e/auth-and-locales.spec.ts`
- Create: `tests/e2e/admin-security.spec.ts`
- Create: `tests/e2e/projects-assets.spec.ts`
- Create: `tests/e2e/studios-and-credits.spec.ts`
- Create: `tests/e2e/coming-soon.spec.ts`
- Create: `tests/e2e/global-setup.ts`
- Create: `.github/workflows/verify.yml`
- Create: `.github/workflows/staging-smoke.yml`

**Interfaces:**
- Consumes: Program Task 3's verified Staging/core manifest, Storage Task 6's
  private-asset extension, and protected credential values referenced only by
  stable environment-variable names.
- Produces PR verification and manually/scheduled Staging smoke without Live secrets.

- [ ] **Step 1: Write failing browser specs**

Implement the exact UI paths in the quality spec: localized errors, seeded
hostile Admin row, keyboard/focus behavior, collection error/empty, one real
Staging text/image/voice success, saved-result visibility, canonical/legacy
export, and truthful Coming Soon pages. Use Playwright request interception to
verify customer error/retry/refund wording; do not simulate a ledger refund or
webhook in the browser. Those atomic invariants remain in the Financial
integration suite.

- [ ] **Step 2: Add deterministic test fixtures**

`global-setup.ts` validates `PLAYWRIGHT_BASE_URL`, exact protected credential
names from the core manifest, `.artifacts/staging/fixtures.json`, and
`.artifacts/staging/storage-ai-fixtures.json`. It calls both
`verify:staging-fixtures` and `verify:storage-ai-staging-fixtures` before browser
work, requires `new URL(PLAYWRIGHT_BASE_URL).origin === manifest.appOrigin`,
rejects the Production origin, and requires stable legacy and
`privateCanonicalAssetId` references. Never
embed passwords/service keys in source. Missing Staging configuration is a
failed explicit gate, not a green skip.

- [ ] **Step 3: Configure CI jobs**

Both workflows use `actions/setup-node` pinned to Node 22 and `npm ci`.
`verify.yml` runs `npm run verify` and `npm run build` on PR/push without
external secrets or DB integration tests. `staging-smoke.yml` is
`workflow_dispatch` plus a nightly schedule, uses a protected `staging`
environment, then runs `npm exec -- playwright install --with-deps chromium`
before a workflow-concurrency-locked, idempotent
`provision:staging-fixtures`/`provision:storage-ai-staging-fixtures` refresh.
Only then does it run `verify:test-env`, both fixture validators,
deploys the exact checked-out `${{ github.sha }}` to Staging, waits for health,
and runs
`npm run verify:deployment -- --environment=staging --expected="${GITHUB_SHA}"`
before the explicit integration suite and Playwright. A nightly run therefore
tests the default-branch SHA it just deployed; dispatch tests the selected SHA.
It receives only Staging/Stripe-Test/deployment secrets. The browser install belongs only to
`staging-smoke.yml`; `verify.yml` does not run E2E. The concurrency group permits
one deploy/fixture-mutating Staging smoke at a time, so two schedules cannot race.

- [ ] **Step 4: Deploy and run against Staging**

Deploy the exact Quality commit to the provisioned Staging app using available
Git/Coolify authority and verify the deployed commit before running:

```powershell
$env:PLAYWRIGHT_BASE_URL=$env:STAGING_APP_URL
npm run provision:staging-fixtures
npm run provision:storage-ai-staging-fixtures
npm run verify:test-env
npm run verify:staging-fixtures
npm run verify:storage-ai-staging-fixtures
$qualityGitSha = (git rev-parse HEAD).Trim()
npm run verify:deployment -- --environment=staging --expected=$qualityGitSha
npm run test:integration
npm run test:e2e
```

Expected: all specs pass in Chromium; failure artifacts contain no secrets.

Write the reviewed non-secret Staging quality input for Program Integration Task
4, which is the only owner that records `quality:release` after the cumulative
gate, at ignored path `.artifacts/releases/input/quality-staging.json`. Do not
call `release:evidence` in this task.

- [ ] **Step 5: Commit**

```powershell
git add tests/e2e/auth-and-locales.spec.ts tests/e2e/admin-security.spec.ts tests/e2e/projects-assets.spec.ts tests/e2e/studios-and-credits.spec.ts tests/e2e/coming-soon.spec.ts tests/e2e/global-setup.ts .github/workflows/verify.yml .github/workflows/staging-smoke.yml
git commit -m "test(e2e): protect critical production journeys"
```
