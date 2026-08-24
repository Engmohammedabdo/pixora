# Quality, UX, and Release Confidence — Design

**Date:** 2026-08-18
**Status:** Approved for planning
**Program:** `docs/superpowers/specs/2026-08-18-production-remediation-program-design.md`
**Depends on:** Security test harness and stable API/financial contracts

---

## 1. Scope

This release makes failures visible, localizes exposed customer surfaces, makes
Admin and navigation usable from a keyboard, and supplies automated regression
coverage for the full remediation program.

It covers:

- deterministic package scripts and declared tool dependencies;
- a shared API response and fetch contract;
- React Query for customer collections and honest async states;
- exposed i18n debt and fabricated coming-soon pages;
- Admin table and mobile navigation accessibility;
- generated-image semantics and dimensions;
- Playwright customer/admin smoke coverage and CI;
- accurate repository onboarding documentation.

It does not redesign the product or add Community, Team, or Portfolio features.

---

## 2. Deterministic tooling

The repository currently calls `npx tsx` in build scripts without declaring
`tsx`, has no test script, and imports `sharp` directly while receiving it only as
a transitive dependency of Next.js.

The final package contract declares:

- runtime: `sharp`;
- development: `tsx`, Vitest, coverage, jsdom, Testing Library, user-event,
  jest-dom, `vitest-axe`, and Playwright;
- scripts: `test`, `test:watch`, `test:coverage`, `test:e2e`, `typecheck`, and
  `verify`;
- existing TypeScript scripts call local `tsx`, never network-resolving `npx`.

```text
verify = check:invariants -> typecheck -> lint -> test
release gate = verify -> test:e2e -> build
```

The security plan creates the base Vitest harness early. This plan extends it; it
does not create a second configuration or duplicate setup file.

---

## 3. API transport contract

Every customer-facing endpoint uses one envelope:

```ts
export type ApiSuccess<T> = { success: true; data: T };

export type ApiFailure = {
  success: false;
  error: ApiErrorCode;
  details?: unknown;
  required?: number;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export class ApiClientError extends Error {
  status: number;
  code: ApiErrorCode;
  retryable: boolean;
  details?: unknown;
}
```

`lib/api/fetch-json.ts` exports:

```ts
export async function fetchJson<T>(input: {
  url: string;
  init?: RequestInit;
  dataSchema: z.ZodType<T>;
}): Promise<T>;
```

It checks the HTTP status, validates the envelope, treats `success:false` as an
error even with HTTP 200, validates `data`, and distinguishes retryable network/
server failures from customer validation failures. It never turns an error into
an empty list.

`lib/contracts/api.ts` from the Storage/AI release is the validated envelope
authority. The existing `types/api.ts` remains a compatibility interface for
untouched routes; this release does not force dozens of current endpoints into a
breaking global union.

Studio generation mutations are never retried automatically. Customer collection
queries use bounded React Query retries only for retryable transport/server
failures.

---

## 4. React Query and honest states

Central query keys cover projects, assets with filters, transactions, brand kits,
credits, and user profile. Hooks own transport and invalidation:

```ts
queryKeys.projects()
queryKeys.assets(filters)
queryKeys.transactions(limit)
queryKeys.brandKits()
queryKeys.credits() // ['credits-balance'] — preserves the live cache
queryKeys.user()    // ['auth-user'] — preserves auth listener invalidation
```

Initial migration surfaces:

- projects page and project selectors;
- assets page and project filter;
- dashboard Usage Stats and Activity Timeline;
- brand-kit hooks;
- credits and transactions consumers.

`AsyncState` has four explicit modes: loading, error with retry, successful empty,
and successful content. Empty UI is rendered only after a validated successful
empty result.

Mutation invalidation is exact: project mutations invalidate projects/selectors;
asset deletion invalidates affected asset keys; generation success invalidates
credits, assets, and transactions. A mutation error preserves cached data.

---

## 5. Localization and honest coming-soon pages

The audit measured 131 known Arabic-literal violations while the invariant comment
mentions 130. The first task records the actual inventory; it does not regenerate
the baseline to hide new debt. The final accepted count is zero for customer TSX
outside intentionally English-only Admin surfaces.

Highest-priority files:

- `app/global-error.tsx`;
- locale auth/dashboard error boundaries;
- Community, Portfolio, and Team direct routes;
- dashboard and shared customer components;
- remaining studio forms and previews.

`global-error.tsx` cannot rely on a healthy i18n provider or root `lang` value,
so it selects a small local fallback dictionary from the first pathname segment
when it is exactly `/ar` or `/en`, defaulting to Arabic only for an invalid path.
It links to that locale's home page. Locale-scoped boundaries use `next-intl`
normally.

Community, Team, and Portfolio routes remain valid bookmarks but show a localized
Coming Soon state. Fabricated prompts, fake likes, mock team members, imaginary
portfolio links, no-op invite dialogs, and fake actions are removed. Sidebar
entries remain disabled until real features exist.

Every new key is added to both Arabic and English catalogs in the same commit.

---

## 6. Accessibility and generated media

### Admin DataTable

- Sorting is a real button inside the header with `aria-sort`.
- Row expansion is a dedicated button with an accessible name, not a click
  handler on `<tr>`.
- Stable record IDs, not array indexes, control expansion state.
- Enter and Space work without triggering unrelated row actions.

### Mobile sidebar

`MobileSidebarDialog.tsx` owns the mobile drawer with Radix primitives, an
accessible hidden `DialogTitle`, and sidebar-specific geometry
`fixed inset-y-0 start-0 w-64`. Mobile content is not a second focusable copy of
the desktop sidebar. Focus moves in, remains trapped, Escape closes it, the
background is inert, and focus returns to the trigger; the shared centered
`components/ui/dialog.tsx` geometry is not changed.

### Status and images

`GenerationProgress` exposes status/live/progress semantics. A shared
`GeneratedImage` uses Next Image for HTTPS canonical/signed sources and a bounded
plain image fallback for preserved data-URI legacy content; both branches have
known dimensions, translated alt text, and safe source validation. Controls
containing only an image receive an accessible name.

Automated axe checks must contain no serious or critical violation on the touched
surfaces.

---

## 7. Browser and CI coverage

Stateful Playwright runs only against the provisioned isolated Staging deployment
and never auto-starts an unseeded local server or touches Stripe Live.
The core suite covers:

- Arabic and English login/error routing;
- Admin malicious-generation rendering;
- Admin keyboard sort/expand and mobile focus behavior;
- project and asset loading/error/empty states;
- one text studio, one image studio, and Voiceover success/failure behavior;
- customer-visible saved-result and retry/refund outcomes (the actual ledger,
  persistence-failure, webhook, and concurrency invariants remain Financial
  integration tests rather than browser simulations);
- canonical and legacy asset export behavior;
- coming-soon routes without fake data.

PR CI pins Node 22, installs from the lockfile, and runs invariants, typecheck,
lint, unit tests, and production build without external secrets. The protected
Staging workflow first runs `verify:test-env` and
`verify:staging-fixtures`, then the explicit integration/browser gates. Secrets
are environment-scoped and no workflow receives Production service-role or
Stripe Live keys.

---

## 8. Repository onboarding and documentation ownership

The separate Program Integration plan owns `AGENTS.md`, onboarding, final live
documentation, and the cumulative Production smoke. This quality release only
produces test evidence and customer-surface changes, preventing it from claiming
deployment facts owned by Security, Financial, or Storage plans.

That final plan's `AGENT-ONBOARDING.md` explains in Egyptian Arabic with English technical terms:

- Muhammad's manager-level communication preference;
- the actual PyraSuite audiences and stack;
- credits, Stripe Live, generation persistence, RLS, RTL, i18n, UTF-8, and
  deployment invariants;
- the requirement to explain decisions simply;
- the read-only-first production verification and approval gates.

Update `SETUP.md`, `docs/INVARIANTS.md`, and the changelog only with facts verified
from the final code and live read-only checks. Historical counts are labeled as
snapshots rather than current truth.

---

## 9. Quality release and rollback

The work ships in small batches: tooling, transport, collection hooks,
localization, accessibility, then E2E/CI and an evidence handoff. Each code batch
passes its focused unit gate; the deployed Quality candidate passes the browser
suite in Staging.

React Query migrations are page-by-page and can revert without changing APIs.
Localization changes can revert per catalog/page pair. Accessibility changes can
revert per component, except the unsafe XSS renderer is outside this plan and can
never return.

This quality plan is complete when its unit, Staging browser, accessibility, and
CI gates pass. The Program Integration plan alone declares the whole remediation
complete after cumulative Production smoke and live evidence.
