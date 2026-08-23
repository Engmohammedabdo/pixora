# Changelog

Dated record of what shipped. Every entry names the files that prove it.

The convention here is deliberate: **an entry is only written after the change is
verified**, and the verification is stated. This repo has a documented history of
marking work complete before it worked — `FIXPLAN.md:19` marks "Stripe webhook —
no idempotency protection" as done, and that same handler turned out to be the
worst defect in the money path.

---

## 2026-08-23 — Password reset that can actually reset a password

`app/api/auth/recover/route.ts`, `app/[locale]/(auth)/{forgot,reset}-password/page.tsx`,
`lib/email/{client,send,templates}.ts`, `lib/throttle.ts`, `middleware.ts`,
`next.config.ts`, `supabase/migrations/043_throttle_table_is_general_purpose.sql`.

### It could never have worked, for two independent reasons

Reset was `supabase.auth.resetPasswordForEmail()` — Supabase Auth's job. Supabase
Auth is a **different Coolify service** with its own SMTP, and it has never had any.
Measured, not assumed: `/auth/v1/settings` reports `mailer_autoconfirm: true`, and all
three accounts have `email_confirmed_at` equal to `created_at` to the millisecond,
which is exactly what auto-confirm does when there is no mailer to confirm through.

And even with SMTP configured it would still have failed, because GoTrue builds its
`action_link` from `API_EXTERNAL_URL` — here the **internal** docker host:

    http://supabase-kong:8000/auth/v1/verify?token=…&type=recovery&redirect_to=…

`supabase-kong` resolves only inside the compose network. Every reset email GoTrue
would have sent carried a link that is dead in any inbox. Found by generating one and
looking at it, which is the only way it could have been found.

### What it does now

`POST /api/auth/recover` mints the token itself with
`admin.generateLink({ type: 'recovery' })` — which sends nothing — builds a link to
our own reset page carrying `properties.hashed_token`, and puts it on the transport
this app already uses for the dunning notice. One SMTP configuration, on the service
the app owns, instead of two.

Two rules shaped the route, and each cost something to satisfy:

- **The answer must not depend on whether the account exists.** Unknown address, known
  address, failed send — the same 200. The send is deliberately **not awaited**:
  awaiting it made the known-address arm pay for a full SMTP transaction and turned the
  route into a timing oracle, defeating by the clock what the identical body was there
  to prevent.
- **"We cannot send mail at all" is decided BEFORE the lookup.** Deciding after would
  mean the 503 is only ever returned for addresses that exist — an honest outage notice
  becoming the leak the first rule forbids. Verified: with no backend configured, a real
  and an unknown address get byte-identical 503s and no throttle row is written for
  either.

Throttled per source (5/15min) and per address (3/60min) through migration 039's
atomic RPC. The per-address counter key is a SHA-256 prefix; the address is never
stored.

### The defect adversarial review caught was the entire feature

`@supabase/ssr` hard-codes `flowType: 'pkce'` **after** spreading caller options, so no
caller can change it. `generateLink` issues an **implicit**-flow link. auth-js throws
`AuthPKCEGrantCodeExchangeError: Not a valid PKCE flow url.` before any network call —
no session, no `PASSWORD_RECOVERY` event, and a reset form whose button is disabled
forever with nothing on screen explaining why.

The old code never hit this because a PKCE client asks for a `?code=` link and gets
one. **Swapping the issuer flipped the link's flow while the consumer stayed pinned to
the other one** — the kind of break that no type checker sees and no build fails on.
The page now redeems the token with `verifyOtp({ token_hash, type: 'recovery' })`, an
explicit call that does not care about flow type and still writes the session to
cookies.

The same review found the reset page had **no failure surface at all**: an expired or
already-used link — which the email itself calls the normal case — rendered a greyed
button and zero text. It now has four states, and the two failure states name the
problem and offer a new link.

### Also fixed here

- **`npm run dev` produced a completely inert app.** The security stage removed
  `'unsafe-eval'` from the CSP unconditionally, and its own comment said "it is a
  dev/HMR requirement" while removing it anyway. Next's dev server serves eval-based
  modules, so the client bundle threw `EvalError` before hydration and every form on
  the site fell back to a native GET. Restored for development only, keyed off
  `NODE_ENV`; verified against `.next/routes-manifest.json` that the production build
  still ships no `unsafe-eval`.
- **`/api/auth/recover` returned 401 to every caller** until it was added to the
  middleware's public list — requiring a session from someone who by definition cannot
  get one. Found by calling it, not by reading it.
- The "forgot password" link is shown again. It was hidden behind
  `NEXT_PUBLIC_AUTH_EMAIL_ENABLED` because the destination lied; now it either sends
  the link or says plainly why it cannot and points at `/contact`. An invisible link
  leaves a locked-out customer with no path and no explanation.
- The reset page's subtitle was the forgot-password one, telling someone who had
  already clicked their link to "enter your email and we'll send you a reset link".

### Documentation that had become false

`docs/EMAIL_SETUP.md` sent the operator to configure SMTP on the **Supabase** service
to fix password reset — after this change, that configures a service which no longer
sends the message they are trying to unblock. It also said a timestamp appearing in
`auth.users.recovery_sent_at` proves SMTP is wired. **It proves nothing:** that column
is stamped by `admin.generateLink()`, which sends no mail, and the app's own reset
route calls it on every request. An earlier claim in this repo that "no auth email has
ever been sent, `recovery_sent_at` is NULL for every user" rested on that column and
has been corrected at every site that repeated it — `CLAUDE.md`, `SETUP.md`,
`.env.local.example`, and the login page's own comment.

**Verified:** `generateLink` → `verifyOtp` establishes a session for the right user
against the live service, and a second use of the same token returns `403 Email link
is invalid or has expired`. All four page states rendered in both locales. Route
behaviour exercised end to end: unknown address 200, fourth request 429, real address
with a dead SMTP host 200 with an identical body plus a `REACHABLE CUSTOMER NOT
REACHED` log, no backend 503 for both address kinds with zero counters written.
Migration 043 rehearsed rolled-back, then applied. Gates: `tsc`, `lint`, invariants
12/12, `[safety] 65`, `[uploaded-url] 37`, `[logo-parity] 41`, clean production build.

**Still needed to switch it on:** `EMAIL_FROM` + `SMTP_HOST` on the app service.

---

## 2026-08-23 — Data integrity: writes nobody checked, and a logo that was never uploaded

`supabase/migrations/042_brand_kit_logo_shape.sql`, `lib/supabase/generation-writes.ts`,
`lib/storage/uploaded-url.ts`, `components/brand-kit/LogoUpload.tsx`,
`app/api/studios/*/route.ts`.

### The brand kit was unusable in both directions

**Saving one with a logo stored a pointer to nothing.** `LogoUpload` called
`URL.createObjectURL(file)` and handed the result straight to `onChange`. A
`blob:` URL is a handle scoped to the document that created it and the bytes
were never uploaded anywhere, so the value died with the tab. Against the live
database that was **1 of 1 rows** — every brand-kit logo this product had ever
stored.

**Saving one without a logo did nothing at all, silently.** `BrandKitForm`
always sends `logo_url: logoUrl` and `brand_voice: brandVoice || null`. POST's
schema had `.optional()` where PUT had `.nullable()`, and `.optional()` rejects
`null` — so the request 400'd, `useBrandKit` threw, and the page awaited it with
no catch. The dialog stayed open, the button re-enabled, and nothing told the
user why. Editing worked; creating did not, for the same payload from the same
component.

`z.string().url()` was doing the validating, which is a syntax check, not a
provenance check. Measured, all four values that reach this column passed it:
`blob:`, `data:`, `javascript:` and any foreign host.

Now: the file is uploaded to `/api/upload` and the object URL never leaves the
component; the schema is shared; every mutation reports its failure as a toast;
and the logo is finally displayed on the brand-kit card, which is the only thing
it does — it still reaches no model, and the copy says so.

### The rule stated twice, in two languages, that did not agree

Migration 042 puts the same guard on `brand_kits` that 040 put on `assets`, for
the same reason: `authenticated` holds INSERT/UPDATE on every column and the
table's only policy has `polwithcheck = NULL`, so a customer can `PATCH
/rest/v1/brand_kits` and never touch the route.

**The first version of the route-side check was wrong, and adversarial review
caught it.** It decided on `new URL(url)` — but the routes store the string the
CLIENT SENT (`.insert({ ...input })`), and the trigger matches raw bytes. Every
normalisation the WHATWG parser performs was a place where the value checked was
not the value written. All of these were accepted by the route and then refused
by the database, turning the clean 400 into a 500 carrying raw Postgres text:

    …/a.png?download=evil.html    query lives in .search, never .pathname
    "   https://…/a.png"          leading whitespace stripped by URL()
    https://…clo<TAB>ud/…         C0 controls stripped by URL()
    https://…cloud\storage\…      backslashes become separators
    https://PIXORADB…CLOUD/…      host lowercased
    https://pixoradb。pyramedia。cloud/…   IDEOGRAPHIC FULL STOP mapped to '.'
    …/uploads/<uid>/./a.png       dot segment collapsed
    https://…cloud:443/…          default port dropped

The rule is now stated on the raw bytes both layers store. `scripts/tests/logo-parity.ts`
feeds one corpus of 41 strings to the TypeScript validator and to the Postgres
predicate and fails on any disagreement — which is why 042 exposes its rule as
`brand_kit_logo_is_own(text, uuid)` rather than burying it in a trigger body.

### Every studio's completion write was fire-and-forget

A generation leaves `reconcile_orphaned_generations()`'s scan
(`status IN ('pending','processing')`) only by being marked terminal. Every
studio issued that write with no `.select()` and discarded its error — and an
UPDATE that matches zero rows reports no error at all, so "no error" and "it
worked" were different claims and nothing checked the second one. A failed
completion leaves delivered, paid-for work sitting in the reconciler, which
refunds it within 45 minutes while the route already returned `success: true`
with the output attached.

`finalizeGeneration()` retries four times — shedding `output` before `credits_used`,
because the ledger is worth more than the stored copy of something the customer
already received — confirms the row via `RETURNING`, and logs a `REFUND RISK`
line when it cannot. `insertAssets()` retries a rejected batch row by row, so one
off-shape URL costs one asset instead of nine, but **only on a database verdict**:
a transport failure may already have committed and `assets` has no unique
constraint to absorb a duplicate.

**The conversion missed photoshoot, and adversarial review caught that too.** The
import was added, the asset write was converted, the completion write was left
raw — `tsc` and `eslint` both stayed green. Hence the new `generation-finalized`
invariant, which fails the build on any raw terminal write in a studio route.
Proved by reintroducing one and watching it fail.

### Campaign

- It **never wrote `assets`** — the only image studio that didn't. A 12-credit
  campaign's images were persisted to storage, embedded in `generations.output`,
  and unreachable from ملفاتي. The assets page even has a `campaign` filter that
  could never match anything. Zero campaign generations exist, so nothing needed
  backfilling.
- It **charged 12 credits with `success: true` for zero posts.** `|| '[]'` turned
  an empty model response into a parseable array, `arr.map` over it threw
  nothing, and every refund path was sized from `posts.length` — so zero posts
  refunded zero credits. Short-but-nonempty was charged as if it were nine.
  Empty is now a failure with a full refund, and image refunds are sized against
  the nine the campaign is sold as.

### Smaller, same class

- `formatFromUrl()` returned `png` for every `data:` URL — 13 of 25 live asset
  rows are `data:` URLs, and the export route uses that column verbatim as the
  ZIP filename extension, so JPEG bytes were handed over as `.png`. It reads the
  mime now.
- `assets.format` and `generations.studio` reached the ZIP entry name
  unsanitised, and both are customer-writable. Filename allowlist.
- `edit` inserted an asset row with `url: ''` whenever a generation produced no
  file — a tile in ملفاتي pointing at nothing. `insertAssets` drops those.
- The brand-kit routes returned raw Postgres `error.message` to the client.

**Verified:** migration rehearsed in a rolled-back transaction, applied, then
re-probed independently as the `authenticated` role — all six hostile shapes
returned `23514`, and the migration's own seven probes (A–G, covering INSERT as
well as UPDATE) refuse to commit if any cannot reach a verdict. `logo-parity`:
41 strings, both implementations agreeing on every one. `UPDATE … RETURNING id`
was proved to work as `authenticated` against a real completed generation before
`finalizeGeneration` was allowed to depend on it. Gates: `tsc` clean, `lint`
clean, invariants 12/12, `[safety] 65 checks`, `[uploaded-url] 37 checks`, clean
production build.

**Not fixed, and now recorded rather than implied:** `plan` (5 credits),
`analysis` (3) and `storyboard` (14) write their output only into
`generations.output`, and no customer-facing route reads that column — reload
the page and the work is gone. That needs a retrieval path, not a patch.

---

## 2026-08-19 → 2026-08-23 — Money path round three, security hardening, UX

Backfilled. `CLAUDE.md` cited this file as the evidence for round three while the
newest entry here was still 2026-08-06 — a pointer to a page that did not exist,
which is the same class of defect the preamble above exists to prevent.

### 2026-08-19 — A customer could rewind a delivered generation and be refunded

`297914a`, `supabase/migrations/038_generation_lifecycle_guard.sql`.

`generations` had one policy, "Users manage own generations" FOR ALL, and
`authenticated` held the bootstrap grant on every column. So a customer could
`PATCH /rest/v1/generations` their own **completed** row back to `processing`,
wait for `reconcile_orphaned_generations()` (pg_cron, every 15 min) and be
refunded in full for work already delivered — repeatably, for unlimited free
credits. Three supporting holes: `created_at` was writable, so an in-flight
generation could be backdated into the refund window; `status` was nullable and a
`CHECK` passes NULL, so `completed → NULL → processing` laundered a terminal row
past any `OLD`/`NEW` comparison; and policy `009:28` let a user DELETE the rows
`lib/rate-limit.ts:11-16` counts, i.e. the only throttle in front of every paid
studio.

A trigger, not a REVOKE: all nine studios write through `createServerClient()`
(anon key + the user's cookie JWT), so the app executes as `authenticated` — the
same role over the same PostgREST endpoint as the attacker, writing the same
column. Privilege cannot separate them; only the shape of the write can.

**The first version of this fix was bypassable.** It stated the rule as a
blacklist on `OLD`, and the NULL hop walked straight through it in two PATCHes.
The rule belongs on `NEW`, where it is total. Recorded in the migration header
because it is easy to reintroduce.

**Verified:** the migration proves itself at apply time against the live table as
the `authenticated` role (probes A–E) and refuses to commit if any probe cannot
reach a verdict — a probe blocked by RLS is treated as a failure, not a pass,
because it certifies nothing. Post-apply, all four attack paths were re-run
independently as `authenticated` and returned `23514` / `42501`. Forensics before
applying: the loop had never been used — zero rewound rows, zero reconciler
payouts ever.

### 2026-08-20 — Every free-plan image shipped without a usable watermark

`6d22742`, `4ebf1db`, `Dockerfile`, `lib/image/watermark.ts`,
`lib/storage/persist-image.ts`.

The mark is SVG `<text>` rendered through librsvg/pango. On a bare
`node:*-alpine` there are no fonts, so pango draws every glyph as `.notdef` — an
empty box — and returns **success**. From 2026-08-13 to 2026-08-20 every
free-plan image shipped with rectangles where the product name should be, with
nothing thrown and nothing logged. Proved by downloading a real production asset,
not by reasoning about it.

Fixed at the cause (`Dockerfile` installs `ttf-dejavu`) and guarded:
`assertTextRenderingAvailable()` renders `IIII` and `WWWW` and refuses the request
if they are byte-identical. With `.notdef` every glyph is the same box, so the two
renders match exactly — a did-any-pixel-change test cannot tell that apart.

`persistGeneratedImage` also stopped falling back to the clean original when the
watermark could not be applied: it throws `WatermarkRequiredError` and the caller
refunds. **A naive version of that fix would have minted credits** — creator and
photoshoot issue a partial refund *before* their uploads, so a throw afterwards
refunded the full reservation a second time. Netted against `refundedSoFar`.

### 2026-08-20 → 08-23 — Security hardening

`9b857d3`, `1ee1d4b`, `748ea06`, `32fd34e`, migrations 039–041.

One defect class produced most of these: **RLS gates WHICH ROW, only a GRANT
gates WHICH COLUMN.** Migration 022 applied column-level lockdown to `profiles`
and to no other table.

- Stored XSS in the admin panel — a customer's own prompt rendered as live HTML
  (`JSON.stringify` escapes quotes, not `<`). The `dangerouslySetInnerHTML` sink
  is gone; `highlightJson()` returns React nodes.
- The admin preview `<img src>` fetched a customer-chosen URL, beaconing the
  admin's IP and user-agent. Restricted to our own origin.
- SSRF: `POST /api/assets/export` did `fetch(asset.url)` on a customer-writable
  column and returned the response in a ZIP. Bytes now come from inline `data:`
  or our own bucket by validated path (`lib/storage/export-source.ts`).
- The admin login limiter failed **open** on any DB error, raced
  (SELECT-then-UPSERT), and keyed on the client-supplied leftmost
  `x-forwarded-for`. Replaced by an atomic `consume_login_attempt()` (039) that
  fails closed, reads the rightmost hop, and buckets IPv6 per-/64.
- `assets.url` was writable to any string by any customer (040).
- The CSP and two server-side fetch allowlists trusted `*.supabase.co` /
  `*.supabase.in` — multi-tenant wildcards this self-hosted deployment never
  owned. Removed. `script-src 'unsafe-eval'` removed, verified against the
  production bundle rather than assumed.

**Three defects were introduced by these fixes and caught by adversarial review
before shipping**, each recorded in its migration header: 040 v1 derived its
allowed origin from the customer-writable column it exists to constrain and built
a `LIKE` pattern from it, so a row of `https://%/...` could compile a guard
matching every host while all probes passed; the export fix v1 resolved only
storage paths and silently dropped the 13 of 25 live rows that are `data:` URLs,
taking one account from 16 exportable assets to 1 with a 200 and no warning; and
the login throttle's first global budget was an unrecoverable lockout — 10 IPs
× 5 attempts refused the real admin before credentials were ever checked, with
nothing to clear it.

**Verified:** every migration rehearsed in a rolled-back transaction, applied,
then re-probed independently as `authenticated`. `42501` for the admin-throttle
RPC/table/reset and for `assets` UPDATE; `23514` for an SSRF-shaped `assets`
INSERT; legitimate inserts still `OK`. The throttle was proved atomic with 25
genuinely parallel calls against a cap of 5 → exactly 5 allowed. Live after
deploy: a real generation completes and writes its asset row; export returns
`X-Export-Included: 13, X-Export-Skipped: 3`; admin login returns 401 → 429 at
the cap and records `login_throttled`.

### 2026-08-23 — UX, in three passes

`84c1ea2`, `0381ab1`, `b730b1d`, `9da9a56`.

1. **On a phone the studio looked like the button did nothing.** Output renders
   in a second column that is below the fold on mobile, so a generation appeared
   to do nothing for 20 seconds. `StudioLayout` now scrolls the output into view
   under `(max-width: 1023px)`, honouring `prefers-reduced-motion`, and announces
   with `aria-live="polite"` + `aria-busy` (deliberately not `role="status"`,
   which implies `aria-atomic`).
2. **The product promised things it does not do.** Onboarding claimed the brand
   kit is used "in every generation"; colours reach two of nine studios and the
   voice reaches one. Copy now names the two studios.
3. **The prompt safety filter refused real businesses and ignored Arabic.**
   `lower.includes(term)` blocked `amethyst`, `Bombay Grill`, `skill
   development` and `Shotgun Coffee` without ever naming the word. The first
   rewrite used a whole-word regex, which was barely better than nothing for
   Arabic — `القتل`, `بالسلاح` and `المخدرات` all passed, because Arabic writes its
   clitics joined to the word. Matching is now on stems. **The second version was
   also broken**: it treated digits as word characters, so `bomb1` defeated the
   filter entirely for the price of one keystroke.

   Two further defects found in the same review: the arrow translator wrapper
   took one parameter and silently dropped the values a message needs, so
   `{term}` rendered as literal text on six of nine studio pages while `tsc`
   stayed green; and `edit`, `photoshoot` and `prompt-builder` never called
   `sanitizePrompt` at all, which made their `catch (PromptBlockedError)` blocks
   unreachable and left the two highest-risk image surfaces with no filter.

**Verified:** `scripts/tests/safety.test.ts` — 65 checks, the first runnable
tests in this repo — wired into `prebuild`, so the build fails if the filter
breaks. The blocked term was confirmed rendering through the real next-intl
`createTranslator` in both locales.

---

## 2026-08-06 — Stripe SDK 21 → 22, API 2026-07-29.dahlia

`stripe` 21.0.1 → 22.4.0, and the pinned API version `2026-03-25.dahlia` →
`2026-07-29.dahlia` (the version SDK 22.4.0 is generated against).

The API bump is the safe half: both versions are **dahlia**, and monthly releases
inside a major are backward-compatible by definition. The SDK major is where the
breaking changes live. Checked each against this codebase before upgrading:

| v22 breaking change | This repo |
|---|---|
| `Stripe(...)` must become `new Stripe(...)` | already `new Stripe()` |
| Callback-style API methods removed | async/await throughout |
| API key as a function argument removed | passed to the constructor |
| Per-request host override removed | never used |
| `Stripe.StripeContext` / `Stripe.errors.StripeError` no longer types | zero references |
| CJS entry no longer exports `.default` / `.Stripe` | ESM imports only |
| `StripeResource` helper methods removed | zero references |

Nothing to migrate — the integration was already on the supported shapes.

`lib/stripe/client.ts` now exports `STRIPE_API_VERSION`. No invariant check guards
it, because none is needed: `apiVersion` is typed as the exact literal the installed
SDK pins, so a stale value is a compile error.

```
Type '"2026-03-25.dahlia"' is not assignable to type '"2026-07-29.dahlia"'
```

**Verified:** the full webhook replay suite re-run against the new SDK produces
byte-identical outcomes — a replayed top-up grants once, `past_due` leaves the plan
alone, `unpaid` downgrades while keeping purchased credits, `invoice.payment_failed`
writes no ledger row. The 12 database assertions still pass.

### Fixed: signature verification could be disabled by a public env var

Found while testing the upgrade. The webhook accepted unsigned JSON when either
`NODE_ENV === 'development'` **or** `NEXT_PUBLIC_APP_URL` contained the substring
`localhost`.

That second clause is an operator-set, publicly-exposed string. A deploy that
carried a localhost URL over from `.env.local.example` would silently turn off
signature verification on a live endpoint — and this route grants credits, so a
forged `checkout.session.completed` would be worth unlimited credits to anyone who
found the URL.

The bypass now requires `NODE_ENV !== 'production'`, which Next sets itself and no
environment variable can spoof.

`scripts/db/verify-webhook-signature.js` asserts the four properties the replay
tests structurally cannot reach, because they all use the unsigned dev path: a valid
signature verifies, a tampered body is rejected, a stale timestamp is rejected, and
a wrong secret is rejected.

### Noted, not changed

- **`STRIPE_WEBHOOK_SECRET` is present but empty in `.env.local`.** Harmless
  locally. If it is also empty in production, every webhook returns 500 and no
  customer ever receives credits — fail-closed, but completely broken. Verify it in
  Coolify before the first sale.
- **`@stripe/stripe-js` is declared in `dependencies` and imported by nothing.** The
  app uses hosted Checkout and redirects with `window.location.href`, so it is not
  needed. Left in place because it would be required for Payment Element or embedded
  checkout later; it costs nothing at runtime since it is never bundled.

---

## 2026-08-02 — Money path, round two

Round one stopped the app losing money on a payment that **succeeded**. This round
covers what happens when a payment is delivered twice, stops arriving, or is taken
back — and makes the billing screen tell the truth while it happens.

Found by a 32-agent audit in which every claimed defect was handed to an independent
agent instructed to refute it. Nine of the twenty-one raised were killed that way,
including two I had already started building against. What follows is what survived.

### Fixed: one top-up delivered twice granted the credits twice

The top-up handler read `purchased_credits`, added to it in Node, and wrote the sum
back — no row lock, no idempotency key on the money. Every other grant in the file
assigns absolutely (`credits_balance = <plan amount>`) and so is replay-safe; this
one was not. Stripe delivers at least once, and the route deliberately re-runs an
event whose row exists but is not yet marked processed. One $59.99 purchase
delivered twice granted 2000 credits.

Now a single RPC in one transaction, keyed on the Stripe payment intent, with a
partial unique index that makes a second grant impossible even under a concurrent
race. The same RPC also fixes `balance_after`, which omitted every previously
purchased credit.

`supabase/migrations/031_grant_purchased_credits.sql`, `app/api/stripe/webhook/route.ts`

**Verified against the live database:** the same event replayed after forcing the
retry condition grants 500 credits once, writes one ledger row, and records
`balance_after` 513 (13 monthly + 500 purchased). Server log:
`top-up for session cs_test_1 was already granted — replay ignored`.

### Fixed: a monthly cron refilled accounts that had stopped paying

`reset_monthly_credits()` selected on `credits_reset_date <= NOW() AND plan_id !=
'free'`. A plan name and a date — no payment state at all. The job is live
(`cron.job` jobid 1, monthly), so an account sitting in Stripe's ~3-week dunning
window, or one that had disputed its charge, was written back up to a full 5000
Agency credits on the 1st of every month, indefinitely.

Now skips any account flagged `payment_failed`. Credits already granted for a month
that *was* paid for stay spendable; no new month is issued until payment recovers,
which happens automatically since the webhook clears the flag on every success.

`supabase/migrations/032_reset_credits_payment_guard.sql`

### Fixed: nothing downgraded a subscriber who stopped paying

`customer.subscription.deleted` was the only exit from a paid plan, and Stripe only
sends it when the dashboard's retry-exhaustion action is "cancel". Under "mark
unpaid" or "leave past due" the subscription object simply changes status, `deleted`
never arrives, and `plan_id` stays on the paid tier forever — while `create-checkout`
still 409s the customer as an existing subscriber.

Added a status branch for `unpaid`, `canceled` and `paused`, sharing one
`downgradeToFree()` with the cancel path so the two cannot drift. `past_due` is
deliberately excluded: that is a soft decline inside the retry window, and the cron
guard above already stops new credits reaching it.

**Verified:** `status: "past_due"` leaves an Agency account untouched;
`status: "unpaid"` downgrades it to free/25, clears the subscription id, and keeps
the customer's separately-purchased credits.

### Added: a dispute is now handled at all

A chargeback fires none of the handled events — the invoice stays `paid` on Stripe's
side, so `invoice.payment_failed` never comes and the subscription keeps cycling. The
account kept its paid tier while the money had already been pulled back plus a fee.

`charge.dispute.created` now resolves the charge to a customer, logs the dispute
loudly, and downgrades.

> Requires `charge.dispute.created` to be enabled on the webhook endpoint in the
> Stripe Dashboard. The handler cannot fire if the endpoint is not subscribed to it.

### Fixed: refunds destroyed credits the customer had bought

`refund_credits` always returned credits to `credits_balance`, whatever pool the
spend actually drew on. That column is overwritten wholesale at five sites, so a
credit **bought for money** and refunded after a failed generation was deleted at the
next renewal. The exposure is `reconcile_orphaned_generations()` (cron jobid 2, every
15 minutes), which refunds stranded generations in bulk while the customer is offline
and cannot re-spend before the overwrite lands.

Usage rows now record which pool each spend came from, and a refund goes back the
same way. Repeated partial refunds — campaign refunds per failed image — are capped
cumulatively so they cannot mint purchased credits out of monthly ones. Rows written
before the migration have NULL splits and fall back to the old behaviour, so no
backfill was needed.

`supabase/migrations/033_refund_to_source_pool.sql`

**Verified:** twelve assertions run against the live database inside a rolled-back
transaction (`scripts/db/tests/money-path.sql`), covering purchased-only, mixed,
three-way partial, and expired-pool refunds.

### Fixed: `payment_failed` was written by the webhook and read by nothing

The flag had zero readers outside the type definition. A customer whose card declined
experienced no in-app change whatsoever, then was silently downgraded weeks later.

It now drives two things: the cron guard above, and a red dashboard banner with a
one-click route to the billing portal. With no transactional email in the product,
that banner plus Stripe's own dunning emails are the entire notification path.

`components/shared/PaymentFailedBanner.tsx`, `app/api/credits/balance/route.ts`

### Fixed: the screen a customer sees right after paying

The billing page rendered "Success!" from the URL parameter alone, over a profile
read once at mount and never invalidated by the webhook. A customer returning from a
$29 checkout could see a green success banner above a `Free` badge, a `1000 / 25`
balance, and no Manage Subscription button — until they thought to reload.

The plan now comes from the server via the balance poll the layout already runs, so
the badge, the denominator, the plan cards and the portal button all heal within 30s.
While the plan is still settling, the banner is amber and honest — "payment received,
activating your plan" — and every plan card is inert so a paid customer cannot open a
second checkout.

### Fixed: three ways the billing screen was lying or unreachable

- **The portal button was gated on the plan**, so a customer who had only ever bought
  top-ups — and a churned subscriber — were locked out of their own receipts and
  payment history. It is now gated on having a Stripe customer, which is what the
  route actually checks, and relabels to "الفواتير وطريقة الدفع" for non-subscribers.
- **Every Stripe route returned English customers to the Arabic page.** The portal
  hardcoded `/ar/billing`; checkout and top-up *looked* correct but read
  `profiles.locale` — a column declared in migration 001 and written by nothing, so
  it was always `'ar'`. The caller's real locale is now passed in the request.
- **Raw error codes were shown to customers.** `toast.error(data.error || t('…'))`
  never reached the fallback, because these routes always populate `error` — so an
  Arabic customer saw the literal token `portal_failed` in an RTL page.

### Removed: a fake ledger row on every failed payment

`invoice.payment_failed` wrote `amount: 0, type: 'reset', balance_after: 0` without
reading the profile. `TransactionTable` renders that type as a red "Monthly reset — 0"
row — one per Stripe retry attempt, directly above a widget showing the customer's
real balance. A payment failure is not a credit transaction.

### Also

- The webhook's `processed: true` marker is now checked like every other write. Left
  unchecked, the route returned 200 while `processed` stayed false, and the next
  at-least-once delivery ran the handler again.
- `credits_balance: 25` on downgrade now reads `getCreditsForPlan('free')`.
- Subscription events with no `userId` in metadata now log a warning instead of
  vanishing — that is what a subscription created in the Stripe Dashboard looks like.
- Dead `annual` / `save18` / `billingCycle` translation keys removed, left behind when
  annual billing was deleted.

### Still not done — deliberately

Tax invoices, VAT and `tax_id_collection` remain absent, and that is correct: below
the AED 375,000 threshold the business has no TRN and **may not issue a document
stating VAT**. Shipping `tax_id_collection` alone would produce a non-compliant
invoice. This becomes real work at registration, not before.

---

## 2026-07-21 — Money path hardened, waitlist live

### Fixed: paid customers were not receiving credits

The Stripe webhook made 23 database writes and checked the result of none of
them. `supabase-js` resolves with `{ data, error }` instead of throwing, so the
surrounding `try/catch` never fired on a database failure. Execution continued to
the `processed: true` marker, the route returned 200, and Stripe — seeing a
successful delivery — never retried. The customer had paid and received nothing,
with no error anywhere and no way to replay the event.

Critical writes now go through a `mustSucceed` helper that throws on error, so
the failure reaches the catch block, returns 500, and Stripe retries.

`app/api/stripe/webhook/route.ts` — 10 critical writes guarded.

### Fixed: upgrading created a second parallel subscription

`create-checkout` opened a new `mode: 'subscription'` session with no check for
an existing one. Stripe creates a second subscription rather than replacing the
first, so a Starter subscriber who clicked Pro was billed $12 + $29 = $41/month.
The webhook then overwrote the stored subscription id, leaving the original
billing forever with no way to cancel it from the app.

Now returns 409 with a message and a link to the billing portal.

`app/api/stripe/create-checkout/route.ts`, `app/[locale]/(dashboard)/billing/page.tsx`

### Fixed: a full month of credits on any subscription update

`customer.subscription.updated` fires for payment-method edits, trial changes and
cancel-at-period-end — not just plan changes. The handler granted a full month of
credits on every one of them, and read the plan from `metadata`, which Stripe does
not update when a subscription item changes.

Now reads the plan from the price, requires an `active`/`trialing` status, and
skips the grant when the tier has not actually changed.

### Fixed: credits granted before payment settled

`checkout.session.completed` fires while a delayed payment method is still
pending. Now requires `payment_status === 'paid'`.

### Removed: annual billing

All four annual price ids were `price_*_annual_placeholder`, and the env vars
were absent even from `.env.local.example` — so every annual checkout returned
500 while a "save 18%" badge advertised it on an indexed public page. Worse, the
renewal handler is tied to the Stripe billing cycle, so a correctly configured
annual subscriber would have paid for a year and received one month of credits.

Removed entirely rather than half-fixed: config, API field, and both UI toggles.
Zero references remain.

### Added: pre-launch waitlist

`/[locale]/waitlist` (ar + en, static) collects interested emails while the rest
of the product is finished. It promises nothing the product cannot do — no
pricing, no "try it now", no feature claims.

Security shape:
- Reads are server-only. The public key cannot enumerate the list; a leaked email
  list is a real breach, not an embarrassment.
- Writes go through a `SECURITY DEFINER` RPC accepting exactly four fields,
  rather than a table-level INSERT grant.
- Rate limited to 5/minute per IP, plus a honeypot field.
- A repeat signup returns the same response as a new one, so the form cannot be
  used to test whether a given address is on the list.

`supabase/migrations/030_waitlist.sql`, `app/api/waitlist/route.ts`,
`components/landing/WaitlistForm.tsx`

**Verified end to end against production:** signup returns 200 and stores exactly
one row; a repeat signup in different case updates that row instead of
duplicating it; an Arabic name round-trips intact; honeypot submissions are
accepted with a normal 200 and never stored; `anon` can neither read the table
nor call the RPC.

### Fixed: the honeypot announced itself

The Zod field was `.max(0)`, so a filled honeypot failed validation and returned
400 — telling a bot exactly which field caught it, which is the one thing a
honeypot must never do. It now accepts the value and discards the submission with
an ordinary 200.

### Added: migration runner and ledger

Port 5432 is closed to the internet (correct) and no `exec_sql` RPC exists, but
this self-hosted deployment exposes pg-meta's `/pg/query` through Kong. The
runner uses it, reading the service-role key from `.env.local` rather than argv
so it cannot reach shell history. `scripts/db/` is gitignored.

It refuses a migration whose version is already in `schema_migrations`. That
check paid for itself immediately: the waitlist migration was numbered 026, but
`026_referral_abuse_controls.sql` was already applied in production — and the
ledger writes use `ON CONFLICT DO UPDATE`, so applying it would have silently
overwritten the record of that migration. Renumbered to 030.

---

## Verified state of production (2026-07-21)

Read directly from the database, not inferred:

| Check | Result |
|-------|--------|
| Migrations recorded | 022–030 |
| `authenticated` can execute `deduct_credits` / `refund_credits` | **no** |
| `authenticated` can INSERT into `projects` | **no** |
| Self-referencing `team_members` policies (the 42P17 recursion) | **0** |
| Integrity trigger on `generations` | present |
| Public tables without RLS | **0** |

The 42P17 recursion that made every read of `projects`, `teams` and
`team_members` fail is resolved — those tables now respond normally.

---

## Known open items

Ordered by what blocks revenue first. Detail in the audit report.

1. **Transactional email** — none at all. Password reset is broken in production
   today, and this blocks team invites, receipts and payment-failure notices.
2. **Support channel** — no contact page, no support email, no widget. An error
   message tells the user to "contact support" with no way to do so.
3. **Tax invoice, VAT, refund handling** — blocks selling to Gulf companies.
4. **Admin panel stored XSS** — `components/admin/ExpandableRow.tsx` injects
   unescaped user-controlled JSON via `dangerouslySetInnerHTML`, executing in the
   admin session.
5. **Exposed credentials** — the service-role key and database password remain in
   git history and the repository is public. See `docs/ROTATE_SECRETS.md`.
