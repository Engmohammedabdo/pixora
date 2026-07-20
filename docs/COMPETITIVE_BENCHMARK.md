# PyraSuite — Competitive Benchmark

> **Verification note (added by the orchestrator after the report was written).**
> I independently re-checked this report's headline claims against the source.
> Confirmed: the `placehold.co` landing demo, the missing `openGraph.images`
> alongside `twitter.card: 'summary_large_image'`, zero analytics/monitoring
> packages in `package.json`, and the absence of a public `/pricing` route.
>
> **One claim in this report is incorrect:** the `robots.txt` disallow rules do
> NOT "lack the locale prefix". `app/robots.ts` uses wildcard patterns such as
> `/*/dashboard/`, which correctly match `/ar/dashboard/` and `/en/dashboard/`.
> Private routes are blocked as intended. Disregard that item.
>
> **One claim is imprecise:** `components/landing/SocialProof.tsx` is not empty —
> it renders a titled section with feature blocks. The substance of the finding
> stands (there are no testimonials, customer logos, or usage numbers anywhere),
> but the section itself exists and is populated with value propositions.
>
> Font loading and the activity-payload leak referenced here were fixed before
> this report was finalised (commits efd38f8 and f4ec015).



**Date:** 2026-07-20
**Goal being tested:** "the best site for these services compared to similar ones."
**Method:** desk research on the competitive set (web) + direct reading of the PyraSuite codebase at
`C:\xampp\htdocs\Pyrasuite` + live measurement of `https://pyrasuite.pyramedia.cloud`.
**Nothing in the repo was modified.** This document is the only file written.

---

## 0. Honesty notes about this research

So the owner can weight the findings correctly, here is exactly how solid each part is.

| Area | Confidence | Why |
|---|---|---|
| PyraSuite landing/SEO/perf/headers | **High** | Measured directly against the live production URL with `curl`, plus source files read. |
| PyraSuite error handling, refunds, pricing constants | **High** | Read the actual source files and the `messages/*.json` strings. |
| Predis.ai, AdCreative.ai, Simplified | **High** | Pricing pages fetched directly; credit tables and trust signals read verbatim. |
| Canva Magic Studio, Jasper, Copy.ai | **Medium** | Canva's own pricing page returned a browser-compat stub; figures come from secondary sources and Canva Help Center summaries. |
| Creatopy | **Low — not verified** | `creatopy.com/pricing` 301-redirects to `thebrief.ai`. I did not complete a fetch of the successor page. **Treat Creatopy as unresearched.** |
| Araby.AI | **Low — not verified** | `araby.ai/pricing` returned only a page title; no pricing, no tiers, no trust signals retrievable. |
| Adly AI, Makeen AI, Sahl AI | **Low–Medium** | Positioning confirmed from search results and vendor blurbs; `getadly.com/pricing` 404'd. **No verified pricing for any Arabic-market competitor.** |
| PyraSuite Core Web Vitals (real LCP/INP/CLS) | **Not measured** | No Lighthouse/CrUX run was performed. Payload, TTFB and render-blocking chain were measured as proxies. Scorecard rows say so. |
| PyraSuite WCAG AA contrast | **Not re-verified** | Reported as already fixed; I checked structural a11y (lang/dir, skip link, headings, alt) instead. |

**Biggest gap in this research:** the actual Arabic/MENA competitive set — the market PyraSuite is
really fighting in — is the part I could verify least. Adly AI and Makeen AI are the two names that
matter most and I could not retrieve their pricing or feature depth. Someone should sign up for both
and redo that section properly.

---

## 1. Competitive set summary

### 1.1 AdCreative.ai — the ad-creative category leader

- **Pricing:** 3 published tiers, roughly **$39 / $249 / $599 per month**, carrying **10 / 100 / 500
  credits**. ~40% discount on annual.
- **The metering idea worth stealing:** *generation is unlimited; a credit is only consumed when you
  **download** a creative.* Users browse dozens of options and pay only for what they keep.
- **Free tier:** 7-day trial with 10 credits. Marketing on the homepage says "no credit card
  required"; several third-party pricing round-ups say a card *is* required to activate. I could not
  reconcile these two claims — flagging rather than picking one.
- **Trust signals (dense):** 11+ named brand logos (Snap Inc., Durex, Philips, Häagen-Dazs, BNP
  Paribas), "4,200,000+ users", four G2 badges (Leader / Best Results / Best Usability / Momentum
  Leader, Winter 2024), Trustpilot testimonials, Google Premier Partner certification.
- **Activation promise:** "Create ads in 60 seconds", "3 easy steps".
- **No interactive pre-signup demo** — static screenshots only. PyraSuite is not behind here, but see
  §3 Gap 1: PyraSuite's demo is worse than having none.

### 1.2 Predis.ai — best-in-class credit transparency

- **Pricing:** **$19 / $40 / $212 per month**; **1,300 / 3,200 / 10,000 credits**; 40–50% off annual.
- **Published credit table, on the pricing page:** social post or ad creative = **15 credits**;
  standard video = **200 credits per 8s**; faceless video = **5 credits per 10s**; multi-slide post =
  **15 credits per slide**. They also translate credits into outcomes on the tier card itself
  ("~86 images, ~9 videos").
- **Quota rules stated publicly:** credits do **not** roll over; a Fair Use Policy may throttle heavy
  usage; **"All payments are non-refundable, but you can cancel anytime."** Blunt, but stated.
- **Trust:** "6.5M+ users"; Semrush, Yamaha, Accenture, Uber, Vodafone, PepsiCo, Ford logos.
- **Feature PyraSuite lacks entirely:** direct **publishing and scheduling** to Instagram, LinkedIn,
  Facebook, Pinterest, X, YouTube Shorts, Google Business, TikTok — plus auto-post quotas per tier.
- **Activation:** free trial with no card, plus a free-forever tier; reported ~2-minute setup.

### 1.3 Simplified — outcome-based metering

- **Pricing:** **$59 / $119 / $239 monthly** (annual $79 / $99 / $199 per the page as fetched — the
  Starter annual figure reading higher than monthly looks like a page error on their side).
- **Metering by outcome, not tokens:** the unit is a **"campaign" = one brief-to-approval cycle**,
  producing one output type (6-post social batch, 3–5 email sequence, or a 3-variant ad set).
  Overage is a flat **$10 per extra campaign** on every plan.
- **Trial contents are itemised:** 5 campaigns, 100K AI words, 100 AI designs, 50 AI videos,
  7 social accounts, 5 GB storage, 1 brand kit.
- **Trust:** "15 million+ active users", **G2 4.6/5 from 5,008+ reviews**.

### 1.4 Canva Magic Studio — best-in-class quota exhaustion UX

- Free plan: **50 Magic Studio AI credits per month**, shared across AI features, resetting on the
  1st at 00:00 UTC. Video generation is separately capped (reported as 5 lifetime credits on free).
- **When a paid user exhausts AI quota, Canva does not hard-stop.** Standard and Premium AI tools
  fall back to **short pauses between generations**; only Ultra tools become unavailable until reset.
- No à la carte top-ups; instead an **"AI Pass"** monthly add-on multiplies the allowance.
- This is the single best pattern in the set for "running out doesn't feel like a wall".

### 1.5 Jasper and Copy.ai — the transparency contrast

- **Jasper:** no free-forever tier; **7-day trial on the Pro plan, no credit card**. Notably, Jasper
  does **not** publicly display the exact monthly price — you start a trial to see it. This is worse
  transparency than PyraSuite.
- **Copy.ai:** **permanent free plan, 2,000 words/month, 90+ templates, no credit card.** Workflow
  credits are 1 credit = 1 workflow run. Clean, honest, and the closest analogue to PyraSuite's
  25-credits-a-month free tier.

### 1.6 Refund-on-failure practice across the AI-credit category

- **Ideogram:** subscription payments non-refundable; no credit for partially used periods.
- **Leonardo.ai:** refunds assessed manually by a human agent via chat; there are public complaints
  about credits consumed by generations their own safety system blocked. I found **no vendor in the
  set that documents automatic credit refunds on failed generations.**
- **This is the clearest place PyraSuite is ahead of the entire category.** See §2 and §4.

### 1.7 The Arabic / MENA set — PyraSuite's real market

Verified to exist and to be Arabic-first; pricing and depth **not verified**:

| Product | Positioning (as claimed publicly) |
|---|---|
| **Adly AI** (`getadly.com`) | Saudi-focused. Arabic-first ad copy, social visuals, short-form video ads — **and publishes them directly to connected channels.** The most direct threat. |
| **Makeen AI** (`makeen-ai.com`) | Multi-tenant B2B SaaS **for MENA marketing agencies**: Arabic-first content, "brand DNA" alignment, **client approval workflows**. Owns the agency segment PyraSuite's Business/Agency tiers target. |
| **Araby.AI** | Arabic-first general generative-AI toolbox for MENA. |
| **Sahl AI** | Arabic social-media content generation. |
| **Jasper** | Reported to have shipped an Arabic-market version with Gulf-dialect handling and ready-made Snapchat/TikTok ad templates. If true, PyraSuite's "first Arabic platform" claim is under pressure. |

**Market context that matters commercially (verified):** in Saudi Arabia **mada carries roughly 93%
of card payments**; Apple Pay is preferred by ~36% of online shoppers; STC Pay has 20M+ users;
BNPL (Tabby/Tamara) accounts for ~35–40% of checkouts; VAT is 15%. PyraSuite bills in USD via
Stripe cards only.

---

## 2. Scorecard

Every row is PASS/FAIL or a number. "Best-in-class" names the vendor that sets the bar.

### 2.1 Onboarding and activation

| # | Criterion | PyraSuite | Best-in-class | Verdict |
|---|---|---|---|---|
| 1 | Free tier exists and is permanent (not a trial) | **PASS** — 25 credits/month, recurring | Copy.ai (permanent free) | **PASS — ahead of AdCreative, Jasper, Simplified** |
| 2 | Free tier usable with **no credit card** | **PASS** — Stripe is only touched at `/api/stripe/create-checkout` | Copy.ai, Jasper, Predis | **PASS** |
| 3 | A prospect can see real product output **before** signing up | **FAIL** — `components/landing/InteractiveDemo.tsx` renders 4 hard-coded `placehold.co` grey boxes behind a fake 600 ms spinner | Nobody in the set does a true live demo; Predis/AdCreative show real generated samples | **FAIL — and actively harmful (see Gap 1)** |
| 4 | Public gallery of real generated work | **FAIL** — `/ar/portfolio` and `/ar/community` both 307 → `/ar/login` | Leonardo/Ideogram public feeds | **FAIL** |
| 5 | Stated time-to-first-asset on the landing page | **Not stated** | AdCreative: "ads in 60 seconds"; Predis: ~2-min setup | **FAIL** |
| 6 | Onboarding grants starter credits | **PASS** — `supabase/migrations/027_onboarding_bonus.sql` | — | **PASS** |
| 7 | Signup → first asset without leaving the product | Requires signup + onboarding + studio navigation. **I did not complete an end-to-end click count** (would need a live account). | AdCreative claims 3 steps | **UNVERIFIED — do not claim either way** |

### 2.2 Pricing transparency

| # | Criterion | PyraSuite | Best-in-class | Verdict |
|---|---|---|---|---|
| 8 | Prices published publicly without signup | **PASS** — `components/landing/PricingSection.tsx` renders on `/ar` | Predis | **PASS — ahead of Jasper**, which hides price behind a trial |
| 9 | A **dedicated, linkable, indexable `/pricing` URL** exists | **FAIL** — `https://pyrasuite.pyramedia.cloud/ar/pricing` returns **307 → `/ar/login`**. Pricing is an anchor on the landing page only. | Every competitor has one | **FAIL** |
| 10 | Public per-action credit cost table ("1 image = N credits") | **FAIL** — costs live in `lib/credits/costs.ts` and `lib/credits/voiceover-costs.ts`, shown only after login | **Predis** publishes the full table on the pricing page | **FAIL — and the README explicitly promises this: "تعرف بالضبط كم بتدفع قبل ما تضغط"** |
| 11 | Credits translated into outcomes on the plan card ("~86 images") | **FAIL** — plan cards show raw credit counts | Predis | **FAIL** |
| 12 | Annual billing option with a stated discount | **FAIL** — `lib/stripe/plans.ts` defines monthly price IDs only; no annual toggle | AdCreative 40%, Predis 40–50%, Simplified ~17–26% | **FAIL — leaves cash and retention on the table** |
| 13 | Promo/coupon codes supported at checkout | **FAIL** — `app/api/stripe/create-checkout/route.ts` does not set `allow_promotion_codes` | Industry standard | **FAIL** |
| 14 | Local currency (SAR/AED/EGP) offered | **FAIL** — USD only | — | **FAIL for an Arabic-first product** |
| 15 | Local payment methods (mada, Apple Pay, STC Pay, Tabby/Tamara) | **FAIL** — no `payment_method_types` configured; card-only Checkout | Saudi PSPs (Moyasar, HyperPay, Tap) | **FAIL — mada is ~93% of KSA card payments** |
| 16 | VAT / tax handling | **FAIL** — no `automatic_tax`, no `tax_id_collection`, no `billing_address_collection` in `create-checkout/route.ts` | Stripe Tax is one flag | **FAIL — KSA VAT is 15%** |
| 17 | Rollover / expiry rules stated publicly | **Partially** — README states purchased credits last 12 months and Pro+ rolls 20%; **not confirmed as visible on the public pricing section** | Predis states "no rollover" plainly | **PARTIAL** |
| 18 | Refund / money-back policy stated on the pricing surface | **Not found on the landing page** | Predis states non-refundable explicitly | **FAIL — say something, even "no refunds"** |

### 2.3 Generation experience

| # | Criterion | PyraSuite | Best-in-class | Verdict |
|---|---|---|---|---|
| 19 | Credit cost of an action shown **before** the user commits | **PASS** — cost-before-generate gating is implemented and wired to a live balance read | Canva shows a credit counter | **PASS** |
| 20 | Credit reservation before the model call (no double-spend, no race) | **PASS** — `reserve_credits` RPC, migrations `017`/`018` | Not documented by any competitor | **PASS — ahead of category** |
| 21 | You pay only for results you keep | **FAIL** — credits are reserved/charged per attempt | **AdCreative** — credits burn only on download | **FAIL — biggest metering idea PyraSuite is missing** |
| 22 | Direct publish/schedule to social channels | **FAIL** — grep across `app/` finds platform names only as form selectors in `storyboard` and `campaign`; no OAuth, no scheduler, no `social_accounts` table in migrations 001–027 | Predis (8 networks), Adly AI | **FAIL — largest feature gap vs the MENA set** |
| 23 | Batch/bulk export | **PASS** — `app/api/assets/export` (ZIP) + PDF export | — | **PASS** |
| 24 | Brand consistency automation | **PASS** — brand kits auto-applied | Predis "brand voice", Makeen "brand DNA" | **PASS (parity)** |

### 2.4 Error and limit handling

| # | Criterion | PyraSuite | Best-in-class | Verdict |
|---|---|---|---|---|
| 25 | Distinct, localised messages per failure mode | **PASS — 17 codes**, full AR + EN parity, verified in `messages/ar.json` / `en.json` under `studio.errors` | Nobody in the set does this well | **PASS — clearly ahead** |
| 26 | Messages are **actionable** (say what to do next) | **PASS** — e.g. `rate_limited`: "طلبات كثيرة خلال وقت قصير — انتظر دقيقة وحاول مجدداً" / "wait a minute and try again"; `insufficient_credits` points at Billing | — | **PASS** |
| 27 | **Credits refunded when a generation fails after deduction** | **PASS** — `refund_credits` present in **all 8** generating routes (`creator`, `photoshoot`, `edit`, `campaign`, `voiceover`, `storyboard`, `analysis`, `plan`), backed by `supabase/migrations/019_fix_refund_credits.sql` | **No competitor documents this.** Ideogram: non-refundable. Leonardo: manual human review. | **PASS — best in the entire category** |
| 28 | Running out of credits opens a purchase path, not a dead end | **PASS** — `getGatedUpgradeVariant()` in `lib/studio-errors.ts` routes 4 codes (insufficient credits, resolution, voice, dialect) to `UpgradePrompt` with a working Billing CTA, and suppresses the modal while the balance read is unresolved | Canva (soft throttle) | **PASS** |
| 29 | Exhausted quota degrades gracefully rather than hard-stopping | **FAIL** — hard stop + upsell | **Canva** — short pauses between generations, tools stay usable | **FAIL (nice-to-have, not urgent)** |
| 30 | Rate-limit message states when to retry | **PASS** — "wait a minute" | — | **PASS** |

### 2.5 Trust and credibility

| # | Criterion | PyraSuite | Best-in-class | Verdict |
|---|---|---|---|---|
| 31 | Testimonials on the landing page | **FAIL** — `components/landing/SocialProof.tsx` is misnamed: it renders 3 generic value cards (Rocket / Languages / LayoutGrid icons) plus a trust sentence. **Zero testimonials.** | AdCreative (Trustpilot quotes) | **FAIL** |
| 32 | Customer logos | **FAIL** — none | AdCreative: Snap, Philips, BNP Paribas | **FAIL** |
| 33 | Third-party review score | **FAIL** — no G2/Trustpilot/Capterra presence found | Simplified: **G2 4.6 from 5,008 reviews** | **FAIL** |
| 34 | Traction numbers | **FAIL** — `StatsSection.tsx` counters are product facts (9 studios, 25 credits, 5 plans), not traction | AdCreative 4.2M users; Simplified 15M | **HONEST FAIL** — fabricating numbers would be worse; the fix is real proof, not fake proof |
| 35 | Real sample outputs shown anywhere public | **FAIL** — the only public image on `/ar` is `placehold.co/600x600?text=Specialty+Coffee` | All competitors | **FAIL** |
| 36 | Privacy policy publicly reachable | **PASS** — `/ar/privacy` returns 200 without auth | — | **PASS** |
| 37 | Terms publicly reachable | **PASS** — `/ar/terms` returns 200 without auth | — | **PASS** |
| 38 | Legal pages rendered in a public chrome, not the app shell | **FAIL** — both render inside the dashboard layout (studio sidebar visible in the HTML) and neither is in the sitemap | — | **FAIL (cosmetic but reads as unfinished)** |
| 39 | Security / compliance page (SOC 2, GDPR, DPA, subprocessors) | **FAIL** — no such route under `app/[locale]` | Enterprise SaaS norm | **FAIL — blocks agency/enterprise deals** |
| 40 | Status page | **FAIL** — `/api/health` exists but returns `{"success":false,"error":"unauthorized"}`; no public status surface | — | **FAIL** |
| 41 | Named human / company identity, address, support contact | **Not found on the landing page** beyond a Pyramedia credit | — | **FAIL** |
| 42 | FAQ | **PASS — 8 questions** (`faq.q1`–`q8` in `messages/ar.json`) | — | **PASS** |
| 43 | Blog / docs / help centre / changelog | **FAIL** — no such route in `app/` | Every competitor | **FAIL — also the cheapest Arabic SEO channel available** |

### 2.6 i18n and localisation

| # | Criterion | PyraSuite | Best-in-class | Verdict |
|---|---|---|---|---|
| 44 | `<html lang>` and `dir` correct per locale | **PASS** — `/ar` → `lang="ar" dir="rtl"`; `/en` → `lang="en" dir="ltr"` (verified live) | — | **PASS** |
| 45 | hreflang alternates served | **PASS** — via HTTP `Link:` header carrying `ar`, `en`, `x-default` (verified live). Not in the HTML `<head>`, but valid for Google. | — | **PASS** |
| 46 | Full AR/EN string parity | **PASS** — spot-checked `studio.errors`: all 17 codes present in both files | — | **PASS** |
| 47 | RTL-first component conventions | **PASS** — enforced by project rules; `dir="rtl"` confirmed live | — | **PASS** |
| 48 | Arabic-market payment/currency localisation | **FAIL** — see rows 14–16 | — | **FAIL — the localisation that actually converts is the missing one** |
| 49 | Marketing copy consistent with the Pyra persona rule | **FAIL (minor)** — the live `<meta name="description">` on `/ar` says **"نماذج AI متعددة"** ("multiple AI models"), which contradicts `CLAUDE.md`'s rule to present one persona | — | **FAIL (trivial fix)** |

### 2.7 Accessibility

| # | Criterion | PyraSuite | Verdict |
|---|---|---|---|
| 50 | Skip-to-content link present | **PASS** — "تخطي" link found in live HTML | **PASS** |
| 51 | Exactly one `<h1>` on the landing page | **PASS — 1** | **PASS** |
| 52 | All `<img>` have `alt` | **PASS — 0 of 1 images missing alt** | **PASS** |
| 53 | Reduced-motion respected in animated counters | **PASS** — `StatsSection.tsx` checks `prefers-reduced-motion` and snaps to the final value | **PASS** |
| 54 | WCAG AA contrast, both themes | **Reported fixed; not re-verified in this pass** | **UNVERIFIED** |

Structural accessibility is genuinely good and better than most marketing sites in this category.

### 2.8 Performance

Measured live, 2026-07-20. **Real Core Web Vitals were not measured** — no Lighthouse or CrUX run.
These are payload and network proxies.

| # | Criterion | PyraSuite (measured) | Verdict |
|---|---|---|---|
| 55 | TTFB on `/ar` | **0.35–0.40 s** across 3 runs | **PASS** |
| 56 | HTML transfer size | **28 KB** compressed (129 KB raw) | **PASS** |
| 57 | JS transfer on the landing page | **235 KB** br/gzip across 14 chunks (750 KB raw) | **MARGINAL** — two ~173 KB raw chunks dominate; framer-motion is loaded for a marketing page |
| 58 | CSS | 73 KB | **PASS** |
| 59 | Third-party font requests | **0 — already addressed** (fonts migrated to `next/font` self-hosting, commit `efd38f8`). The previous `@import url(fonts.googleapis.com)` inside the CSS bundle created a 3-hop blocking chain; that is gone. | **PASS (fixed)** |
| 60 | Public landing page is cacheable at the edge | **FAIL** — response header is `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` on the **public** marketing page. Every visit is a full origin render; no CDN or browser reuse. | **FAIL — single cheapest perf win available** |
| 61 | LCP image is optimised | **FAIL** — the hero/demo image is an external `placehold.co` URL rendered with `unoptimized` (`InteractiveDemo.tsx:111`) | **FAIL** |
| 62 | Security headers | **PASS** — CSP with `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`; HSTS `max-age=63072000; includeSubDomains; preload`; `X-Frame-Options: DENY`; `nosniff`; Permissions-Policy. `script-src` still carries `'unsafe-inline' 'unsafe-eval'` (Next.js default). | **PASS — strong** |

### 2.9 SEO and measurability

| # | Criterion | PyraSuite | Verdict |
|---|---|---|---|
| 63 | Sitemap covers all public pages | **FAIL — 6 URLs only**: `/ar`, `/en`, and the 4 login/signup pages. Missing pricing, privacy, terms. | **FAIL** |
| 64 | `robots.txt` disallows actually match real paths | **FAIL** — live file disallows `/api/`, `/dashboard/`, `/onboarding/`, but real routes are `/ar/dashboard`, `/ar/onboarding`. **The rules block nothing.** (A static `public/robots.txt` appears to be winning over any generated one.) | **FAIL** |
| 65 | JSON-LD structured data | **FAIL — 0 blocks** on `/ar`. No `Organization`, `SoftwareApplication`, `Product`/`Offer`, or `FAQPage` — despite having 8 FAQs and 5 priced plans ready to mark up. | **FAIL — free rich-result eligibility being left on the floor** |
| 66 | `og:image` present | **FAIL** — `og:title`, `og:description`, `og:locale`, `og:type` present; **no `og:image`** — while `twitter:card` is set to `summary_large_image`. Every WhatsApp/X/LinkedIn share renders a blank card. | **FAIL — worst possible combination for a share-driven Arabic market** |
| 67 | Canonical URL | **FAIL** — no `<link rel="canonical">` found in the live HTML | **FAIL** |
| 68 | Product analytics installed | **FAIL** — no `gtag`, GTM, PostHog, Plausible, Clarity, Hotjar or Umami in the live HTML; none in `package.json` | **FAIL** |
| 69 | Error monitoring installed | **FAIL** — no Sentry or equivalent in `package.json` | **FAIL — you cannot see failed generations in production** |

**Scorecard total: 69 criteria — 27 PASS, 34 FAIL, 3 PARTIAL/UNVERIFIED, 5 informational.**
The engine and the money-safety layer are strong. The *shopfront* and the *measurement* are weak.

---

## 3. Ranked gap list

Ranked by (impact on winning a customer) × (implementation cost). Effort: **S** ≤ half a day,
**M** ≈ 1–3 days, **L** ≈ a week or more.

### Tier 1 — high impact, low cost. Do these first.

**Gap 1 — The one place a prospect can judge quality shows fake grey placeholders. (S)**
- *Competitors:* AdCreative and Predis both put real generated creatives on the homepage.
- *PyraSuite:* `components/landing/InteractiveDemo.tsx:11–16` hard-codes four
  `https://placehold.co/600x600/...?text=Specialty+Coffee` URLs, and `handleSelect()` fires a
  **600 ms fake spinner** (`SWITCH_DELAY_MS`) before swapping to a grey box. A visitor sees "بايرا
  تشتغل…" and is rewarded with a placeholder. The section is titled as a demo. This is worse than
  having no demo — it reads as a broken or dishonest product and it is the hero visual.
  It is already logged in `docs/DESIGN_REVIEW.md` item 6 and is still live in production.
- *Files:* `components/landing/InteractiveDemo.tsx`; remove `placehold.co` from
  `next.config.ts:15` and from the CSP `img-src` at `next.config.ts:38` once done.
- *Fix:* generate 4 real outputs, commit them to `/public`, serve via optimised `next/image`.

**Gap 2 — No `og:image`, while `twitter:card` claims `summary_large_image`. (S)**
- Every share of pyrasuite.pyramedia.cloud on WhatsApp, X or LinkedIn renders an empty card. In a
  market where WhatsApp forwarding is a primary distribution channel this is a direct traffic tax.
- *Files:* `app/[locale]/layout.tsx` (or the landing page's `metadata`), plus an OG asset in `/public`.

**Gap 3 — Public marketing page is served `no-store`. (S)**
- *PyraSuite:* `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` on `/ar`.
  A blanket auth-oriented cache header is being applied to the public landing page, so it can never
  be cached by a CDN or a returning visitor's browser.
- *Files:* `middleware.ts` and/or the `headers()` block in `next.config.ts` — scope the private
  cache policy to `/(dashboard)` routes and let the landing page be `s-maxage`-cacheable.

**Gap 4 — `robots.txt` rules match nothing; sitemap covers 6 URLs. (S)**
- Disallows are `/dashboard/` and `/onboarding/` but the real paths are locale-prefixed
  (`/ar/dashboard`). Private routes are technically crawlable; meanwhile pricing/privacy/terms are
  absent from the sitemap.
- *Files:* the static `public/robots.txt` (which is overriding any generated one) and `app/sitemap.ts`.

**Gap 5 — Zero analytics and zero error monitoring. (S)**
- *PyraSuite:* nothing in `package.json`, nothing in the live HTML. You cannot currently answer
  "how many signups converted?", "which studio fails most?", or "did the fix work?" — which means
  every other item on this list is being prioritised blind.
- *Files:* `package.json`, `app/[locale]/layout.tsx`, `next.config.ts` CSP `connect-src`.
- *Note:* choose an EU/self-hosted option (Plausible/Umami + self-hosted Sentry) so this doesn't
  become a privacy liability in the same breath.

**Gap 6 — Landing meta description breaks the Pyra persona rule. (S)**
- Live `/ar` description contains "نماذج AI متعددة" ("multiple AI models"), directly against
  `CLAUDE.md`. Trivial, but it's the first sentence Google shows.
- *Files:* the `metadata` export for the landing route.

### Tier 2 — high impact, medium cost.

**Gap 7 — No public per-action credit cost table, and no dedicated `/pricing` page. (M)**
- *Competitors:* Predis publishes "social post = 15 credits, video = 200 credits/8s" on the pricing
  page and converts credits into "~86 images" on the tier card.
- *PyraSuite:* `/ar/pricing` **307-redirects to login**. Costs exist only in `lib/credits/costs.ts`
  and `lib/credits/voiceover-costs.ts`, visible after signup. Meanwhile the README's headline
  differentiator is "الأسعار غامضة → نظام كريدت شفاف… تعرف بالضبط كم بتدفع قبل ما تضغط". **The
  product's stated differentiator is invisible to anyone who hasn't already signed up.**
- *Files:* new `app/[locale]/pricing/page.tsx` (public, outside the dashboard group);
  `components/landing/PricingSection.tsx`; `app/sitemap.ts`; middleware matcher so it isn't gated.
- *Bonus:* a public credit table is exactly the kind of page that ranks for Arabic long-tail queries.

**Gap 8 — No annual billing, no promo codes. (M)**
- Every competitor discounts annual 17–50%. `lib/stripe/plans.ts` carries monthly price IDs only,
  and `app/api/stripe/create-checkout/route.ts` never sets `allow_promotion_codes`. This costs
  cash upfront, hurts retention, and makes launch/referral promotions impossible.
- *Files:* `lib/stripe/plans.ts`, `app/api/stripe/create-checkout/route.ts`,
  `components/landing/PricingSection.tsx`, plus new Stripe price objects.

**Gap 9 — Zero social proof on a site whose competitors are drowning in it. (M)**
- *Competitors:* Simplified shows G2 4.6/5,008 reviews; AdCreative shows 4.2M users, four G2 badges
  and eleven brand logos.
- *PyraSuite:* `components/landing/SocialProof.tsx` contains **no social proof at all** — three
  generic icon cards. `StatsSection.tsx` counts product facts, not customers.
- *Honest framing:* the fix is **not** inventing numbers. It is (a) getting 5–10 real early users to
  give a named quote, (b) opening the existing `/portfolio` and `/community` routes to the public as
  a real-work gallery, (c) claiming a Product Hunt / G2 / Capterra listing to earn a real score.
- *Files:* `components/landing/SocialProof.tsx`, and un-gating
  `app/[locale]/(dashboard)/portfolio` + `community` (they already exist — this is the cheapest
  credible proof available, and it doubles as indexable Arabic content).

**Gap 10 — Saudi payment reality: USD cards only. (M–L)**
- *Market:* mada ≈ **93%** of KSA card payments; Apple Pay ~36% of online shoppers; STC Pay 20M+
  users; BNPL ~35–40% of checkouts; VAT 15%.
- *PyraSuite:* Stripe Checkout, USD, no `payment_method_types`, no `automatic_tax`, no
  `billing_address_collection`, no SAR pricing.
- *This is the highest-revenue item on the list and the one most specific to PyraSuite's actual
  market.* A product whose entire pitch is "Arabic-first" that cannot take the payment method 93% of
  its market uses has a localisation gap where it counts.
- *Files:* `app/api/stripe/create-checkout/route.ts`, `app/api/stripe/create-topup/route.ts`,
  `lib/stripe/plans.ts`, `lib/stripe/topups.ts`. Start with **Apple Pay + SAR presentment + Stripe
  Tax** (achievable on Stripe today, M); mada/STC Pay likely needs a local PSP (L).
- *Caveat:* I did not verify Stripe's current mada support for Saudi-domiciled subscription
  merchants. Confirm before scoping.

### Tier 3 — high impact, high cost. Roadmap decisions, not quick fixes.

**Gap 11 — No publishing or scheduling. (L)**
- Predis publishes to 8 networks with per-tier auto-post quotas; Adly AI publishes to connected
  channels; Simplified meters by campaign because it owns the whole cycle. PyraSuite generates
  assets and then hands the user a download — the workflow ends where the competitors' begins.
- No OAuth flow, no `social_accounts` table across migrations 001–027; platform names appear only as
  form selectors in `storyboard` and `campaign`.
- *Files:* new `app/api/social/*`, new migration, new scheduler UI.
- *Strategic note:* this is the difference between "an AI content tool" and "a marketing platform",
  and it's the thing the two most credible Arabic competitors already have.

**Gap 12 — Pay-per-attempt instead of pay-per-keep. (M–L)**
- AdCreative's model — unlimited generation, credits burn only on download — removes the fear that
  makes users hesitate before every click. PyraSuite reserves credits per attempt.
- *Files:* `lib/credits/reserve`+`deduct` flow, `supabase/migrations/017_reserve_credits.sql`, all 8
  studio routes, plus the asset download path.
- *Judgement:* commercially attractive, architecturally invasive, and real inference cost is borne
  per attempt regardless. A cheaper 80% version: make the **first generation of the day free** for
  free-tier users, or refund on explicit "discard".

**Gap 13 — No security/compliance page, no status page, no docs/blog/changelog. (M each)**
- Blocks agency and enterprise buyers (Makeen AI is going straight at that segment with client
  approval workflows). A `/security` page listing RLS, signed URLs, encryption, subprocessors and a
  DPA contact is a day's writing and unblocks conversations the product currently can't have.
- An Arabic blog is the cheapest organic acquisition channel available and there is none.
- *Files:* new public routes under `app/[locale]/`; `app/sitemap.ts`.

**Gap 14 — No JSON-LD. (S, listed here because impact is slower-burning)**
- 8 FAQs and 5 priced plans already exist as structured data waiting to be marked up as `FAQPage`,
  `SoftwareApplication` and `Offer`. Zero blocks on the live page.
- *Files:* landing route metadata / a JSON-LD component.

### Tier 4 — real but low priority

- **Gap 15 (S):** legal pages render inside the dashboard shell with the studio sidebar visible; move
  them to a public layout and add them to the sitemap.
- **Gap 16 (S):** no canonical URL on the landing page.
- **Gap 17 (M):** hard stop on quota exhaustion instead of Canva's graceful throttle.
- **Gap 18 (M):** 235 KB of JS on a marketing page; framer-motion is a large chunk of it. Consider
  lazy-loading motion below the fold.
- **Gap 19 (S):** no stated time-to-first-asset anywhere in the marketing copy, while AdCreative
  leads with "60 seconds".

---

## 4. Where PyraSuite already leads

These are real and should be defended, marketed, and in two cases *put on the pricing page* — right
now they are invisible to buyers.

1. **Automatic credit refunds on failed generations.** `refund_credits` is wired into all 8
   generating routes with `supabase/migrations/019_fix_refund_credits.sql` behind it. **No competitor
   I researched documents this** — Ideogram is explicitly non-refundable, Leonardo requires a human
   agent and has public complaints about credits burned by its own blocked generations. This is a
   headline-worthy promise ("لو بايرا فشلت، كريدتك يرجع تلقائياً") and it is currently buried in SQL.
2. **Credit reservation before the model call** (`reserve_credits`, migrations 017/018) — atomic,
   race-safe accounting. Nobody in the set advertises anything comparable.
3. **A permanent 25-credit/month free tier with no credit card.** Better than AdCreative (7-day
   trial), Jasper (7-day trial, no free tier, price not even public) and Simplified (trial).
   Comparable to Copy.ai. Under-marketed.
4. **17 distinct, localised, actionable error messages** with full AR/EN parity, plus a gated upgrade
   modal that suppresses itself while the balance read is unresolved (`lib/studio-errors.ts`). This
   is a level of error-state craft the competitive set does not approach.
5. **Cost shown before you commit**, tied to a live balance. Canva shows a counter; PyraSuite shows
   the price of the specific action. Ahead.
6. **Security posture.** Full CSP with `object-src 'none'` / `frame-ancestors 'none'` / `base-uri
   'self'`, 2-year HSTS with preload, `X-Frame-Options: DENY`, nosniff, Permissions-Policy, RLS on
   every table, signed URLs. Stronger than most Series-A SaaS. Also completely unadvertised — there
   is no `/security` page saying any of it.
7. **Structural accessibility and RTL correctness:** correct `lang`/`dir` per locale, hreflang via
   `Link` header, skip link, single `h1`, alt text, `prefers-reduced-motion` respected.
8. **Breadth for the price.** 9 studios at $12/month entry vs AdCreative at $39 and Simplified at
   $59. Genuinely competitive positioning — provided the outputs hold up, which this benchmark did
   not evaluate.
9. **Features the set mostly lacks:** referrals with abuse controls (migrations 023/026), projects,
   teams, gamification, a community/portfolio surface. The community and portfolio surfaces are
   locked behind login, which wastes them.

**The honest summary:** the engineering is ahead of the category on money-safety, error handling and
security. The marketing surface is behind almost everyone. PyraSuite is a good product wearing a
placeholder image and no analytics.

---

## 5. The five things to do next, in order

**1. Fix the shopfront. (1 day, S)**
Replace the four `placehold.co` boxes in `InteractiveDemo.tsx` with real generated Arabic-market
outputs; add an `og:image`; fix the meta description's "نماذج AI متعددة"; add a canonical tag. This
is the highest ratio of impact to hours anywhere in this document — right now the single most
prominent image on the site is a grey rectangle that says "Specialty Coffee", and every social share
is a blank card.

**2. Install analytics and error monitoring. (half a day, S)**
Plausible or Umami plus Sentry. Do it *before* the rest, because otherwise you will ship items 3–5
without knowing whether they worked. You currently cannot see a failed generation in production.

**3. Ship a public `/pricing` page with a real credit cost table. (2–3 days, M)**
`/ar/pricing` currently redirects to login. Publish the per-studio costs from `lib/credits/costs.ts`,
translate credits into outcomes the way Predis does ("200 credits ≈ 40 صورة"), state the rollover and
expiry rules, and state a refund position even if it's "no refunds on subscriptions". Add it and the
legal pages to the sitemap; fix the locale-prefix bug in `robots.txt`; add `FAQPage` and
`SoftwareApplication` JSON-LD while you're in the file. **Then put the automatic-refund-on-failure
promise on that page** — it is the strongest differentiator in the product and no buyer can currently
see it.

**4. Add annual billing, promo codes, SAR presentment, Apple Pay and Stripe Tax. (3–5 days, M)**
Direct revenue. Annual billing alone is 17–50% of upfront cash across the set and improves retention.
mada is ~93% of Saudi card payments — if Stripe cannot serve it for your entity, that is a
PSP decision worth making now rather than after launch. Verify Stripe's current mada support for
your merchant setup before committing scope.

**5. Build credible social proof from real material. (1 week, M)**
Un-gate the `/portfolio` and `/community` routes you already built into a public gallery of real
work; collect 5–10 named early-user quotes to replace the three generic cards in `SocialProof.tsx`;
claim a G2/Capterra/Product Hunt listing to earn a real score; write a `/security` page from the CSP,
RLS and signed-URL work already done. **Do not fabricate traction numbers** — the current honesty is
an asset, and a real gallery of Arabic marketing output is more persuasive to this market than a
"4M users" badge you haven't earned.

*Deferred deliberately:* social publishing/scheduling (Gap 11) is the largest strategic gap versus
Adly AI and Predis, but it is an L-sized roadmap decision, not a next-sprint item. Revisit once
items 1–5 have produced measurable funnel data.
