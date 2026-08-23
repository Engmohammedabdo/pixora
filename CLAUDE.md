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
| Brand kit logo/fonts reaching the model | ❌ zero references to `logo` anywhere in `lib/ai/`. The logo is uploaded and now shown on the brand-kit card, and that is all it does — the copy says so. Colours reach creator and photoshoot, the voice reaches creator. |
| Retrieving a text studio's output after the tab closes | ✅ **fixed 2026-08-23.** Was absent: `plan` (5cr), `analysis` (3cr) and `storyboard` (14cr) wrote their result only into `generations.output` and every read of that column lived under `/app/admin/`, so a reload destroyed paid work. Now `GET /api/generations` (metadata only) and `GET /api/generations/[id]` (one row's output), surfaced by `RecentWork`. The detail route refuses the image studios — their `output` holds 904 kB – 2.8 MB of base64, measured — and answers not-found and not-yours identically so it cannot be used to probe which ids exist. Nothing was lost in practice: those three studios had zero rows. |
| Cleaning up replaced brand-kit logos | ❌ a logo the user replaces or abandons stays in the public `uploads` bucket forever. Storage growth only — the object is under the owner's own folder and nothing links to it. |
| Error tracking (Sentry) / product analytics (PostHog) | ❌ env vars declared, empty, never read by any line of code. |

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
- **44 files** in `supabase/migrations/`, latest `043_throttle_table_is_general_purpose.sql`.
  `public.schema_migrations` records 22 of them (022 → 043, contiguous) because
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
npm run check:invariants   # 12 rules; --update-baseline after fixing known debt
npm run test:safety        # 72 checks over the prompt filter
npm run test:uploads       # 37 checks over the brand-kit logo validator
npm run test:plan-switch   # 15 checks over the mid-period plan-switch credit rule
```

`test:plan-switch` runs **sequences**, not cases, and that is the point: the rule it
guards had a version that passed every single-step check and still minted credits on the
second lap of a down-up cycle. If you change `lib/credits/plan-switch.ts`, add the new
attack as a sequence.

Needs the live database, so **not** a build gate — run it after applying 042 or
touching either side of the logo rule:

```bash
npm run test:logo-parity   # one corpus through both the TS validator and the SQL guard
```
