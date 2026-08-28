# CLAUDE.md — PyraSuite Project Instructions

> هذا الملف للـ Claude Code. اقرأه كاملاً قبل أي كود.

---

## Project Overview

**PyraSuite** — أول منصة عربية تحوّل أي فكرة لحملة تسويقية كاملة — بقوة بايرا 🦊

**Live URL:** https://pyrasuite.pyramedia.cloud/
**Stack:** Next.js 15 + TypeScript + Tailwind v3 + shadcn/ui + Supabase + Stripe + Pyra AI 🦊

---

## ⚠️ الهوية التسويقية — إلزامي!

### مين بايرا 🦊؟
**بايرا (Pyra AI)** هي الاسم التسويقي لمحرك الذكاء الاصطناعي الخاص بـ PyraSuite.

- **تسويقياً:** بايرا هي اللي تولّد الصور، تكتب الخطط، تحلل المنافسين
- **تقنياً:** بايرا هي router يدير عدة نماذج AI (Gemini + GPT + Flux + ElevenLabs)
- **المستخدم يتعامل مع "بايرا" كشخصية واحدة** — مش مع APIs مختلفة

### قواعد الهوية التسويقية:
1. **لا تذكر أسماء الـ models مباشرة للمستخدم** — قل "بايرا" أو "محرك Pyra AI"
2. **الـ multi-model routing = "ذكاء متعدد الطبقات"** — مش "Gemini fallback to GPT"
3. **الـ fallback = "بايرا تجرّب مسار ثاني"** — مش "model failed, trying another"
4. **في الكود:** متغيرات الـ models تبقى كما هي (gemini/gpt/flux) — التغيير في UI/UX فقط
5. **في الـ UI:**
   - Loading state: "بايرا تشتغل..." بدل "جاري التوليد"
   - Fallback notice: "بايرا استخدمت مسار بديل" بدل "تم استخدام نموذج بديل"
   - Model selector (داخلي): "سرعة / جودة / إبداع" بدل "Gemini / GPT / Flux"
6. **في الـ Landing page:** "محرك Pyra AI 🦊" — ذكاء متعدد الطبقات
7. **في الـ README:** كل الـ AI features تُنسب لبايرا

### أمثلة:
```
❌ "Powered by Gemini + GPT + Flux"
✅ "بقوة بايرا 🦊"

❌ "Gemini failed, falling back to GPT"
✅ "بايرا تجرّب مسار بديل"

❌ "Choose AI model: Gemini / GPT / Flux"
✅ "مسار بايرا: سرعة / جودة / إبداع"

❌ "Generated with OpenAI TTS"
✅ "تعليق صوتي من بايرا 🎙️"
```

---

## Project Status — verified against code, not against intent

> **Read this before trusting any ✅ in this repo.** A July 2026 audit read 100
> documented claims and checked each one against the source. Result: 14 were UI
> with no backend, 32 half-built, 16 absent entirely. The docs were not stale —
> they recorded intent at the moment of writing and were never re-checked.
>
> **Rule from here on: a ✅ must be able to name a file:line that proves it.
> Otherwise write the real state.** A doc that lies is worse than a missing
> feature — the feature gets discovered, the doc misdirects every later decision.

### Shippable today

| Area | State | Proof |
|------|-------|-------|
| Auth + DB + RLS | ✅ built | 30 migrations; every public table has RLS |
| 9 studios generate | ✅ built | `app/api/studios/*` — all 9 return real output |
| Credits: reserve → deduct → refund | ✅ built | atomic RPCs, `SELECT … FOR UPDATE` |
| Projects (client workspaces) | ✅ built | wired into all 9 studios + asset filter |
| Stripe money path | ✅ hardened | see "Money path" below |
| Pre-launch waitlist | ✅ built | `/[locale]/waitlist`, migration 030 applied |
| Invite-only gate | ✅ built + **live** | `invite_gate_status()` on the live DB returns `installed: true, enabled: true`; refusal is a BEFORE INSERT trigger on `auth.users` (035/036) |
| Invite issue + email | ✅ built | `/admin/invites` → `issue_invite` RPC, then `sendInviteEmail()`; per-address delivery status is reported, never assumed |
| Text-studio retrieval | ✅ built | `/api/generations` + `/api/generations/[id]`, surfaced by `components/shared/RecentWork.tsx` in plan/analysis/storyboard |
| Admin dashboard | ✅ built | real funnel/MRR/churn/retention queries |
| i18n ar/en + RTL | ✅ built | 863 keys each, verified identical 2026-08-23 |

### Money path — round 1 fixed 2026-07-21, round 2 fixed 2026-08-02, round 3 fixed 2026-08-19

Round 1 — money that arrived:

| Defect | State |
|--------|-------|
| Webhook ignored all 23 DB writes → paid customer got no credits, Stripe never retried | ✅ fixed — critical writes throw via `mustSucceed` |
| Upgrade created a SECOND parallel subscription → double billing | ✅ fixed — 409 + billing-portal route |
| `subscription.updated` granted a full month on ANY update | ✅ fixed — reads plan from price, requires live status + tier change |
| Credits granted before payment settled | ✅ fixed — requires `payment_status === 'paid'` |
| Annual billing sold with placeholder price ids → every purchase 500'd | ✅ removed entirely (not deferred — deleted) |

Round 2 — money delivered twice, money that stops, money taken back:

| Defect | State |
|--------|-------|
| One top-up delivered twice granted the credits twice | ✅ fixed — `grant_purchased_credits` RPC, keyed on payment intent (031) |
| Monthly cron refilled non-paying accounts forever (job is LIVE, `cron.job` jobid 1) | ✅ fixed — reset skips `payment_failed` (032) |
| Nothing downgraded a subscriber who stopped paying — `deleted` was the only exit | ✅ fixed — status branch shares `downgradeToFree()` |
| A chargeback fired no handled event; account kept its paid tier | ✅ fixed — `charge.dispute.created` handler† |
| Refunds destroyed credits the customer had bought | ✅ fixed — refund returns to its source pool (033) |
| `payment_failed` was written by the webhook and read by NOTHING | ✅ fixed — drives the cron guard + a dashboard banner |
| Post-checkout screen showed "Success" over a `Free` badge | ✅ fixed — plan comes from the server poll, amber pending state |
| Portal unreachable for top-up-only and churned customers | ✅ fixed — gated on `stripe_customer_id`, not plan |
| Every Stripe route returned English users to `/ar/billing` | ✅ fixed — locale passed by the caller (`profiles.locale` is a dead column) |
| Raw error codes (`portal_failed`) shown to Arabic customers | ✅ fixed |

† Requires `charge.dispute.created` to be enabled on the webhook endpoint in the
Stripe Dashboard — the handler cannot fire if the endpoint is not subscribed to it.

Round 3 — money the customer could take back after receiving the goods
(fixed 2026-08-19, migration `038_generation_lifecycle_guard.sql`):

| Defect | State |
|--------|-------|
| A customer could PATCH their own **completed** generation back to `processing` and let the reconciler refund it in full — work already delivered, repeatable, unlimited free credits | ✅ fixed — `generations_lifecycle_guard` trigger |
| `created_at` was writable, so an in-flight generation could be backdated into the refund window and collected on while the route was still running | ✅ fixed — `created_at` immutable |
| `generations.status` was nullable and a `CHECK` passes NULL, so `completed → NULL → processing` laundered a terminal row past any `OLD`/`NEW` comparison | ✅ fixed — `status SET NOT NULL` + the rule stated on `NEW` |
| Policy 009:28 let a user DELETE their own generations — the rows `lib/rate-limit.ts:11-16` counts, i.e. the only throttle in front of every paid studio | ✅ fixed — DELETE revoked from `PUBLIC, anon, authenticated` |

**Why a trigger and not a REVOKE.** All nine studios write `generations` through
`createServerClient()` (`lib/supabase/server.ts:5`) — anon key plus the user's
cookie JWT — so the app executes as `authenticated`, the *same role over the same
PostgREST endpoint as the attacker*, and `status` is exactly the column both must
write. Privilege cannot separate them; only the shape of the write can. Every
legitimate write moves a generation forward, so the invariant is: **a row may only
be in the reconciler's scan window if it was already in it.** Stated on `NEW`, where
it is total — a blacklist on `OLD` is what the NULL hop defeats.

**Verification:** `scripts/db/tests/money-path.sql` runs 12 assertions against the
live database inside a rolled-back transaction. The webhook paths were verified by
replaying events at a running dev server. Migration 038 proves itself at apply time
against the live table **as the `authenticated` role** (probes A–E, `038:§4`) and
refuses to commit if any probe cannot reach a verdict — a probe blocked by RLS is
treated as a failure, not a pass, because it certifies nothing. Post-apply, all four
attack paths were re-run independently as `authenticated` and returned `23514`
(check_violation) / `42501` (permission denied). Forensics before applying: the loop
had never been used — zero rewound rows, zero reconciler payouts ever.
See `docs/CHANGELOG.md` for the evidence.

### Security hardening — fixed 2026-08-20 → 2026-08-23

One defect class produced most of these: **RLS gates WHICH ROW, only a GRANT
gates WHICH COLUMN.** Migration 022 applied column-level lockdown to `profiles`
and to no other table, so every table where Supabase's bootstrap
`GRANT ALL TO anon, authenticated` was never revoked still lets a customer
rewrite arbitrary columns of their own rows.

| Defect | State |
|--------|-------|
| Stored XSS: a customer's own prompt rendered as live HTML in the admin panel (`JSON.stringify` escapes quotes, not `<`) | ✅ fixed — `highlightJson()` returns React nodes; the `dangerouslySetInnerHTML` sink is gone |
| Admin preview `<img src>` fetched a customer-chosen URL, beaconing the admin's IP/UA | ✅ fixed — previews restricted to our own origin |
| SSRF: `POST /api/assets/export` did `fetch(asset.url)` on a customer-writable column, returning the response in a ZIP | ✅ fixed — bytes come from inline `data:` or our own bucket by validated path (`lib/storage/export-source.ts`) |
| Admin login limiter failed OPEN on any DB error, raced (SELECT-then-UPSERT), and keyed on the client-supplied leftmost `x-forwarded-for` | ✅ fixed — atomic `consume_login_attempt()` (039), fails closed, rightmost hop, per-/64 for IPv6 |
| `assets.url` writable to any string by any customer | ✅ fixed — UPDATE revoked, INSERT shape-constrained (040) |
| CSP + two server-side fetch allowlists trusted `*.supabase.co` / `*.supabase.in` — multi-tenant wildcards this self-hosted deployment never owned | ✅ fixed — removed from CSP, `remotePatterns`, `lib/ai/gemini.ts`, `lib/image/watermark.ts` |
| `script-src 'unsafe-eval'` | ✅ removed — verified against the production bundle, not assumed |
| `script-src 'unsafe-inline'` | ⚠️ **remains.** Next.js App Router emits inline bootstrap scripts; the nonce alternative forces all 133 prerendered pages dynamic. Deliberate trade, not an oversight. |

**Verification.** Every migration rehearsed in a rolled-back transaction, then
applied, then re-probed independently **as the `authenticated` role** against the
live database — a probe blocked by RLS is treated as a failure, not a pass,
because it certifies nothing. Results: `42501` (permission denied) for admin-
throttle RPC/table/reset and for `assets` UPDATE; `23514` (check violation) for
an SSRF-shaped `assets` INSERT; legitimate inserts still `OK`. The throttle was
proved atomic with 25 genuinely parallel calls against a cap of 5 → exactly 5
allowed. Live end-to-end after deploy: a real generation completes and writes its
asset row; export returns `X-Export-Included: 13, X-Export-Skipped: 3`; admin
login returns 401 → 429 at the cap and records `login_throttled`.

**Three defects were introduced by these fixes and caught by adversarial review
before shipping.** They are recorded in the migration headers because each is
easy to reintroduce:
- 038 v1 stated its rule as a blacklist on `OLD`. `status` was nullable and a
  `CHECK` passes NULL, so `completed → NULL → processing` walked through in two
  PATCHes. The rule belongs on `NEW`, where it is total.
- 040 v1 derived its allowed origin **from the customer-writable column it
  exists to constrain**, and built a `LIKE` pattern from it — so a row of
  `https://%/...` could compile a guard matching every host while all probes
  passed. Now a literal, matched with `starts_with()`.
- The export fix v1 resolved only storage paths, silently dropping the 13 of 25
  live rows that are `data:` URLs — one account went from 16 exportable assets
  to 1, with a 200 and no warning.

**Still open (known, not fixed here):** `script-src 'unsafe-inline'` above, and
`scripts/backfill-data-uris.ts --watermark` is all-or-nothing across users,
making it the one remaining path that could publish an unwatermarked free-plan
image.

### Data integrity — fixed 2026-08-23 (migration 042)

Everything below was measured against the live database, not inferred.

| Defect | State |
|--------|-------|
| **Every brand-kit logo ever saved was a dead pointer.** `LogoUpload` did `URL.createObjectURL(file)` and handed the result to `onChange`; the bytes were never uploaded. 1 of 1 live rows. | ✅ fixed — uploads to `/api/upload`; the object URL is now a local preview only and never leaves the component |
| **Creating a brand kit without a logo did nothing, silently.** The form always sends `logo_url: null` / `brand_voice: null`; POST had `.optional()` (PUT had `.nullable()`), so it 400'd, the hook threw, and nothing caught it — dialog open, no message, forever. | ✅ fixed — shared schema, and every mutation now toasts its failure |
| `logo_url` was validated with `z.string().url()` — a syntax check. `blob:`, `data:`, `javascript:` and any foreign host all passed. | ✅ fixed — `isOwnUploadUrl()` + migration 042 |
| **The campaign studio never wrote `assets`.** A 12-credit campaign's images were persisted to storage, embedded in `generations.output`, and unreachable from ملفاتي — the assets page even has a `campaign` filter that could never match anything. | ✅ fixed (0 campaign generations existed, so nothing to backfill) |
| **Campaign charged 12 credits with `success: true` when the model returned no posts.** `\|\| '[]'` made an empty response parse, and every refund path was sized from `posts.length`. A short response was charged as if it were nine. | ✅ fixed — empty is a failure; image refunds are sized against the 9 sold |
| **Every studio's completion write was fire-and-forget.** A generation leaves the reconciler's scan window only by being marked terminal — so a silently failed `update({status:'completed'})` gets delivered, paid-for work refunded within 45 minutes while the route already returned the output. | ✅ fixed — `finalizeGeneration()` retries, confirms via `RETURNING`, and logs `REFUND RISK` when it cannot |
| A batch `assets` insert lost every row to one off-shape URL (the risk migration 040's own header named). | ✅ fixed — `insertAssets()` retries row-by-row, but only on a database verdict, never on a transport failure that may already have committed |
| `formatFromUrl()` returned `png` for every `data:` URL, so JPEG bytes exported as `.png`. 13 of 25 live asset rows are `data:` URLs. | ✅ fixed — reads the mime |
| `assets.format` and `generations.studio` reached the export ZIP's entry names unsanitised; both are customer-writable. | ✅ fixed — filename allowlist |

**One defect was introduced by these fixes and caught by adversarial review
before shipping**, and it is the same shape as 040's: `isOwnUploadUrl()` first
decided on `new URL(url)` while the routes store the string the client SENT and
migration 042 matches raw bytes. A query string, a leading space, an embedded
tab, an uppercase host, an IDN full stop, a `./` segment and a backslash path
were all blessed by the route and then refused by the database — a 500 carrying
raw Postgres text instead of a clean 400. **The rule must be stated on the same
bytes both layers store.** `scripts/tests/logo-parity.ts` now feeds one corpus
to both and fails on any disagreement.

**A second was caught by the same review and is why a new invariant exists:** the
conversion to `finalizeGeneration()` added the import to `photoshoot`, converted
its asset write, and left its completion write raw. `tsc` and `eslint` both
stayed green. The `generation-finalized` invariant now fails the build on any
raw terminal write in a studio route — proved by reintroducing one.

**Verified:** migration rehearsed in a rolled-back transaction, applied, then
re-probed independently as `authenticated` — all six hostile shapes returned
`23514`. `logo-parity` reports 41 strings, TypeScript and Postgres agreeing on
every one. Gates: `tsc` clean, `lint` clean, invariants 12/12, `[safety] 65`,
`[uploaded-url] 37`, clean production build.

### Password reset — rebuilt 2026-08-23

A customer who forgot their password had no way back into a paid account, and the
page told them a link was on its way. Two independent reasons it could never have
worked, both measured rather than reasoned about:

1. **Nothing was sending.** Reset was `supabase.auth.resetPasswordForEmail()`, i.e.
   GoTrue's job, and GoTrue is a separate Coolify service whose SMTP has never been
   set. `/auth/v1/settings` reports `mailer_autoconfirm: true`, and every account has
   `email_confirmed_at == created_at` to the millisecond — what auto-confirm does when
   there is no mailer to confirm through.
2. **The link was unreachable anyway.** GoTrue builds `action_link` from
   `API_EXTERNAL_URL`, which here is the *internal* docker host
   `http://supabase-kong:8000`. Even with SMTP configured, the message would have
   carried a link that resolves nowhere outside the compose network.

Now: `POST /api/auth/recover` mints the token with `admin.generateLink()` (which sends
nothing), builds a link to our own reset page carrying `properties.hashed_token`, and
sends it on the app's transport. The page redeems it with
`verifyOtp({ token_hash, type: 'recovery' })`.

**Two rules the route is built around**, both of which cost a redesign to satisfy:

- *The answer must not depend on whether the account exists.* Unknown address, known
  address, failed send — the same 200. The send is **not awaited**, because awaiting it
  made the known-address arm pay for a whole SMTP transaction and turned the route into
  a timing oracle for a product whose customer list is its business.
- *"We cannot send mail at all" is decided BEFORE the lookup.* Deciding after would
  mean the 503 is only ever returned for addresses that exist — an outage notice
  becoming the leak the first rule forbids.

Throttled per source (5/15min) and per address (3/60min) through migration 039's
atomic RPC; the counter stores a SHA-256 prefix, never the address.

**One defect in this fix was caught by adversarial review before shipping, and it was
the whole feature:** `@supabase/ssr` hard-codes `flowType: 'pkce'` *after* spreading
caller options, so the implicit-flow fragment GoTrue's verify endpoint redirects with
is rejected by our own client — `AuthPKCEGrantCodeExchangeError`, thrown before any
network call, leaving no session, no event, and a reset form whose button is disabled
forever with nothing on screen. The old code did not hit this only because a PKCE
client asks for a `?code=` link and gets one. **Swapping the issuer flipped the link's
flow while the consumer stayed pinned to the other.** `verifyOtp` sidesteps flow type
entirely. The same review found the reset page had no failure surface at all — an
expired link, which the email itself says is the normal case, rendered a greyed-out
button and zero text.

**Verified live:** `generateLink` → `verifyOtp` establishes a session for the right
user and a second use returns `403 Email link is invalid or has expired`; all three
page states render in both locales; the route returns an identical body for a real and
an unknown address, 429 at the cap, and 503 with zero counters written when no backend
is configured.

**Still needed to switch it on:** `EMAIL_FROM` + `SMTP_HOST` on the app service. Until
then the page says so and offers `/contact` instead of claiming a send.

### Launch readiness — fixed 2026-08-23 (the round that shipped the invite launch)

A seven-dimension audit produced 100 candidate observations; adversarial verification
confirmed 24 and **refuted 24 of 48 that reached a verdict** — treat any unverified
finding in this repo as a hypothesis, not a defect.

**The one that was already live in production:**

```
/login   -> 307 -> /login/login -> ... 10 hops deep, still going
/pricing -> 307 -> /pricing/login
```

Every URL without a locale prefix was an **infinite redirect loop**, measured against
production. `pathname.split('/')[1] || 'ar'` never asked whether the first segment IS a
locale, so `/login` built a redirect to `/login/login`, whose first segment is again
`login`. `/pricing` is the URL a launch announcement links to. Fixed with
`localeOf()`/`stripLocale()` in `middleware.ts`, which match against `routing.locales` —
so a segment either is a locale or the path has none, with no third case. Verified on a
real production build across 20 paths, logged in and out, plus `/ab/`, `/xx`, `/en-GB/`:
every one terminates in ≤ 2 hops.

| Defect | State |
|--------|-------|
| Locale-less URLs were an infinite redirect loop **in production** | ✅ fixed — verified live |
| A mid-period plan switch re-granted a full month of credits; the reverse destroyed a paid-for balance | ✅ fixed — `lib/credits/plan-switch.ts` |
| A rejected image upload was swallowed: thumbnail rendered from the `blob:` URL, Generate enabled, credits reserved, request died in the model client. Three of nine studios unusable, forever, with no message | ✅ fixed — all three forms + server-side backstop |
| Premium voiceovers billed at the premium rate could be served an American-English voice reading Arabic | ✅ fixed — refuses the substitution, refunds, discloses |
| Campaign charged the full 12 credits with "Generate All Images" unchecked — 12 for the 3-credit half | ✅ fixed — price decomposed, form tracks the checkbox |
| Storyboard (14cr), plan (5cr) and analysis (3cr) marked malformed model output `completed`, kept the credits, then threw while rendering it | ✅ fixed — shape validated before finalizing; renderers survive partial output |
| The asset library download button never downloaded — cross-origin `<a download>` is ignored, so it navigated the customer out of the app | ✅ fixed — the one page whose purpose is retrieving finished work |
| A banned account kept full API access; the ban only blocked HTML page loads | ✅ fixed — enforced in the `/api/*` branch, session revoked |
| `lib/ai/prompts/plan.ts` imported `sanitizePrompt` and never called it, making the plan route's `PromptBlockedError` handler dead code | ✅ fixed — plan and analysis now sanitize **before** the credit reservation |
| `prebuild` ran `npx tsx` with `tsx` undeclared, so every production Docker build fetched `tsx@latest` + an esbuild binary from the registry, unpinned, mid-build | ✅ fixed — declared and locked |
| An empty `REPLICATE_API_TOKEN` made flux a dead 2.5s stop whose thrown error then **overwrote** the real gemini/gpt failure | ✅ fixed — providers without credentials are filtered out before the first network call |

**The money rule took three attempts, and the first two both shipped as taps.** This is
the most reusable lesson in this round:

1. Stated on the **event** (*has this switch already granted?*) — defeated, because every
   switch in a down-up cycle is a genuine, distinct tier change, indistinguishable from
   honest churn.
2. Stated on the **resulting balance** (cap the balance at the new allowance) — defeated,
   because balance is a number the customer moves by spending. Spend 600, drop a tier,
   come back, collect the difference, repeat. It passed every single-step check.
3. Stated on **credits already granted this period** — the one quantity spending cannot
   move. Plus a clamp to the new tier in **both** directions: Stripe prorates a
   downgrade, so leaving the higher tier's credits in place pays the customer twice.

Attempt 2 was caught only by adversarial review, and only because the review was asked to
walk the attack as a *sequence*. `scripts/tests/plan-switch.test.ts` therefore runs
sequences, not cases, and is a build gate.

**Six defects were introduced by these fixes and caught by review before shipping** —
the same pattern as every previous round. Two were blockers, both in the money fix above.
The others: a new error code that was never added to `KNOWN_ERROR_CODES`, so its message
was unreachable and customers saw a generic failure; a scheme guard that refused `data:`
URLs on the claim that "gemini.ts refuses a non-https reference image", which is the
opposite of what `fetchReferenceImage()` does; a schema `refine` that counted array
**length** while every leaf `.catch('')`-defaulted, so `{"objectives":[{},{}]}` passed as
a finished deliverable; and a login page that rendered "your account is suspended" from
an unauthenticated `?error=` parameter, i.e. a free social-engineering primitive.

**Still open (known, not fixed here):**
- Plan switching is **not reachable today** — the live Stripe account has zero billing-portal
  configurations and `subscription_update` is off by default. If it is ever enabled, re-read
  the plan-switch rule first.
- `ADMIN_PASSWORD` is weak and unrotated (founder's decision, 2026-08-23).
- The `not-reply@pyramedia.info` mailbox password is weak, and port 587 is internet-facing.
- Coolify's GitHub webhook does not fire: every deployment is `is_webhook: false`, so a
  `git push` does **not** deploy. Trigger the deploy explicitly.
- The app has **no healthcheck** (`health_check_enabled: false`), which is why Coolify
  reports `running:unknown` rather than `running:healthy`. Note `/` returns 307, so a
  healthcheck on `/` would fail — point it at `/ar`.

### Nine-studio hardening — 2026-08-24

A full audit of all nine studios (194 agents across 15 review units, every finding
attacked by independent skeptics) produced **79 distinct defects and no blockers**.
67% of what the finders filed was downgraded on verification, and six claims were
refuted outright — treat any unverified finding in this repo as a hypothesis.

The audit report, with every finding and its verdict:
https://claude.ai/code/artifact/d89501a0-e49d-4c4f-8084-d35e98cbc180

**The through-line: the studios were sound, and what they had was drift.** Nine
copies of the same fifty-line preamble, diverging one route at a time. Almost
everything below is a divergence between copies, and each fix is paired with a gate
so the divergence cannot come back.

#### Money

| Defect | State |
|--------|-------|
| The `generation-finalized` invariant matched only `status: 'completed'`, so **25 raw `status: 'failed'` writes** across all nine routes passed the build | ✅ fixed — the rule now matches any terminal status, proved by reintroducing one |
| A route that marked a row `failed` when its refund had NOT landed removed it from `reconcile_orphaned_generations()`'s scan window — the last automated payout — stranding the credits | ✅ fixed — `failGeneration()` refuses to write unless the credits are provably settled |
| `analysis:213`, `plan:197`, `storyboard:148`, `campaign:258`, `photoshoot:275` wrote `failed` **before** `refundCredits()` was even called | ✅ fixed — the refund runs first and the write is conditional on it |
| On a reservation failure the row was closed regardless of cause; if `reserve_credits` committed and only the reply was lost, the customer was charged with **no refund attempted and no `[credits][OWED]` line** | ✅ fixed — only `insufficient_credits`, a verdict from the RPC body (`017:31`), proves nothing was charged |
| Voiceover priced and duration-capped on the submitted script while synthesising an LLM **rewrite** of it that nothing measured. On pro/business/agency `toneEnabled` is true, so this fired on essentially **every paid request** | ✅ fixed — `maxCharsForBudget()` bounds the rewrite; one settlement reprices on `synthesizedChars` **and** the rate actually served, composing both inputs instead of refunding their overlap twice |
| creator and photoshoot wrote `credits_used` from the INTENDED figure without consulting `refundResult.success`, so a failed partial refund told the ledger, every admin revenue number and the customer that credits came back | ✅ fixed — `settleCharge()`; a charge only ever drops from a refund that landed |
| Campaign generated one paid image per post the model returned, uncapped, against a nine-image price | ✅ fixed — truncated to `EXPECTED_POSTS` at parse |
| Storyboard's schema accepted 1 of the 9 scenes sold for 14 credits | ✅ fixed — `.min(EXPECTED_SCENES)` into the existing full-refund branch |
| Plan's completeness gate passed on `kpis` alone — a section no screen renders | ✅ fixed — the gate lists only rendered sections |
| photoshoot hardcoded `'1080p'`, so **every paid plan received a 1K product photo** while the plans sell 2K/4K | ✅ fixed — the plan is read once, above the reservation, and decides resolution **and** watermark |

**Why `failGeneration()` refuses rather than retries harder.** Leaving a row in
`processing` costs at most one reconciler tick and **cannot double-pay**: 028 derives
what it owes from the ledger (`SUM(usage) - SUM(refund)`), so a refund that did land
leaves nothing owed and the row is skipped untouched. Writing `failed` over a refund
that did not land is unrecoverable by any automated path. `creator/route.ts` already
followed this rule at exactly one of its four sites; that site is now the helper.

#### Security

| Defect | State |
|--------|-------|
| creator's DEFAULT prompt path sent `style` and every brand-kit column to the image model with no filter and no cap — the admin-override branch had been fixed, the branch every customer hits had not | ✅ fixed |
| storyboard (14 credits) never called `sanitizePrompt` in the route; `style`/`platform`/`brandKitName` went raw and `concept` was filtered AFTER the reservation | ✅ fixed — enums for the closed sets, sanitize before the money moves |
| voiceover `tone` was `z.string()`, interpolated raw into the LLM rewrite prompt **whose output is read aloud on a paid generation** | ✅ fixed — `z.enum` + a `TONE_INSTRUCTIONS` table; the value now selects a row |
| campaign sent MODEL-authored `post.scenario` straight to the image model — the only image path that never met the filter, and therefore the way around it | ✅ fixed — a blocked scenario drops that one image and is refunded, never the campaign |
| The SSRF allowlist matched by **bare suffix**. Measured against the old rule: `xplacehold.co`, `notreplicate.delivery` and `xoaidalleapiprodscus.blob.core.windows.net` were all ACCEPTED — the last because an Azure Blob account name is the first label and is chosen by whoever opens the account | ✅ fixed — exact host or proper subdomain, one copy, `[image-host] 18` |
| The inline `data:` reference image had no ceiling while the https path was capped at 20 MB — and edit and photoshoot held byte-identical copies of the rule, so fixing one would have left the other open | ✅ fixed — `lib/storage/reference-image.ts`, `[reference-image] 12` |
| `brand_kits` never received a column-level GRANT lockdown, so `name`/`brand_voice` were writable to any string over PostgREST | ✅ fixed — **migration 044** |

**The filter went in the BUILDER, not the route schema, and that was measured rather
than assumed.** A zod v4 transform was tested against this repo's actual 4.3.6: a
throw inside one is NOT wrapped into a `ZodError`, so the `400 + term` response would
have survived. It was rejected anyway because a route `InputSchema` only sees the
request body, and three of these channels never pass through one — the brand-kit
columns come from a `SELECT` and campaign's image prompt comes from the text model's
own output. The prompt builder is where all three converge.

**`brand_kits` before migration 044**, measured: `anon` and `authenticated` both held
`DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE`. Rehearsed in a rolled-back
transaction (5/5 probes), applied, then re-probed **independently as `authenticated`**:
unbounded `name` → `23514`, unbounded `brand_voice` → `23514`, `TRUNCATE` → `42501`,
legitimate insert and rename → OK.

#### Output quality

| Defect | State |
|--------|-------|
| No text studio asked for JSON: five paid deliverables were regex-scraped from prose at temperature 0.7 | ✅ fixed — an OpenAPI-subset `responseSchema` per studio at temperature 0.2, with the regex scrape LEFT IN as the degradation path |
| `temperature: options.temperature \|\| 0.7` coerced a deliberate `0` back to `0.7` in both clients, silently discarding any low-temperature request | ✅ fixed — `??` |
| plan and analysis told the model the business was at **'Growth' stage** whenever `stage` was absent — which is ALWAYS, because nothing collects it | ✅ fixed |
| The analysis prompt asked for `kpis[].target_30d`/`target_90d` while the schema, the page and the PDF all read `target`/`timeframe` — so every KPI card rendered a blank headline number | ✅ fixed — the three now agree |
| `quick_wins`, `risks`, `usp`, `gtm`, `pricing` and several leaf fields were generated, stored and rendered by nothing | ✅ removed from the requested shape |
| The 30/60/90-day choice reached the prose and nothing else | ✅ fixed — the prompt states the exact week count |
| The raw industry SLUG was interpolated into the CMO persona, producing "20+ years of experience in **the other industry**" | ✅ fixed — slug→name table; `other` degrades to cross-industry |
| Every plan, analysis and storyboard was generated in **Arabic regardless of locale** | ✅ fixed — the page sends `locale`; the Gulf/MENA market instruction stays in both languages |
| **`edit` had no prompt file at all**: the whole prompt was a slug turned into two English words, with nothing telling the model a reference image was attached or that the customer's photo had to survive | ✅ fixed — `lib/ai/prompts/edit.ts`, five modes with real direction |
| creator unconditionally ordered the model to "STRICTLY PRESERVE" an original that does not exist on the text-to-image path, then contradicted itself a line later | ✅ fixed — conditional on `hasReferenceImage` |
| campaign fetched only the brand kit's NAME while `buildCampaignPrompt` had declared `brandVoice`/`brandColors` since it was written | ✅ fixed — including through the admin-override composer, which silently drops any field not added there too |
| Campaign images were generated from one bare model sentence with none of the platform framing, brand colours or no-text rule every other image gets | ✅ fixed |
| The photoshoot BRAND block asked for colour "in the set dressing" and was appended to `white_studio`, which specifies "no props" | ✅ fixed — a preset defines the scene; the brand kit tints what sits in it |
| prompt-builder returned ANY JSON array as success, and its prompt used none of its context | ✅ fixed — schema stated on CONTENT, not length |

#### What the customer sees

| Defect | State |
|--------|-------|
| **Seven of nine routes returned raw English prose** where a registered code belongs, so `mapApiError` collapsed it to the generic fallback and the Arabic maintenance/disabled copy was unreachable | ✅ fixed + a new `studio-error-codes` invariant |
| `failed_to_create_generation` was returned by all nine routes and was not registered | ✅ fixed — registered with copy in both locales |
| creator's all-variations-failed path returned an English sentence, so the customer was never told their credits came back — the one thing that sentence existed to say | ✅ fixed |
| A campaign's nine captions were destroyed by a reload; with images unchecked, ZERO asset rows are written and 3 credits of strategy vanished | ✅ fixed — `RETRIEVABLE_STUDIOS` + `stripInlineImages()` + a 256 kB ceiling |
| **The competitor-analysis PDF had no competitors section** — the type was declared and rendered nowhere | ✅ fixed, and placed first |
| The plan studio had **no export at all** | ✅ fixed — `generatePlanPdf` |
| A restored past run was exported under whatever name was currently typed in the form | ✅ fixed — `onRestore` hands back `input` as well as `output` |
| storyboard truncated its own 14-credit deliverable to 80 characters with an unconditional ellipsis | ✅ fixed — CSS clamp, so the full text stays selectable and reaches the PDF |
| analysis rendered a blank panel when a section was missing — which its own completeness gate PERMITS, and SWOT is the default tab | ✅ fixed — all five tabs say so |
| creator's error panel REPLACED images the customer had already paid for, with no dismiss, and its only button re-spent credits | ✅ fixed |
| Downloads were named `.png` regardless of the bytes; photoshoot also numbered by FILTERED index | ✅ fixed — `formatFromUrl` + the true shot index |
| Campaign's Copy and Copy All ignored the clipboard rejection — in the studio whose deliverable is text meant to be copied | ✅ fixed |
| Every image failing showed nine empty tiles with no message and no notice of the refund | ✅ fixed |
| Plan's Generate was enabled with an empty `industry`, which the route requires — instant 400 naming no field | ✅ fixed — the gate matches the schema |
| **ElevenLabs accepts speed 0.7–1.2**; the studio offered five speeds and the availability check was BACKWARDS — free/starter (OpenAI, 0.25–4.0) got the restricted set, pro/business/agency got all five | ✅ fixed — clamped, and availability follows the provider |
| The dialect/tone rewrite failing was swallowed by a bare `catch {}` returning `enhanced:false` — indistinguishable from "nothing to enhance" | ✅ fixed — logged and disclosed |
| **Tailwind 3.4.19 silently drops `X-[var(--token)]/NN`**, so 16 elements across the landing, pricing and contact pages rendered with no background or border | ✅ fixed — `color-mix`, verified against the BUILT stylesheet before and after |

#### Platform

| Defect | State |
|--------|-------|
| `lib/rate-limit.ts` was the last check-then-act limiter and the **only throttle in front of all nine paid studios**. `checkKeyedRateLimit` additionally failed **OPEN** and keyed on the **leftmost** `x-forwarded-for` entry — the attacker-chosen one, and defect #3 from migration 039's own header | ✅ fixed — atomic `consumeAttempt()`, fails closed, nearest hop. Proved with 25 parallel calls against a cap of 5 → exactly 5 |
| No provider call had a deadline and `withRetry` retried EVERY error class, so one image request became up to 9 upstream calls and a nine-post campaign up to 81 — hardest on errors that could never succeed (rotated key, wrong model id, our own refusals) | ✅ fixed — `lib/ai/http.ts` deadlines + `isRetryable()` |
| The same 20 MB reference image was fetched once per shot and again per retry | ✅ fixed — in-flight dedupe; 6 concurrent calls → 1 fetch, nothing retained |
| `getStudioConfig`/`getEffectivePrompt` were uncached and built a fresh service-role client per call, in a serial chain in front of every model call | ✅ fixed — `memoizeWithTtl`, with an inflight guard so N cold-cache requests make ONE query |
| `GET /api/generations/[id]` fetched the 904 kB–2.8 MB blob it then refused to serve | ✅ fixed — decides on metadata alone |
| 8 of 9 routes hardcoded `model: 'gemini'` and never corrected it, so admin per-model reliability was wrong and API cost understated ~5× on mis-attributed runs | ✅ fixed |
| The admin per-studio credit-price knob was dead in 7 of 9 routes, while `StudioCostTable.tsx` is a PUBLIC page that statically imports `CREDIT_COSTS` and calls them "the real per-action costs" | ✅ removed — prices are code. Verified `studio_config` was `'{}'` live before removing it |
| `versions.ts` versioned nothing: zero importers, no generation had ever recorded one | ✅ fixed — seven routes write `promptVersion` into `generations.input` (JSONB, no migration) |
| `VoiceoverCostConfig.watermark` had ZERO readers, so free-tier audio has always shipped unmarked while the config claimed otherwise | ✅ removed, with the truth recorded where the field was |

#### Four new build gates

`check-invariants` is now **15 rules**. The four added here exist because each defect
class above was found by an audit, and without a gate the next instance is found by
the next audit — or not at all:

- **`generation-finalized`** widened from `'completed'` to any terminal status.
- **`studio-error-codes`** — every error a route returns is registered AND has a message in both locales (a registered code with no message is just as unreachable).
- **`prompt-input-bounded`** — every `z.string()` in a studio `InputSchema` carries a bound.
- **`prompt-builder-sanitized`** — a builder interpolates only `safe*` identifiers. **This one found 19 violations across five builders the audit never flagged.** It ignores comments, because these files document their own history by quoting the old code.

All four were proved by deliberately reintroducing a violation and watching the build fail.

**Test gates: 14 files, 800 checks.** New here: `generation-terminal` (11),
`voiceover-budget` (508), `image-host` (18), `reference-image` (12),
`retrievable-output` (21), `settle` (12), `provider-retry` (20),
`response-schemas` (28), `prompts` (36). Plus `rate-limit` (4) which needs the live
database and is therefore NOT a prebuild gate, like `logo-parity`.

#### Six audit claims that did NOT survive verification

Recorded because this repo's rule is that a ✅ must name a `file:line`, and a
corrected claim is worth as much as a fixed defect:

- **storyboard's `PromptBlockedError` handler is reachable.** `buildStoryboardPrompt` does call `sanitizePrompt`. This is not the `plan.ts` case. The real defects there were different (filter after the reservation; unfiltered `style`/`platform`).
- **creator's brand kit DOES reach the model.** `creator/route.ts` does `.select('*')` and passes the whole row. Only the campaign half of that finding was real.
- **The maintenance-prose defect was in 7 routes, but not the ones named** — `campaign` and `creator` were already correct; `voiceover` was missed.
- **`failed_to_create_generation` was returned by all nine routes**, not two.
- **The fallback badge was not unrenderable** — it renders today in creator and voiceover, fed from the API response rather than `generations.model`. Two different problems.
- **prompt-builder's four output types do not link to non-existent studios.** They are output TYPES (image/video/copy/campaign), not studio links. No UI change was made.

#### Still open, deliberately

- **`withStudio()` — the shared route preamble.** Measured at **35.5% of executable
  studio-route lines** (the audit's 26% was low). It is the fix that would make the
  drift class structurally impossible rather than repeatedly caught, and it is real
  debt. It was NOT done: it touches all nine routes, every one of which was heavily
  edited in this round, and the plan for it calls for a design review of the wrapper
  signature before implementation. `docs/superpowers/plans/2026-08-24-studio-business-integrity.md`
  Task 8 has the measurements and the divergence list.
- **Raw Tailwind palette classes** (`bg-green-50` etc.) across ~25 files. These
  already carry `dark:` variants, so this is style-consistency debt against the
  CSS-variable rule, not a legibility defect. A token set should be designed before
  a sweep, not during one.
- **`FallbackNotice` is still duplicated** in `CreatorPreview` and `voiceover/page.tsx`.
- **The `costs` save path in the admin studio UI is inert but still plumbed** — the
  inputs are read-only now, and the values it stores are read by nothing.
- **Nothing in this round was verified against a live model.** Every fix is
  gate-verified (tsc, lint, 15 invariants, 800 test checks, clean production build)
  and the database work was probed against the live database — but no studio was run
  end to end against a real provider. Do that before deploying.

### One document per route — fixed 2026-08-24

**Every English page and the entire admin panel were rendering right-to-left in
production**, and had been since the app was built. Measured, not inferred:
**61 of the 64 prerendered documents carried two `<html>` start tags** — 23 ar,
23 en, 15 admin.

```
/en          <html lang="ar" dir="rtl">                  <- app/layout.tsx
             <html lang="en" dir="ltr" class="__variable_...">   <- the branch
/admin/login <html lang="ar" dir="rtl">
             <html lang="en" dir="ltr" class="dark">
```

`app/layout.tsx`, `app/[locale]/layout.tsx` and `app/admin/layout.tsx` each
rendered an `<html>`, and **the App Router root layout wraps every nested
segment layout, always** — there is no "only when nothing else matched" case.
The second `<html>` is serialised inside the first one's `<body>`, which puts
the parser in the "in body" insertion mode, whose rule for a stray `<html>` is
to **merge only the attributes NOT already present**. So the root's `lang`/`dir`
won and the branch's were discarded, while `class` — which the root did not set
— was merged in.

The comment that stood in `app/layout.tsx` asserted the opposite: that the other
two layouts were "each self-contained … so this root layout never double-wraps
them", and that the file was "effectively only ever reached for the rare
genuinely-unmatched top-level path". Both halves were false when written. **It
was a hardcoded list of filenames pretending to be a rule.**

| Defect | State |
|--------|-------|
| Every `/en/*` page served `lang="ar" dir="rtl"` — mirrored layout, bidi-mangled mixed text, and `lang="ar"` on English content for Google and screen readers | ✅ fixed |
| Every `/admin/*` page did the same, against a layout explicitly asking for `lang="en" dir="ltr"` | ✅ fixed |
| `<body>` is a singleton under the same merge rule, so admin's `bg-slate-950 text-slate-100` had **never once applied** — the root's `min-h-screen antialiased` won | ✅ fixed |
| Admin's mobile sidebar is `fixed inset-y-0 start-0` closed with a **physical** `-translate-x-full` (`AdminLayout.tsx:48-50`); under the inherited RTL, `start-0` resolved to the right edge while the transform still moved left, so the closed drawer translated **into** the viewport | ✅ fixed by restoring LTR |
| The `--font-*` variables reached `/ar` and `/en` only because `class` was the one attribute that merged, and reached admin and the top-level 404 **not at all** — `getComputedStyle(document.documentElement).fontFamily` on `/admin/login` returned `"Times New Roman"` | ✅ fixed — `app/fonts.ts` |
| `/favicon.ico` and `/icon-192.png` both 404'd, and `public/manifest.json` pointed at that same missing `icon-192.png` | ✅ fixed |

**Why the fonts broke rather than degrading.** `app/globals.css:86-99` states
`[lang='ar'] { font-family: var(--font-tajawal), sans-serif }`. The trailing
`sans-serif` does not rescue it: a `var()` whose custom property is undefined
and which carries no fallback *inside the parentheses* makes the whole
declaration invalid at computed-value time — the rest of the stack goes down
with it. `font-family` is inherited and `<html>` has no parent, so it lands on
the initial value: the UA default serif.

**The shape.** `app/layout.tsx` is now a pass-through returning `{children}`;
the document belongs to whichever segment knows its locale. This is what
next-intl's own example ships at the tag pinning `next: ^15.5.0`, byte-identical
at the installed v4.8.3. The file must still **exist** — every route needs a root
layout or `next build` exits 1, and `next dev` silently *writes one back into
`app/` for you*. Having the root keep `<html>` and read the locale itself was
rejected: `setRequestLocale()` runs *below* the root, so next-intl would fall
through to `headers()` and force all 129 prerendered pages dynamic — the exact
cost `app/[locale]/layout.tsx:16-25` records paying to avoid — and it cannot
distinguish the admin branch at all.

**Why nothing caught it for this long.** `tsc`, `eslint`, all 15 invariants and
a clean production build were green the entire time. Next's own
`Missing <html> and <body> tags in the root layout` check is a **dev-only** scan
of the response stream (`validateRootLayout: dev`), satisfied by *any* layout in
the chain — it fires when a document has **zero** `<html>`, never when it has
two. React 19 treats `<html>`/`<body>` as host singletons so hydration does not
throw; it is not silent though — `acquireSingletonInstance()` logs
"You are mounting a new %s component when a previous one has not first
unmounted" (`react-dom-client.development.js:22639`) in development, and that
console error was there the whole time.

**The gate: `npm run test:root-document`** (62 checks, in `prebuild`). It walks
the **actual layout chain** of every routable leaf and asserts exactly one
document owner — deliberately *not* an allowlist of filenames, because an
allowlist of filenames is precisely what the false comment was. Two details cost
a review round each:

- Attribute checks run against the extracted `<html …>` **start tag**, not the
  file. A file-wide `/\bdir=/` is satisfied by `<DirectionProvider dir={dir}>`,
  so deleting the `<html>`'s own `dir` — *the production defect itself* — would
  have passed on the branch serving 46 of the 61 affected documents.
- Comments are stripped with `check-invariants.ts`'s `stripComments()` state
  machine, moved to `scripts/lib/strip-comments.ts` for the purpose. A regex that
  blanks from the first `//` to end of line also blanks inside string literals,
  so an `<html>` sharing a line with a URL becomes invisible and the gate
  certifies a tree in which the bug has returned.

All three were proved by reintroducing the violation: restoring the root
`<html>` fails 48 of 66; deleting `dir={dir}` from the `<html>` while
`DirectionProvider` keeps it fails 1 of 62; an `<html>` sharing a line with
`'https://x'` is still seen.

**Verified:** 62 of 62 prerendered artifacts now carry exactly one `<html>`,
none carry zero. Live on a production build: `/ar` → `ar/rtl`, `/en` and
`/en/pricing` → `en/ltr`, `/admin/login` → `en/ltr` + `dark` + font variables,
`/foo/bar.txt` → 404 with a complete document. `getComputedStyle` on
`/admin/login` now returns `Inter`, and `body` carries `bg-slate-950`.

**This round also changed the landing page** (`InteractiveDemo`, new
`ComparisonSection`) — see the commit for the reasoning, which is recorded in
the component headers.

### Product analytics — built 2026-08-25

Before this, `gtag` appeared in exactly three lines of the repo — `js`, `config`,
and nothing else. GA4 reported **visits**: pageviews, sources, devices, locales.
Zero product events, zero conversions, and revenue was **architecturally
unreachable** — payment settles in a Stripe webhook the browser tag never sees.

`public.user_events` (migration 018) had been built and then written by nothing:
**0 rows on the live database**, no insert anywhere in `app/` or `lib/`, its only
reference a type in `types.ts`. It is now the primary sink, with GA4 second.

**One catalogue, two sinks.** `lib/analytics/events.ts` defines every event; every
recording goes to `user_events` (joinable to credits, generations and invoices;
survives ad blockers; queryable by SQL) and to GA4 (acquisition, attribution,
campaign ROI). Free-text names would let the two drift apart one call site at a
time, and a typo would land in exactly one of them — a report that is quietly
short, never an error.

| Event | Written where | Why there |
|-------|---------------|-----------|
| `generation_started`, `insufficient_credits` | `lib/credits/deduct.ts` → `reserveCredits()` | The one choke point all 8 paid studios pass through. Nine copies is the drift this repo keeps paying for |
| `generation_completed` | `finalizeGeneration()`, on the write that **proved** it landed | Earlier would count generations the reconciler later refunded — analytics claiming revenue the ledger gave back |
| `generation_failed` | `failGeneration()`, same rule | |
| `purchase` | Stripe webhook, after the credits are granted | Reporting before the grant books revenue for a run that then throws, and GA4 has no retraction |
| `sign_up`, `invite_redeemed` | `POST /api/events` (password) and the OAuth callback (Google) | Signup is `supabase.auth.signUp()` in the browser; there is no server side to it |

**`insufficient_credits` is recorded only on the RPC's own verdict** (`017:31`),
never on any other reservation failure. Recording infrastructure errors under the
same name turns an outage into fake purchase intent.

**A top-up replay is not revenue.** The grant RPC's `already_granted` verdict
(migration 031) suppresses the event, and `transaction_id` is the checkout session
id so GA4 deduplicates anything that still gets through twice — the route's guard
deliberately re-runs an event whose row exists but is unfinished, so this is a real
path, not a hypothetical.

**Revenue could not have worked without carrying the GA identity across Stripe.**
The webhook request is Stripe's: no `_ga` cookie exists on it, so `readGaIds()`
returns nulls and `sendGa4Event()` refuses. Minting an id instead is *worse* than
dropping the event — GA4 files the sale under a new user with source `(direct)`,
so the campaign that earned it keeps its click and loses its conversion, and every
channel ROI is wrong in the same direction. `lib/analytics/stripe-attribution.ts`
owns both ends (checkout writes the ids into session metadata, the webhook reads
them back) so the key names cannot drift — a typo on one side is not an error, it
is silently unattributed revenue.

**What the browser may report is a closed set, and it is asserted as one.**
`POST /api/events` takes the subject from the verified session and ignores any user
id in the body; accepts only `CLIENT_REPORTABLE`; bounds params (12 keys, 40-char
keys, 200-char values) because they land in JSONB; and throttles per user through
migration 039's atomic RPC, failing CLOSED. Adding `purchase` to that list — an
easy, well-meant edit, it is right there in the same enum — would let any
signed-in customer POST themselves revenue into both sinks, indistinguishable from
a real sale. `npm run test:analytics` therefore asserts exact membership, not a
minimum, and was proved by adding `purchase` and watching it fail.

**`user_events` is written with the service-role client, which CLAUDE.md otherwise
restricts to webhooks and admin operations.** That is forced, not chosen: migration
022 enabled RLS on the table, revoked ALL from `anon` and `authenticated`, and added
no policy, so the studio routes — which execute as `authenticated` — physically
cannot write it. The lockdown is worth keeping; granting INSERT to `authenticated`
would let any customer forge the rows every admin number is computed from.

**One defect was introduced by this work and caught before shipping — by measuring
the build output rather than trusting the gates.** `<AnalyticsIdentity/>` (user id,
plan and locale as GA4 user properties) was first mounted in
`app/[locale]/layout.tsx`, alongside `<GoogleAnalytics/>`. Against the production
build that shipped:

```
.next/server/app/ar.html    2 <html> start tags, and NO GA tag at all
.next/server/app/en.html    2 <html> start tags
```

The Arabic landing page — the URL a launch announcement points at — would have
shipped with **no analytics whatsoever**, and both landing pages had regressed the
two-document defect `app/layout.tsx` exists to document. `tsc`, `eslint`, all 15
invariants, all 13 prebuild test files (including `test:root-document`, 62 of 62)
and `next build` itself were green. Reverting that one edit and rebuilding restored
both pages, so the cause was not in doubt. It now mounts in
`app/[locale]/(dashboard)/layout.tsx`, which is where it belongs on the merits: a
logged-out marketing page has no user id and no plan to report, and an auth-reading
component has no business on every public page.

`npm run test:built-document` is the gate that would have caught it — see the
commands section for why a source-level rule structurally cannot.

**Verified live on a production build** (`next start`, 62 prerendered documents):
`/ar`, `/en` and `/ar/pricing` each carry exactly one `<html>` and the GA tag;
`/admin/login` carries no tag, as intended; `POST /api/events` returns 401 for an
unauthenticated `sign_up`, for a forged `purchase`, and for a malformed body —
auth is checked before parsing, so the response cannot be used to probe the
catalogue.

**`user_events` is CONFIRMED arriving — measured 2026-08-27**, against the live
database rather than inferred: 83 `generation_started`, 80 `generation_completed`,
3 `generation_failed`, the newest stamped at the minute a real production
generation was run. The internal sink works end to end.

**GA4 is enabled but has still never been OBSERVED, and the reason is structural
rather than a missing setting.** `GA4_API_SECRET` IS set on the app service
(verified in the Coolify config 2026-08-27; an earlier version of this file said
otherwise and was stale). `NEXT_PUBLIC_GA_MEASUREMENT_ID` is deliberately unset —
`lib/analytics/config.ts:8` falls back to the hardcoded property.

What cannot be proved by any API-driven test, including `npm run verify:live`:
`sendGa4Event()` returns early when there is no `clientId` (`lib/analytics/ga4.ts`),
and the client id is read from the browser's `_ga` cookie. A session minted with
`admin.generateLink` has no such cookie, so **every server event from the harness
is dropped on purpose** — correctly, since minting an id would file the sale under
a new user with source `(direct)` and corrupt channel ROI. Confirming GA4
therefore requires a **real browser session**, and is one more thing riding on the
three browser signups already listed as outstanding.

**Still open:**
- **Custom dimensions are not registered.** `studio`, `plan`, `app_locale` and the rest are collected from the first event but do NOT appear in any GA4 report until registered under Admin → Custom definitions. Unregistered they are still stored and still queryable from BigQuery and the Data API — which reads exactly like a broken tag.
- **Enhanced Measurement → “Page changes based on browser history events” must be OFF** in the data stream. The dependency was INVERTED 2026-08-27: the live property showed landing pageviews only (the exact failure the old note predicted), so `<PageViewTracker/>` now reports every SPA navigation from the code. With the toggle mistakenly ON, SPA pageviews count twice — visible inflation, chosen deliberately over the old failure mode of invisible absence.
- **Nothing reads `user_events` yet.** The rows accumulate — 166 of them as of 2026-08-27 — and no admin screen surfaces them. This is now the gap worth closing: the data exists, the questions it answers do not.
- `failGeneration()`'s refuse-to-write branch records no event — it has no returned row to take a user id from, and it is already loud in the logs.

### Project-as-context — built 2026-08-25 (the branch that made two customers differ)

Before this round, `grep -rn "project" lib/ai/prompts/*.ts` returned **0**. A Dubai shawarma
shop and a Riyadh SaaS startup produced a **byte-identical prompt** for the same studio. The
product asked for the customer's business three separate times and carried the answer nowhere.

Now the business facts are collected **once** — optionally read off the customer's own website
— stored on `brand_kits` (migration `045`), and carried into **seven** prompt builders.

| What | State | Proof |
|------|-------|-------|
| One industry list, shared by DB CHECK, Zod, prompts and the n8n workflow | ✅ built | `lib/industries.ts` — before this, `plan.ts:49` spliced an Arabic label into an English persona ("20+ years in **the other industry**") |
| Business context on `brand_kits`: `website_url`, `industry`, `description`, `target_audience`, `city` | ✅ applied live | migration `045`, probes A–H as `authenticated`, `schema_migrations` 2026-08-25 01:51:54Z |
| One shared Zod schema for POST **and** PATCH | ✅ built | `lib/brand-kits/schema.ts` — the two diverged once (`.optional()` vs `.nullable()`) and the result was a dialog that silently never saved |
| `buildBrandContextBlock()` reaching creator, campaign, storyboard, photoshoot, plan, analysis | ✅ built | `lib/ai/prompts/brand-context.ts`, 32 checks. `edit` is wired but **dead** — see below |
| Onboarding starts from the customer's website | ✅ built | `components/onboarding/WebsiteStep.tsx` — skip, success and failure all land on the same editable form **by construction**, not by three parallel paths |
| `POST /api/brand-kits/extract` | ✅ built | auth → config check → throttle (5/60, fails CLOSED) → 90 s deadline → 256 kB bounded read. Our container **never fetches a customer URL** — it calls one fixed n8n webhook from env |
| n8n + Apify extraction workflow | ⚠️ deployed, **inactive** | id `qH3LzMlpap3VRjPm`. Needs its own header credential — the current one is **shared** with another workflow |
| Arabic text on generated images | ✅ **works — proved on production, both halves** | Verified 2026-08-25 and again 2026-08-27 with real generations (`mock: false`). Fidelity was never the problem: the requested string renders correctly joined, right-to-left, no invented harakat, no transliteration. Containment WAS the problem and was a PROMPT defect, not a model one — the same model that invented garbled text under a loose prompt produced a completely clean frame under an explicit one-occurrence rule. See "The Arabic containment fix" below |
| `food` environment in photoshoot, six real recipes | ✅ built | `lib/ai/prompts/photoshoot.ts` |
| `profiles.onboarding_step` written for the first time | ✅ fixed | read by `ProfileCompletion.tsx:23` since it was built, written by **nothing** until now |
| `sharp` declared | ✅ fixed | resolved only via `next@15.5.14`'s hoisted transitive; the free-plan watermark is fail-CLOSED, so a hoisting change fails **every** free-plan image |

**The extraction is a guess, and the UI says so.** The draft is always editable, never saved
silently, and every field the crawl could not determine carries its own "we couldn't find this"
badge. Colours and fonts are the least reliable and are always listed as missing when absent.

#### What the final review found — three reviewers, 21 commits, and the pattern held

**One of the two blockers was in a fix from this same round, and one was in a fix from the
commit immediately before it.** That is the whole lesson.

| Defect | State |
|--------|-------|
| **A customer who typed `mysite.ae` could never save a brand kit.** The `website_url` regex is case-sensitive and scheme-required, and the form sent the raw string — so `mysite.ae`, `www.mysite.ae` and `Https://mysite.ae` (**what iOS and Gboard produce**, since the input had no `autoCapitalize`) all 400'd as `validation_error`, a code the message map did not carry. The customer got "جرّب مرة ثانية" — a lie, since no retry could succeed — while the correctly-worded `invalidWebsiteUrl` string sat **unreachable** in the same commit | ✅ fixed — `lib/brand-kits/website-url.ts`, one normaliser both callers import |
| `plan` and `analysis` reserved credits **before** the brand-kit filter ran, so a blocked prompt cost a reserve/refund pair and a misattributed `failed` row — and if the refund failed, real credits for a prompt no model ever saw | ✅ fixed — and gated |
| A paid plan could be generated against **two contradictory business identities** — the form's edited values and the kit's originals, both in one prompt, with two `- Industry:` lines | ✅ fixed — the routes null out what the form already carries |
| The dev mock fix (`f721c62`) was **incomplete**: it filled arrays with 3 while storyboard requires `.min(9)` and campaign expects 9, so storyboard still returned `generation_parse_failed` and campaign refunded 6 of 9 posts every run. The test could not tell — it validated against the OpenAPI schema, which has no `minItems`, instead of the studio's own parser | ✅ fixed — `minItems` on the schemas, which also tells the **model**; the test now runs the real parsers |
| The extract route relayed upstream values with **no bound and no enum**. An `industry` the n8n workflow invented passed every layer and was stored — then `industryName()` returned `''` forever: no chip selected, **no missing-field badge**, and the industry line silently omitted from every studio prompt | ✅ fixed — bounded at the boundary, `isIndustry()` at the writer, badge on unrecognised-not-just-empty |
| Migration `045` computed `N FAILED of M` and **committed regardless** — `044:153-162` on the same table has the `DO $gate$` that refuses | ✅ fixed |
| `photoshoot` and `storyboard` read brand context only from a **project**, so P4.2's restaurant→`food` default was unreachable on the exact journey this branch was built for | ✅ fixed — default-kit fallback |
| The plan studio replaced free-text industry with seven chips and no escape hatch, so a Dubai car-rental owner picked أخرى and paid 5 credits for a plan carrying **no industry at all** | ✅ fixed |
| The onboarding error banner used `bg-[var(--color-error)]/10` — the class Tailwind 3.4.19 **silently drops** — on the arm every customer hits today | ✅ fixed + gated |
| Both new URL inputs lacked `dir="ltr"`, against seven existing precedents, on the first field of the first screen of an Arabic-first product | ✅ fixed |
| A successful 55-second crawl was destroyed by a reload | ✅ fixed — parked in `sessionStorage`, re-parsed on read rather than trusted |

**Two review instructions were deliberately NOT followed, and both refusals were right:**
- The brief said make the Zod regex case-insensitive. Migration `045:93` uses Postgres `~`,
  which is **case-sensitive** — `/i` on the JS side alone recreates the `042` defect in
  reverse (a 500 carrying raw Postgres text instead of a clean 400). The normaliser lowercases
  the scheme instead, so **both layers accept an identical set**. Verified: all five
  previously-rejected forms now accepted, `not a url at all` still rejected.
- The brief said add `type="url"`. Native constraint validation refuses `mysite.ae` and blocks
  submission — so the handler that normalises it would never run, **reinstating the blocker one
  layer up**. Documented at both input sites so it is not "fixed" later.

**Eight findings were filed and REFUTED**, recorded because a corrected claim is worth as much
as a fixed defect: the `sharp` lock entry (`npm ci --dry-run` installs it even under
`--omit=optional` — the root declaration overrides the optional flag); `credits_used` on a
failed row (`028:19-35` documents it as the INTENDED figure, the ledger is truth, and
`/api/generations` filters to `completed` so no customer sees it); campaign's untested block
sites (provably safe — the gap was the *rule*); `edit`'s dead wiring (real, and **older** than
this branch); and the plan's own claim that a dead end here is a total product lockout — the
gate is `/dashboard` and `/` only.

#### Two new gates, and the one that mattered most

`check-invariants` is now **17 rules**; the test suite is **18 files / 1250 checks** (from 887).

- **`sanitize-before-reserve`** — no `build*Prompt(` after `reserveCredits(` in any studio
  route. **This is the gate whose absence caused the blocker.** `c12e928` fixed two routes
  while the commit before it had broken three; every gate stayed green. Proved by reintroducing
  `plan`'s ordering.
- **`no-var-opacity-modifier`** — the Tailwind class that emits no CSS at all. Second offence.

Also new: `test:website-url` (48) proving the normaliser and both storage layers agree on one
corpus, and `test:mock-from-schema` (55), which now feeds each studio's mock through **that
studio's own Zod parser** rather than a re-implementation of conformance.

#### A process defect this round exposed, worth more than any single fix

`scripts/db/run-sql.js` guarded on `\bCOMMIT\b` — which also matches
`CREATE TEMP TABLE … ON COMMIT DROP`, present in **both** `044:77` and `045:103`. So the
rehearsal step this file mandates ("send the same file with its trailing `COMMIT` swapped for
`ROLLBACK`") was **silently unreachable for exactly the two migrations that most needed it**.
That is *why* `045` shipped without its commit gate.

**And `/scripts/db/` is entirely gitignored — zero tracked files.** This file documents
`node scripts/db/apply.js …` as the way to apply a migration, and no fresh clone has it, so the
fix above cannot ship. Decide the policy: either commit the scripts (they read the service-role
key from `.env.local` and embed nothing) or say plainly here that they are local-only and must
be recreated.

#### Post-deploy verification, 2026-08-25 — run against production, not against gates

The branch merged at `c640cba` and deployed at 13:29:24Z. Everything below was run against
`https://pyrasuite.pyramedia.cloud` with a real session for the e2e account
`b215522f-f572-4203-8544-115e38af0466`, minted **without a password**: `admin.generateLink`
mints a token and sends nothing, `/auth/v1/verify` redeems it for a session, and the
`@supabase/ssr` cookie is built from that. No password was created, typed or transmitted.

**The new build was confirmed live before anything was claimed about it.** The old code has no
`website_url`/`city`/`description` in its schema, so a PUT carrying them silently dropped
them; after the deploy the same PUT persisted `city = دبي`. That is the probe, not the
Coolify status field, which reads `running:unknown` because this app still has no healthcheck.

**C1 — proved fixed, with a before and an after.** The form's own normaliser output was sent
to the live API:

```
mysite.ae          -> https://mysite.ae        200
Https://mysite.ae  -> https://mysite.ae        200      <- the iOS/Gboard case
www.mysite.ae      -> https://www.mysite.ae    200
not a url          -> https://not a url        400 validation_error, details name the field
```

Every one of the first three was unsavable before this branch, with a toast telling the
customer to retry something that could never succeed. Note the server still refuses a raw
un-normalised URL by design — the normalisation is the form's job (`BrandKitForm.tsx:106`),
and the API keeps the strict contract that matches migration `045:93`'s CHECK byte for byte.

**Arabic on images — the definition of done was "an Arabic string rendered correctly into a
real image by the live model, seen." It has now been seen, and the answer is half yes.**

`creator` produced a real shawarma photograph (`mock: false`, gemini, 1 credit), and `edit`
with `editType: 'text_add'` and `editDescription: 'شاورما الشام'` returned a real edit
(`mock: false`, 1 credit, balance 115 → 113).

- **The requested text rendered correctly.** The shop sign reads شاورما الشام with every
  letter joined in its correct contextual form, running right to left, no invented harakat,
  no transliteration. The four rules added to `edit.ts` do the job they were written for.
- **But the model also painted text nobody asked for.** The sandwich wrapper and the menu
  board in the same image carry invented, garbled pseudo-Arabic and fake Latin. The prompt
  says "set the text exactly as the customer wrote it… with no extra words", and that half
  is not holding.

This is the same root cause finding F15 named, arriving from the other direction: F15 was
about the model not knowing which words are *payload*; this is the model not knowing that the
text belongs in **one** place. The fix is the same shape — a delimited referent plus an
explicit "one occurrence, on the sign only" rule — and it is now grounded in a rendered image
rather than in reasoning.

**Also confirmed by the same image, unasked:** the free-plan watermark is burned in and its
glyphs render as real letters, not the empty boxes that shipped for a week in August when
`ttf-dejavu` was missing from the runtime layer. `assertTextRenderingAvailable()` is doing its
job on the current image.

**Still not verified:** the extraction success arm (the n8n secret is still unset, so
`/api/brand-kits/extract` returns 503 and the manual arm carries onboarding), and the three
onboarding signups end to end in a browser.

#### Still open, deliberately

- **The extraction SUCCESS arm has never run.** The n8n workflow is inactive and its header
  secret is shared with another workflow. Until `N8N_BRAND_DNA_WEBHOOK_URL` +
  `N8N_BRAND_DNA_SECRET` are set, `/api/brand-kits/extract` returns **503** and the UI tells the
  customer to fill the form in themselves — which works, and is the arm every real customer
  hits today.
- **`edit`'s brand-context wiring is dead** and is **older than this branch**:
  `EditPromptInput.brandKit` pre-dates `8bd96c6`, so the `Brand Colors` line was already dead.
  `edit/route.ts`'s `InputSchema` has no `brandKitId` and never fetches a kit. Zero runtime
  cost, named at `edit.ts:119-126`. Wire it or delete both — do not leave a third consumer.
- **`website_url` and the two font columns are collected and read by nothing.** Both are
  deliberate and commented, but fonts were an explicit deliverable of this round. This repo's
  catalogue is full of exactly this shape.
- **The n8n workflow source (`.superpowers/sdd/brand-dna-workflow.js`) is gitignored**, so the
  font-length clip added on the app side has no committed counterpart upstream.
- **`docs/INVARIANTS.md` was stale at 11 of 17 rules** and is now complete. It goes stale
  silently; there is no gate on it.


### The edit studio — project context, presets, and the Arabic containment fix (2026-08-27)

The owner's framing, and it was right: *"I'm a paying subscriber with a project.
This is a **product photography** studio. I should not be writing prompts — the
system already understands my project, so generating AND editing should both be
correct and dynamic from that."*

Two things were measured before any code, and one of them corrected a claim this
file had been making.

**1. Garbled Arabic was a PROMPT defect, not a model defect.** The 2026-08-25
entry blamed the model. Wrong. `gemini` and `gpt-image-2` were run on production
with the same brief: both render the requested Arabic correctly. `gemini`
invented extra garbled text; `gpt` did not. Then `gemini` was run again with an
explicit one-occurrence rule and every other surface came back **completely
blank**. The rule that worked is now `buildTextRule()` in `lib/ai/prompts/edit.ts`.

**2. "Any model can edit an image if the prompt is right" is false at the API
layer**, and this repo already documented it. `lib/ai/openai.ts` posts to
`/v1/images/generations`, which has **no image field at all**; `lib/ai/replicate.ts`
sends `{prompt,width,height}` to `flux-1.1-pro`. `router.ts:67` already guards
this with `IMAGE_INPUT_CAPABLE = ['gemini']` because routing an edit to those
adapters *"silently discards the customer's photo … while still charging for it."*
The **models** can edit (`gpt-image-2` via `/v1/images/edits`, flux via kontext);
**our adapters** cannot. No prompt fills a missing request field. Building that
adapter is real work and was **deliberately deprioritised** — it was not the
blocker.

| What | State | Proof |
|------|-------|-------|
| `edit` receives the customer's brand context | ✅ built | explicit kit → project kit → account default, the `photoshoot` pattern. `edit.ts`'s branch documented DEAD since F10 is finally fed |
| 14 presets instead of a free-text box | ✅ built | `EDIT_PRESETS`. `editDescription` is now optional — except `text_add`, where it is the text to render, not an instruction |
| Marketplace-grade white background | ✅ **proved on production** | `marketplace_white`: 6 of 6 background sample points exactly `rgb(255,255,255)` |
| Arabic text onto the customer's own product | ✅ **proved on production** | three runs, same image — see below |
| Named next actions after a generation | ✅ built | `EditNextActions` on creator AND photoshoot. Photoshoot had **no** edit link at all, and it is the product-photography studio |
| Free-plan watermark | ✅ changed | one corner mark instead of a grid across the merchandise |

#### The failure that no gate in this repo could have caught

`product_label` returned the customer's photograph **visually unchanged**, twice,
while the route answered **200**, charged a credit, and wrote an asset row.
Nothing threw. `tsc`, `eslint`, 17 invariants and 306 prompt checks were green
for the broken version and the working one alike.

It took three production runs to isolate, and the decisive one was the run that
**removed** a variable: the same mode with **no preset** rendered شاورما الشام
large, clean, correctly joined and right-to-left on the first try. So the mode,
the Arabic rules and the containment rule were all fine — the preset was not.

Two causes, found in that order:

1. **The containment rule named its own target.** The shared blank line listed
   *"packaging, labels"* as surfaces that must be COMPLETELY BLANK, and on a
   product close-up the label is exactly where `product_label` puts the text. The
   model was told to print on the label, leave labels blank, keep existing print
   exactly, and not redraw the label's artwork. Doing nothing breaks none of
   them. `text_add` now states containment as an **exclusion of its own target**
   — a fixed list of nouns cannot know what a preset aimed at, which is precisely
   how it came to name it.
2. **The preset demanded space that did not exist.** *"Place it in existing
   negative space"* (there was none, on a wrapper printed edge to edge) plus
   *"never larger than the product name already printed there"* (which drives the
   type toward invisible). A model facing a precondition it cannot satisfy
   declines — and at the HTTP layer declining is indistinguishable from success.
   Placement is now an **ordering** the model can always satisfy, the size rule
   is legibility, and the preset names a fallback surface.

**Proved:** after the second fix, the same request put شاورما الشام on the
wrapper itself, following the wrap's curvature in the same brown ink, with the
existing print preserved and nothing invented elsewhere.

#### Two notes on method, both of which cost a round

- **The pixel diff is a weak discriminator for text edits.** It was used to call
  the first run a no-op and was directionally right, but the run that visibly
  **worked** scores 3.19% changed against 2.67% for one that did nothing — text
  occupies too little of the frame. Looking at the image decided all three runs.
  Do not build a gate on that number.
- **A prompt test cannot prove a model will act.** The nine checks added here pin
  the *wording* measured to matter. That limit is stated where they live, because
  a test that looks like a behavioural guarantee and is not is worse than no test.

#### Still open, deliberately

- **A studio can bill for a no-op and nothing notices.** Three failed runs each
  returned 200 with a credit charged. A post-generation check comparing input to
  output would catch it — but the obvious metric is the weak one above, so this
  needs a real design, not a threshold.
- ~~`marketplace_white` does not reach its own 85% framing rule.~~ **RETRACTED
  2026-08-27 — the claim was mine and it was wrong.** The rule asks that the
  product's *longest side* span about 85% of the corresponding frame dimension.
  Measured on the real output: subject bbox 1162×516 in a 1376×768 frame, so
  1162/1376 = **84.4%**. The preset met it. What I had actually measured was the
  share of non-white **pixels** (26%) — an AREA figure — and compared it against a
  LINEAR rule. A `sharp` re-framing step was written on that premise and deleted
  unbuilt rather than shipped as dead code.
  Still open as a *product* question, not a defect: the output inherits the
  source's aspect ratio, so a landscape photo stays landscape, while both
  marketplaces want a square main image. Squaring is a deliberate choice with a
  visible cost — a wide product in a square frame reads smaller — and belongs to
  whoever owns the listing, not to a silent post-process.
- **The OpenAI image-edit adapter still does not exist**, so `edit` remains pinned
  to gemini. Now a quality option rather than a blocker.

### The paid plans, measured — 2026-08-28 (sprint P0-1)

Until this date **no paid path had ever been run**: every live measurement was
made on a free account, and ElevenLabs, 2K/4K, unwatermarked output, the
12-credit campaign and multi-shot photoshoot were all unexercised. The founder
authorized a ledgered 150-credit grant and the e2e account moved to Pro; the
harness became plan-aware (`buildStudioCases(plan)`, polarity-flipping
watermark checks, per-plan voiceover arithmetic, a resolution promise check)
and the whole paid surface was run against production.

**Proved, with the run artifacts as evidence** (`.superpowers/live-runs/2026-08-27T21-*`):

| Promise | Measured |
|---|---|
| Paid output carries NO watermark | asserted on the white-field marketplace outputs; confirmed by eye on every textured output |
| Pro sells 2K | 3072×5504 delivered — the promise is exceeded, not merely met |
| Pro voiceover is ElevenLabs | `provider: elevenlabs` from the response itself |
| Campaign at 12 credits | 9 posts + 9 images, refund identity holds (delivered + failed = 9, charge = price − refund), captions 100% Arabic, images ad-grade by eye |
| Multi-shot photoshoot | 3 delivered, pairwise-distinct (same-image-sold-twice is measured, not assumed), charge matches delivery |
| Marketplace presets on paid | Amazon square and noon portrait both fully green, unwatermarked |

**Found and fixed — the premium tier had its own version of the 1.8× defect.**
ElevenLabs reads Arabic at **10.3–10.9 chars/sec over `synthesizedChars`** (the
text actually spoken — the original script length is the WRONG numerator on
rewriting plans, which the first paid run proved by printing 7.6 from it). At
the OpenAI-derived 8, every Pro duration badge overstated 1.37×, and a script
whose estimate crossed a 20s unit boundary its real audio did not was charged a
whole 3-credit unit too many. `PROVIDER_CHARS_PER_SECOND { openai: 8,
elevenlabs: 10 }`, resolved through the plan; `estimateVoiceoverDuration` takes
the plan, and the route's delivered-duration reprices at `ratePlan` so a
fallback serve is read at the rate of the provider that actually spoke.
The badge's journey, all measured on production: **1.80 → 1.12 (openai) and
1.37 → 1.02 (elevenlabs)**. `voiceover-budget` grew a Pro worked example (546).

**Two harness defects of mine, found by their own run and recorded because the
shape recurs:** two case bodies used invented field names instead of the
routes' real `InputSchema`s (copy the schema, never recall it), and
`realModelCheck` was handed "all shots are real" — a boolean — where it takes
the MOCK FLAG, so a healthy run failed with `mock=true`. A checker's checks
need the same adversarial reading as the product's.

**Still unmeasured, stated rather than implied:** business/agency 4K (a
different model id — `geminiImagePro`), the ElevenLabs premium voices
(`el_premium_*`), the starter plan, and every dialect other than `formal`/
`emirati`. The harness now runs as whatever plan the account holds, so each of
these is one plan-switch away.

### Meta Pixel + Conversions API — built 2026-08-28

The Meta half of the analytics architecture, mirroring the GA4 one deliberately
— same division of labour, same attribution carry, same failure classes guarded
the same way. Pixel id `945169027980538` (public by nature; hardcoded fallback
in `lib/analytics/meta-config.ts`, one module imported by BOTH the browser tag
and the server sender so the two cannot drift onto different pixels).

**The browser owns what only the browser witnesses.** `MetaPixel.tsx` mounts
beside `GoogleAnalytics` in `app/[locale]/layout.tsx` — both locales, never the
admin panel, production-only — and reports the landing PageView; every SPA
navigation is reported by `PageViewTracker`, which now owns the SPA half for
BOTH tags (one navigation listener, two sinks). The pixel also plants
`_fbp`/`_fbc`, which is what gives the server events their match quality.
**It is a server component like GoogleAnalytics, and that was corrected by
measurement, not taste:** the first version was a client component (it carried
the SPA tracking itself), and the built `ar.html` contained no fbevents
reference at all — the whole bootstrap lived in the layout chunk. As a server
component the bootstrap ships in the prerendered document (flight payload) and
the noscript fallback is real HTML — verifiable in the bytes that ship. One
measured caveat for future greps: `next/script` `afterInteractive` NEVER emits
an executable `<script>` into SSR HTML — the GA tag included; the document
carries a preload link + the payload, and the client runtime injects both tags
after hydration. And `grep -c` on a prerendered document counts LINES — the
same one-line trap the built-document gate already records — which briefly
made this round report a GA regression that had not happened. One rule the
headers state and `test:analytics` enforces on the comment-stripped source of
both components: **the browser never reports Purchase, CompleteRegistration or
InitiateCheckout** — a client-reportable purchase is free Ads-Manager revenue
for anyone with a devtools console, and would double-count against the
webhook's copy.

**The server owns the money and the funnel, via `lib/analytics/meta-capi.ts`:**

| Event | Written where | Dedup key (`event_id`) |
|-------|---------------|------------------------|
| `Purchase` | Stripe webhook, inside the same guard as the GA4 purchase — a replay absorbed by `already_granted` reports to NEITHER sink | checkout session id, so Stripe's at-least-once delivery and the idempotency guard's deliberate re-run collapse to one sale |
| `CompleteRegistration` | the two sign-up witnesses: `POST /api/events` (password, gated on `created_at` < 5 min so an old account cannot replay `sign_up` into ad-optimization data) and the OAuth callback (Google) | `signup_<userId>` — the two witnesses collapse to one registration |
| `InitiateCheckout` | both checkout routes, fire-and-forget — the request IS the customer's browser, so cookies are readable there | `ic_<sessionId>` |

Meta dedups on (event_name, event_id) for 48h. Match keys per event: hashed
email (normalize-then-SHA256 — `test:analytics` holds a known-answer vector
computed independently), hashed `external_id` (Supabase user id), and
`_fbp`/`_fbc`. The webhook has no cookies (the request is Stripe's), so the
checkout routes capture both cookies into session metadata — `metaFbp`/
`metaFbc`, owned by the same `stripe-attribution.ts` module as the GA ids and
for the same reason: a key-name typo is not an error, it is silently
unattributed revenue. `_fbc` exists only when the visitor arrived through an ad
click, which is exactly the case where losing it un-credits the campaign.

**CSP: FIVE directives are load-bearing and fail SILENTLY** — script-src
`connect.facebook.net`; img-src, connect-src, **form-action and frame-src**
`www.facebook.com`. The last two are not in Meta's usual allowlist trio and
were found by MEASUREMENT on a production build in a real browser: with only
the first three, fbevents loaded, planted `_fbp`, and then delivered every
PageView as a **form POST into a facebook.com iframe** — refused by
`form-action 'self'` and the old frame-src, with no img/XHR fallback firing,
and the only symptom two console lines nothing in CI can see. Widening
form-action is normally the move to be most suspicious of (it is what stops an
injected `<form>` exfiltrating credentials); one fixed Meta-operated origin is
the acceptable shape of it. `test:analytics` asserts all five per-directive
against comment-stripped `next.config.ts` (the beside-the-CSP comment names
these very hosts, so an unstripped match would be satisfiable by the comment
alone). Proved by removing one and watching the gate fail. Graph API pinned
`v24.0`, confirmed live 2026-08-28 (v99.0 answers "Unknown path components";
v24.0 answers a normal auth error).

**Verified on a production build in a real browser (`next start`, 2026-08-28):**
fbevents.js loads, `fbq.loaded: true`, the `_fbp` cookie is planted beside
`_ga`/`_ga_*`, zero CSP violations under the final policy, and an SPA
navigation `/ar` → `/ar/pricing` fired **exactly one** `fbq('track','PageView')`
(measured by wrapping fbq — the landing view stays with the bootstrap, the
initial-pathname skip held). The built documents carry the bootstrap + noscript
once per customer-facing page and zero times on `/admin/*`; 62 of 62 documents
still one `<html>` each.

**Still open:**
- **`META_CAPI_ACCESS_TOKEN` is NOT set** — the founder must generate it
  (Events Manager → Data Sources → pixel → Settings → Conversions API) and set
  it on the app service. Until then every server-sent Meta event is skipped
  with one warning per process; the pixel still reports PageViews, so the
  symptom is Ads Manager showing traffic but zero conversions. Optional
  `META_CAPI_TEST_EVENT_CODE` routes CAPI events to Test Events for end-to-end
  verification before going live.
- **The pixel has never been OBSERVED in a real browser** — the same caveat GA4
  carries, for the same structural reason: an API-driven harness has no `_fbp`
  cookie. One more thing riding on the outstanding browser signups.
- **Domain verification + ATT event prioritization** are Business Manager
  steps, not code: verify `pyrasuite.pyramedia.cloud` and rank the events for
  iOS delivery. Without them iOS-ATT users are measured worse — and the Gulf is
  iOS-heavy, which is half the reason the CAPI path exists.

### Not built — do not describe these as done

| Item | Real state |
|------|-----------|
| Transactional email — app side | ✅ **LIVE on production since 2026-08-23.** Sends as `PyraSuite <not-reply@pyramedia.info>` with `EMAIL_REPLY_TO=support@pyramedia.info`, through `mail.pyramedia.info:587` (STARTTLS; **465 is closed and times out** rather than failing cleanly). The mail service is `docker-mailserver` in the Coolify project **Email** — NOT cPanel/Bluehost, which every doc before 2026-08-23 claimed. Mailbox passwords are SHA-512 hashes on a volume, so **none is readable from Coolify**; a password can only be set, via `setup email add/update` inside the `mailserver` container. Proved end to end, not inferred: `opendkim: DKIM-Signature field added (s=mail, d=pyramedia.info)` — the **bare** domain, which is what `adkim=s` requires — then `status=sent (250 … gsmtp)` from Gmail, for a message sent by the production container (`10.0.13.1`). The server is **not** an open relay (`554 5.7.1 Relay access denied` unauthenticated). See `docs/EMAIL_SETUP.md`. |
| Password reset | ✅ **works on production.** `POST /api/auth/recover` returns **200** (it returned 503 until the SMTP variables were set), and returns the *same* 200 for an unknown address so it cannot be used to enumerate customers. `app/api/auth/recover/route.ts` mints the token with `admin.generateLink()` and sends it on this app's own transport, so it does not depend on the Supabase service at all. Note `recovery_sent_at` is **not** evidence of a send — `generateLink()` stamps it and sends nothing. See "Password reset — rebuilt 2026-08-23" above. |
| Transactional email — auth side (GoTrue) | ❌ **unconfigured, and now optional.** Signup confirmation and magic link are still GoTrue's, configured with `SMTP_*` on the **Supabase** service. Neither is in use: `/auth/v1/settings` reports `mailer_autoconfirm: true` and the magic-link control was removed from the login page. |
| Support channel | ✅ built — `/[locale]/contact` (public), stored in `support_messages`, read at `/admin/support`. Stores rather than emails on purpose, so it works with no provider configured. |
| Tax invoice / VAT | ❌ none — and correctly so. Below the AED 375,000 threshold there is no TRN and it is *prohibited* to issue a document stating VAT. Becomes real work at registration. Credit refunds/clawback are handled (see money path round 2). |
| Teams | 🗑️ **removed 2026-08-23.** Was a UI shell with mock members that also sold Business at $59/mo for a 5-seat team — a claim `lib/stripe/plans.ts` had already pulled from checkout. Page, nav entry and i18n namespace all deleted. |
| Gamification (achievements, levels, streaks) | ❌ dead code. Zero importers, table never written. |
| Community / Portfolio | 🗑️ **removed 2026-08-23.** Community shipped six invented Arabic users with invented like counts and a Copy button that did not copy; Portfolio was an orphan route leaking the user's raw UUID. Both deleted. |
| Prompt templates + history | ⚠️ components written (242 lines), zero imports. Cheap to activate. |
| API access (sold on Agency tier) | ❌ absent — and correctly removed from the plan features. |
| Arabic text inside generated images | ❌ not handled; prompts actively forbid it. |
| Brand kit logo/fonts reaching the model | ❌ zero references to `logo` anywhere in `lib/ai/`. The logo is uploaded and now shown on the brand-kit card, and that is all it does — the copy says so. **Colours and voice now reach creator, campaign and edit; colours reach photoshoot and storyboard** (2026-08-24 — campaign fetched only the NAME until then, while its builder had declared `brandVoice`/`brandColors` since it was written). |
| Retrieving a text studio's output after the tab closes | ✅ **fixed 2026-08-23.** Was absent: `plan` (5cr), `analysis` (3cr) and `storyboard` (14cr) wrote their result only into `generations.output` and every read of that column lived under `/app/admin/`, so a reload destroyed paid work. Now `GET /api/generations` (metadata only) and `GET /api/generations/[id]` (one row's output), surfaced by `RecentWork`. The detail route refuses the image studios — their `output` holds 904 kB – 2.8 MB of base64, measured — and answers not-found and not-yours identically so it cannot be used to probe which ids exist. Nothing was lost in practice: those three studios had zero rows. **2026-08-24: `campaign` joined them** via a separate `RETRIEVABLE_STUDIOS` list — its nine captions live only in `output` too, and with images unchecked it writes ZERO asset rows. Its output is not reliably small (persist-image returns inline `data:` URLs on four degradation paths), so the detail route strips inline images by VALUE and enforces a 256 kB ceiling. |
| Cleaning up replaced brand-kit logos | ❌ a logo the user replaces or abandons stays in the public `uploads` bucket forever. Storage growth only — the object is under the owner's own folder and nothing links to it. |
| Error tracking (Sentry) | ❌ env vars declared, empty, never read by any line of code. |
| Product analytics | ✅ **built 2026-08-25** — GA4 traffic **plus** product, revenue and signup events, each written to BOTH `public.user_events` and GA4. See “Product analytics — built 2026-08-25” above for what is and is not measured. `GA4_API_SECRET` **is set** (verified 2026-08-27) and `user_events` is **confirmed arriving** (166 rows, measured). GA4 itself has still never been observed, and cannot be from an API-driven test — server events need the browser's `_ga` cookie for a client id. PostHog remains absent: its env vars are still declared, empty and unread. |

---

## Key Files

| File | Purpose |
|------|---------|
| `PRD.md` | Original product requirements (reference) |
| `PHASES.md` | Development roadmap with completion status |
| `RULES.md` | Coding conventions and rules |
| `FIXPLAN.md` | Code review bug tracking (55/55 resolved) |
| `ROADMAP.md` | Feature roadmap & UX enhancement plan |
| `docs/VOICEOVER_UPGRADE_PLAN.md` | VoiceOver studio upgrade plan |

---

## Tech Stack

- **Framework:** Next.js 15 (App Router), TypeScript (strict)
- **Styling:** Tailwind CSS v3, CSS Variables, Framer Motion, shadcn/ui
- **Auth & DB:** Supabase (Auth + PostgreSQL + Storage + RLS)
- **Payments:** Stripe (Subscriptions + One-time + Webhooks)
- **AI Engine:** Pyra AI 🦊 (multi-layer router with auto-fallback)
  - Image: Gemini Flash Image / GPT Image / Flux 1.1 Pro
  - Text: Gemini Pro / GPT-4o
  - Voice: OpenAI TTS (Free/Starter) / ElevenLabs (Pro+)
- **State:** Zustand (client) + React Query (server)
- **i18n:** next-intl (Arabic-first, URL-based `[locale]`)
- **Theme:** next-themes (dark mode, system detection)

---

## Architecture

```
app/
├── [locale]/
│   ├── (auth)/          # Login, Signup, Forgot/Reset Password, Callback
│   ├── (dashboard)/     # 20+ authenticated pages (9 studios + billing + projects + etc.)
│   ├── page.tsx         # Landing page (public)
│   └── layout.tsx       # Root: i18n + theme + query + toast providers
├── api/
│   ├── studios/         # 9 studio API routes
│   ├── stripe/          # 4 Stripe routes (checkout, topup, webhook, portal)
│   ├── credits/         # Balance + transactions
│   ├── brand-kits/      # CRUD
│   ├── assets/          # CRUD + export (ZIP)
│   └── upload/          # File upload to Supabase Storage
├── globals.css          # Tailwind + CSS variables + fonts
└── sitemap.ts

lib/
├── ai/
│   ├── router.ts        # Pyra AI image/text router (multi-model + fallback)
│   ├── tts-router.ts    # Pyra AI voice router (OpenAI + ElevenLabs)
│   ├── elevenlabs.ts    # ElevenLabs Arabic voices client
│   ├── gemini.ts        # Gemini API client
│   ├── openai.ts        # OpenAI API client
│   ├── replicate.ts     # Flux API client
│   └── prompts/         # System prompts v2.0 + safety filters + versioning
├── credits/
│   ├── costs.ts         # Credit costs per studio
│   ├── voiceover-costs.ts # Tiered voiceover pricing per plan
│   ├── check.ts         # Balance check
│   └── deduct.ts        # Atomic deduction via RPC
├── stripe/              # Plans + topups + client
├── supabase/            # Server/client + types + signed URLs
├── image/               # Watermark
├── export/              # PDF generation
├── gamification/        # Achievements + levels
└── animations.ts        # Framer Motion shared variants
```

---

## Development Conventions

### Must Follow
- **Server Components** by default — `'use client'` only when needed
- **TypeScript strict** — zero `any`, zero errors
- **Zod validation** on all API inputs (import from `zod/v4`)
- **RTL-first CSS** — use `ps/pe/ms/me/start/end` (NOT `pl/pr/ml/mr/left/right`)
- **CSS Variables** for colors — NOT hardcoded `bg-white` (use `bg-[var(--color-surface)]`)
- **No inline styles** — Tailwind utilities only
- **shadcn/ui** in `components/ui/` — extend via wrapping, don't modify directly
- **Rate limiting** via Supabase query (NOT in-memory) — see `lib/rate-limit.ts`
- **Safety filters** — all user prompts pass through `sanitizePrompt()` before AI
- **Pyra AI branding** — user-facing text refers to "بايرا" not model names

### File Naming
- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts` (prefix: `use`)
- API routes: `route.ts`
- Utils/libs: `camelCase.ts`

### API Route Pattern
```typescript
// 1. Auth check
// 2. Rate limit check (await checkRateLimit(supabase, user.id))
// 3. Validate input (Zod) + sanitize prompt
// 4. Check plan limits (resolution, duration, features)
// 5. Check credits
// 6. Generate via Pyra AI router (handles model selection + fallback)
// 7. Persist + watermark (persistGeneratedImage — burns the mark in before the
//    single upload; throws WatermarkRequiredError if it cannot, so the caller
//    refunds. NOT maybeWatermark/watermarkAndReupload — both are dead code.)
// 8. Deduct credits + CHECK deductResult.success
// 9. Finalize + save assets — ALWAYS via lib/supabase/generation-writes.ts:
//      await finalizeGeneration(supabase, generation.id, {...}, 'studio')
//      await insertAssets(supabase, rows, 'studio')
//    NEVER a raw `.from('generations').update({ status: 'completed' })`. That
//    write is what takes the row out of reconcile_orphaned_generations()'s scan
//    window; unchecked, a failed one gets delivered work refunded 45 minutes
//    later while the route already returned success. The `generation-finalized`
//    invariant fails the build on a raw one.
// 10. Return response
```

### VoiceOver Tiered Pricing
```
Free/Starter → OpenAI TTS → 1 credit / 15 seconds
Pro+         → ElevenLabs → 3 credits / 20 seconds
```

### Supabase
- **RLS on every table** — no exceptions
- **Service role** only in webhooks and admin operations
- **Atomic credit deduction** via `deduct_credits()` RPC
- **Signed URLs** for storage assets (15-min expiry)

### Credits System
- Check balance → Generate → Deduct (atomic) → Log transaction
- `deductResult.success` MUST be checked after every deduction
- Free plan: watermark on images — fail-CLOSED. If the mark cannot be burned in,
  the request fails and credits are refunded; the clean original is never served.
  **Requires fonts in the runtime image.** The mark is SVG `<text>` rendered via
  librsvg/pango, and on a bare `node:*-alpine` pango draws every glyph as an empty
  box and returns *success* — so from 2026-08-13 until 2026-08-20 every free-plan
  image shipped with rectangles instead of the product name, with nothing thrown
  and nothing logged. `Dockerfile` installs `ttf-dejavu`; `assertTextRenderingAvailable()`
  (`lib/image/watermark.ts`) fails the request closed if that layer is ever dropped.
- Resolution enforcement per plan
- VoiceOver: tiered pricing based on plan (see `lib/credits/voiceover-costs.ts`)

### Database Migrations
- **46 files** in `supabase/migrations/`, latest `045_brand_kits_business_context.sql`.
  `public.schema_migrations` records 24 of them (022 → 045, contiguous) because
  the ledger was introduced at 022 — a version's absence from it means only that
  it predates the ledger, not that it was skipped. Verified against the live
  database 2026-08-23; an earlier version of this file stopped at 042.
- Apply with `node scripts/db/apply.js supabase/migrations/0XX_*.sql`. Port 5432
  is closed to the internet, so this goes through pg-meta `/pg/query` on Kong and
  runs as `supabase_admin`. `scripts/apply-migrations.sh` is the historical
  runner and had no `ON_ERROR_STOP` — do not use it.
- **Rehearse before applying.** Send the same file with its trailing `COMMIT`
  swapped for `ROLLBACK`; a migration that cannot pass its own probes must never
  reach production.
- **A migration that changes an access rule must prove itself as the
  `authenticated` role**, inside the transaction, and refuse to commit if any
  probe cannot reach a verdict — a probe blocked by RLS certifies nothing. See
  038, 040 and 042 for the pattern. `apply.js` discards NOTICE and WARNING, so
  report results as a final `SELECT`, never as `RAISE NOTICE`.
- **21 tables in `public`** (read from the live database, 2026-08-23):
  achievements, admin_login_attempts, admin_logs, assets, brand_kits,
  credit_transactions, daily_metrics, generations, profiles, projects,
  referrals, saved_prompts, schema_migrations, subscription_events,
  support_messages, system_settings, team_members, teams, user_events, waitlist,
  webhook_events. `achievements` and `saved_prompts` are dead (zero writers);
  `teams`/`team_members` outlive the feature, which was removed 2026-08-23.

---

## Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
STRIPE_BUSINESS_PRICE_ID=
STRIPE_AGENCY_PRICE_ID=
STRIPE_TOPUP_SMALL_PRICE_ID=
STRIPE_TOPUP_MEDIUM_PRICE_ID=
STRIPE_TOPUP_LARGE_PRICE_ID=
STRIPE_TOPUP_XL_PRICE_ID=

# AI APIs (Pyra AI Engine)
GOOGLE_GEMINI_API_KEY=
OPENAI_API_KEY=
REPLICATE_API_TOKEN=
ELEVENLABS_API_KEY=

# App
NEXT_PUBLIC_APP_URL=https://pyrasuite.pyramedia.cloud
NEXT_PUBLIC_DEFAULT_LOCALE=ar

# Analytics — OPTIONAL. GA4 falls back to a hardcoded measurement id in
# components/analytics/GoogleAnalytics.tsx, so production reports without this.
# Set it to run the tag locally, preferably against a throwaway property.
NEXT_PUBLIC_GA_MEASUREMENT_ID=

# Server -> GA4 (Measurement Protocol). NOT derivable from the measurement id.
# GA4 -> Admin -> Data Streams -> (stream) -> Measurement Protocol API secrets.
# Absent, every SERVER-sent event is skipped and warned once per process — the
# internal user_events timeline is unaffected, so the symptom is GA4 Monetization
# staying empty while the admin dashboard shows the revenue.
GA4_API_SECRET=

# Meta Pixel — OPTIONAL. Falls back to the hardcoded pixel id in
# lib/analytics/meta-config.ts (the id is public — it ships in page source),
# so production reports without this. Set it to test against a throwaway pixel.
NEXT_PUBLIC_META_PIXEL_ID=

# Server -> Meta Conversions API. NOT derivable from the pixel id.
# Events Manager -> Data Sources -> (pixel) -> Settings -> Conversions API ->
# Generate access token. Absent, every SERVER-sent Meta event (Purchase,
# CompleteRegistration, InitiateCheckout) is skipped and warned once per
# process — the browser pixel still reports PageViews, so the symptom is Ads
# Manager showing traffic but ZERO conversions.
META_CAPI_ACCESS_TOKEN=
# Optional: routes CAPI events to Events Manager -> Test Events instead of
# recording them — the way to verify the pipe without writing fake conversions.
META_CAPI_TEST_EVENT_CODE=
```

---

## Commands

```bash
npm run dev      # Development server
npm run build    # Production build — runs the gates below first, via prebuild
npm run lint     # ESLint
npx tsc --noEmit # TypeScript check
```

**Build gates** (`prebuild`, so a regression fails the build rather than shipping):

```bash
npm run check:invariants        # 17 rules; --update-baseline is for no-arabic-literals ONLY
npm run test:safety             # 82 checks over the prompt filter and the builders
npm run test:uploads            # 37 checks over the brand-kit logo validator
npm run test:plan-switch        # 15 checks over the mid-period plan-switch credit rule
npm run test:generation-terminal #  11 checks: a row is only closed once credits are settled
npm run test:voiceover-budget   # 508 checks: the char budget is the exact inverse of the price
npm run test:image-host         #  18 checks: the SSRF allowlist is a HOST rule, not a suffix
npm run test:reference-image    #  12 checks: an inline reference image is bounded
npm run test:retrievable-output #  21 checks: a retrievable output can never be multi-megabyte
npm run test:settle             #  12 checks: a charge only drops from a refund that landed
npm run test:provider-retry     #  20 checks: transient vs permanent provider failures
npm run test:response-schemas   #  28 checks: what we ASK the model for matches what we parse
npm run test:prompts            # 111 golden-string checks over the prompt builders
npm run test:analytics          #  46 checks: the client may never report a server-witnessed event — GA4 AND Meta — plus cookie parsers, Meta hashing, and the five load-bearing CSP hosts
npm run test:root-document      #  62 checks: exactly ONE <html> per route, with lang/dir/fonts
npm run test:website-url        #  48 checks: the URL normaliser and BOTH storage layers agree
npm run test:brand-extract      # 135 checks: the extract route, its codes and its bounds
npm run test:brand-context      #  32 checks: business facts reach the prompt, sanitised
npm run test:mock-from-schema   #  55 checks: the dev mock parses with the STUDIO own Zod schema
```

**One gate runs AFTER the build**, because before it there is nothing to read:

```bash
npm run test:built-document     #  every prerendered document, counted in the BYTES THAT SHIP
```

**1250 checks across 18 prebuild test files, plus one postbuild gate.** Several exist because the defect they guard was
invisible in review — `test:prompts` catches a prompt that "reads fine" while
inventing a business stage the product never collects, and `test:voiceover-budget`
catches a price computed from a different string than the one the customer hears.

`test:built-document` exists because `test:root-document` **passed while the build
was broken**, on 2026-08-25. root-document reads SOURCE — it walks each leaf's
layout chain and asserts one document owner, which is right for the defect it was
written for. A client component added to `app/[locale]/layout.tsx` added no
`<html>` to any layout, so the chain was still one owner and it passed 62 of 62 —
while `ar.html` and `en.html` each shipped **two** `<html>` tags and the Arabic
landing page shipped **no GA tag at all**. A source-level rule cannot certify a
rendered document; React 19 treats `<html>` as a host singleton, so a second one
arrives by rendering accident rather than by a layout. Count the output.

The same round is why the reported figure "62 of 62 prerendered artifacts now
carry exactly one `<html>`" (2026-08-24, above) should be read with care: a
prerendered document is **one line**, so `grep -c '<html'` returns 1 no matter how
many tags are on it. `test:built-document` uses a global regex for that reason.

`test:plan-switch` runs **sequences**, not cases, and that is the point: the rule it
guards had a version that passed every single-step check and still minted credits on the
second lap of a down-up cycle. If you change `lib/credits/plan-switch.ts`, add the new
attack as a sequence.

Needs the live database, so **not** a build gate — run these after applying 042, after
touching either side of the logo rule, or after changing the beta-credit grant on either
side. `test:beta-credits` exists because the waitlist page is statically prerendered and
therefore cannot read `system_settings.invite_gate.beta_credits` — so the figure it promises
in two languages is a SECOND source of truth. Lower the grant without it and the page keeps
promising the old number: the customer signs up for 100, receives 50, and nothing in the
product is technically wrong.

```bash
npm run test:logo-parity   # one corpus through both the TS validator and the SQL guard
npm run test:rate-limit    # 25 genuinely parallel calls against a cap of 5 -> exactly 5
npm run test:beta-credits  # the number the waitlist PROMISES == the number the DB GRANTS
```
