# Execution Program — the merged, authoritative sequence

**Date:** 2026-08-25 · **Branch:** `plan/project-as-context` · **Status:** executing

> **This file supersedes the task ordering and the storage decisions in both source plans.**
> It does not replace their detail — go to them for the reasoning and the `file:line` proof:
>
> - `2026-08-25-project-as-context.md` — the shawarma-journey review's fixes.
>   **Tasks 3–8 of that plan are VOID**: they put business facts on `projects`, and the
>   owner chose `brand_kits`. Tasks 1 and 2 stand and are executing.
> - `2026-08-25-brand-dna-arabic-and-agent.md` — brand DNA, Arabic on images, prompt
>   guard, agent. Its §2A build-vs-integrate inventory is the best-researched section
>   in either plan and is carried forward, with one owner override recorded below.

---

## Owner decisions, 2026-08-25

Each of these changed the shape of the work. Recorded here because a later reader will
otherwise re-litigate them from the source plans, which say something different.

| # | Decision | What it overrides |
|---|----------|-------------------|
| D1 | **Business facts live on `brand_kits`, not `projects`.** | Voids `project-as-context` Tasks 3–8. Migration `045` is the `brand_kits` version. |
| D2 | **Extraction comes first**, before the rest of the context work. | Reorders both plans. |
| D3 | **Extraction runs on n8n + Apify**, not in-app scraping. | Overrides `brand-dna` §2a's `metascraper` + `node-vibrant` recommendation. |
| D4 | Extraction returns **colours, logo, fonts, business name, industry, description, target audience, city**. | Fixes the output contract. Fonts were an explicit addition. |
| D5 | Fold in: **Arabic-on-images (1a+1b)**, **`sharp` declaration**, **`onboarding_step` fix (2d)**. Arabic font in Docker (1c) deferred. | Selects from `brand-dna` §7 and §3. |

### Why D3 is right, and the one thing it costs

`brand-dna` §2a spends a paragraph hardening an in-app `fetch()` of a customer-supplied
URL, citing the `POST /api/assets/export` SSRF this repo already shipped. Moving the fetch
to Apify does not *harden* that surface — it **removes it from our container entirely**.
Our app never fetches a customer URL; it calls one known n8n webhook. §2a's own table also
concedes the plain-fetch path "misses client-rendered sites, which is most modern marketing
sites"; Apify runs a real browser without putting Chromium in the Coolify image. And it adds
zero npm dependencies where the recommendation added three.

**What it costs, stated plainly:** `apify/website-content-crawler` returns text, Markdown and
HTML — **not a colour palette and not a font list**. D4 requires both. So palette and font
extraction move *into the n8n workflow* as a Code node reading inline CSS, `<link>`ed
stylesheets and OG/meta tags. That is real work, not glue, and P3.1 owns it. Anyone who
assumes Apify hands back colours will build the wrong thing.

**Second cost:** a runtime dependency on n8n and Apify during onboarding. This is acceptable
**only because** the flow is skippable in one click and the failure arm must still produce a
usable brand kit (`brand-dna` §2c.1 and its Verification section). If either of those is
dropped, `middleware.ts:314-318` turns an n8n outage into a total signup outage.

---

## Phases

Ordered by what unblocks what, and by what can ship without a schema.

### Phase 0 — complete

| ID | Task | State |
|----|------|-------|
| P0.1 | `lib/industries.ts` — one industry list, one slug→name table. Stops `plan.ts:49` splicing Arabic into an English persona. | ✅ commit `caa65b7`, review Spec ✅ / Quality Approved |

`lib/industries.ts` survived decision D1 untouched: it is a *list*, independent of which
table stores the chosen slug. Its exports are a contract for P2.2, P3.1 and P4.2.

### Phase 1 — independent, no schema, ships on its own

Nothing here depends on anything else here. All three can be verified by gates alone except
P1.3, which needs a live-model run.

| ID | Task | Source | Size |
|----|------|--------|------|
| P1.1 | Declare `sharp` in `package.json`. Verified undeclared; resolves only via `next@15.5.14 → sharp@0.34.5`, hoisted. The free-plan watermark is fail-closed, so a hoisting change fails **every free-plan image**. | brand-dna §7 | 1 line |
| P1.2 | `food` environment in the photoshoot studio, with six real food-photography recipes and environment-aware MUST/AVOID blocks. | project-as-context Task 2 | medium |
| P1.3 | Arabic text on generated images: flip the Latin-only rule in `edit.ts` `text_add`, add joining/RTL fidelity rules, and add the golden-string gate that does not exist (`prompts.test.ts` has zero `edit` checks). | brand-dna §3 (1a + 1b) | hours |

**P1.3 carries a hazard the source plan names explicitly:** no test pins any `edit.ts`
string, so changing them fails nothing on its own. The gate in 1b is not optional polish —
it is what makes the change safe to make. Prove it by reintroducing the old string and
watching it fail, which is this repo's standing rule for a new gate.

### Phase 2 — the schema

| ID | Task | Notes |
|----|------|-------|
| P2.1 | **Migration `045`** — `brand_kits` gains `website_url`, `industry`, `description`, `target_audience`, `city`. CHECK constraints mirroring the Zod caps exactly. Follow `044` line for line: constrain the shape, revoke what nothing uses, prove every probe **as the `authenticated` role** inside the transaction, refuse to commit on any probe that cannot reach a verdict. Also confirm whether `022` grants `authenticated` column-level UPDATE on `profiles.onboarding_step`; if not, add it here (P3.3 needs it). | Owner authorised applying to the LIVE database end to end: rehearse with `ROLLBACK`, apply, re-probe independently. |
| P2.2 | One shared brand-kit Zod schema used by POST **and** PATCH, carrying the five new fields. Widen `GET`/`POST`/`PATCH` payloads and the brand-kit form. | POST and PATCH diverged once before (`.optional()` vs `.nullable()`) and the result was a dialog that silently never saved. One schema, both routes. |

`brand_kits` is **not** the `projects` case: it still holds `INSERT/UPDATE/DELETE` for
`authenticated` (that is why `044` exists at all), so these CHECKs are the *only* thing
bounding the new columns on the PostgREST path. Get them exactly right.

### Phase 3 — extraction (n8n + Apify)

| ID | Task | Notes |
|----|------|-------|
| P3.1 | **The n8n workflow.** Webhook → normalise and validate the URL → `apify/website-content-crawler` (browser mode, `saveHtml`) → Code node extracting palette, fonts, logo and OG/meta → LLM structuring pass through the workflow's own model → return ONE JSON matching the P3.2 contract. Model the shape on `PyramediaX — Instant Audit` (id `fBioDT9mTRkYRhBl`), which is already a validate-then-call-external-service-then-return-structured-JSON webhook in this same n8n instance. | Palette and fonts are OURS to extract — Apify does not return them. |
| P3.2 | **App side:** `POST /api/brand-kits/extract`. Authenticated, throttled through migration 039's atomic RPC (fails CLOSED), bounded on time and response size, returns the draft. It calls one fixed n8n webhook URL from env — never a customer-supplied host, which is the whole point of D3. | A registered error code with copy in both locales, per the `studio-error-codes` invariant. |
| P3.3 | **Onboarding's new first step:** ask for the website URL, skippable in one click; extract; show an **editable draft**, never save silently; on save write the `brand_kits` row. Fold in the `onboarding_step` fix (write the step to `profiles.onboarding_step`, which is read by `ProfileCompletion.tsx:23` and written by nothing today). Keep the five existing tour cards. | The skip path and the fetch-failure path must BOTH end at a usable brand kit. `middleware.ts:314-318` makes a dead end here a lockout from the entire product. |

### Phase 4 — the payoff

| ID | Task | Notes |
|----|------|-------|
| P4.1 | `buildBrandContextBlock()` — one sanitised block carrying industry, description, target audience and city into the prompt builders. Six builders already receive `brandKit`; this extends what that object says rather than adding new plumbing. | Must live in `lib/ai/prompts/` under an interface named `*PromptInput`, or the `prompt-builder-sanitized` invariant stops covering it. Interpolate only `safe*` identifiers. |
| P4.2 | `plan` and `analysis` receive the brand kit (they do not today) and prefill from it, so `industry`, `businessName`, `description` and `targetMarket` stop being retyped every session. Photoshoot defaults to the `food` environment when the kit's industry is `restaurant`. | This is the item that closes the original review's finding #8 and delivers D2's whole point. |

### Deferred, with the reason

| Item | Why not now |
|------|-------------|
| Arabic font in the Docker runtime image (`brand-dna` 1c) | The **model** draws the Arabic a customer asks for, not us. The font governs server-side compositing (watermark), which is Latin today and works. Real hardening, no current consumer. |
| Second layer on the prompt guard (`brand-dna` §5) | §2A measured every JS/TS candidate and found none trustworthy — `llm-guard` is hobby-scale at 5k downloads/mo, `rebuff` was abandoned in 2023. So this is "write a judge prompt", not "install a library", and it needs its own fail-posture decision. |
| Pyra as an agent (`brand-dna` §6) | Three blockers still true in today's code, and three product questions unanswered since 2026-08-12. The quote-only planner is the right first step and is cheap, but it should follow the three answers, not precede them. |
| Brandfetch ($99/mo, 100 brands) | A founder decision, not an engineering one. Recorded so the option is not rediscovered. Re-price it if P3.1's measured extraction quality is poor. |

---

## Carried findings — resolve at the final review

| From | Finding | Status |
|------|---------|--------|
| P0.1 review | `plan.ts` / `analysis.ts` still emit `- Industry: ${resolvedIndustry \|\| safeIndustry}`, so an unrecognised free-text industry still reaches the model on the fact line. **Plan-mandated** — the brief specified that fallback verbatim. In practice the shipped UI can now only submit the 7 slugs; reachable only by direct API call. **Clean fix available in P2.2/P4.2: tighten both route schemas from `z.string()` to `z.enum(INDUSTRIES)`.** | open |
| P0.1 review | `plan.industries` and `analysis.industries` carry different wording for identical slugs. Cosmetic; reconcile into one namespace if a third studio adopts the list. | open |
| P0.1 review | `prompt-builder-sanitized` only flags **bare reuse of an interface field name**, not absence of a `safe*` prefix — so a derived variable escapes it regardless of naming. Pre-existing gap in the invariant, not introduced here. | open |

---

## Definition of done

No task is done on a green build alone. This repo's own record: `tsc`, `eslint`, all 15
invariants and a clean production build were green while every English page in production
rendered right-to-left, and again while the Arabic landing page shipped with no analytics
tag at all.

- **P1.2** — a food prompt that names a food set and never asks for a product label, proved by the gate.
- **P1.3** — an Arabic string rendered correctly into a real image by the live model, seen.
- **P2.1** — migration probed as `authenticated` and re-probed independently after commit.
- **P3.1** — the workflow returns the full D4 contract for a real Arabic restaurant site.
- **P3.3** — a real signup completed three ways: with a website, with a skip, and with a site that fails to fetch. All three end at a usable brand kit.
- **P4.2** — a generation whose prompt provably carries the business facts, read back from `generations.input`.

---

## What we PORT from Open-Pomelli, and what we deliberately do not

Read from the source on 2026-08-25, not taken from the plan's summary:
`SamurAIGPT/Open-Pomelli` (MIT), `src/lib/brand-analyzer.ts`.

**How theirs actually works:** Playwright scrapes the site, the screenshot is uploaded
to MuAPI, `gpt-4-vision` reads it, and that is merged with **CSS-extracted colours,
fonts and logo** into an editable brand profile. Stack is Next 16 + SQLite/Prisma,
single-user, no auth, and **every AI call routes through one provider (MuAPI)**.

### PORT — these are the valuable parts

| What | Why it is worth taking |
|------|------------------------|
| The `BrandDNA` output shape | Verbatim: `brandName, industry, tagline, valueProposition, toneOfVoice[], brandPersonality[], targetAudience, keyMessages[], primaryColors[], secondaryColors[], fonts[], logoUrl, screenshotUrl, imageryStyle, layoutStyle`. Someone already thought about what a brand profile needs to carry. |
| The extraction prompt's discipline | "Extract the brand DNA as STRICT JSON only (no commentary, no markdown)", with **enumerated** options for categorical fields (`professional \| casual \| illustrated \| cinematic \| minimalist \| editorial`). A closed set is what makes the output usable downstream instead of free prose. |
| The **editable draft** decision | Their profile is editable, and so is ours. Extraction is a guess; presenting a guess as a fact on the customer's first screen is how you lose them. |
| **`node-vibrant`** (MIT, 3.1M downloads/mo) | A real drop-in for palette quantisation from the logo/hero image. Do not write a colour quantiser. |

### DO NOT IMPORT — and the reason is specific

`brand-analyzer.ts` is **welded to MuAPI and its own `scrapeSite()`**. Importing it would
drag a **second AI provider and a second router** into a codebase that already owns
`lib/ai/router.ts` (316 lines) plus `lib/ai/http.ts` deadlines and `isRetryable()` — built
in the 2026-08-24 round precisely because untimed, indiscriminately-retried provider calls
turned one image request into nine. Two routers with two retry policies is the exact drift
class this repo keeps paying for.

So: **take the shape and the prompt; write the call against our own router.**

### The mapping, concretely

| Open-Pomelli | Ours | Why ours differs |
|--------------|------|------------------|
| Playwright in-process | **Apify `website-content-crawler` via n8n** | Owner decision D3. Removes the SSRF surface from our container entirely and keeps Chromium out of the Coolify image. |
| MuAPI + `gpt-4-vision` | **Gemini via the n8n workflow's own credential** | No second provider in the app. |
| `scrapeSite()` CSS extraction | **Code node over Apify's returned HTML** | ⚠ The n8n Code sandbox has **no network access** — `fetch` is unavailable and fails at runtime. Palette and font extraction must work from the **inline** HTML/CSS Apify returns; we cannot follow `<link rel=stylesheet>`. This is the single biggest technical constraint on P3.1. |
| `screenshotUrl` | **dropped for now** | We have no screenshot in the crawler path and no vision call. Recorded rather than silently omitted. |

### Fields we keep vs drop, against owner decision D4

D4 asked for: colours, logo, fonts, business name, industry, description, target audience, city.

- **Kept and mapped:** `brandName`, `industry` (constrained to `lib/industries.ts`'s seven slugs, not free text), `primaryColors`/`secondaryColors`, `fonts`, `logoUrl`, `targetAudience`, plus `description` (their `valueProposition` + `tagline` collapsed) and `city` (**not in their shape — ours to add**, and it matters for a Gulf product).
- **Kept because they are cheap and feed `brand_voice`:** `toneOfVoice[]`, `brandPersonality[]`.
- **Dropped:** `screenshotUrl` (no screenshot), `imageryStyle`/`layoutStyle`/`keyMessages` (nothing in PyraSuite reads them today — adding columns nothing reads is the defect this repo already catalogued).
