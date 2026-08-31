# Image Prompt Engineering — creator and campaign — Design

**Date:** 2026-08-31
**Status:** Approved for planning — **revised after a live baseline run**
**Scope owner:** `lib/ai/prompts/`, `app/api/studios/creator`, `app/api/studios/campaign`, the three image adapters

---

## 0. What the live run changed, and why this section is first

The first draft of this design was written from **reading code**. It named a
central defect — the customer's colloquial Arabic reaching the image model
unexpanded — and made an expansion layer the largest piece of work.

On 2026-08-31 that claim was **tested** for 20 credits against production, on a
Pro account, and it is **false**. Artifacts:
`.superpowers/live-runs/2026-08-31T09-35-51-970Z/`.

`creator_ar_raw` and `creator_en_brief` requested the same picture two ways and
differed in nothing else. Raw Arabic —
`عايز صورة لساندوتش شاورما تجيب جوع لمطعمي في دبي` — produced an ad-grade frame
that resolved **both** things a translation layer was supposed to add: it put a
recognisable Dubai skyline in the background (from `في دبي`) and framed the shot
hand-held and close for appetite appeal (from `تجيب جوع`). The hand-written
English brief, carrying an explicit lens, aperture, lighting and palette,
produced a **more generic** frame that lost the city entirely.

Three of the first draft's premises are therefore withdrawn:

| First draft claimed | Measured |
|---|---|
| Raw colloquial Arabic is a weak instruction; expansion is the biggest win | **Refuted.** It outperformed a hand-written English brief on the same subject |
| `style` as a bare slug tells the model nothing | **Refuted.** `bold` produced a coherent, dramatically different night scene |
| Every image outside `edit` is square | **Half wrong.** `campaign` is square; `creator` is *unpredictable* |

**The expansion layer is cut from this design.** Building it would have spent an
LLM call per generation to flatten the customer's own words into generic
photographic vocabulary — losing the context the customer supplied, which is the
one thing the model was already using well.

What the run **confirmed**, by eye rather than by inference:

- **Text containment in `creator` is absent and fails badly.** `creator_ar_signage`
  rendered the requested `شاورما الشام` perfectly — correctly joined, RTL, clean.
  It also invented garbled pseudo-Arabic and fake Latin across *every other
  surface in the frame*: the menu board, and the entire street of background shop
  signs. `creator`'s whole defence is one line (`creator.ts:95`).
- **`creator`'s output canvas is non-deterministic.** Four requests, identical
  `resolution: '2K'`, identical model and account:

  | Case | Frame | Ratio |
  |---|---|---|
  | `creator_ar_raw` | 2752×1536 | 1.79 |
  | `creator_en_brief` | 2752×1536 | 1.79 |
  | `creator_ar_bold` | **1696×2528** | **0.67** |
  | `creator_ar_signage` | **2848×1504** | **1.89** |

  Three different shapes across four requests. A customer generating a set of
  posts cannot know what they will get.
- **`campaign` is square for a platform it was explicitly told.** Both kept
  images are 1024×1024 with `platform: 'instagram'` in the request.

---

## 1. Scope

Rebuild the image-generation prompt path for the two studios that never received
the engineering `edit` and `photoshoot` did, and give both a real output canvas.

In scope, in priority order set by §0's measurements:

1. **A text-containment rule in `creator`** — the one defect confirmed by eye.
2. **A deterministic output canvas** for `creator` and `campaign`: `aspectRatio`
   support in the `gpt` and `flux` adapters, a platform field on `creator`, and
   the ratio passed on both routes.
3. The campaign route's inline image prompt — moved into a builder.
4. A small shared platform-framing module.
5. Removing the four dead lines `creator` sends on every request.

**Cut after measurement:** the Arabic-to-brief expansion layer, and the rich
per-style direction tables. See §0.

Not in scope:

- `edit.ts` and `photoshoot.ts`. Both are engineered, both were proved against
  real production generations, and neither is changed here.
- the text studios (`plan`, `analysis`, `storyboard`, campaign **copy**).
- the admin prompt-override paths, beyond keeping them working.

---

## 2. Current state, measured

### 2.1 The two studios are spec sheets, not briefs

| File | Lines | Shape |
|------|-------|-------|
| `lib/ai/prompts/edit.ts` | 847 | 14 presets, per-mode direction, text-containment rule, diacritics rule |
| `lib/ai/prompts/photoshoot.ts` | 576 | `SUBJECT` / `SHOT` / `SET` / `MUST` / `AVOID` / `BRAND`, seeded shot recipes |
| `lib/ai/prompts/creator.ts` | **103** | a bullet list |
| campaign image prompt | **~20, inline in the route** | a bullet list |

`creator` is the first studio in the product, costs 1–4 credits, and is where
every customer starts.

### 2.2 The customer's Arabic reaches the image model raw — and that is fine

There is no translation or expansion anywhere on the path: `router.ts`,
`gemini.ts` and `openai.ts` contain zero occurrences of `translat` or `Arabic`.
`creator.ts:54` emits the customer's sentence verbatim.

**This was the first draft's headline defect and the live run refuted it** (§0).
The observation is kept because the code fact is real and because the refutation
is worth more than the fix would have been: it is the reason an expansion layer
is not being built, and the reason nobody should propose one again without
re-running `creator_ar_raw` against `creator_en_brief` first.

The corollary matters for everything below: **the customer's own words are the
best signal in the prompt.** Any change here must pass them through intact
rather than translate, summarise or "improve" them.

### 2.3 Four dead lines in every creator generation

`app/api/studios/creator/route.ts:221-226` never passes `mood` or `platform` —
there are no such fields in `InputSchema`. So `buildCreatorPrompt`'s defaults
ship on every request:

```
- Mood: Professional               fixed, no source
- Platform: General                fixed, no source
- Resolution: 4K                   the model does not read pixel dimensions from prose
- Resolution optimized for general use
```

### 2.4 Style is a bare slug — and the model reads it anyway

`components/studios/creator/CreatorForm.tsx:47` offers four values —
`photographic`, `illustrative`, `minimalist`, `bold` — and `creator.ts:62`
emits `- Visual Style: bold`.

The first draft called this the `plan.ts` defect class ("20+ years of experience
in **the other industry**"): a slug spliced where a sentence belongs. **The live
run refuted it.** `creator_ar_bold` returned a coherent, dramatically different
night scene — dark, high-contrast, neon, portrait — against the same Arabic
subject that produced a warm daylight frame under `photographic`.

The two cases are not analogous, and the difference is worth stating because it
governs which slugs are worth expanding elsewhere: `plan.ts`'s failure was
**semantic** — it spliced an industry slug into a sentence that then asserted
something false about the persona. `bold` is a **stylistic adjective an image
model already grounds**. Slug-into-prose is only a defect when the prose makes a
claim; as a style token it is doing its job.

No style tables are being written.

### 2.5 The canvas: campaign is square, creator is unpredictable

`aspectRatio` exists on `ImageGenerationInput` (`router.ts:41`) and only `edit`
passes it. The router's own comment states the constraint:

> "If a text-to-image caller ever passes this, extend the gpt/flux adapters
> FIRST: an aspect ratio that is part of a paid spec being quietly ignored is
> exactly the defect class this file's other comments catalogue."

Adapter reality today:

| Adapter | Parameter | Current behaviour |
|---------|-----------|-------------------|
| gemini | `imageConfig.aspectRatio` + `imageSize` | forwards it when given one. **Omitted, it picks the shape itself** — measured, §0 |
| gpt | `size: "WxH"` | `openaiImageSize()` returns `1024x1024` / `1536x1536` / `2048x2048` — always square |
| flux | `width` / `height` | `sizeMap` returns square at all three resolutions |

So the two studios fail in **opposite** ways, and only one of them was predicted.
`campaign` is pinned to gemini and gets a square 1024×1024 for an Instagram
request. `creator` is also on gemini here but returns a shape the model chose
from prompt content — three ratios across four requests. Neither is the
customer's choice, and the second is not even repeatable.

An Instagram story generated by `campaign` is square. So is a story from
`creator`.

### 2.6 The campaign image prompt is outside the guard

`app/api/studios/campaign/route.ts:400-415` builds its image prompt inline. Its
own comment admits the consequence: `prompt-builder-sanitized` scans
`lib/ai/prompts` only, so this prompt is not covered by the invariant that exists
to cover exactly this.

---

## 3. Design

### 3.1 Module map

| Module | Status | Purpose |
|--------|--------|---------|
| `lib/ai/prompts/image-text-rule.ts` | new | The containment rule, in one place, for every text-to-image caller. |
| `lib/ai/prompts/platform-framing.ts` | new | Platform → aspect ratio and framing prose. No model call. |
| `lib/ai/prompts/creator.ts` | rewritten | Containment + framing in; four dead lines out. |
| `lib/ai/prompts/campaign-image.ts` | new | The campaign route's image prompt, moved under `prompt-builder-sanitized`. |
| `lib/ai/openai.ts`, `lib/ai/replicate.ts`, `lib/ai/models.ts` | extended | `aspectRatio` honoured, not dropped. |
| `app/api/studios/creator/route.ts`, `.../campaign/route.ts` | extended | Pass the ratio; creator gains an optional platform. |

No `visual-brief.ts`, and no style tables. Both were in the first draft and both
are cut by §0.

### 3.2 `image-text-rule.ts` — the fix for the one confirmed defect

**This wording is not new, and it is not a guess.** `lib/ai/prompts/edit.ts:602-631`
records the exact form that was proved on production 2026-08-25, and records that
it was proved **on a generate path** — which is `creator`. The rule was then
adapted for `edit`, where "every other surface must be COMPLETELY BLANK" had to
become "add nothing", because in an edit that instruction erases text the
customer photographed on purpose.

`creator` is the path the original wording was correct for, and it is the one
path that never received it. This module restores it there and gives `campaign`
the same rule, so the two text-to-image studios cannot drift the way the nine
studio preambles did.

Three ingredients carry it, per `edit.ts`'s own analysis, and all three are kept:

1. an **override claim** (`this overrides everything else in this prompt`),
2. a **count plus a named surface** (`EXACTLY ONCE, on …`),
3. an **enumeration** of the surfaces where invented text actually lands.

Ingredient 3 is what `creator_ar_signage` proves is missing: the invented text
landed on a menu board and a street of background shop signs — the exact nouns
the enumeration names.

**Two modes, because `creator` has two cases:**

```
noText()          the customer asked for no text
                  -> "There is NO text anywhere in this image." A concrete
                     claim, and correct for the majority of requests.

textAllowed()     the subject description may name words to render
                  -> the words the description asks for, EXACTLY ONCE, on the
                     one surface it names; every other surface blank.
```

**Why `creator` gets the relation form rather than `edit`'s concrete form, and
what that costs.** `edit` has an `editDescription` field holding *the string to
render*, so it can state `The only NEW text anywhere in the entire image is:
"شاورما الشام"` — a fact the model can check in one step. `creator` has no such
field: the request is one free-form Arabic sentence and the words to render, if
any, are inside it. So the rule has to be phrased as a relation to the subject
description above it, and `edit.ts:637-651` explicitly records that a relation
is the weaker form — that is the reason `buildDiacriticsRule` exists.

This is accepted deliberately for now, and it is the **first thing to re-measure**:
`creator_ar_signage` is already in the harness and re-running it costs 2 credits.
If the relation form does not hold, the upgrade is an optional `imageText` field
on `creator`, which turns the relation back into `edit`'s concrete claim. That
field is **not** built on speculation — the point of §0 is that this repo now
tests premises before it builds for them.

**Which mode fires.** Without an `imageText` field there is nothing to branch on,
so `creator` emits `textAllowed()` — the form that is correct whether or not the
description asks for words, since its own first clause is conditional. `campaign`
emits `noText()`: its captions are delivered as text beside the image and the
route's existing prompt already says so.

### 3.3 `platform-framing.ts` — the deterministic canvas

```
PLATFORM_FRAMING: Record<PlatformId, {
  aspectRatio: string   // passed to the adapter as a parameter
  framing:     string   // the same shape stated in prose
}>
```

Both, deliberately: the parameter sets the canvas, and the prose stops the model
composing a centred landscape subject inside a vertical frame.

**The platform set.** `campaign`'s `InputSchema` already closes it to five
(`campaign/route.ts:29`) and that contract does not change. `creator` gains the
same five plus a `general` default, so the new field is optional and every
existing client keeps working:

| PlatformId | Ratio | Used by |
|------------|-------|---------|
| `general` | 1:1 | creator default |
| `instagram` | 4:5 | both |
| `tiktok` | 9:16 | both |
| `linkedin` | 1:1 | both |
| `twitter` | 16:9 | both |
| `facebook` | 1:1 | both |

One ratio per platform is lossy — an Instagram feed post and an Instagram story
are different canvases behind one id. Splitting them means changing campaign's
public enum, which is deliberately deferred rather than bundled here.

**`general` is 1:1 and that is a behaviour change**, stated rather than buried:
`creator` today returns whatever shape the model picks, and two of the four
baseline frames were 1.79 landscape. Customers who liked those get squares
unless they choose a platform. The alternative — keeping "let the model decide"
as the default — preserves a behaviour that is not repeatable between two
identical requests, which is not a behaviour worth preserving in a tool sold for
producing sets of posts.

### 3.4 Adapters

| Adapter | Change |
|---------|--------|
| gemini | none — already forwards `aspectRatio` |
| gpt | `openaiImageSize(resolution, aspectRatio)` returns a size the API accepts for that ratio |
| flux | `sizeMap` becomes a function of resolution **and** ratio, honouring the model's own width/height constraints |

**Two pre-existing risks are settled before this code is written, not assumed.**
`openaiImageSize()` currently returns `1536x1536` and `2048x2048`; `flux`'s map
returns `2048x2048`. Neither has ever been checked against what those models
accept, and if either is out of range then every 2K/4K request to that provider
already fails in production today. CLAUDE.md already notes 4K paths are
unmeasured, which is consistent with both.

A research pass against the providers' own documentation runs before the adapter
edits, and whatever it finds is recorded here as a finding in its own right —
including "UNCONFIRMED", which is a verdict and not a licence to guess.

**The router's constraint is honoured in order.** `router.ts:37-40` says a
text-to-image caller must not pass `aspectRatio` until `gpt` and `flux` forward
it, because "an aspect ratio that is part of a paid spec being quietly ignored is
exactly the defect class this file's other comments catalogue." So the adapters
change **first**, and the routes start passing the ratio only after.

### 3.5 The rewritten creator prompt

```
role
SUBJECT           the customer's description, passed through intact
CLIENT CONTEXT    buildBrandContextBlock(), unchanged
FRAME             platform framing prose
STYLE             the style token, unchanged — the model grounds it (§2.4)
MUST
AVOID
TEXT RULE         last, because it overrides everything above it
```

The four dead lines from §2.3 are removed. `SUBJECT` carries the customer's
Arabic verbatim, per §2.2's corollary.

`TEXT RULE` is stated **last** — `edit.ts:602` records that placement as
load-bearing, since it is the instruction that has to win against everything
before it.

### 3.6 Campaign

`post.scenario` is already English and model-authored, so it needs no expansion —
only framing and containment. `campaign-image.ts` takes the scenario as
`SUBJECT`, adds `FRAME` from the route's existing `platform` enum, and closes
with `noText()`.

Moving it out of the route puts it under `prompt-builder-sanitized` for the
first time — a gap the route's own comment already admits
(`campaign/route.ts:203-208`).

Campaign images are pinned to `model: 'gemini'` in the route, so campaign gets
the true canvas as soon as the route passes the ratio, independent of the
adapter work.

## 4. Verification

### 4.1 Build gates

| Gate | Change |
|------|--------|
| `test:prompts` | golden strings for the text rule's two modes, the framing table, and the rewritten creator/campaign shapes |
| `test:image-canvas` (new) | every `PlatformId` maps to a ratio each adapter can actually serve, and each adapter's size function returns a value inside the provider's accepted set |
| `prompt-builder-sanitized` | now covers the campaign image prompt for the first time |
| `no-var-opacity-modifier`, `sanitize-before-reserve` | unchanged; already satisfied |

Each new gate is proved by deliberately introducing the violation it exists to
catch, per this repo's standing rule.

**One gate is deliberately NOT written.** Nothing asserts that an image contains
no invented text. `looksLikeNoOp`'s own history is the reason — CLAUDE.md records
that the pixel-diff metric called a working text edit (3.19% changed) worse than
one that did nothing (2.67%), and warns in as many words: *"Do not build a gate on
that number."* A containment check needs OCR and a judgement about which text was
asked for, and a threshold invented today would fail honest runs and pass the
defect. It stays an eye pass, and §4.2 is where it happens.

### 4.2 Live verification — the same harness that produced §0

Gates cannot show that an image got better, and this round exists because
`creator` had never been looked at. The baseline is already recorded, so every
claim below is a **before/after against a specific file**, not an impression.

| Question | Case | Baseline to beat |
|---|---|---|
| Does containment hold? | `creator_ar_signage` | The street of invented shop signs in `creator-creator_ar_signage.png` |
| Is the customer's intent still passed through? | `creator_ar_raw` | The Dubai skyline and hand-held framing must SURVIVE the new prompt |
| Is the canvas now the requested one? | all four, plus `campaign_full` | 1.79 / 1.79 / 0.67 / 1.89, and campaign's 1024×1024 |
| Does `style` still work? | `creator_ar_bold` | The night scene must not be flattened by the new blocks |

The second row is the one to watch. This round adds instructions to a prompt
whose current output is **good**, and the failure mode of a containment rule is
that it also suppresses the atmosphere the customer asked for — `edit.ts:658-700`
records exactly that happening twice, once erasing a real menu board and once
turning a paid edit into a no-op. A regression here is more likely than a
regression in containment.

Also required, and settled by the same run:

- one real generation per adapter (`gpt`, `flux`) at each resolution, which is
  what turns §3.4's two risks into findings;
- `campaign_full` with `platform: 'instagram'`, checking the nine images arrive
  at 4:5 rather than square.

CLAUDE.md's standing caveat applies: nothing is done until it has been run
against a live model.

---

## 5. What this does not fix

- `edit`'s brand-context wiring is still dead. Out of scope, older than this
  work, and already recorded.
- A studio can still bill for a visual no-op, and this round adds no metric for
  it — see §4.1 for why the obvious one is refused.
- **`creator` still has no field naming the text to render**, so its containment
  rule is the weaker relation form (§3.2). This is the first thing to re-measure
  and the one place this design knowingly ships the second-best rule.
- One ratio per platform (§3.3), so Instagram feed and Instagram story share an
  id.
- Nothing here improves `campaign`'s *scenario* text, which is what actually
  decides those nine images. It is model-authored by `campaign.ts` and was not
  examined in this round.
