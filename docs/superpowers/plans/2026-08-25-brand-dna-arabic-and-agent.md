# Plan — Brand DNA onboarding, Arabic text on images, a second prompt guard, and the agent

**Date:** 2026-08-25 · **Working tree:** clean at `8bd96c6` · **Status:** planned, nothing built.

> **How to read this.** Every factual claim below names a `file:line` that was read on
> 2026-08-25 against this working tree. Nothing here is inferred from `CLAUDE.md`, from a
> README, or from an earlier plan — three claims that came from exactly those sources
> turned out to be wrong and are corrected in §2. If you change code that this document
> cites, fix the citation in the same commit. A plan that misdirects costs more than a
> missing feature.

---

## 1. Ground truth

Read 2026-08-25. This is the whole factual basis of the plan; if you disagree with a task
below, disagree with a row here first.

| # | Fact | Proof |
|---|------|-------|
| G1 | The **only** Arabic-specific prohibition in the entire prompt layer is one string in `text_add`'s `avoid` list | `lib/ai/prompts/edit.ts:68` |
| G2 | The same mode positively requires Latin script | `lib/ai/prompts/edit.ts:61` |
| G3 | No build gate pins any `edit.ts` string — `prompts.test.ts` has zero references to edit | grep `edit` over `scripts/tests/prompts.test.ts` → 0 hits |
| G4 | Other no-text rules are **not** Arabic bans and must survive: a general cleanliness rule with an escape hatch, and a product-label preservation rule | `lib/ai/prompts/creator.ts:77`, `lib/ai/prompts/photoshoot.ts:444,451` |
| G5 | An onboarding flow **already exists** and is a 5-step explanatory tour that collects **zero** data | `app/[locale]/(dashboard)/onboarding/page.tsx:25-62` |
| G6 | Onboarding progress lives in `localStorage`, not the database | `app/[locale]/(dashboard)/onboarding/page.tsx:63` |
| G7 | `profiles.onboarding_step` exists and is **read** by the dashboard, but written by **nothing** — so it is permanently `0` | column at `lib/supabase/types.ts:19`; sole reader `components/dashboard/ProfileCompletion.tsx:23`; zero writers in `app/`, `lib/`, `components/` |
| G8 | Middleware forces every signed-in, non-banned, non-onboarded user to `/onboarding` | `middleware.ts:314-318` |
| G9 | Completing onboarding pays 5 credits; skipping flips the flag without paying | `app/api/user/onboarding/route.ts:7`, `:37-54` |
| G10 | `brand_kits` has **no** industry, website, audience or description column | `lib/supabase/types.ts:87-101` |
| G11 | `brand_kits` columns are bounded by CHECK constraints deliberately mirroring the Zod caps | `supabase/migrations/044_brand_kits_column_lockdown.sql:39-62` |
| G12 | Latest migration is `044`. A new column needs `045` | `supabase/migrations/` |
| G13 | `industry` is typed into the plan and analysis forms every single time and persisted **nowhere** | collected only in `app/[locale]/(dashboard)/plan/page.tsx`, `app/[locale]/(dashboard)/analysis/page.tsx` |
| G14 | **No scraping dependency exists** — playwright, puppeteer, cheerio, jsdom, linkedom all absent | `package.json` |
| G15 | `sanitizePrompt()` is a deterministic term-stem denylist with Arabic affix stripping. No semantic detection anywhere | `lib/ai/prompts/safety.ts:62,78,100,101,180` |
| G16 | Model-authored `post.scenario` already passes `sanitizePrompt` and a block drops **one image**, not the campaign | `app/api/studios/campaign/route.ts:350-372` |
| G17 | **No job queue of any kind** — bullmq, redis, inngest, trigger.dev all absent | `package.json`, `lib/`, `app/api/` |
| G18 | **No studio route exports `maxDuration`** — all nine run on the platform default | grep over `app/api/studios/*/route.ts` |
| G19 | Credits are a fixed price per action, resolved before the call | `lib/credits/costs.ts:1-12` |
| G20 | The agent question is on record as discussed and undecided, with three questions still unanswered | `docs/PRODUCT_DIRECTION.md:3,146,166` |
| G21 | `sharp` is imported directly but is **not declared** in `package.json` — it arrives only as a transitive dep of `next@15.5.14` | `lib/image/watermark.ts:1`; `npm ls sharp` |

---

## 2. Corrections to earlier statements

Recorded because each one would have sent the next engineer down a wrong path.

**2.1 — The Dockerfile font is not the blocker for Arabic-on-images.**
An earlier report framed "add an Arabic font to the runtime image" as the unlock. That is
wrong about *this* feature. The font (`Dockerfile:47`, currently `ttf-dejavu` only) governs
the **server-side compositing** path — `lib/image/watermark.ts` drawing SVG `<text>` through
sharp → librsvg → pango. The Arabic text a customer asks for is drawn by the **model**, not
by us, and the thing stopping it is a prompt string (G1, G2). The font work is still worth
doing, but as hardening for the watermark and any future overlay — not as this feature.
It is Task 1c below, not Task 1.

**2.2 — `docs/PRODUCT_DIRECTION.md` and the agent memo cite `lib/ai/prompts/creator.ts:36`
as the place Arabic is forbidden. That line no longer says that.**
`creator.ts:36` today is brand-kit sanitization. `creator.ts` was rewritten in the
2026-08-24 round and the citation was never updated. The real location is `edit.ts:68`.
This is the exact failure mode `CLAUDE.md` warns about — a citation that ages into a lie.

**2.3 — Onboarding does not need to be built.**
It exists (G5) and middleware already routes into it (G8). Task 2 is a *conversion* of an
existing tour into a data-collecting step, which is materially cheaper than the ~3–5 days
previously estimated for a greenfield flow.

**2.4 — Two of the four tasks were framed as "build" when a maintained package already
does the hard part.** Corrected in §2A below. This was a real error in the first version of
this plan: it would have had someone write an HTML/metadata extractor and a colour
quantiser by hand.

---

## 2A. Build vs integrate — verified inventory

Every package below was checked against the npm registry on 2026-08-25: latest version,
licence, last publish, dependency tree, and monthly download volume. Download volume is
used as a maintenance signal, not a quality claim.

| Task | Is there a drop-in? | Verdict |
|------|--------------------|---------|
| 1 — Arabic on images | **No, and none is possible** | It is two string literals in `lib/ai/prompts/edit.ts`. No library can hold this rule for us |
| 2 — Brand DNA | **Yes, substantially** | Do not write a scraper or a colour quantiser |
| 3 — Prompt guard | **No trustworthy one exists in JS/TS** | See the measurements below before reaching for one |
| 4 — Planner | **Yes, for the mechanism** | But it collides with our own router — see §6 |

### Task 2 — integrate these, write only the glue

| Package | Version / licence | Downloads/mo | What it removes from the task |
|---------|-------------------|--------------|-------------------------------|
| `metascraper` | 5.56.2 · MIT · 13 KB unpacked, deps `cheerio` + helpers | 565,714 | Open Graph, JSON-LD, meta tags and fallbacks — the entire "parse the HTML" half of §4a |
| `node-vibrant` | 4.0.4 · MIT | 3,180,711 | Palette extraction from the logo or hero image. Ships a dedicated `node-vibrant/node` export backed by `@vibrant/image-node`, so it runs server-side |
| `@mozilla/readability` | 0.6.0 · Apache-2.0 | — | Main copy extraction, to feed the model for voice / audience / industry. Optional |

**Port, do not import:** `SamurAIGPT/Open-Pomelli` `src/lib/brand-analyzer.ts` (MIT, ~110
lines) is coupled to MuAPI and its own `scrapeSite()`, so it is not a dependency. What *is*
portable is its `BrandDNA` output shape — `brandName, industry, tagline, valueProposition,
toneOfVoice[], brandPersonality[], targetAudience, keyMessages[], primaryColors[],
secondaryColors[], fonts[], logoUrl, imageryStyle, layoutStyle` — and its extraction prompt.
Take the shape and the prompt; write the call against our own `lib/ai/router.ts`.

**The buy option, priced:** Brandfetch's Brand API returns logos, colours *with roles*,
fonts and firmographics from a domain in one call — the whole feature, no extraction code
at all. It is **$99/mo for 100 brands**, then $0.10 per additional brand. Their *Logo API*
is separately free to 500k requests/mo but returns logos only, not colours or fonts. For a
pre-revenue invite launch, $99/mo of fixed cost for the first 100 signups is a founder
decision, not an engineering one. Record whichever way it goes.

### Task 3 — measured, and the answer is no

| Candidate | What the registry says | Verdict |
|-----------|------------------------|---------|
| `llm-guard` (npm) | v0.1.9 · MIT · **5,196 downloads/mo** · 43 KB, 23 files, **zero dependencies**, single author | Hobby-scale. Not something to put in front of a paid generation path |
| `rebuff` (npm) | v0.1.0 · last published **2023-11-28** | Abandoned |
| `superagent-ai/superagent` | 6.7k stars on GitHub, **not published as an npm library** | Read it as a reference implementation; it is not an install |
| Python ecosystem (`llm-guard` PyPI, NeMo Guardrails, Presidio) | Mature, but Python | Would mean a second service on Coolify for one filter |

So §5 stands as written — but note what it now means concretely: **not a framework, a
prompt.** An LLM-as-judge call through our existing `lib/ai/router.ts`, or a hosted
guard API. Both still need the three constraints in §5 (fail posture, deadline, registered
error code) decided explicitly.

### Task 4 — the mechanism exists, and it brings a problem

`ai` (Vercel AI SDK) v7.0.78 · Apache-2.0 · **84,062,842 downloads/mo**, with
`@ai-sdk/google` 4.0.50 and `@ai-sdk/openai` 4.0.46 — the two providers we already use.
`generateObject()` with a Zod schema produces a typed, validated plan, which is exactly the
planner's output.

**Compatibility is confirmed, not assumed:** `ai@7.0.78` declares
`peerDependencies: { zod: "^3.25.76 || ^4.1.8" }` and this repo is on `zod@^4.3.6`. It fits.

**The problem it brings:** we already own a router — `lib/ai/router.ts` (316 lines) plus
`lib/ai/http.ts` deadlines and `isRetryable()`, built in the 2026-08-24 round precisely
because untimed, indiscriminately-retried provider calls turned one image request into nine
upstream calls. Adding the AI SDK means **two routers with two retry policies and two
fallback ladders** in one codebase. That is the drift class this repo keeps paying for.

Two honest ways out, and the choice belongs to whoever builds it:

- **Scope the SDK to the planner only** — it never touches a paid studio call, so the two
  policies never overlap. Simplest, and correct for a quote-only planner.
- **Do not add it at all** — `generateObject` is a schema-constrained call, and
  `lib/ai/response-schemas.ts` already does schema-constrained calls for five studios.
  The planner may just be a sixth.

Prefer the second if the planner's schema turns out to be simple. Reach for the SDK only
when tool-calling or multi-step execution actually arrives, i.e. not in the quote-only
phase.

---

## 3. Task 1 — Arabic text on generated images

**Why now:** the founder confirms the backend models render Arabic script acceptably. The
product's whole positioning is Arabic-first, and today the one studio whose job is putting
text on an image explicitly refuses to do it in the customer's own language.

### 1a. Flip the rule (the actual feature)

`lib/ai/prompts/edit.ts`, `text_add` mode:

- **`:61`** — replace the Latin-only instruction. The rule should be *script-agnostic and
  fidelity-bound*: set the text exactly as the customer wrote it, in the script they wrote
  it in, correctly spelled, no extra words, no transliteration, no translation.
- **`:68`** — delete the `Arabic script` entry from `avoid`. Replace it with the rules that
  are actually true for Arabic and that a model gets wrong: letters must stay **joined** in
  their correct contextual forms, the run must read **right-to-left**, and diacritics must
  not be invented. Add "transliterating or translating the customer's text" to `avoid`.
- **`:25-26`** — the file header comment states `text_add` "deliberately inverts the no-text
  rule". Extend it to record *why the Arabic ban existed and why it was lifted*, with the
  date. Do not delete the history; this repo documents its own reversals.

**Gates:** `check:invariants` includes `prompt-builder-sanitized`, which requires a builder
to interpolate only `safe*` identifiers. `buildEditPrompt` already satisfies this — the
customer string is `safeDescription` (`lib/ai/prompts/edit.ts:82`) and the mode strings are
literals. Changing literal text does not touch that rule. Per G3, no test pins these
strings, so **nothing will fail on its own**. That is a hazard, not a convenience — see 1b.

### 1b. Add the gate that should have existed

Add golden-string checks for `edit` to `scripts/tests/prompts.test.ts` (currently 36 checks,
zero of them about edit). At minimum:

- `text_add` must **not** contain `Latin` or `Arabic script` in a prohibitive context.
- `text_add` **must** contain the joining/RTL fidelity rules.
- The other four modes must still carry their preservation rules (a careless edit to the
  `EDIT_MODES` table is one keystroke from deleting them).

Prove the gate by reintroducing the old string and watching it fail — that is this repo's
standing rule for a new gate, and every gate added on 2026-08-24 and 2026-08-25 was proved
that way.

### 1c. Arabic font in the runtime image (hardening, separable)

`Dockerfile:47` installs `ttf-dejavu` only, whose Arabic coverage is poor. Add a Noto Naskh
Arabic (or Tajawal) package and extend `assertTextRenderingAvailable()`
(`lib/image/watermark.ts:148`) to probe an **Arabic** glyph, not just Latin. The existing
probe's whole reason for existing is that pango returns *success* while drawing empty boxes
(`lib/image/watermark.ts:128-132`) — an Arabic-blind probe reproduces exactly that bug for
Arabic.

This ships independently of 1a and does not block it.

### Verification

Not gate-verifiable. Run the edit studio end to end against the live model with an Arabic
string in `text_add`, in both locales, and look at the returned image. `CLAUDE.md` records
that the entire 2026-08-24 round shipped without a single live-model run; do not repeat that
here, because this is the one task whose success **only** a rendered image can confirm.

### Found in passing

`app/api/studios/edit/route.ts:112` hardcodes `resolution: '1080p'`. This is consistent with
edit's flat 1-credit price (`lib/credits/costs.ts:9`), so it is not a mispricing — but a 4K
customer's edit returns downscaled. Decide deliberately; do not fix by reflex.

---

## 4. Task 2 — Brand DNA from a website URL, inside onboarding

**Why now:** this is the single largest UX gap. Today a new customer lands on a five-card
tour (G5) and is asked to fill a brand kit by hand. The competitive scan found two
independent open implementations of "URL → brand identity", both tracking Google's own
Pomelli — the market has converged on *"give me your website link"* as the opening move,
and we open with an empty form.

It also fixes G13: `industry` is retyped into every plan and analysis run and stored nowhere.

### 2a. Decide the extraction mechanism — **this is a blocking decision, make it first**

We have **no** scraping capability at all (G14). Three options, and the choice changes
everything downstream:

| Option | Cost | Note |
|--------|------|------|
| Server-side `fetch` + HTML parse | Lowest — one small dep | Misses client-rendered sites, which is most modern marketing sites. Gets `<meta>`, OG tags, inline CSS colours, visible copy |
| Headless browser in the container | Highest — Playwright/Chromium is a large image layer on Coolify | Full fidelity: screenshot for a vision model, computed CSS for real colours |
| External scraping/screenshot API | Middle — a vendor and a key | Adds a runtime dependency and a per-call cost on a **free** onboarding step |

**Recommendation: start with the plain `fetch` path — and do not write the parser.**
`metascraper` + `node-vibrant` (§2A) cover metadata, logo and palette; what we write is the
bounded fetch, the model call for voice/industry/audience, and the draft UI. The result is an
*editable draft* (see 2c), so a partial extraction is still a large improvement over an empty
form. Escalate to a headless browser only if measured extraction quality is poor on real
customer sites — and price Brandfetch (§2A) against that escalation before building it, because
a headless-Chromium layer on Coolify is not obviously cheaper than $99/mo.

**Whatever is chosen, the fetch is SSRF-shaped and must be treated as such.** This repo has
already been bitten by exactly this class: `POST /api/assets/export` did `fetch()` on a
customer-writable column. The rules already exist and must be reused, not reinvented —
`lib/ai/allowed-hosts.ts` for the host rule (`test:image-host`, 18 checks, proves a host rule
is not a suffix rule) and the bounded-fetch pattern in `lib/storage/reference-image.ts`
(`test:reference-image`, 12 checks). A customer-supplied URL must be bounded on scheme, host
(no private ranges, no link-local, no redirects to them), response size, and time.

### 2b. Schema — migration `045`

`brand_kits` needs columns that do not exist (G10). Follow `044` exactly:

- New nullable columns: `website_url`, `industry`, `target_audience`, `description`.
- CHECK constraints bounding each, **deliberately identical to the Zod caps** — the phrasing
  and reasoning are at `044:39`. A constraint stricter than the route turns a clean 400 into
  a 500 carrying raw Postgres text; this repo has shipped that bug once already
  (`CLAUDE.md`, the `isOwnUploadUrl()` parity defect) and `scripts/tests/logo-parity.ts`
  exists because of it.
- `website_url` is customer-writable over PostgREST and will be **read back and interpolated
  into prompts**, which is precisely the threat `044` was written for. Bound it in the same
  migration, on the same bytes both layers store.
- Rehearse with `COMMIT` swapped for `ROLLBACK`; prove every probe **as the `authenticated`
  role**; a probe blocked by RLS is a failure, not a pass. Apply with
  `node scripts/db/apply.js`. `scripts/apply-migrations.sh` has no `ON_ERROR_STOP` — do not
  use it.

Update `CreateBrandKitSchema` (`app/api/brand-kits/route.ts:15-24`) and the PUT schema
together. They diverged once before — POST had `.optional()` where PUT had `.nullable()`,
and the result was a dialog that silently never saved (`CLAUDE.md`, migration 042 round).
Use the shared schema.

### 2c. The flow

Insert a **new first step** into `STEPS` (`app/[locale]/(dashboard)/onboarding/page.tsx:25`):

1. Ask for the website URL. **Make it skippable in one click** — a customer with no website
   must not be trapped, and `middleware.ts:314` means being trapped here means being trapped
   out of the entire product.
2. Extract → show a **draft brand kit the customer edits before saving**. Both reference
   implementations do this and it is the right shape: extraction is a guess, and presenting a
   guess as a fact is how you lose trust on the first screen. Never save silently.
3. On save, write the `brand_kits` row (default kit) and prefill `industry` so plan and
   analysis stop asking for it (G13).

The existing five tour cards keep working after it. Do not delete them in this task.

### 2d. Fix the progress bug while you are in this file

G6/G7: progress is in `localStorage` while `profiles.onboarding_step` exists and is read by
`ProfileCompletion.tsx:23` and written by nothing — so the dashboard's completion widget
reads a permanent `0`, and a customer who switches device restarts the tour. Write the step
to `profiles.onboarding_step` as well. Migration `022` already grants `authenticated`
column-level UPDATE on onboarding columns (the pattern is used at
`app/api/user/onboarding/route.ts:37-54`); confirm `onboarding_step` is in that grant before
assuming it, and add it in `045` if not.

### Verification

- Migration probed as `authenticated`, as above.
- A hostile URL corpus through the fetch guard: private IPs, `localhost`, redirect-to-private,
  oversized body, slow-loris. Model it on `scripts/tests/image-host.test.ts`.
- A real signup, end to end, in both locales: with a website, with a skip, and with a site
  that fails to fetch. The failure arm must produce a usable brand kit, not a dead end.

---

## 5. Task 3 — A second layer on the prompt guard

**What we have (G15):** `sanitizePrompt()` is a normalised term-stem denylist with Arabic
prefix/suffix stripping. It is fast, deterministic, testable — `test:safety` is 82 checks —
and it is a **string** filter. It cannot see intent, paraphrase, or an instruction smuggled
through a benign vocabulary.

**Where the second layer earns its cost, in order:**

1. **`campaign`** — the one path where the text reaching an image model is **written by
   another model** (G16). The existing per-post handling is already the right shape: a block
   drops one image and refunds it rather than killing a 12-credit campaign
   (`app/api/studios/campaign/route.ts:359-372`). A semantic check slots into that exact
   branch with no new failure design.
2. **`edit` `text_add`** — after Task 1 this accepts arbitrary Arabic to be *rendered into an
   image*. The denylist's Arabic stemming (`safety.ts:100-101`) is good, but rendering
   customer text verbatim into a deliverable raises the stakes.
3. Everything else — lower value; the denylist plus the bounded inputs
   (`prompt-input-bounded` invariant) already cover the common shapes.

**Design constraints, from this repo's own history:**

- **It must fail one of two ways, chosen deliberately per call site — and never fail open
  silently.** `lib/rate-limit.ts` failed open, and `checkKeyedRateLimit` failed open, and
  both were defects. If the guard is a network call, decide now whether an outage blocks
  paid generation or waves it through, and write the decision in the code.
- **It must not become an unbudgeted upstream call.** `lib/ai/http.ts` exists because
  provider calls had no deadline and `withRetry` retried every error class, turning one
  request into nine. Any guard call gets a deadline and `isRetryable()` treatment from day
  one.
- **A block must return a registered error code.** The `studio-error-codes` invariant
  requires every returned error to be registered **and** to have copy in both locales. Seven
  routes shipped raw English prose past this once.

**There is no drop-in to install — that was measured, see §2A.** The JS/TS candidates are a
5k-download hobby package and a package abandoned in 2023; `superagent-ai/superagent` is a
6.7k-star GitHub project that publishes no npm library. So this layer is a **prompt and one
call**, not a framework: an LLM-as-judge through the existing `lib/ai/router.ts`, or a hosted
guard API. Read Superagent for the detection approach; do not wait for a package that does
not exist.

---

## 6. Task 4 — Pyra as an agent

**Standing decision:** the founder asked for this on 2026-08-12, the recommendation was to
defer (`docs/PRODUCT_DIRECTION.md:146`), and on 2026-08-25 he reaffirmed it. It is on the
roadmap. This section states what is actually in the way, because all of it is still true in
today's code and none of it is a matter of opinion.

### The three blockers, re-verified today

**B1 — Billing is fixed-price-per-action; an agent's cost is not.**
`lib/credits/costs.ts:1-12` prices each action before the call, and the whole money path —
reserve → deduct → refund, `settleCharge()`, the plan-switch rule, the reconciler — is built
on knowing the price up front. An agent that chooses its own steps makes the total
non-deterministic. This is not a small problem: `CLAUDE.md` records that the plan-switch rule
alone took **three attempts**, and two of them shipped as exploitable taps.

**B2 — There is no queue, and routes are synchronous with no declared ceiling.**
G17 and G18. A multi-step agent run cannot live inside a single request/response.

**B3 — Failure handling multiplies.**
Nine studios each took a full hardening round to get their refund/finalize/fail paths
correct. An agent composing them multiplies the partial-failure surface: step 3 of 6 fails,
and something must decide what the customer owes for steps 1–2 and what happens to their
half-finished campaign.

### The shape that resolves B1 and B2 without unpicking the money path

**A planner that quotes, and an execution that is just the existing studios.**

1. The customer states a goal in natural language.
2. Pyra returns a **plan**: an ordered list of concrete studio calls, each with its price
   from `getStudioCost()` — so the total is a **sum of existing fixed prices**, not a new
   pricing model. Nothing about `costs.ts`, `reserve_credits`, `settleCharge` or the
   reconciler changes.
3. The customer sees the total and approves.
4. Execution runs the approved list. Every step is an existing, hardened studio path.
   Nothing new touches money.

This keeps the promise ("tell Pyra what you want, get a campaign") while the *only* new
component is the planner. It is also the cheapest thing to build and the easiest to abandon
if the first cohort does not use it.

**B2 still has to be answered before step 4 can run more than one or two steps.** Either
declare `maxDuration` on a bounded run, or introduce a queue. That is a real infrastructure
decision on Coolify and it should be scoped separately, not smuggled into this task.

### The three questions still unanswered

`docs/PRODUCT_DIRECTION.md:166` records three questions that were put on 2026-08-12 and never
answered. They are not gatekeeping — they change what gets built:

1. **Autonomous or conversational?** "Pyra does it for me" and "Pyra talks me through it"
   are different products with different failure modes.
2. **Professional marketer or shop owner?** A marketer wants control at each step; a shop
   owner wants an outcome. The approval step in the design above is either essential or
   friction depending on the answer.
3. **Has one complete campaign been run through the product as a customer?** The planner's
   output *is* the orchestration that currently lives in the founder's head. It cannot be
   encoded from the outside.

**On tooling:** the mechanism is available (Vercel AI SDK `generateObject`, Zod-4 compatible
— §2A) but it duplicates our own router. For a quote-only planner, prefer extending
`lib/ai/response-schemas.ts`, which already makes schema-constrained calls for five studios.
Add the SDK only when real tool-calling arrives.

**Recommended sequencing: build the planner as a quote-only feature first** — it shows a
priced plan and links each step to its studio, executing nothing. It is small, it is
reversible, it answers question 1 by watching what people click, and it delivers the "Pyra
understands my goal" moment without touching B1, B2 or B3 at all.

---

## 7. Found in passing

Not in scope; recorded so it is not rediscovered.

| Finding | Proof | Cost to fix |
|---------|-------|-------------|
| `sharp` is imported directly but undeclared; it survives only as a transitive dep of `next@15.5.14`. The free-plan watermark is fail-closed, so a hoisting or Next dependency change fails **every free-plan image** | `lib/image/watermark.ts:1`; `npm ls sharp` → `next@15.5.14 → sharp@0.34.5`; absent from `package.json` | one line |
| `profiles.onboarding_step` is read and never written | G7 | folded into Task 2d |
| `docs/PRODUCT_DIRECTION.md` cites a line that no longer says what it claims | §2.2 | fix with Task 1 |

---

## 8. Sequence

Ordered by return on effort, and by what unblocks what.

1. **Task 1a + 1b — flip the Arabic rule and add the gate.** Hours. No schema, no
   infrastructure, no new dependency. Requires a live-model run to confirm.
2. **`sharp` declaration.** One line, prevents a total free-tier outage.
3. **Task 2a — decide the extraction mechanism, and decide build-vs-buy.** Blocking;
   everything else in Task 2 depends on it. Two questions, not one: `fetch` vs headless
   browser, and `metascraper` + `node-vibrant` (§2A) vs Brandfetch at $99/mo. Do not start 2b
   before both are answered.
4. **Task 2b/2c/2d — migration 045, the onboarding step, the progress fix.** The largest item
   and the largest UX return.
5. **Task 1c — Arabic font + Arabic-aware render probe.** Independent hardening.
6. **Task 3 — the guard's second layer**, starting at `campaign`.
7. **Task 4 — the planner, quote-only.** After the three questions in §6 are answered.

**Explicitly dropped:** social publishing (founder, 2026-08-25 — not needed now).

## 9. Definition of done for each task

No task is done on a green build alone. `CLAUDE.md` records that `tsc`, `eslint`, all 15
invariants and a clean production build were green while every English page in production
rendered right-to-left, and again while the Arabic landing page shipped with no analytics
tag at all.

- **Task 1:** an Arabic string rendered correctly into a real image by the live model, seen.
- **Task 2:** a real signup completed with a website, with a skip, and with a fetch failure —
  all three producing a usable brand kit; migration probed as `authenticated`.
- **Task 3:** the fail posture is written down in the code, and a blocked call returns a
  registered code with copy in both locales.
- **Task 4:** a priced plan displayed, with each line's cost matching `getStudioCost()`.
