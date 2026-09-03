# Live audit of the nine public studio pages — 2026-09-03

Run against **production**, after the deploy, by six independent finders looking at
the live pages a different way each. Every non-trivial finding was then handed to an
independent skeptic told to REFUTE it and to default to refuted when it could not be
reproduced.

**21 findings survived. 4 were refuted** — a refuted finding is worth as much as a
fixed one, which is why the count is recorded rather than the survivors alone.

Severity below is the SKEPTIC's corrected severity, not the finder's.

## Where the copy for these findings actually landed — recorded 2026-09-03

Commit `85b8606` is titled for two `[copy]` **nits** (nit 3, the changelog voice; nit 4, the
dialect register) and its message states two things its own diff contradicts: *"No factual
claim was touched — only markers"* and *"Both locales, identical key sets, no key added or
removed."* Both are retracted here. It was a shared worktree and the copy of four other
groups' in-flight fixes was swept into it. This note exists so that a reader of the findings
below can find their own sentences.

`85b8606` (`messages/ar.json`, `messages/en.json`) also carries the corrected copy for:

| Finding | Keys it rewrote or added |
|---|---|
| defects **1** and **8** — photoshoot's per-environment shot list | `studios.photoshoot.definition`, `studios.photoshoot.a1` |
| defects **2** and **7** — the voiceover rewrite's plan/dialect gate | `studios.voiceover.definition`, `studios.voiceover.a1` |
| defect **3** — the edit page's before/after provenance | `studios.edit.beforeLabel`, plus the NEW key `studios.shared.pairProvenance` |
| defect **4** — the prompt-builder sample note | the NEW key `studios.shared.sampleNoteFull` |
| defect **6** — campaign's two-band price | the NEW key `studios.shared.perCampaign` |

Three keys were added, in both locales — `perCampaign`, `pairProvenance`, `sampleNoteFull`.

The consequence for anyone reading the history: those groups' own commits — `e3eaba3`
(defects 1/8, 2/7 and 4) and `57f03f6` (defects 6 and 3) — ship their gates, their code and
their reasoning **without the sentences they describe**. `git diff --name-only 85b8606 HEAD`
lists 28 files and neither `messages/ar.json` nor `messages/en.json` is among them.

Nothing was rewritten to tidy this: three commits are already downstream of `85b8606`, and
rewriting published history is a worse trade than a correction that can be read. This is the
same shape as `d3235c2`, and the same rule — a record that lies misdirects every later
decision — applied to the repo's own history rather than to a page.

## defect (16)

### 1. [claims] /ar/studios/photoshoot (and /en/studios/photoshoot)

**Claim.** The definition and FAQ a1 both publish ONE fixed list of six shot angles as the shoot's output — «كل لقطة بكاميرا وتكوين وتنسيق مختلفين — أمامية، ثلاثة أرباع، من فوق، ماكرو على التفاصيل، جانبية، ومرفوعة» / "Each of the six frames has its own written camera, composition and styling — front hero, three-quarter, overhead flat lay, macro on the detail, side profile and elevated". That list is the white_studio recipe only. Six of the seven environments the same sentence sells ("من سبع بيئات جاهزة") return completely different frames, so a customer who picks anything but استوديو أبيض is told in advance what they will receive and receives something else.

**Evidence.** Live text: /ar/studios/photoshoot definition (messages/ar.json:1423) and a1 (messages/ar.json:1430); /en equivalents at messages/en.json:1430 — "front hero, three-quarter, overhead flat lay, macro on the detail, side profile and elevated". The code: lib/ai/prompts/photoshoot.ts white_studio recipes are `Front hero`(:81), `Three-quarter`(:87), `Overhead flat lay`(:93), `Macro detail`(:99), `Side profile`(:105), `Elevated dynamic`(:111) — byte-for-byte the published list. The other six environments are different: luxury = `Low hero on stone`(:346), `Chiaroscuro`(:352), `Mirror reflection`(:358), `Material macro`(:364), `Styled still life`(:370), `Spotlight on velvet`(:376); food = `Hero 45`(:134), `Overhead spread`(:140), `Macro texture`(:146), `Held and ready to eat`(:152), `Cross-section`(:158), `On the counter`(:164); urban = `Concrete ledge`(:293) … `Rooftop skyline`(:323); nature, lifestyle, festive likewise. The file's own header says why the global list was abandoned — photoshoot.ts:57-60: "Shot recipes are per-environment rather than one global list … v2.0 applied the same six angles to all six environments and they contradicted each other." The page republished v2.0's list. The route confirms the seven environments (photoshoot/route.ts:23) and the 1/3/6 counts (:24).

**Fix.** State what is actually true and still sells: "كل بيئة ليها ست لقطات مكتوبة مخصوصة ليها — استوديو أبيض بياخد أمامية وثلاثة أرباع ومن فوق وماكرو وجانبية ومرفوعة، والفخامة بتاخد لقطات تانية زي المرايا والماكرو على الخامة." Better: read the six names for a named environment out of `ENVIRONMENT_PRESETS` at build time the way the cost badge reads `CREDIT_COSTS`, so a translation can never carry a shot list again.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Reproduced end to end on the live site and in the repo.

LIVE (fetch + script-stripped visible text): https://pyrasuite.pyramedia.cloud/ar/studios/photoshoot carries «أمامية، ثلاثة أرباع، من فوق، ماكرو على التفاصيل، جانبية، ومرفوعة» 2x in visible text (definition + FAQ a1) and 10x in the whole document; «سبع بيئات جاهزة» 1x. /en/studios/photoshoot: "front hero, three-quarter, overhead flat lay, macro detail, side profile and elevated" 2x visible, 10x total; "seven ready-made environments" 1x. Parsing the single ld+json ELEMENT (1 per page; @graph = BreadcrumbList, WebPage, FAQPage) shows the list inside BOTH WebPage.description and FAQPage Q1 acceptedAnswer.text — i.e. it is the text an answer engine lifts, not merely on-page copy.

CODE: lib/ai/prompts/photoshoot.ts defines 7 environments x 6 recipes. Enumerated by script with line numbers: white_studio :81 Front hero, :87 Three-quarter, :93 Overhead flat lay, :99 Macro detail, :105 Side profile, :111 Elevated dynamic — byte-for-byte the published list. The other six do not match: urban :293 Concrete ledge, :299 Cafe table street bokeh, :305 Low angle architecture, :311 Night neon, :317 Motion street, :323 Rooftop skyline (zero overlap); luxury :346-:376 (Low hero on stone, Chiaroscuro, Mirror reflection, Material macro, Styled still life, Spotlight on velvet); food :134-:164; nature :240-:270; lifestyle :187-:217; festive :399-:429. photoshoot.ts:57-60's own comment states v2.0's single global list was abandoned because "the same six angles ... contradicted each other" across environments — the page republished that abandoned list. app/api/studios/photoshoot/route.ts:23 confirms the seven-value enum and :24 the 1/3/6 counts. buildShotOrder (:470-475) rotates but a 6-shot pack still covers all six recipes OF THE CHOSEN ENVIRONMENT, so the claim is exactly true for white_studio and false for the other six.

TWO FACTS THE FINDER DID NOT HAVE, BOTH STRENGTHENING IT: (1) every example image the page ships is from a luxury run — lib/studios/catalogue.ts:62 lists photoshoot-shot-1/2/3 + photoshoot-luxury, and both photoshoot cases in scripts/live/studio-cases.ts (:642, :737) are environment: 'luxury'. So the page displays luxury frames directly beneath a sentence enumerating white_studio's six angles — the same shape as the rejected creator task. (2) scripts/tests/studio-pages.test.ts has zero matches for "environment" or "shot", so the 457-check gate cannot see this class at all. Also components/studios/photoshoot/PhotoshootForm.tsx:271-285 renders the seven environment chips with names only and no shot list, so nothing inside the product corrects the promise before the customer pays.

REFUTATION ATTEMPTS THAT FAILED: not in the already-measured/passing list (that is structural SEO); not one of the known false findings (I counted ld+json ELEMENTS with a <script...> regex, got exactly 1, and counted occurrences globally rather than with grep -c); not recorded as deliberate anywhere — the only nearby text is docs/superpowers/plans/2026-09-02-public-studio-pages.md:968 ("six angles of one product from one photo; environment presets"), which is where the compression entered, not an accepted trade-off.

SEVERITY: defect, not blocker. white_studio is the form's default (PhotoshootForm.tsx:75, with the restaurant->food exception at :133), so a customer who never touches the environment chips receives precisely the six named frames — no money moves on a false promise by default, and there is no security or ledger impact. But it is a pre-purchase capability claim published in visible text AND in the FAQPage/WebPage schema in both locales, false for six of the seven environments the very same sentence advertises, with the page's own four example images drawn from one of the six that contradict it.

</details>

### 2. [claims] /ar/studios/voiceover (and /en/studios/voiceover)

**Claim.** The definition and FAQ a1 state the dialect rewrite as universal and unconditional — «وبايرا بتعيد صياغة نصّك باللهجة اللي اخترتها قبل ما تنطقه» and «وبايرا مش بتقرا نصّك زي ما هو — بتعيد صياغته باللهجة اللي اخترتها الأول وبعدين تنطقه» / "Pyra does not read your script back as typed: it rewrites it in the dialect you picked first, then speaks it". It is false on the free plan in every case, and false for فصحى on every plan. The very next sentence — «الباقة المجانية فصحى بس» — names the plan/dialect combination where no rewrite can ever happen, without saying so.

**Evidence.** lib/ai/tts-router.ts:132-135 — `async function enhanceScript(...)` opens with `if (!config.enhanceEnabled) { return { text: script, enhanced: false, rejected: false }; }`. lib/credits/voiceover-costs.ts free plan: `enhanceEnabled: false` (starter/pro/business/agency are true). Independently, tts-router.ts:125 `formal: '', // No rewrite needed for فصحى` and :147-148 `if (!dialectPrompt && !tonePrompt) return { text: script, enhanced: false, rejected: false }` — so on starter (`toneEnabled: false`) + فصحى there is no rewrite either. The free plan's only dialect IS فصحى (`dialectsAvailable: ['formal']`), so a free visitor — the plan the page's own CTA sells, "25 كريدت مجاناً" — gets a literal reading of their typed text, which is the thing the page says Pyra does not do.

**Fix.** Gate the sentence the way the plan gates the feature, in both the definition and a1: e.g. «وفي الباقات المدفوعة بايرا بتعيد صياغة نصّك باللهجة اللي اخترتها قبل ما تنطقه — الباقة المجانية بتنطق نصّك بالفصحى زي ما كتبته». Note the constraint is two-part (plan AND dialect), so 'paid plans rewrite' alone is still wrong for starter+فصحى.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Independently reproduced against both the live site and the repo.

LIVE (visible text, <script> stripped): /ar/studios/voiceover carries «وبايرا بتعيد صياغة نصّك باللهجة اللي اخترتها قبل ما تنطقه» (definition) and «وبايرا مش بتقرا نصّك زي ما هو — بتعيد صياغته باللهجة اللي اخترتها الأول وبعدين تنطقه. الباقة المجانية فصحى بس…» (FAQ a1). /en carries "Pyra rewrites your script in the dialect you picked before speaking it" and "Pyra does not read your script back as typed: it rewrites it in the dialect you picked first, then speaks it. The free plan is Formal Arabic only…". Sources: messages/ar.json:1519,1526 and messages/en.json:1519,1526.

CODE, and the gating is LIVE in the request path rather than dead config: app/api/studios/voiceover/route.ts:89 `const config = getVoiceoverConfig(planId)` and :112 enforces `config.dialectsAvailable`; lib/ai/tts-router.ts:185 resolves the same config and :188-190 passes it to enhanceScript, whose FIRST statement (:133-135) is `if (!config.enhanceEnabled) return { text: script, enhanced: false, rejected: false }`. lib/credits/voiceover-costs.ts:41 free `enhanceEnabled: false`, :38 `dialectsAvailable: ['formal']`, :40 `toneEnabled: false`; :50-51 starter `toneEnabled: false, enhanceEnabled: true`. Independently, tts-router.ts:125 `formal: '', // No rewrite needed for فصحى` and :147-148 `if (!dialectPrompt && !tonePrompt) return ... enhanced: false`.

Enumerated over every reachable plan/dialect pair: free+formal = NO REWRITE (enhanceEnabled false); starter+formal = NO REWRITE (empty dialect + no tone); starter+saudi and all pro dialects = dialect rewrite; pro+formal = TONE-ONLY rewrite.

ONE CORRECTION to the finder, which does not rescue the page: "false for فصحى on every plan" is over-broad — pro/business/agency have toneEnabled:true, so pro+فصحى does call the model (tone-only). The unambiguously false combinations are FREE (every case, since formal is its only dialect) and STARTER+فصحى. Free is precisely the plan the page's own CTA sells («25 كريدت مجاناً وبدون بطاقة ائتمان» / "Start free"), so the page's conversion target is the plan where the sentence is false 100% of the time. «الباقة المجانية فصحى بس» sits one sentence later and names the dialect restriction without disclosing its consequence — a reader has no way to learn that فصحى means the script is spoken verbatim, especially as the same paragraph presents فصحى as one of five dialects.

Skeptical checks it survived: not in the already-measured/passing list (that list is structural — sitemap, ld+json elements, canonicals, <audio> counts); not one of the known false findings (no grep -c on a one-line document, no ld+json double-count, no case-sensitive hreflang); grep over CLAUDE.md finds NO known-open entry for this — the studio-pages section records only the transcript-label refusal («النص اللي بعتناه» vs the plan's "النص المنطوق"), a different sentence. CLAUDE.md:385 actually corroborates the gap: "On pro/business/agency `toneEnabled` is true, so this fired on essentially every paid request."

Severity: defect, not blocker. No money is misdirected and no page breaks — the paid dialect paths do exactly what the sentence says — but this is verbatim the defect class that got four sibling build tasks rejected (the plan page's non-existent KPIs section, the prompt-builder's non-existent distinctness check, and notably this same page's earlier universal-15-second-unit claim). A public capability claim that is false for the plan the CTA converts to, traceable to a file:line, is a defect by this repo's own rule.

The proposed fix's caveat is correct and worth keeping: "paid plans rewrite" alone would still be wrong for starter+فصحى, so the gate must be two-part (plan AND dialect) — e.g. state it as "on the dialect plans, picking a dialect other than فصحى rewrites your script before speaking it; فصحى is spoken as you wrote it".

</details>

### 3. [claims] /ar/studios/edit (and /en/studios/edit)

**Claim.** The before/after pair is labelled «قبل — الصورة اللي عندك» / "Before — the photo you have", captioned «برطمان دبس تمر مصوّر داخل كافيه» / "a date-syrup jar photographed inside a café", and cited by FAQ a1 as the proof that «منتجك … بيفضلوا زي ما هما» — "the same date-syrup jar … its label untouched". The 'before' frame is not a photograph and was never a customer upload: it is a Gemini text-to-image generation the harness made seconds earlier as a test fixture. The page's central preservation claim is demonstrated against a synthetic input, which is the weakest possible evidence for it, while step1 tells the visitor this is «نفس صورة المنتج اللي مصوّرها بموبايلك».

**Evidence.** public/examples/studios/manifest.json: `edit-before-cafe` has `sourceFile: "fixture-retail_scene.png"`, sourceRun 2026-08-27T21-07-40-884Z. scripts/live/cases.ts:40-42 defines that fixture as a PROMPT — "A jar of date syrup with a printed brand label, standing on a rustic wooden cafe table, wide landscape framing, a folded linen napkin, scattered dates and a brass spoon around it, warm blurred cafe interior behind. Photographic." scripts/live/run.ts:314 generates every fixture by posting it to the creator studio: `prompt: FIXTURES[name], model: 'gemini', resolution: '1080p', style: 'photographic', variations: 1`. Labels: messages/ar.json:1372 `beforeLabel` = «قبل — الصورة اللي عندك»; messages/en.json:1372 = "Before — the photo you have"; alt text on the live page = «قبل: برطمان دبس تمر مصوّر داخل كافيه، بخلفية مزحومة» / "a date-syrup jar photographed inside a café". The shared note above it (messages/ar.json:1358) is technically satisfied — it says every image is product output on a paid account, and the fixture is — which is exactly why nothing flagged it.

**Fix.** Either (a) relabel honestly: «قبل — صورة مشهد مزحوم اتولّدت من الاستوديو عشان الاختبار» and drop "مصوّر"/"photographed", or (b) far better for the claim being sold: shoot one real phone photo of one real product, run marketplace_white on it, and ship that pair. The edit studio's whole promise is about a photograph the customer already owns; demonstrating it on a generated image leaves the promise untested on the input class that matters.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Reproduced end to end. LIVE (script-stripped, global counts — a prerendered doc is one line): /ar/studios/edit carries «قبل — الصورة اللي عندك» ×1, «مصوّر داخل كافيه» ×2, step1 «نفس صورة المنتج اللي مصوّرها بموبايلك» ×1, and a1 «والصورتين من نفس التشغيلة الحقيقية» ×1; /en/studios/edit carries "Before — the photo you have" ×1, "photographed inside a café" ×2, "the photo you already have" ×1, and a1 verbatim "the same date-syrup jar, from a busy café to a white background, its label untouched — both frames from one real run."

REPO, every cited line verified exact: manifest.json edit-before-cafe -> sourceFile "fixture-retail_scene.png", sourceRun 2026-08-27T21-07-40-884Z, 1376x768; scripts/live/cases.ts:40 defines retail_scene as a PROMPT STRING ("A jar of date syrup with a printed brand label… warm blurred cafe interior behind. Photographic."); scripts/live/run.ts:314 generates every fixture by POSTing it to /api/studios/creator with model:'gemini', style:'photographic'; messages/ar.json:1372 and messages/en.json:1372 hold the two labels as quoted. I decoded .superpowers/live-runs/2026-08-27T21-07-40-884Z/fixture-retail_scene.png — magic ffd8 (JPEG under a .png name, the known 11-of-12 mislabel) and 1376x768, byte-identical dimensions to the manifest entry, so the shipped "before" frame IS that generation.

Therefore the alt text's «مصوّر» / "photographed" is a false factual statement about a Gemini text-to-image output, and the label "the photo you have" is read against a step1 that defines that as the photo the customer shot on their phone.

Refutation attempts that failed: not in the already-measured list; not one of the known instrument false-findings (two ld+json occurrences, case-sensitive hreflang, grep -c on a one-line doc); and NOT recorded as a deliberate open item — CLAUDE.md's "The examples are real product output, and the exact claim matters" section audits paid-vs-free source runs and the English plan sample but never says the edit 'before' frame is a synthetic fixture, and grep on the plan doc returns only the examples: ['edit-before-cafe', …] line.

The one genuine mitigation, checked: app/[locale]/(landing)/studios/[slug]/page.tsx:242-250 renders examplesNote INSIDE the same BeforeAfter block, and it is live in both locales — "Every image here is actual product output, generated on a paid account." That is true of the fixture and it is adjacent. It does not cure the finding: the same block simultaneously says the frame is product output, that it is "the photo you have", and that it was "photographed inside a café". Adjacent contradiction is not disclosure, and it is plausibly why nothing flagged this.

Severity defect, not blocker: the demonstrated edit is a genuine marketplace_white run and the preservation capability itself is not overstated — what ships false is the provenance of the input frame and the word "photographed", plus the fact that the input class the studio is sold on (a real phone photo) is left untested while the FAQ cites this pair as the proof. Proposed fix (b) is right; (a) is the honest floor.

</details>

### 4. [claims] /ar/studios/prompt-builder

**Claim.** «ده مخرج فعلي، اتولّد على الإنتاج. مختصر عشان الصفحة — النسخة الكاملة بتوصلك في حسابك.» / "Shortened for the page — you get the full version in your account." Both halves are false on this page specifically: nothing is shortened (all three prompts render in full), and prompt-builder output is excluded from the retrieval API, so there is no copy waiting in the account.

**Evidence.** Live /ar/studios/prompt-builder renders all three entries with full prompt text and full Arabic tip — public/examples/studios/deliverable-prompt-builder.json has `data.length === 3` (prompt lengths 253, 249, 243). components/studios/public/DeliverableSample.tsx:269 renders `PROMPT_BUILDER.data.map(...)` with no `.slice()`, unlike plan (`calendar.slice(0, 2)` at :175) and storyboard (`.slice(0, 3)` at :246) where the same note is true. Retrieval: lib/studios/text-output.ts:47 — `export const RETRIEVABLE_STUDIOS = ['plan', 'analysis', 'storyboard', 'campaign']` — and app/api/generations/route.ts:50 filters `.in('studio', RETRIEVABLE_STUDIOS)`, so a prompt-builder run is never listed; app/[locale]/(dashboard)/prompt-builder/page.tsx imports no `RecentWork` (the four studios that do are analysis:28, campaign:9, plan:28, storyboard:26). The note is `studios.shared.sampleNote` (messages/ar.json:1375, en.json:1375), shared across all four text pages, so the fix must not break the three where it holds.

**Fix.** Make `sampleNote` per-studio, or add a `studios.promptBuilder.sampleNote` override reading «ده مخرج فعلي كامل، اتولّد على الإنتاج» — dropping both the truncation claim and the account-retrieval claim. If retrieval is wanted instead, `prompt-builder` has to join RETRIEVABLE_STUDIOS, which is a product decision, not a copy edit.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Independently reproduced on the live site and in the repo. (1) "Shortened for the page" is false on this page: on live /ar and /en studios/prompt-builder, with <script> elements stripped, each of the three prompts from public/examples/studios/deliverable-prompt-builder.json (253, 249, 243 chars) appears exactly once verbatim, along with all three full Arabic tips and the brief — nothing is truncated. DeliverableSample.tsx:269 maps PROMPT_BUILDER.data with no .slice(), unlike plan (calendar length 4 rendered as 2, :175), storyboard (9 scenes rendered as 3, :246) and analysis (5 data sections, only swot+kpis rendered), where the same note holds. (2) "You get the full version in your account" is false and by more than the filter: app/api/studios/prompt-builder/route.ts:50-54 inserts the generations row with credits_used 0 and status completed and never writes `output` at all, so the row is NULL-output by construction (matching the measured note at lib/studios/text-output.ts:19); RETRIEVABLE_STUDIOS at text-output.ts:47 excludes prompt-builder and app/api/generations/route.ts:49 filters .in('studio', RETRIEVABLE_STUDIOS); and the dashboard prompt-builder page imports no RecentWork (only analysis:28, campaign:9, plan:28, storyboard:26 do). No surface returns a past prompt-builder run. Live evidence, /en/studios/prompt-builder outside <script>: "This is actual output, generated on production. Shortened for the page — you get the full version in your account." Not in the already-measured list, not one of the known instrument false-positives (counted with a global search on a script-stripped document, not grep -c), and CLAUDE.md's public-studio-pages section logs the plan sample's language note but nothing about sampleNote. Severity is defect rather than blocker because prompt-builder costs 0 credits (lib/credits/costs.ts:10) and renders its full output on screen at run time, so no one pays under the false impression and the truncation half understates rather than oversells — but it is exactly the rejected-task pattern of a page asserting product behaviour (retention/retrieval) that does not exist, verified in the shipped bytes.

</details>

### 5. [schema] /en/studios/creator (all 20 studio pages; also /contact, /privacy, /terms)

**Claim.** twitter:title and twitter:description on every studio page are the site-wide landing-page defaults, not the page's own — while og:title and og:description are correctly page-specific. Every X/Twitter share of any of the 20 new pages shows the generic homepage card.

**Evidence.** Extracted head meta from all 20 pages: twitter:title has exactly two distinct values across 20 pages — "PyraSuite — AI Marketing Platform" (10 en pages) and "PyraSuite — منصة التسويق بالذكاء الاصطناعي" (10 ar pages); twitter:description likewise two values ("Turn any idea into a professional marketing campaign in minutes — 9 AI studios and a transparent credit system." / its Arabic twin). On the same page og:title is "Image Creator — AI ad images that get Arabic right" and og:description is the page's own 175-char description. Cause: lib/seo/alternates.ts:69-92 `publicOpenGraph()` returns an `openGraph` object only, so Next inherits the segment's `twitter` block from app/[locale]/layout.tsx:73-77 unchanged. The helper's own header (alternates.ts:53-61) documents this exact shallow-merge trap for og:image and stops there.

**Fix.** Have publicOpenGraph's module also export a `publicTwitter(o)` returning `{card:'summary_large_image', title:o.title, description:o.description}` (twitter:image already resolves correctly, derived from og:image), and spread it in the five generateMetadata callers that already import publicOpenGraph — app/[locale]/(landing)/studios/[slug]/page.tsx:73, studios/page.tsx:53, contact:24, privacy:22, terms:22. Assert in test:alternates that twitter:title equals the page title, not the site title.

<details><summary>The skeptic could not refute it — their reasoning</summary>

CONFIRMED — reproduced independently against the live site and traced to a file:line, and it is not on the "already measured" list, not a known false-finding instrument error, and not a deliberate known-open item in CLAUDE.md.

LIVE REPRODUCTION (fetched all 20 studio URLs + contact/privacy/terms/pricing/ar/en, parsed with a global regex, not `grep -c`):

  https://pyrasuite.pyramedia.cloud/en/studios/creator
    <meta property="og:title" content="Image Creator — AI ad images that get Arabic right"/>
    <meta name="twitter:title" content="PyraSuite — AI Marketing Platform"/>
    <meta name="twitter:description" content="Turn any idea into a professional marketing campaign in minutes — 9 AI studios and a transparent credit system."/>
    <title>Image Creator — AI ad images that get Arabic right | PyraSuite</title>

  Across the 20 studio pages: og:title has 20 distinct page-specific values; twitter:title has exactly TWO — "PyraSuite — AI Marketing Platform" (10 en) and "PyraSuite — منصة التسويق بالذكاء الاصطناعي" (10 ar). twitter:description likewise two. og:title === twitter:title on only /ar and /en (the landing pages, where the site default is correct). Their numbers are exact.

CAUSE, confirmed at file:line:
  - app/[locale]/layout.tsx:73-77 is the ONLY `twitter` block in the entire app tree (`grep -rn twitter app/ --include=*.tsx --include=*.ts` returns just this one plus an unrelated campaign platform enum). It sets title/description from the landing page's own `og`.
  - lib/seo/alternates.ts:69-92 `publicOpenGraph()` returns an `openGraph` object only — no `twitter` key — so Next's shallow segment merge carries the parent's twitter block through untouched. The helper's own header (alternates.ts:53-61) documents this exact shallow-merge trap for og:image and stops there, as claimed.
  - None of the SEVEN callers sets `twitter`: studios/[slug]:73, studios:53, contact:24, privacy:22, terms:22, pricing:28, waitlist:27.
  - No gate covers it: `grep -n twitter scripts/tests/alternates.test.ts` returns zero lines.

NOT A DELIBERATE DECISION — the opposite. docs/superpowers/plans/2026-09-02-seo-geo-quick-wins.md:394 explicitly instructed: "Keep whatever `twitter` block exists but set its `title`/`description` to the same `t('title')`/`t('description')` so the card matches the page." That instruction was never implemented on any caller. `grep -i twitter CLAUDE.md` returns one unrelated hit (a campaign platform ratio), so this is nowhere recorded as known-open.

WHY "PRESENT BUT WRONG" IS WORSE THAN ABSENT: X falls back to og: only when twitter:* is missing. Here twitter:title/description are present and wrong, so X uses them — every share of any of the 20 new high-intent product URLs renders the generic homepage card. og: being correct means LinkedIn/WhatsApp/Slack/Facebook are unaffected, which bounds the blast radius to X.

TWO CORRECTIONS TO THEIR WRITE-UP (neither changes the verdict):
  1. The proposed fix names five callers; there are seven. /en/pricing is measurably affected on live (og:title "Pricing — A Transparent Credit System" vs twitter:title "PyraSuite — AI Marketing Platform"), and waitlist/page.tsx:27 has the same shape. Scope the fix to all seven or the same bug survives on two public URLs.
  2. "twitter:image already resolves correctly" is true but trivially so — there is one opengraph-image per locale, and twitter:image:alt is the static site-wide OG_IMAGE.alt by deliberate design (alternates.ts:65-67, "a static export in the file-based convention"). Do not "fix" that alt.

SEVERITY: defect, not blocker and not nit. It is a wrong value shipped on 20+ live URLs and it defeats a stated goal of the round (per-studio discoverability on the highest-intent product terms), but nothing is functionally broken, no money or security is involved, and it is not the "page claims a capability the product lacks" class the project's rejections were about.

</details>

### 6. [copy] /ar/studios/campaign (and /ar/studios, /en/studios/campaign, /en/studios)

**Claim.** The most prominent number on the page — التكلفة — says "12 كريدت" flat, but a campaign without images costs 3 credits. The page's own FAQ says images are optional and "بتدفع الجزء الخاص بالكتابة لوحده" without ever giving that figure, so the only number a shop owner can read is 4× the real price of the path the page tells them to take.

**Evidence.** Live: `node vis.js live/ar-campaign.html` → "[H2] مخطط الحملات … التكلفة\n12 كريدت"; same line on /ar/studios and "12 credits" on both English pages. Route: app/api/studios/campaign/route.ts:123-128 — `const perImageCost = CREDIT_COSTS.image['1080p']` (=1, lib/credits/costs.ts:2), `const textCost = Math.max(1, fullCost - EXPECTED_POSTS * perImageCost)` = max(1, 12-9) = **3**, `const creditCost = input.generateImages ? fullCost : textCost`. The label comes from lib/studios/catalogue.ts:71 `costShape: 'flat'` → lib/studios/cost-label.ts:61 `${CREDIT_COSTS[entry.costKey]} ${labels.unit}`. lib/studios/cost-label.ts:26-35 already documents this exact failure for voiceover — "a single number in front of a two-band price is what made the old badge read as one universal rate" — and campaign was left single-band.

**Fix.** Give campaign a two-band cost shape the way voiceover has one: derive both figures from the route's own decomposition (`CREDIT_COSTS.campaign` and `campaign - 9 * CREDIT_COSTS.image['1080p']`) and render an ICU string like "3 كريدت للتسع بوستات بالكتابة · 12 كريدت لو طلبت الصور". Never type either number into a translation.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Reproduced end to end. LIVE: script-stripped text of https://pyrasuite.pyramedia.cloud/ar/studios/campaign shows "التكلفة" immediately followed by "12 كريدت" as the sole cost value; /en/studios/campaign shows "Cost" / "12 credits"; /ar/studios and /en/studios carry the same figure on the campaign card. ROUTE: app/api/studios/campaign/route.ts:125-128 computes fullCost = getStudioCost('campaign') = 12 (lib/credits/costs.ts:3), perImageCost = CREDIT_COSTS.image['1080p'] = 1 (costs.ts:2), EXPECTED_POSTS = 9 (lib/ai/studio-output-schemas.ts:228), so textCost = Math.max(1, 12-9) = 3 and creditCost = input.generateImages ? 12 : 3. The figure 3 appears NOWHERE on the page: a regex over the raw live HTML finds two "3 credits" matches on /en/studios/campaign and both are inside self.__next_f (landing.s2Credits neighbourhood and pricing.voiceoverNote), not the campaign price. SAME PAGE ADVERTISES THE OTHER BAND WITHOUT ITS NUMBER: /en/studios/campaign FAQ a2 reads "clear it and you get the nine posts as text only, and you pay for the text half alone, because the image share is never reserved from your balance"; Arabic a2 «بتاخد التسع بوستات بالكتابة بس، وبتدفع الجزء الخاص بالكتابة لوحده». LABEL SOURCE: lib/studios/catalogue.ts:71 costShape:'flat' -> lib/studios/cost-label.ts:66 renders `${CREDIT_COSTS[costKey]} ${unit}`. The same file, cost-label.ts:26-35 and :61-62, documents this exact defect for voiceover and states the rule campaign breaks ("a single number in front of a two-band price is what made the old badge read as one universal rate"); creator renders 1-4 per image and photoshoot 2-8 per shoot, so campaign is the one two-band price published single-band. REFUTATION ATTEMPTS THAT FAILED: not in the pre-measured passing list (which covers sitemap/ld+json/canonical/hreflang/audio, not cost labels); not one of the known false findings; CLAUDE.md's "Still open, deliberately" for the public-studio-pages round lists the /studios index link, the NavBar, the Arabic plan sample, use-cases/compare and image-alt — not this, and that round asserts credit figures as a correctness property ("Every credit figure comes from lib/credits/costs.ts through lib/studios/cost-label.ts"). ONE OVERSTATEMENT IN THEIR EVIDENCE, corrected rather than fatal: "4x the real price of the path the page tells them to take" is too strong — components/studios/campaign/CampaignForm.tsx:74 is useState(true), so the in-app checkbox defaults to images ON and 12 is what the default path genuinely charges; step 3 of the page does not steer anyone to text-only. The defect is publishing a two-band price as one number while the same document advertises the cheaper band, not a wrong headline figure. Also scope context the fixer should know: the flat 12 is systemic and predates these pages (messages/en.json:844 and :1025 both publish "a full 9-post campaign = 12"). Severity defect, not blocker: no money is lost, the error direction overstates price, and 12 is correct for the default configuration — but it is a public page publishing a price the product does not charge on a path the page itself advertises, with an in-repo precedent (voiceover) that this project already treated as worth fixing.

</details>

### 7. [copy] /ar/studios/voiceover (and /en/studios/voiceover)

**Claim.** The definition sentence — the one an answer engine lifts — states unconditionally that Pyra rewrites your script in the dialect you picked before speaking it. On the free plan the page's own CTA sells, no rewrite happens at all, and the page discloses the plan gate for dialects and for tone but never for the rewrite.

**Evidence.** Live /ar/studios/voiceover definition: "…وبايرا **بتعيد صياغة نصّك باللهجة اللي اخترتها قبل ما تنطقه**…" (messages/ar.json:1519). lib/credits/voiceover-costs.ts:41 — free plan `enhanceEnabled: false`; lib/ai/tts-router.ts:133-135 — `if (!config.enhanceEnabled) { return { text: script, enhanced: false, rejected: false }; }`. The page does disclose the neighbouring gates: step2 "والنبرة … بتتفتح في الباقات الأعلى" and q1 "الباقة المجانية فصحى بس" — the rewrite gate is the one omitted, and it sits in the definition rather than the FAQ.

**Fix.** Qualify the definition the way the tone line already is: "…وبايرا بتعيد صياغة نصّك باللهجة اللي اخترتها قبل ما تنطقه (بيشتغل من باقة ستارتر وفوق)…", or move the clause out of the definition into q1 where the plan gate is already being explained.

<details><summary>The skeptic could not refute it — their reasoning</summary>

SURVIVES. I reproduced it against the live site and the repo, and it is stronger than filed.

LIVE, both locales (curl, script tags stripped, global regex — not `grep -c`):
- /ar/studios/voiceover definition: "…وبايرا **بتعيد صياغة نصّك باللهجة اللي اخترتها قبل ما تنطقه**…"
- /en/studios/voiceover definition: "…**Pyra rewrites your script in the dialect you picked before speaking it**…"
- FAQ a1, both locales, states it a SECOND time and even harder: "وبايرا **مش بتقرا نصّك زي ما هو** — بتعيد صياغته باللهجة اللي اخترتها الأول وبعدين تنطقه" / "**Pyra does not read your script back as typed**: it rewrites it in the dialect you picked first, then speaks it."

Both sentences are in the STRUCTURED DATA, not just visible copy — the single ld+json element (@graph = BreadcrumbList + WebPage + FAQPage) carries the definition as `WebPage.description` and the a1 text as `FAQPage.mainEntity[0].acceptedAnswer.text`. This is precisely the sentence an answer engine lifts.

CODE (the finder's two citations are exact):
- lib/credits/voiceover-costs.ts:41 — free plan `enhanceEnabled: false` (and `dialectsAvailable: ['formal']`, `toneEnabled: false`).
- lib/ai/tts-router.ts:133-135 — `if (!config.enhanceEnabled) { return { text: script, enhanced: false, rejected: false }; }`.
So on free the script is returned byte-identical and spoken as typed. The page's own CTA sells exactly that plan: "سجّل ببريدك وابدأ على طول — 25 كريدت مجاناً وبدون بطاقة ائتمان."

THE FINDING IS UNDERSTATED — it is not free-only. lib/ai/tts-router.ts:126 `formal: ''` carries the comment `// No rewrite needed for فصحى`, and tts-router.ts:147-149 returns early when both prompts are empty. Per plan:
- free (any dialect): no rewrite, ever.
- starter + فصحى: no rewrite (toneEnabled false, formal prompt empty) — and starter's only other dialect is saudi.
- pro/business/agency + فصحى: a TONE rewrite only; the dialect rewrite is a no-op by design at every tier.
So "Pyra does not read your script back as typed" is false for every free user and for every فصحى run at any tier.

THE ONE DISCLOSURE MAKES IT WORSE, NOT BETTER. a1 follows the rewrite claim immediately with "الباقة المجانية فصحى بس" / "The free plan is Formal Arabic only." A reader composes the two into "on free, Pyra rewrites my script into فصحى" — which the product explicitly declines to do. The page gates the neighbours (step2 gates tone: "بتتفتح في الباقات الأعلى"; a1 gates dialects; a3 gates duration; the cost line gates the unit) and gates the rewrite nowhere. I grepped the stripped document: `صياغ` occurs three times — definition, a1, and the sample `audioNote` — and none is qualified.

REFUTATION ATTEMPTS THAT FAILED: not in the "already measured and passing" list (that list is structural — sitemap, one h1, one ld+json ELEMENT, three case-insensitive rel=alternate, canonical, one <audio>; I re-confirmed 1 ld+json element with a `<script ...>` regex and did not file the known-false two-occurrence claim). Not recorded as deliberately open in CLAUDE.md — that section records the adjacent transcript-label fix ("النص اللي بعتناه"), the 15-second-unit rejection and the sample's language note, but says nothing about the rewrite being plan-gated.

NOT FILED (checked and defensible): the sample `audioNote` asserting the clip was rewritten. public/examples/studios/voiceover-gulf-sample.json has scriptAsWritten === scriptAsSpoken byte-identical, but CLAUDE.md already explains that field falls through because the route returns no rewritten text, and the run was pro/gulf/friendly where enhanceEnabled and toneEnabled are both true.

SEVERITY: defect, not blocker. No money moves wrongly and nothing is broken — it is a capability overclaim on a public page, the exact class that got four of the six build tasks rejected, sitting in the definition sentence and in JSON-LD. The proposed fix is right; it should also cover starter+فصحى, e.g. gate the clause "(بيشتغل من باقة ستارتر وفوق، ولما تختار لهجة غير الفصحى)" or move it out of the definition into a1 beside the dialect gate.

</details>

### 8. [render] /ar/studios/photoshoot and /en/studios/photoshoot (hero definition + FAQ 1, both locales)

**Claim.** Both photoshoot pages publish ONE environment's six shot names as if they were the product's universal six, in the same sentence that tells the customer they pick from seven environments. This is the rejected claim class: a capability statement the code contradicts.

**Evidence.** Live /en/studios/photoshoot hero: "returns 1, 3 or 6 frames, each with its own camera, composition and styling — front hero, three-quarter, overhead flat lay, macro detail, side profile and elevated — in whichever of seven ready-made environments you pick." FAQ 1 repeats it: "Each of the six frames has its own written camera, composition and styling — front hero, three-quarter, overhead flat lay, macro on the detail, side profile and elevated". Arabic identical: "...— أمامية، ثلاثة أرباع، من فوق، ماكرو على التفاصيل، جانبية، ومرفوعة — وإنت اللي بتختار البيئة من سبع بيئات جاهزة."
Measured against lib/ai/prompts/photoshoot.ts ENVIRONMENT_PRESETS (extracted `name:` per preset block):
  white_studio [6] Front hero | Three-quarter | Overhead flat lay | Macro detail | Side profile | Elevated dynamic
  food         [6] Hero 45 | Overhead spread | Macro texture | Held and ready to eat | Cross-section | On the counter
  lifestyle    [6] In use, candid | On a real surface | Overhead scene | Window light close-up | Held in hand | Wide environmental
  nature       [6] Resting on stone | Backlit through foliage | Water macro | Wide landscape | Ground level | Raised against sky
  urban        [6] Concrete ledge | Café table, street bokeh | Low angle architecture | Night neon | Motion street | Rooftop skyline
  luxury       [6] Low hero on stone | Chiaroscuro | Mirror reflection | Material macro | Styled still life | Spotlight on velvet
  festive      [6] Bokeh lights | Gifting context | Overhead table | Candlelight | Sparkle in motion | Warm hero
The six names on the page are white_studio's alone (photoshoot.ts:66 block, `name: 'Front hero'` at :81). `app/api/studios/photoshoot/route.ts:23` offers all seven: z.enum(['white_studio','food','lifestyle','nature','urban','luxury','festive']), and the page's own step 2 lists all seven. So the enumerated angle list is wrong for 6 of the 7 environments a customer can pick — and the four example images on that same page are a dark luxury/marble set, not white_studio.

**Fix.** Either drop the six angle names from `studios.photoshoot.definition` and FAQ 1 in both locales and say what is actually true for every environment ("six frames, each with its own written camera, composition and styling, chosen for the environment you picked"), or move the enumeration into the white-studio sentence where it is true. If the names stay, they must be read from ENVIRONMENT_PRESETS rather than typed into a translation — the same rule cost-label.ts:5-8 states for credit figures — and test:studio-pages should gain an assertion that no shot name appears in any translation.

<details><summary>The skeptic could not refute it — their reasoning</summary>

SURVIVES. I reproduced every leg independently.

LIVE (curl, both locales, script tags stripped, text extracted with a global regex — not grep -c):
- /en/studios/photoshoot hero: "…returns 1, 3 or 6 frames, each with its own camera, composition and styling — front hero, three-quarter, overhead flat lay, macro detail, side profile and elevated — in whichever of seven ready-made environments you pick."
- /en FAQ A1: "Each of the six frames has its own written camera, composition and styling — front hero, three-quarter, overhead flat lay, macro on the detail, side profile and elevated…"
- /ar identical: "…— أمامية، ثلاثة أرباع، من فوق، ماكرو على التفاصيل، جانبية، ومرفوعة — وإنت اللي بتختار البيئة من سبع بيئات جاهزة."

SOURCE (lib/ai/prompts/photoshoot.ts, ENVIRONMENT_PRESETS at :65). Each of the seven presets carries its OWN six `name:` values. The six on the page are white_studio's verbatim (:81 'Front hero', :87 'Three-quarter', :93 'Overhead flat lay', :99 'Macro detail', :105 'Side profile', :111 'Elevated dynamic'). food (:119) is Hero 45 / Overhead spread / Macro texture / Held and ready to eat / Cross-section / On the counter — four of six bear no relation to the published list. luxury (:331) is Low hero on stone / Chiaroscuro / Mirror reflection / Material macro / Styled still life / Spotlight on velvet. The route offers all seven: app/api/studios/photoshoot/route.ts:23 z.enum([...7...]), and the page's own step 2 lists all seven. So the enumeration is wrong for 6 of the 7 environments a customer can pick, and a Dubai restaurant — this repo's own archetype customer — is one of them.

FOUR THINGS THE ORIGINAL FINDING DID NOT HAVE, which raise it above a copy nit:

1. The wrong enumeration is inside the FAQPage STRUCTURED DATA, both locales. Parsed the single ld+json ELEMENT (1 per page, correctly — I did not file the known-false "two blocks"): @graph → FAQPage → mainEntity[0].acceptedAnswer.text carries the full six-name list in en and ar. That is the string an answer engine lifts verbatim, which is the whole purpose of these pages.

2. The page's own example images refute its own sentence. All four photoshoot examples in public/examples/studios/manifest.json come from sourceRun 2026-08-27T21-28-51-817Z and 2026-09-01T03-43-10-125Z, and scripts/live/studio-cases.ts:642 and :737 are the only photoshoot cases — both `environment: 'luxury'`. So the three frames captioned "the second frame of the same shoot, a different angle" are luxury shots (Chiaroscuro, Mirror reflection…), sitting directly under a paragraph naming white_studio's six angles as what you get.

3. buildShotOrder (photoshoot.ts:470) seeds the ORDER per run, and shots ∈ {1,3,6} takes a subset — so "each of the six frames has its own… front hero, three-quarter, …" holds at no environment other than white_studio and no shot count other than 6.

4. No gate exists: grep for the shot names across scripts/tests/studio-pages.test.ts and components/studios/ returns nothing, so the proposed assertion is not redundant.

NOT already covered: the "already measured and passing" list is entirely structural SEO (loc counts, 200s, one h1, one ld+json element, canonicals, alternates, audio) — none of it reads answer text against the code. Not a known false finding. Not in CLAUDE.md's "Still open, deliberately" for the studio-pages round, and CLAUDE.md's own rule for credit figures (cost-label.ts) is the precedent the proposed fix correctly extends.

SEVERITY — defect, not blocker. The substantive capability claim ("each frame has its own written camera, composition and styling") IS true for all seven presets; what is false is the enumerated names being presented as universal. Nobody is charged wrongly and nothing breaks. But it is published in two locales, twice per page, and in machine-readable structured data, and it is precisely the class six of seven build tasks were rejected for — a sentence naming a specific product behaviour that the code contradicts, traceable to file:line. Fix as proposed: drop the names from studios.photoshoot.definition and .a1 in messages/{en,ar}.json:1423 and :1430, or derive them from ENVIRONMENT_PRESETS, plus a studio-pages assertion that no ENVIRONMENT_PRESETS shot name appears in any translation.

</details>

### 9. [render] /ar/studios/plan, /en/studios/storyboard, /en/studios/analysis (and every page/locale where the sample language differs from the page)

**Claim.** DeliverableSample puts the SAMPLE's text direction on a container that also holds the PAGE's own chrome — section headings, table column headers, the SWOT quadrant grid and the numbered "Scene N" grid — so on every cross-language page the ordered layout runs backwards and the page-language labels are aligned against the page.

**Evidence.** components/studios/public/DeliverableSample.tsx:318 `const dir = meta.lang === 'ar' ? 'rtl' : meta.lang === 'en' ? 'ltr' : undefined;` applied at :331 `<div className="mt-6" dir={dir}>` — which wraps PlanSample/AnalysisSample/StoryboardSample entirely, labels included.
Measured live in a 1265px-wide viewport with getBoundingClientRect():
  /ar/studios/plan (page dir=rtl, block dir=ltr): Arabic table headers الهدف x=146, المؤشر x=735, المستهدف x=937 — left-to-right on an RTL page; the Arabic <h3>الأهداف</h3> computes text-align:start under dir:ltr and renders LEFT-aligned while the section heading directly above it (نموذج حقيقي من الاستوديو ده) is right-aligned. Visible in a screenshot of that section.
  /en/studios/storyboard (page dir=ltr, block dir=rtl): the three cards under the English heading "The first three scenes" render Scene 1 x=803, Scene 2 x=474, Scene 3 x=145 — the numbered sequence runs right-to-left on an English page.
  /en/studios/analysis (page dir=ltr, block dir=rtl): English SWOT labels Strengths x=656, Weaknesses x=162, Opportunities x=656, Threats x=162 — the quadrant order is mirrored.
The component header (:315-318) reasons only about the sample body ("A right-to-left English plan is ... bidi-mangled mixed text"), which is correct, and never considers that the same element carries the page-language labels and the ordering of a grid.

**Fix.** Move `dir` off the section container and onto the leaf nodes that actually hold sample-language text — the table cells, the scene dialogue/description paragraphs, the SWOT bullet lists — the way AudioSample.tsx:131 already does it for one paragraph. The `mt-6` wrapper, the `<h3>` section labels, the `<th>` column headers, the "Scene N" spans and the `grid` should keep the page's direction so ordered content still reads in the reader's direction.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Reproduced independently, source and live.

SOURCE: DeliverableSample.tsx:318 `const dir = meta.lang === 'ar' ? 'rtl' : meta.lang === 'en' ? 'ltr' : undefined;` applied at :331 `<div className="mt-6" dir={dir}>`, which wraps PlanSample/AnalysisSample/StoryboardSample whole. `labels` is a page-language prop (each page passes its own translations), and Section's <h3> (:117), PlanSample's <th> (:135-137), AnalysisSample's quadrant <h4> (:199) and StoryboardSample's "Scene N" span (:246) all render inside it.

WHICH PAGES: public/examples/studios/deliverable-plan.json is lang "en"; analysis and storyboard are "ar"; prompt-builder is "mixed". So exactly three pages flip. Confirmed in the shipped bytes: /ar/studios/plan serves `<div class="mt-6" dir="ltr">` under `<html lang="ar" dir="rtl">`; /en/studios/analysis and /en/studios/storyboard serve `dir="rtl"` under `dir="ltr"`; /ar/studios/prompt-builder has no dir on either wrapper.

MEASURED LIVE (Playwright, 1265px, getBoundingClientRect; my numbers differ from the finder's by ~9px, same facts):
- /en/studios/storyboard: Scene 1 x=796, Scene 2 x=467, Scene 3 x=137 — ordinal sequence right-to-left on an English page. The English <h3> "The first three scenes" computes direction:rtl, text-align:start, text range starts x=925 in a box spanning 137-1113 (right-aligned), while the English <h2> immediately above it, "A real sample from this studio", starts at x=137. Two English headings, stacked, opposite edges.
- /en/studios/analysis: Strengths x=648 / Weaknesses x=154 at the same y, Opportunities x=648 / Threats x=154 — quadrants mirrored; English "SWOT"/"KPIs" labels right-aligned at textX 1069/1080; KPI cards run 796 -> 467 -> 137.
- /ar/studios/plan: Arabic headers الهدف 154 -> المؤشر 744 -> المستهدف 945; Arabic <h3>s (الأهداف، القنوات والميزانية، جدول المحتوى) left-aligned at textX=137 while the Arabic <h2> نموذج حقيقي من الاستوديو ده is right-aligned at textX=782 in the same 137-1113 box; أسبوع 1 x=137, أسبوع 2 x=631.

REFUTATION ATTEMPTS THAT FAILED: not in the already-measured list (status codes, <h1>, ld+json elements, canonical/alternate, <audio>); not a known false finding (no grep -c, no ld+json double-count, no case-sensitive hreflang); CLAUDE.md's "Public studio pages" section documents the English plan sample and sampleLangNote but never direction, so it is not a recorded known-open item. The header at :315-318 is a deliberate decision but reasons only about the sample BODY, which is correct and is why part of what sits under the wrapper is right — the scope of the element is the defect, not the existence of dir. The sibling file settles intent: AudioSample.tsx:131 puts dir="rtl" on the leaf <p> holding the Arabic transcript and leaves transcriptLabel outside it in the page direction, with a comment calling it "the rule DeliverableSample states ... applied the other way round". DeliverableSample is the outlier against its own stated rule, so the proposed leaf-level fix is the established pattern, not a new invention.

SEVERITY: defect, not blocker. It misstates no capability, costs no money, breaks no function — but a numbered sequence rendering backwards and a mirrored SWOT under English labels are comprehension errors rather than style debt, and they are live on three public indexable pages.

</details>

### 10. [render] All four cross-language sample blocks: /ar/studios/plan, /ar/studios/prompt-builder, /en/studios/voiceover, /en/studios/storyboard, /en/studios/analysis

**Claim.** Every foreign-language block sets `dir` and never sets `lang`, so the document tells Google and a screen reader that an English marketing plan is Arabic and that an Arabic voiceover script is English — the exact document-level defect this repo already fixed once in "One document per route".

**Evidence.** Scanning the live HTML with scripts stripped, every studio page contains exactly THREE elements carrying a `lang` attribute: `<html>` plus the two LocaleSwitcher anchors. Zero on any sample block.
  /ar/studios/plan: `<div class="mt-6" dir="ltr"><div class="mt-8 first:mt-0"><h3 ...>الأهداف</h3>...` — an entirely English plan ("Increase monthly delivery order volume by 30 percent…", "Run geo-targeted ads within a 5km radius of Karama…") inside `<html lang="ar" dir="rtl">`, with dir corrected and lang not.
  /en/studios/voiceover: `<p class="mt-1 text-start text-[var(--color-text-secondary)]" dir="rtl">` holding شاورما الشام في الكرامة… inside `<html lang="en">`.
  /ar/studios/prompt-builder: three `<code dir="ltr">` blocks of English image briefs inside `<html lang="ar">`.
The components already KNOW the language: DeliverableSample.tsx:317 uses `meta.lang` to pick `dir` and :319 uses it to decide whether to show the "generated in the other language" note, then never emits it. AudioSample.tsx:126-133 has the same shape.
This matters more here than usual because these pages exist for answer engines: the plan sample is the only concrete English deliverable on /ar/studios/plan and it is served declared as Arabic.

**Fix.** DeliverableSample.tsx:331 — `<div className="mt-6" dir={dir} lang={meta.lang === 'mixed' ? undefined : meta.lang}>` (paired with the leaf-level fix in the previous finding, put `lang` on the same leaves as `dir`). AudioSample.tsx:131 — add `lang="ar"` beside the existing `dir="rtl"`; the transcript is Arabic on both locales by construction. Add a check to test:studio-pages asserting that any element carrying `dir` inside a sample also carries `lang`.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Independently reproduced on the live site and in the source. Fetching all five pages, stripping <script> elements, and counting with a case-insensitive global regex (not grep -c on a one-line document) returns exactly 3 lang-carrying elements per page: <html> plus the two LocaleSwitcher anchors (<a hrefLang="en" lang="en" aria-label="تغيير اللغة: English">), whose lang is correct usage. Zero lang on any sample block; xml:lang is 0 everywhere. The dir-carrying blocks are genuinely cross-language: /ar/studios/plan has <div class="mt-6" dir="ltr"> holding "Increase monthly delivery order volume by 30 percent…" inside <html lang="ar" dir="rtl">; /en/studios/voiceover has <p … dir="rtl"> holding "شاورما الشام في الكرامة…" inside <html lang="en">; /en/studios/analysis and /en/studios/storyboard each have <div class="mt-6" dir="rtl"> holding Arabic SWOT and Arabic scene text; /ar/studios/prompt-builder has three <code dir="ltr"> holding English 85mm-macro image briefs. Source confirms the language is computed then discarded: DeliverableSample.tsx:318 derives dir from meta.lang and :331 emits dir={dir} with no lang; AudioSample.tsx:131 emits dir="rtl" with no lang, and its comment at :126-130 reasons purely about direction, as does DeliverableSample.tsx:277-279 for the prompt-builder <code>. scripts/tests/studio-pages.test.ts contains no lang assertion. Not in the already-measured-and-passing list, not one of the known false-finding instruments, and not recorded in CLAUDE.md's "Still open, deliberately" for this round.

Two corrections to their framing, neither fatal. (1) The SEO half is overstated: Google states it ignores lang attributes for language determination and uses visible content, so "tells Google that an English marketing plan is Arabic" is not supportable — the answer-engine argument they lean on hardest is the weak half (Bing does use the hint, so not zero). (2) Three of five pages already ship the human-visible sampleLangNote (ar-plan 1, en-sb 1, en-an 1; en-vo 0 because AudioSample has no such prop, ar-pb 0 because meta.lang is 'mixed'), so a sighted reader is not misled. What survives is a clean WCAG 2.1 SC 3.1.2 "Language of Parts" (Level AA) failure on five live pages: a screen reader announces an Arabic SWOT in an English voice and an English media plan in an Arabic one.

Caveat on the proposed fix: patching only DeliverableSample.tsx:331 leaves /ar/studios/prompt-builder untouched, because its meta.lang is 'mixed' so dir there is already undefined and the three English <code> blocks take dir="ltr" from :279 instead — that leaf needs lang="en" of its own or the fix ships half-done on the one page where mixing is by design.

Severity: defect, not blocker — no money, data or security exposure, and the fix is one attribute at each of three sites where the value is already in scope.

</details>

### 11. [render] All 20 /{ar,en}/studios/<slug> pages and both /{ar,en}/studios index pages

**Claim.** The X/Twitter card on every studio page is the site-wide landing default, so all 22 URLs share one card that describes the platform rather than the page — while the Open Graph card on the same page is page-exact. Anyone sharing /en/studios/creator on X advertises "PyraSuite — AI Marketing Platform".

**Evidence.** Live /en/studios/creator <head>:
  <meta property="og:title" content="Image Creator — AI ad images that get Arabic right"/>
  <meta property="og:description" content="Type a sentence in Arabic and get a publish-ready ad image…"/>
  <meta name="twitter:title" content="PyraSuite — AI Marketing Platform"/>
  <meta name="twitter:description" content="Turn any idea into a professional marketing campaign in minutes — 9 AI studios and a transparent credit system."/>
  <meta name="twitter:image:alt" content="PyraSuite — AI Marketing Platform"/>
Measured across all 20 studio documents plus both index pages: twitter:title is byte-identical within each locale ("PyraSuite — AI Marketing Platform" / "PyraSuite — منصة التسويق بالذكاء الاصطناعي"), including on the index whose og:title is "The nine PyraSuite studios — AI marketing built for Arabic".
Cause: app/[locale]/(landing)/studios/[slug]/page.tsx:66-73 returns `{ title, description, alternates, openGraph }` and no `twitter`; app/[locale]/layout.tsx:73-77 defines `twitter: { card, title: og.title, description: og.description }` with the segment-level values, and Next keeps the segment's object when the page supplies none. lib/seo/alternates.ts:71-79 (`publicOpenGraph`) sets openGraph only — its header at :54-58 documents Next's shallow openGraph merge but never covers twitter, which does not merge at all here because the page never declares it. The same gap applies to /studios/page.tsx.

**Fix.** Give lib/seo/alternates.ts a `publicTwitter(title, description)` beside `publicOpenGraph` (returning `{ card: 'summary_large_image', title, description }`) and spread it from both studio pages' generateMetadata, so the two channels cannot describe different pages. Extend test:alternates (already 37 checks on canonical/hreflang) with "twitter:title equals og:title on every public page" — it is the same one-source-of-truth rule that file already enforces for canonical.

<details><summary>The skeptic could not refute it — their reasoning</summary>

REPRODUCED INDEPENDENTLY AGAINST THE LIVE SITE AND THE SOURCE. Survives.

Live measurement (node fetch over all 22 studio URLs plus controls, 2026-09-03). Every one of the 20 `/{ar,en}/studios/<slug>` documents and both index documents carries a page-exact `og:title` and a locale-generic `twitter:title`:

    /en/studios/creator   OG: "Image Creator — AI ad images that get Arabic right"
                          TW: "PyraSuite — AI Marketing Platform"
    /ar/studios/voiceover OG: "التعليق الصوتي — صوت عربي بلهجة خليجية أو سعو…"
                          TW: "PyraSuite — منصة التسويق بالذكاء الاصطناعي"
    /en/studios (index)   OG: "The nine PyraSuite studios — AI marketing bui…"
                          TW: "PyraSuite — AI Marketing Platform"

twitter:title is byte-identical within each locale across all 22, exactly as claimed. `twitter:description` likewise ("Turn any idea into a professional marketing campaign in minutes — 9 AI studios and a transparent credit system."). X/Twitter gives `twitter:*` precedence over `og:*`, so the og fix does not rescue the card.

Cause verified at the named lines. `app/[locale]/layout.tsx:73-77` is the ONLY `twitter:` metadata declaration in the entire repo — `grep -rn "twitter" --include=*.ts --include=*.tsx app lib scripts` returns four hits, of which three are `platform: 'twitter'` (campaign canvas) and one comment; nothing overrides it. `app/[locale]/(landing)/studios/[slug]/page.tsx:66-73` returns `{ title, description, alternates, openGraph }` with no `twitter`, and `lib/seo/alternates.ts:70-93` (`publicOpenGraph`) sets openGraph only. Its own header at :55-67 documents Next's shallow openGraph merge and even mentions "twitter:image, which Next derives from it" — the author knew the twitter channel existed and still left title/description un-forwarded.

Not in the already-passing list (that covers canonical, hreflang, ld+json elements, h1, audio, sitemap — nothing about twitter). Not one of the known false findings. `grep -n -i twitter CLAUDE.md` returns exactly one line, 1412, about `platform: 'twitter'` image ratios — this is NOT recorded as a deliberate known-open item anywhere. `scripts/tests/alternates.test.ts` contains no twitter assertion (82 lines; only openGraph mentions), so the proposed gate extension is genuinely absent.

TWO CORRECTIONS to the finding, neither of which refutes it:

1. Scope is UNDERSTATED, not overstated. The same defect is on every public page that declares its own metadata: `/ar/pricing`, `/en/pricing`, `/ar/contact`, `/en/contact`, `/ar/privacy`, `/ar/terms` all serve the generic twitter:title. It is not 22 URLs, it is every non-landing public page — the studio pages are just the 20 newest. Only `/ar` and `/en` are correct, and only because the layout's og.title IS the landing title. The fix therefore belongs in `publicOpenGraph`'s neighbourhood as proposed, but must be applied to the pricing/contact/privacy/terms pages too or the gate will fail on them.

2. The `twitter:image:alt content="PyraSuite — AI Marketing Platform"` line quoted as evidence is NOT part of the defect and should not be filed. It is `OG_IMAGE.alt` (`lib/seo/alternates.ts:66-68`), and the image genuinely IS the one site-wide card image — the comment there deliberately keeps one English string because the file-based `opengraph-image` convention cannot branch on locale. The alt correctly describes the picture being served. The defect is title and description only.

Severity: defect, not blocker and not nit. It is not the project's signature "page claims something the product does not do" class — nothing here is a false capability claim, so it is not a blocker. But it is not cosmetic either: these 20 URLs exist solely for acquisition on high-intent product terms, and the one channel where a share renders is X, where the card advertises the platform instead of the studio. It is reproducible, one-line-per-page to fix, and the same one-source-of-truth rule `lib/seo/alternates.ts` already enforces for canonical and hreflang.

</details>

### 12. [linking] All 20: /{ar,en}/studios and /{ar,en}/studios/<nine slugs>

**Claim.** The sticky header's two content nav items — «الاستوديوهات» (href="#studios") and «المميزات» (href="#features") — are dead links on all 20 new pages: neither fragment id exists in the document. The nav item literally labelled "Studios" does nothing on the studios pages.

**Evidence.** Scan of all 20 live pages (fragment anchors vs. every id="…" in the whole document, scripts included): every one prints `fragAnchors=["features","studios"] broken=["features","studios"]` → `20 of 20 pages carry a dead in-page fragment link`. Element ids on https://pyrasuite.pyramedia.cloud/ar/studios/creator = `[]`; on https://pyrasuite.pyramedia.cloud/ar = `["features","studios","pricing","faq"]`. Anchor dump of /ar/studios/creator: `1 #features | المميزات`, `2 #studios | الاستوديوهات`. Source: components/landing/NavBar.tsx:19-22 defines NAV_LINKS with those bare fragments, and its own comment at NavBar.tsx:12-13 says «"features" and "studios" stay in-page anchors — those sections only exist on the landing page» — while app/[locale]/(landing)/studios/[slug]/page.tsx:4 and app/[locale]/(landing)/studios/page.tsx:3 import NavBar anyway. NAV_LINKS is mapped at NavBar.tsx:63 (desktop) and :112 (mobile), so the mobile menu carries the same two dead links. Pre-existing on /ar/pricing, /ar/privacy, /ar/terms (same scan: broken=["features","studios"]); only /ar and /en are clean. CLAUDE.md records only that «/studios is not in the NavBar — NavBar.tsx:21 is still the #studios anchor. A navigation decision» — that frames the anchor as working-but-pointing-elsewhere; live, it points nowhere on 26 public pages.

**Fix.** Make the two entries locale-home-relative rather than in-page — next-intl `Link href="/#studios"` renders `/ar#studios`, which works on the landing page and on every other page. Better: point the `studios` entry at `/studios`, which fixes this and the index-hub discoverability in one edit. Add a `test:studio-pages` check that every `href="#x"` in a prerendered document has a matching `id="x"` in that same document (the check must fail when it matches nothing, per mock-from-schema.test.ts:247).

<details><summary>The skeptic could not refute it — their reasoning</summary>

Independently reproduced against the live site and the repo. Live scan (2026-09-03) of fragment hrefs vs every id="…" in the full document: all 20 studio URLs print frags=["features","studios"] broken=["features","studios"] with ids=["_R_"] — no element ids exist in those documents at all. Anchor dump of https://pyrasuite.pyramedia.cloud/ar/studios/creator: `a1 #features | المميزات`, `a2 #studios | الاستوديوهات`; /en/studios: `a1 #features | Features`, `a2 #studios | Studios`. The scan is not producing false positives: /ar and /en print broken=[] with ids=["features","studios","pricing","faq",…]. Pre-existing confirmed on /ar/pricing, /ar/privacy, /ar/terms (broken=["features","studios"]) — 21 of 24 sampled pages.

Source verified: components/landing/NavBar.tsx:19-23 defines NAV_LINKS with bare "#features"/"#studios"; NAV_LINKS is mapped at :63 (desktop) and :112 (mobile), so both surfaces carry them (the mobile copy sits inside AnimatePresence/mobileOpen, so its absence from prerendered HTML is expected, not counter-evidence). app/[locale]/(landing)/studios/[slug]/page.tsx:4,214 and app/[locale]/(landing)/studios/page.tsx:3,102 render <NavBar />. grep over scripts/tests/ for 'href="#' returns nothing — no gate covers this.

Skeptic checks: not in the already-measured list (sitemap/status/h1/ld+json/alternates/canonical/audio/robots); not a known false finding (no ld+json double-count, no case-sensitive hreflang, no grep -c on a one-line document, no alt=""). The strongest refutation candidate is CLAUDE.md's bullet "/studios is not in the NavBar — NavBar.tsx:21 is still the #studios anchor. A navigation decision, deliberately out of scope." It does NOT cover this: the deliberate decision recorded is declining to ADD a /studios entry, and its wording — plus NavBar.tsx:12-13's own comment "those sections only exist on the landing page" — frames the anchor as pointing at the landing section. A bare #studios resolves within the current document and finds nothing; it does not navigate to the landing page. Recorded state and live behaviour differ, which is this repo's most-logged defect class.

Trimming the claim: this is not a regression the studio round introduced. The class pre-exists on 6 older public pages (pricing, privacy, terms × two locales) and the reviewer's own evidence says so; the round multiplied it by 20 onto the pages where the "Studios" label is maximally wrong.

Severity: defect, not blocker — nothing touches money, security, or a false claim about what the product generates. Not a nit either: two of three desktop nav items are inert on 20 brand-new pages built to receive cold search traffic, and the item labelled "Studios" does nothing on the studios pages themselves.

</details>

### 13. [linking] All 20 studio pages, e.g. /ar/studios/creator

**Claim.** There is no route home from the header, and with the two dead anchors above the header on a studio page carries exactly ONE working navigation link (Pricing). The logo is a <span>, not a link, and no anchor on the page points at /ar.

**Evidence.** `href="/ar"` exact-match anchors on /ar/studios/creator (scripts stripped): **0**. Full anchor dump of that page, in document order: `#features`(dead), `#studios`(dead), `/ar/pricing`, `/en/studios/creator`(locale switch), `/ar/login`, `/ar/signup`, then body CTAs, then `/ar/studios` («كل الاستوديوهات») at position 11 of 21 — i.e. below the related-studio cards, near the end of the content — then the footer. Source: components/landing/NavBar.tsx:59 renders `<span className="text-2xl font-bold …">PyraSuite</span>`, not a Link. Home is reachable only by scrolling to the footer, whose `/ar#studios` and `/ar#faq` links happen to land on the homepage.

**Fix.** Wrap the NavBar logo in next-intl `Link href="/"`. That is one line and it also gives the BreadcrumbList's crumb 1 a real on-page counterpart.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Independently reproduced on the live site and in the repo, and it survives every refutation test.

LIVE EVIDENCE. curl https://pyrasuite.pyramedia.cloud/ar/studios/creator, <script> elements stripped, anchors counted with a global regex (not grep -c): 21 anchors in exactly the order claimed — 1 #features, 2 #studios, 3 /ar/pricing, 4 /en/studios/creator, 5 /ar/login, 6 /ar/signup, 7 /ar/signup, 8 /ar/pricing, 9 /ar/studios/photoshoot, 10 /ar/studios/edit, 11 /ar/studios, 12-15 /ar#studios, 16 /ar/contact, 17 /ar/pricing, 18 /ar#faq, 19 /ar/privacy, 20 /ar/terms, 21 /en/studios/creator. Exact href="/ar" count: 0. Same shape on /ar/studios/voiceover, /ar/studios/plan and /en/studios/creator (21 anchors, 0 exact home href) and on /ar/studios and /en/studios (27 anchors, 0). Anchor 11 (/ar/studios, "كل الاستوديوهات") is the last element inside <main>, immediately before </main>, below the related-studio cards — confirmed by printing the surrounding markup.

THE TWO HEADER ANCHORS ARE GENUINELY DEAD, NOT MERELY FRAGMENTS. On /ar/studios/creator: id="features" = 0 and id="studios" = 0 occurrences, and 0 even in the RAW bytes including the self.__next_f flight payload, so nothing renders those targets client-side either. On /ar both are 1. A plain <a href="#features"> whose target does not exist sets the fragment and does nothing — it does not fall back to the homepage. The mobile drawer carries the same two anchors, its onClick only closing the menu (NavBar.tsx:110-119).

SOURCE. components/landing/NavBar.tsx:59 is exactly `<span className="text-2xl font-bold text-[var(--color-brand)] font-cairo">PyraSuite</span>` — not a Link. NAV_LINKS (NavBar.tsx:19-23) hard-codes features/studios as '#' anchors, and the file's own comment concedes "those sections only exist on the landing page" — true when NavBar was landing-only; the studio pages now import and render it themselves (studios/[slug]/page.tsx:4,214; studios/page.tsx:3,102). `grep 'href="/"' components/landing/NavBar.tsx components/landing/Footer.tsx` returns nothing (exit 1). Footer.tsx:7-10 are /#studios and Footer.tsx:18 is /#faq — the only anchors that land on the homepage, confirming "home is reachable only by scrolling to the footer."

NOT ALREADY COVERED. The already-measured list is sitemap/200s/canonical/hreflang/ld+json element count/audio/robots — nothing about internal links or navigation. Not one of the known false findings (I counted ld+json with a <script ...> element regex: 1; I did not use grep -c on the one-line document; hreflang is irrelevant here). CLAUDE.md's nearest open item — "/studios is not in the NavBar — NavBar.tsx:21 is still the #studios anchor. A navigation decision, deliberately out of scope" — records the hub-in-nav decision only; it does not record that the anchor is now DEAD (no target) on 20 new public pages, nor that there is no route home at all.

ONE THING THE FINDER UNDERSTATED, AND IT RAISES THE SEVERITY. The page's own JSON-LD BreadcrumbList declares position 1 = {"name":"PyraSuite","item":"https://pyrasuite.pyramedia.cloud/ar"} — a URL the document links to zero times. The structured data asserts a hierarchy the HTML does not implement, on all 20 pages. That is this repo's own defect class (a page declaring something it does not do), in machine-readable form.

ONE IMPRECISION, NOT A REFUTATION. "Exactly ONE working navigation link" is true of NAV_LINKS only; the header also carries a working locale switch, login and signup. Their own evidence dump lists all three, so nothing is hidden.

SEVERITY. Not a nit: a control that does nothing when clicked, on every page of a public surface built specifically for organic entry, is a functional defect — a visitor arriving from Google on /ar/studios/creator who clicks "الاستوديوهات" in the header gets nothing, and has no way to reach the homepage without scrolling past the entire page. It is not a blocker: nothing breaks, no money moves, no product-capability claim is false. Defect.

ON THE PROPOSED FIX. Wrapping the logo in next-intl Link href="/" is correct and one line, and it does give BreadcrumbList crumb 1 an on-page counterpart — but it closes only half the finding. The two dead anchors remain dead on all 20 pages; they need to become /#features and /studios (or /#studios) so they work off the landing page.

</details>

### 14. [linking] /llms.txt

**Claim.** The file the site publishes for answer engines lists seven URLs and not one of them is a studio page or the /studios index — the twenty pages built for answer engines are invisible to the file that exists to point answer engines at content.

**Evidence.** `curl -s https://pyrasuite.pyramedia.cloud/llms.txt` → the `## Links` block is exactly: Home (Arabic) /ar, Home (English) /en, Pricing /ar/pricing, Sign up /ar/signup, Contact /ar/contact, Privacy /ar/privacy, Terms /ar/terms. Scan for studio URLs: the only two matches anywhere in the file are the bare words `studios,` and `studios)` in prose — zero `/studios` URLs. Source: public/llms.txt:24-32. For contrast, the `## What it does (the nine studios)` block at public/llms.txt:7-17 describes all nine studios in prose and gives no URL for any of them, while sitemap.xml carries 20 studio `<loc>` entries (`curl … | grep -o '<loc>[^<]*studios[^<]*</loc>' | wc -l` → 20 of 30).

**Fix.** Add the nine slug URLs plus /ar/studios and /en/studios to public/llms.txt, generated from lib/studios/catalogue.ts so the file cannot drift from the routes — the same rule that makes app/sitemap.ts:2 read the catalogue. Extend test:studio-pages to assert every catalogue slug appears in llms.txt.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Independently reproduced on the live site and in the repo. `curl -s https://pyrasuite.pyramedia.cloud/llms.txt` returns 200 / 2550 bytes, and its `## Links` block is exactly seven URLs — /ar, /en, /ar/pricing, /ar/signup, /ar/contact, /ar/privacy, /ar/terms — with zero /studios URLs anywhere in the file (the only occurrences of "studios" are prose: the "## What it does (the nine studios)" heading and "9 استوديوهات"). The live bytes match public/llms.txt exactly (diff shows only a CRLF/LF line-ending difference); the Links block is public/llms.txt:24-32 and the nine-studio prose block that gives no URL for any studio is public/llms.txt:7-17. Contrast re-measured live: `curl -s .../sitemap.xml | grep -o '<loc>[^<]*studios[^<]*</loc>' | wc -l` → 20 of 30 total <loc>.

Not already covered: the pre-measured list covers robots.txt (38 Disallows, GPTBot named) and the sitemap count, but nothing about llms.txt content. Not a known false-finding class (no ld+json double-count, no case-sensitive hreflang, no grep -c on a one-line document — llms.txt is a real multi-line text file). Not a recorded known-open: the studio-pages round's "Still open, deliberately" list names the footer /#studios links, the NavBar anchor, the Arabic plan sample, /use-cases and /compare, and the missing alt-text gate — it does not mention llms.txt, which the SEO round records as "✅ built" and nobody revisited when the twenty pages shipped.

No gate prevents the drift, verified rather than assumed: grep for "llms" across the repo (excluding node_modules) hits only CLAUDE.md, docs/superpowers/plans/2026-09-02-seo-geo-quick-wins.md, and scripts/tests/robots.test.ts. That test (robots.test.ts:42-50) asserts only existence, the product name, the Arabic definition, a /pricing link, and no model-vendor names. Nothing ties llms.txt to lib/studios/catalogue.ts, which app/sitemap.ts:2 does read (`import { STUDIO_SLUGS } from '@/lib/studios/catalogue'`); the catalogue's nine slugs are at catalogue.ts:56-96.

Trimming the claim where it overreaches: this is an omission, not the "claims a capability the product lacks" class — nothing in llms.txt is false. And the pages are NOT invisible to answer engines generally: they are in the sitemap (20 locs, measured live), linked from StudiosShowcase.tsx:169, and robots.txt allows the named AI crawlers. The defensible statement is the narrower one the finder actually wrote — invisible to the one file that exists to point answer engines at content. That, plus the fact that llms.txt is an unofficial convention with unproven crawler weight, bounds the impact: a missed opportunity on the round's own stated purpose (GEO discoverability), not a broken path or a false promise. Hence defect, not blocker, and more than a nit because it is the single file dedicated to the goal the twenty pages were built for.

Caution on the proposed fix, from this repo's own history: llms.txt is a static public/ file. Implementing "generate from the catalogue" as app/llms.txt/route.ts while leaving public/llms.txt in place would ship a dead generator — Next serves the public/ file over a same-named metadata route, which is byte-for-byte the public/robots.txt shadowing defect recorded in the SEO round. Regenerate the static file at build time or delete it in the same commit, and extend test:studio-pages to assert every STUDIO_SLUGS entry appears in whatever ships.

</details>

### 15. [payload] /{ar,en}/studios/{creator,photoshoot,campaign,edit} — the 8 image-bearing studio pages

**Claim.** The `sizes` attribute declares 50vw (45vw on edit) while the measured slot is 478 CSS px at a 1920 viewport — 24.9vw. A real DPR-1 Chrome therefore downloads the w=1080 candidate and decodes it at 960 px into a 478 px box: 2.01x linear, 4.04x the pixels. This is the single largest avoidable payload on these pages, and the landing page's own image already does it correctly.

**Evidence.** Playwright, real Chrome, viewport 1920x1080, devicePixelRatio 1.0000000149011612, https://pyrasuite.pyramedia.cloud/ar/studios/creator:
  {cssW:478, src:"?url=/examples/studios/creator-shawarma-square.webp&w=1080&q=75", natural:"960x960"}  (all four figures identical: cssW 478, w=1080, natural 960x…)
  transfer.imgOpt = 252,889 bytes
Same run on /ar/studios/campaign: two images, cssW 478 each, both w=1080, natural 910x910, transferSize 79,580 and 184,978 -> imgOpt 264,558 bytes. campaign-post-2 alone is 184,978 B for a 478 px box.
The correct candidate (w=640) measured with `Accept: image/avif,...`:
  creator four images  36,352 + 42,777 + 38,529 + 21,475 = 139,133 B  (vs 252,889 served, -45%)
  campaign two images  41,210 + 85,554        = 126,764 B  (vs 264,558 served, -52%)
  photoshoot four      12,332+12,114+14,186+14,135 = 52,767 B (vs 104,877 at w=1080)
Source: components/studios/public/StudioExamples.tsx:31 `sizes="(max-width: 640px) 100vw, 50vw"` inside `section.mx-auto.max-w-5xl.px-6` (:22) with `div.grid.sm:grid-cols-2.gap-4` (:25) — 1024 - 48 padding - 16 gap, / 2 = 480 px, and Chrome measured 478. components/studios/public/BeforeAfter.tsx:52,68 do the same with 45vw.
CONTRAST, same site, same day: /ar landing declares `sizes="(max-width: 768px) 100vw, 480px"` — a px value matching its container — and Chrome fetched w=640, natural 480x480 into a 496 px slot (0.97x). Total /_next/image transfer on /ar: 47,106 B. The older page gets this right; the new ones do not.

**Fix.** Replace the vw value with the container's real px width, the way the landing page already does: `sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 480px"` in StudioExamples.tsx:31, and `... , 456px` in BeforeAfter.tsx:52,68. Measured saving at 1920/DPR1: 114 kB on creator, 138 kB on campaign, 52 kB on photoshoot, 27 kB on edit — per locale, so 16 pages.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Independently reproduced end to end. (1) Live HTML confirms the attribute: curl of https://pyrasuite.pyramedia.cloud/ar/studios/creator (200, 175,135 B) shows all four <img> with sizes="(max-width: 640px) 100vw, 50vw" and srcset widths 384,640,750,828,1080,1200,1920,2048,3840; /ar/studios/campaign and /ar/studios/photoshoot identical; /ar/studios/edit carries 45vw. Source confirmed at components/studios/public/StudioExamples.tsx:33 and components/studios/public/BeforeAfter.tsx:54,69 (finder's line numbers were off by two). (2) The 478 px slot is derivable without trusting their Playwright run: max-w-5xl = 64rem = 1024 (no maxWidth override in tailwind.config.ts), px-6 = 48, gap-4 = 16 -> (1024-48-16)/2 = 480 CSS px column, and the <figure> carries a 1px border each side, so the <img> content box is exactly 478 — matching their measurement precisely. At 1920/DPR1, 50vw asks 960 -> browser takes w=1080; the correct ask (480) takes w=640. 2.01x linear, 4.04x pixels. Edit's slot: (976 - 2*16 gap - 32 arrow)/2 = 456, and 45vw asks 864 -> also w=1080. (3) Bytes re-measured myself with Accept: image/avif,...: creator w=1080 64,309+77,582+69,390+40,348 = 251,629 vs w=640 36,352+42,777+38,529+21,475 = 139,133 (their w=640 sum matches to the byte); campaign 79,264+184,662 = 263,926 vs 41,210+85,554 = 126,764; photoshoot 106,877 vs 52,767; edit 60,213 vs 32,934. Savings 112k/137k/54k/27k per page, per locale. (4) The in-repo counter-example is real: components/landing/InteractiveDemo.tsx:232 is sizes="(max-width: 768px) 100vw, 480px", live on /ar. Exclusion checks: not in the already-measured-and-passing list (sitemap, status codes, ld+json, hreflang, canonical, audio); not one of the known false findings (no grep -c on a one-line doc, no ld+json double count, no case-sensitive hreflang); not recorded as deliberate anywhere in CLAUDE.md — the SEO round's test:config-hygiene covers image cache headers and Inter preload, never `sizes`. Two corrections to their evidence, neither fatal: their photoshoot w=1080 figure (104,877) is 2 kB off my measurement (106,877), and their served figures are transferSize so run ~0.5-1 kB high. Two things they omitted that bear on severity: every one of these images is loading="lazy" decoding="async" with no fetchPriority and zero rel=preload for /_next/image in the document, so this is deferred bandwidth on scroll rather than an LCP or initial-render block — which caps it below blocker; and at DPR 2 it is worse than stated, since 50vw then asks 1920 and gets w=1920 (111,619 B for creator-shawarma-square alone vs 64,309 at w=1080). Not the repo's signature "page claims what the product does not do" class, but a documented misuse of `sizes` (the value must describe the rendered width), reproducible, measured, affecting 16 public pages, with a one-line fix and a correct precedent in the same codebase.

</details>

### 16. [payload] all 20 studio pages (both locales), and every other public page

**Claim.** 121,264 bytes across 8 woff2 files are preloaded at highest priority on every page, byte-identically in ar and en — 3.0x the page's own HTML transfer, and more than the entire image payload of the 12 studio pages that have no images. The family that actually renders English body copy (Inter) is the one explicitly excluded from preloading, so the preload budget is spent on the two families that do not. The gate written for exactly this class is stated on one family NAME and cannot see the other two.

**Evidence.** curl on /ar/studios/plan and /en/studios/plan returns the identical 8 `<link rel="preload" ... as="font">` tags. Byte sizes fetched individually:
  01f0c602c274ea55 33,644 (Cairo latin)   350b852752f8489d 30,712 (Cairo arabic)
  dd994fbf464986f0  8,916 (Tajawal ar 400) e97026df054cf2a3 10,228 (Tajawal lat 400)
  63a79a6cf340c5d2  8,868 (Tajawal ar 500) f15f45d13243c643  9,868 (Tajawal lat 500)
  1ebb550cd0a67fc6  9,040 (Tajawal ar 700) ce401babc0566bc1  9,988 (Tajawal lat 700)
  TOTAL = 121,264
Family/subset mapping read from the shipped @font-face rules in /_next/static/css/6d0373892779de0b.css + 9cf1c8304171177f.css (49 faces).
Playwright on /en/studios/plan: getComputedStyle(document.body).fontFamily = 'Inter, "Inter Fallback", sans-serif'. Resource timing shows the 8 preloads at startTime 424-425 ms with initiatorType 'link', and the Inter latin file e4af272ccee01ff0-s.woff2 at 444 ms with initiatorType 'css' — the face every English word renders in arrives last, by design.
Cause: app/fonts.ts:45-53 `Cairo({subsets:['arabic','latin'], weight:['400','500','600','700']})` and :55-60 `Tajawal({subsets:['arabic','latin'], weight:['400','500','700']})` — neither passes `preload`, so both default to true for every subset. Only :62-68 `Inter({... preload: false})` opts out.
Gate blindness: scripts/tests/config-hygiene.test.ts:29 is the sole font assertion — `check('Inter is not preloaded (unused on /ar)', /Inter\(\{[\s\S]*?preload:\s*false/.test(fonts))`. It names one constructor. Cairo and Tajawal are unasserted.
On /en the four Arabic-subset files (57,536 B) exist to render 14 characters: the two locale-switcher links reading العربية, measured as `{tag:'A', lang:'ar', text:'العربية', font:'Tajawal, "Tajawal Fallback", sans-serif'}`.

**Fix.** Set `preload: false` on the subsets a given document cannot need — at minimum drop the arabic subset from the preload set on /en and the Tajawal latin faces (30,084 B) everywhere — and widen config-hygiene.test.ts:29 from the literal `Inter(` to every `next/font/google` call in app/fonts.ts, asserting an explicit `preload` decision per family rather than a single name.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Independently reproduced against live production and the repo.

LIVE: `curl .../ar/studios/plan` and `.../en/studios/plan` each return the same 8 `<link rel="preload" ... as="font" type="font/woff2">` tags (regex over the one-line document, not grep -c). Fetched individually, the bytes are exactly as claimed: 33644+9040+30712+8868+9988+8916+10228+9868 = 121,264. Family/subset mapping verified from the shipped @font-face rules in /_next/static/css/6d0373892779de0b.css + 9cf1c8304171177f.css (49 faces): 01f0c602c274ea55=Cairo latin, 350b852752f8489d=Cairo arabic, and the six Tajawal files split ar/lat at 400/500/700. Inter's seven faces are present in that CSS (latin = e4af272ccee01ff0-s.woff2) and appear in NO preload tag.

SOURCE: app/fonts.ts:44-49 (Cairo) and :51-56 (Tajawal) pass no `preload`, so it defaults true for every declared subset; :63 `preload: false` is the only opt-out and it is on Inter. scripts/tests/config-hygiene.test.ts:29 is the ONLY font assertion in scripts/ (`grep -rn preload scripts/ --include=*.ts` returns that one line) and is stated on the literal /Inter\(\{[\s\S]*?preload:\s*false/ — Cairo and Tajawal are unasserted. `git log -- app/fonts.ts` shows cb596b5 "…stop preloading Inter", and CLAUDE.md:1734 records the intent as "Inter preloaded nine files on /ar, the default locale, which never uses it | fixed". So the round whose purpose was removing wasted font preload fixed one family and wrote a gate that structurally cannot see the other two. Nothing in CLAUDE.md records Cairo/Tajawal preload as deliberate or known-open.

SCALE: the identical 8 preloads appear on /ar, /en, /ar/pricing, /en/pricing, /ar/studios, /en/studios, /ar/studios/creator, /en/studios/voiceover, /ar/contact and /admin/login (which renders in Inter). /en/login carries 0 — proving the set is layout-emitted, not page-aware, so no "Next only preloads what the page needs" defence exists. Gzip transfer of /ar/studios/plan is 41,338 B, so 121,264/41,338 = 2.93x ≈ the claimed 3.0x. The 12 studio pages with no content images (10 slug + 2 index) carry exactly one <img> each: the Meta 1x1 noscript beacon — so their content image payload really is 0.

CSS scoping confirms the waste is locale-shaped: `[lang=ar]{font-family:var(--font-tajawal)}`, `[lang=ar] h1..h4{var(--font-cairo)}`, `[lang=en]{font-family:var(--font-inter)}`. On /en the only Arabic is "العربية" on two locale-switcher anchors carrying lang="ar" (14 rendered characters), matching their measurement.

THREE CORRECTIONS, none fatal:
1. Cairo DOES render on /en — the `.font-cairo` utility is applied to the <h1>, the "PyraSuite" wordmark and the footer heading (three DOM occurrences in en_plan.html plus two flight-payload copies). So "the preload budget is spent on the two families that do not [render English]" is wrong for Cairo. The precise /en waste is 60,796 B that no character on the document can use — Cairo arabic (30,712) + Tajawal's three latin faces (30,084, since [lang=ar] is Tajawal's only selector and those anchors hold no Latin) — plus Tajawal's three arabic faces (26,824) serving 14 characters.
2. "highest priority" overstates it; Chrome gives preloaded fonts High. Their own timing (424 ms preloads vs Inter at 444 ms via css) shows ordering, not top priority.
3. Fonts serve `Cache-Control: public, max-age=31536000, immutable`, so this is a first-visit-only cost — which is precisely the visit these SEO landing pages exist for, on a deployment CLAUDE.md itself records as having no CDN and 0.3–0.5 s TLS from the Gulf.

Not in the already-measured list, not one of the known false instruments, not documented as a deliberate trade. Severity: defect, not blocker — nothing is broken, no customer-facing claim is falsified, and roughly half the 121 KB is legitimately used on /ar, the default locale. It sits above nit because it is reproducible on every public page, has a named file:line cause, and the gate written for exactly this class (config-hygiene.test.ts:29) is blind to two of three families — the same "a rule stated on one name is not a rule" shape this repo has paid for repeatedly.

</details>

## nit (5)

### 1. [schema] /ar/studios/creator (and all 20 studio pages, via /ar and /en)

**Claim.** The three shared graph nodes the studio pages point at — #website, #software, #organization — are emitted with CONFLICTING values under the same @id on /ar and /en. WebSite.url and SoftwareApplication.url are single-valued properties holding two different URLs for one entity. lib/seo/schema.ts:107-109 already states this exact rule and fixed it for Organization.url only.

**Evidence.** Parsed the ld+json <script> element on /ar and /en and diffed nodes by @id:
  #website  (WebSite)  url  /ar: "https://pyrasuite.pyramedia.cloud/ar"  /en: "https://pyrasuite.pyramedia.cloud/en"
  #software (SoftwareApplication) url  /ar: ".../ar"  /en: ".../en";  also description, featureList and offers differ (Arabic vs English, untagged)
  #organization (Organization) description differs; contactPoint.url  /ar: ".../ar/contact"  /en: ".../en/contact"
Source: lib/seo/schema.ts:128 `url: `${APP_URL}/${locale}`` (WebSite) and :149 same (SoftwareApplication), while :107-109 reads "// ONE url under ONE @id. It was `/{locale}`, so the same entity claimed two different homepages depending on which page an engine fetched." and sets `url: APP_URL` for Organization alone. All 20 studio pages reference these ids at lib/seo/studio-schema.ts:42-44 and :95-97.

**Fix.** Apply schema.ts:107-109's own rule to the other two nodes: `url: APP_URL` at lib/seo/schema.ts:128 and :149. Then decide what to do with the locale-varying content on shared ids — either drop description/featureList/offers/contactPoint from the shared nodes and put them on a locale-scoped @id (e.g. `${APP_URL}/${locale}/#software`), or keep one canonical language. A gate in test:schema asserting that buildWebSiteSchema('ar') and ('en') differ in no field would pin it.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Reproduced against the live site and the repo, but the scope in the finding is wrong.

CONFIRMED (live, parsed as script ELEMENTS, 1 per page; the 2 raw string occurrences are the known-correct flight-payload duplicate): diffing @graph nodes by @id between https://pyrasuite.pyramedia.cloud/ar and /en gives #website.url = ".../ar" vs ".../en"; #software.url = ".../ar" vs ".../en" plus differing description, featureList and offers[].url; #organization differs in description and contactPoint.url but its url IS locale-independent (so the finding's account of Organization is accurate).

SOURCE CONFIRMED: lib/seo/schema.ts:107-109 states the rule verbatim ("ONE url under ONE @id. It was `/{locale}`, so the same entity claimed two different homepages depending on which page an engine fetched.") and sets url: APP_URL for Organization, while :128 (WebSite) and :149 (SoftwareApplication) still use `${APP_URL}/${locale}` under a shared @id. `git show 0e3c8bb -- lib/seo/schema.ts` shows that commit changed exactly that one line in Organization only. scripts/tests/schema.test.ts:36 pins the rule for Organization alone; the WebSite/SoftwareApplication checks at :44-52 never assert url. The author locale-scopes an @id when they mean to (#faq is `${APP_URL}/${locale}/#faq`, schema.ts:190), which is why the shared-@id-with-locale-varying-values shape reads as an oversight rather than a design.

TWO CORRECTIONS, the first material:
1. NO studio page emits these nodes. /ar/studios/creator and /en/studios/creator carry BreadcrumbList + WebPage + FAQPage and reference #website/#software/#organization only as bare {"@id"} pointers (lib/seo/studio-schema.ts:42-44). The conflicting definitions are emitted on exactly four URLs — /ar, /en, /ar/pricing, /en/pricing — via buildStructuredData() (schema.ts:194; app/[locale]/page.tsx:60, app/[locale]/pricing/page.tsx:51). Measured all four. Filing this as "all 20 studio pages" points a fixer at files that neither contain nor are affected by the defect.
2. "single-valued properties" is an overstatement — every schema.org property admits multiple values in the RDF model. The operational point (an engine consolidating by @id sees one entity asserting two homepages) survives; the spec-violation framing does not.

SEVERITY = nit. It is not the class this audit hunts (a page claiming a capability the product lacks): no false capability claim, no money, no security, nothing user-visible. The correct end state is not even settled — the finding's own fix ends "then decide what to do with the locale-varying content", locale-varying description/featureList under a site-level @id is ordinary bilingual practice, and APP_URL bare is a 307 to /ar (the SEO round records that about the old x-default), so `url: APP_URL` points the WebSite node at a redirect. What survives as genuinely worth doing is the small half: an identical construction two functions below a comment stating why it is wrong, unpinned by the gate that pins its sibling — the drift-between-copies class this repo repeatedly pays for. A schema.test.ts check that buildWebSiteSchema('ar') and ('en') differ in no field would settle it.

</details>

### 2. [schema] /en/studios/creator (all 20 studio pages)

**Claim.** Every studio page's WebPage/CollectionPage node references three @ids that are not defined anywhere in that page's own @graph, so a per-page structured-data parse resolves publisher, about and isPartOf to nothing. The nodes exist only on /ar and /en.

**Evidence.** Script over the parsed <script type="application/ld+json"> element of all 20 pages: every page reports `refs=3 dangling=3 ["https://pyrasuite.pyramedia.cloud/#website",".../#software",".../#organization"]`. The page's @graph holds exactly BreadcrumbList + WebPage + FAQPage (or BreadcrumbList + CollectionPage + ItemList on the index) — no Organization, WebSite or SoftwareApplication node. Those three nodes ARE emitted on /ar and /en, so a site-wide consolidator can resolve them; a parser reading one studio URL in isolation (which is how answer engines fetch, and this project ships llms.txt for exactly that audience) sees `"publisher":{"@id":"..."}` with no name, no logo and no sameAs. Source: lib/seo/studio-schema.ts:42-44 and :95-97.

**Fix.** In lib/seo/studio-schema.ts, push buildOrganizationSchema(locale), buildWebSiteSchema(locale) and buildSoftwareApplicationSchema(locale) — already exported from lib/seo/schema.ts — into the studio @graph, the way Yoast-style graphs repeat the entity nodes on every page. Fix the previous finding first, or you will replicate the conflicting values onto 20 more URLs.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Reproduced independently against the live site: parsing the single ld+json ELEMENT on all 20 studio URLs gives refs=3 dangling=3 on every one, the dangling ids being https://pyrasuite.pyramedia.cloud/#website, /#software and /#organization; the graphs hold only BreadcrumbList+WebPage+FAQPage (or +CollectionPage+ItemList on the index). /ar, /en and /ar/pricing emit Organization+WebSite+SoftwareApplication and report dangling=0. Source confirms it: lib/seo/studio-schema.ts:41-43 and :92-94 emit bare {'@id': ...} for isPartOf/about/publisher, and lib/seo/schema.ts:104,127,140 mint byte-identical ids — so the ids are not mismatched, the nodes are simply absent from these pages. No gate covers it (schema.test.ts never references buildStudioSchema), it is not on the already-measured list (that list covers @graph type composition and element count, not @id resolution), it is not a known false finding, and CLAUDE.md's studio-pages "Still open, deliberately" does not mention it. The evidence therefore says what the finder claims. I downgrade to nit for three reasons. (1) It is not this project's defect class — no page claims a capability the product lacks; nothing here is false. (2) No rich result is lost: BreadcrumbList is self-contained, FAQPage needs only mainEntity, and publisher/about/isPartOf are not required for any rich result these pages are eligible for. (3) The finder overstates the failure: {'@id': ...} is a legal JSON-LD node reference, and the IRI is dereferenceable — curl on the site root returns 307 to /ar, where all three nodes exist under those exact ids, so a consumer that follows the IRI resolves them; only a naive single-document parse sees them empty. The file header at studio-schema.ts:6-13 already records the cross-page reference as deliberate (it just does not acknowledge the single-URL consequence), and it undercounts its own graph by saying "Both nodes" where three entity ids are referenced. Worth fixing as entity-findability polish on 20 URLs; not a defect.

</details>

### 3. [copy] /ar/studios/storyboard, /ar/studios/analysis, /ar/studios/plan, /ar/studios/creator (and all four /en twins)

**Claim.** Four of the nine pages tell a prospective customer that the product used to be broken, in the FAQ, in the product's own voice. This is the repo's internal changelog register — not the landing page's register — and it is inside the FAQPage structured data, so an answer engine can quote "PyraSuite: this was broken before" as its answer about the product.

**Evidence.** Live JSON-LD on /ar/studios/storyboard (parsed from the single ld+json <script> element): `A: تسعة، مش أقل … ده كان مكسور قبل كده: الفحص كان بيقبل مشهد واحد.` Source: messages/ar.json:1510. Also messages/ar.json:1498 (analysis) "وده كان مكسور فترة: التعليمات كانت بتطلب حقول بأسامي مختلفة عن اللي الشاشة بتقراه، فالرقم كان بيطلع فاضي. اتصلح"; :1482 (plan) "الخطط كلها كانت بتطلع عربي مهما كانت لغتك، ودي اتصلحت"; :1414 (creator) "ودي كانت أصعب حاجة في المنتج". English twins carry it verbatim — /en/studios/storyboard: "This was broken before: the check accepted a single scene." Contrast the register the product ships on the page these link from, messages/ar.json landing.pillars.p3Desc: "بدون مفاجآت ولا رسوم مخفية."

**Fix.** State the guarantee, drop the history. "تسعة، مش أقل — ولو رجع أقل، العملية بتتحسب فاشلة ورصيدك بيرجعلك كامل." The bug history belongs in CLAUDE.md and the commit, which is where the same facts already live.

<details><summary>The skeptic could not refute it — their reasoning</summary>

REPRODUCED, with two corrections that lower the severity.

Confirmed live (parsed from the single ld+json <script> element, not a raw grep): /ar/studios/storyboard Q0 ends "ده كان مكسور قبل كده: الفحص كان بيقبل مشهد واحد."; /en twin "This was broken before: the check accepted a single scene."; /ar/studios/analysis Q2 "وده كان مكسور فترة… اتصلح" and /en "This was broken for a while… It is fixed"; /ar/studios/plan Q2 "الخطط كلها كانت بتطلع عربي مهما كانت لغتك، ودي اتصلحت" and /en "Every plan used to be generated in Arabic whatever your language; that is fixed". Source lines exact: messages/ar.json:1482 (plan), :1498 (analysis), :1510 (storyboard). Present in visible HTML too — with <script> blocks stripped, "ده كان مكسور قبل كده" occurs 1x (5x in the whole doc, the rest in the RSC flight payload). Not in the already-measured list; not a known false finding (I counted ld+json ELEMENTS = 1 per page, matched case-insensitively, avoided grep -c on a one-line document); not recorded as deliberate anywhere — the phrasing appears nowhere in docs/superpowers/plans/2026-09-02-public-studio-pages.md, and scripts/tests/studio-pages.test.ts has no register rule.

CORRECTION 1 — creator does not belong. ar.json:1414 reads "ودي كانت أصعب حاجة في المنتج" / "This was the hardest thing in the product." That is development-difficulty commentary, not a disclosure that the product was broken. No past defect is stated. The finding is three pages, not four.

CORRECTION 2 — this is NOT the false-capability defect class, and the finding's framing implies otherwise. Every statement is TRUE and traceable: CLAUDE.md:388 (storyboard schema accepted 1 of 9, fixed with .min(EXPECTED_SCENES)); CLAUDE.md:432 (analysis prompt asked kpis[].target_30d/target_90d while schema/page/PDF read target/timeframe, so the KPI headline rendered blank); CLAUDE.md:436 (every plan/analysis/storyboard generated in Arabic regardless of locale, fixed). The audit's own defect test — "a claim you cannot trace to a file:line is a DEFECT" — is passed here. Each answer also leads with the guarantee and refund; the history is a trailing clause. No prospective customer is misled about what the product does.

WHAT SURVIVES: it is drift, not house voice. The other five studio pages, written in the same round, answer the same shape of question with a pure forward guarantee and zero past-tense bug narration (verified on live /ar/studios/{photoshoot,edit,campaign,voiceover,prompt-builder} — e.g. photoshoot "ولو لقطة ما وصلتش، بايرا بترجّع نصيبها لرصيدك تلقائياً"). The specific risk is narrow but real: FAQPage structured data exists for machine extraction, and these pages were built for GEO, so an answer engine can lift "This was broken before: the check accepted a single scene" as its answer about the product. The proposed fix states the guarantee and drops the history, which is exactly the register already shipping on the other five pages.

SEVERITY: nit. Reproducible, worth fixing, cheap fix — but zero false claims, the load-bearing refund guarantee is stated correctly and first in all three, the harm is speculative rather than measured, and one of the four cited instances is a mischaracterization.

</details>

### 4. [copy] All 10 Arabic pages: /ar/studios and /ar/studios/{creator,photoshoot,edit,campaign,plan,analysis,storyboard,voiceover,prompt-builder}

**Claim.** The studio pages lurch from the landing page's Gulf register into consistently Egyptian colloquial. Measured across the whole `studios` namespace: ZERO Gulf markers, against 8 in `landing` including two section headlines. The same sentence appears in two dialects on a card and the page that card links to.

**Evidence.** `node -e` marker count over messages/ar.json (all false positives removed by inspection — the three apparent hits are substrings of بنمشي / ماشي / بتبدّلهوش / لتقديرها): landing → ليش×1, تبي×3, إيش×2, أبي×1, مو×1; studios → **0** of ليش/تبي/إيش/أبي/مو. Egyptian-only markers: studios → أيوه×10, بيضا×7, دلوقتي×3, مفيش×1, لأ×6; landing → أيوه×0, بيضا×0. Concretely, on the live landing (/ar) the prompt-builder card reads "مو عارف توصف؟ اكتب أي شي وبايرا تحوّله لأمر احترافي" (messages/ar.json:962) and the page it links to opens "مش عارف توصف اللي في دماغك؟" (/ar/studios/prompt-builder H1 tagline, messages/ar.json studios.prompt-builder.tagline) — the same sentence, two dialects, one click apart. The landing headline directly above the nine cards is "إنت بس تقول لبايرا إيش تبي" and the section title is "ليش PyraSuite؟".

**Fix.** Pick one register for the public surface and apply it to the whole `studios` namespace. Given the stated market (الإمارات والخليج, per hero.definition) and that landing's headline copy is already Gulf, move the studio pages to Gulf: أيوه→إي/نعم, دلوقتي→الحين, مش عارف→مو عارف, إزاي→كيف, بيضا→بيضاء, عايز→تبي. Add a gate to studio-pages.test.ts asserting the two namespaces do not use disjoint dialect marker sets.

<details><summary>The skeptic could not refute it — their reasoning</summary>

SURVIVES, but only in its narrow form. The headline framing is materially false and must not be repeated.

WHAT REPRODUCES (live, https://pyrasuite.pyramedia.cloud, 2026-09-03)

1. Zero Gulf markers across the studio pages. I fetched all ten Arabic studio URLs (all 200), stripped <script>/<style>/tags, and counted ليش / تبي / إيش / "مو عارف" / الحين in visible text:

  /ar                        Gulf sum 7
  /ar/studios                Gulf 0
  creator photoshoot edit campaign plan analysis storyboard prompt-builder   Gulf 0 each
  voiceover                  Gulf 1 — and that one is a legitimate exception: "اطلب الحين" sits inside the Gulf voiceover sample's own spoken script (dialect: gulf), not page chrome.

Their false-positive note is right in effect though wrong in detail: the apparent studios hits are أبي×5 inside أبيض/بيضا and وش×9 inside السوشال / وشوف / وشكله — not the substrings they named.

2. The one-click dialect pair is real and verified in the shipped bytes of both pages:
  /ar  -> "مو عارف توصف؟ اكتب أي شي وبايرا تحوّله لأمر احترافي — مجاناً"   (messages/ar.json landing.studios.s9Desc, rendered via StudiosShowcase.tsx:120 descKey 'studios.s9Desc')
  /ar/studios/prompt-builder -> "مش عارف توصف اللي في دماغك؟ اكتبه بالعامية وخد ثلاث صياغات جاهزة"   (studios.prompt-builder.tagline)
Both HIT in visible (script-stripped) HTML. Same construction, two dialects, one click apart — and the /studios index card uses `t('tagline')` (studios/page.tsx:94,121), so the landing card is the only Gulf-voiced surface pointing at it. Nothing in CLAUDE.md records this as deliberate; no gate covers it (grep for dialect/register in studio-pages.test.ts returns nothing).

WHAT IS REFUTED — "the landing page's Gulf register"

The landing page is not in a Gulf register; it is already mixed, and the claimant's marker table hides that by choosing different markers for each side. Counted the same way, live visible text on /ar:
  دلوقتي = 2, إزاي = 1, عايز = 1   (Egyptian sum 4, against Gulf 7)
In messages/ar.json the landing namespace carries عايز×4 (all four demo briefs), دلوقتي×2, إزاي×1, مش×13. Concretely on the live landing:
  - the demo CTA button: "ابدأ مجاناً دلوقتي"  (landing.demo.cta)
  - the pricing subtitle: "سجّل دلوقتي وتدخل من أول دفعة"
  - an FAQ question: "إزاي أجرب المنصة؟"  (landing.faq.q3)
  - "عايز صور تجيب جوع وخطة تسويق للشهر الجاي"  (landing.demo.examples.shawarma.brief)
They counted دلوقتي in studios (×3) but reported only أيوه×0 and بيضا×0 for landing. That selection is what turns a blend into an apparent 8-vs-0 register split. There is no "lurch": the studio pages sit at the Egyptian end of a surface that was already Egyptian-with-Gulf-headlines.

Their Egyptian tally is also inflated: بيضا×7 is not seven markers, it is one product phrase ("خلفية بيضا", the marketplace white background) repeated across studios.edit.metaTitle / metaDescription / definition / q2 / step2 / a1 and studios.photoshoot.a2. A term of art, not register drift.

The PROPOSED FIX rests on the refuted premise. Moving only `studios` to Gulf would leave the landing page inconsistent with itself — its CTA button, its FAQ heading and all four demo briefs are Egyptian. Any register decision has to cover `landing` too, or it makes things worse.

SEVERITY: nit. This is not the defect class the brief names — no page claims a capability the product lacks. Nothing here misleads a customer about what they are buying; it is brand-voice polish. The only weight beyond taste is that landing.pillars.p2Desc sells "تفهم لهجتك", so a mixed-dialect public surface costs a little credibility — still a nit, not a defect.

</details>

### 5. [payload] every URL on the origin, including all 20 studio pages

**Claim.** The origin can serve brotli but never does for a real browser: it prefers gzip whenever gzip appears in Accept-Encoding, and ignores explicit q-values ranking brotli higher. Brotli is only returned when gzip is entirely absent from the request — which no browser ever sends. Every visitor pays the gzip penalty on HTML, JS and CSS.

**Evidence.** curl against https://pyrasuite.pyramedia.cloud/ar/studios/creator, response Content-Encoding and downloaded bytes:
  'gzip, deflate, br, zstd' (Chrome's real header) -> gzip, 40,297 B
  'gzip, deflate, br'                             -> gzip, 40,297 B
  'br, gzip'                                      -> gzip, 40,297 B
  'zstd, br, gzip'                                -> gzip, 40,297 B
  'br'                                            -> br,   35,743 B
q-value test on /_next/static/chunks/5314-b1de01a55f585113.js:
  'br;q=1.0, gzip;q=0.1' -> Content-Encoding: gzip
Per-page saving, summing every script + stylesheet twice (once with 'gzip, deflate, br', once with 'br'):
  /ar/studios/creator  257.6 kB -> 242.1 kB   (-15.5 kB, 6.0%)
  /ar/studios          252.5 kB -> 237.2 kB   (-15.3 kB, 6.1%)
  /ar                  273.9 kB -> 257.6 kB   (-16.3 kB, 6.0%)
Plus 4,554 B on the HTML (11.3%). About 20 kB per page load, on every page of the site.

**Fix.** Fix the encoding negotiation at the proxy in front of the app (Coolify/Traefik) so brotli wins when the client offers it — the encoder is already installed and answers correctly for `Accept-Encoding: br`. Worth pairing with a gate: fetch one page with Chrome's exact Accept-Encoding string and assert Content-Encoding is br.

<details><summary>The skeptic could not refute it — their reasoning</summary>

Reproduced every measurement against the live origin. /ar/studios/creator with 'gzip, deflate, br, zstd', 'gzip, deflate, br', 'br, gzip' and 'zstd, br, gzip' all return Content-Encoding: gzip at 40,297 B; 'br' alone returns br at 35,743 B. The q-value case on /_next/static/chunks/5314-b1de01a55f585113.js reproduces: 'br;q=1.0, gzip;q=0.1' -> gzip 42,064 B, 'br' -> 40,175 B. Summing the 21 scripts/stylesheets plus the HTML twice: gzip path 304,029 B vs br path 283,646 B, a 20,383 B (6.7%) saving; HTML alone 40,297 -> 35,743 (11.3%), and /ar HTML 50,346 -> 41,836 (16.9%). Their arithmetic is sound and no browser ever receives brotli.

Not in the already-measured-and-passing list, not one of the named false findings (no ld+json count, no case-sensitive hreflang, no grep -c on a one-line document), and CLAUDE.md carries no brotli/compression/Content-Encoding entry anywhere - the nearest known-open bullet is "No CDN with edge TLS", which is TLS latency, a different item. docs/COMPETITIVE_BENCHMARK.md:257 records the landing JS as "235 KB br/gzip", a figure no browser has ever been served, so nobody had checked.

Two corrections, both material. (1) The diagnosis is wrong. Four further probes: 'zstd' -> zstd 41,999 (Next cannot emit zstd, so the proxy did it); 'deflate' -> deflate 40,285 (Traefik v3 has no deflate, so the origin did it); 'identity' -> none, 175,135; 'br, zstd' -> zstd, i.e. the proxy prefers zstd OVER br. The real cause is that Next.js's built-in compress (default true, gzip/deflate only - next.config.ts has no compress key) encodes first, and the proxy will not re-encode an already-encoded body; brotli surfaces only when the client offers neither gzip nor deflate. q-values ARE honored - br simply is not in the origin encoder's supported set, so gzip is the highest available. The proposed fix ("fix negotiation at the proxy so brotli wins") would therefore change nothing, since Traefik already ranks br above gzip and never receives an uncompressed body. (2) The obvious repo-side fix regresses on its own: with compress:false the proxy's zstd-first order takes over, and Traefik's zstd is larger than gzip here (JS chunk gzip 42,064 | br 40,175 | zstd 44,397; /ar HTML gzip 50,346 | br 41,836 | zstd 49,689). Chrome sends zstd, so that one-line change makes every JS chunk bigger. The fix must be two-part: disable Next's compressor AND reorder Traefik's compress.encodings to put br ahead of zstd.

Severity nit rather than defect: the responses are HTTP-conformant, nothing is broken, no page claims a capability the product lacks (the defect class this repo actually suffers from), and there is no money, security, correctness or indexing impact - the entire effect is ~20 kB of a ~304 kB cold load. The proposed gate is also not viable as written; a prebuild gate has no production to fetch, so it belongs beside test:rate-limit and test:logo-parity, which this repo documents as live-only and deliberately not prebuild links.

</details>

