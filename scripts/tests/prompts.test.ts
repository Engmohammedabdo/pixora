/**
 * Golden-string assertions over what each prompt builder actually emits.
 *
 *   npx tsx scripts/tests/prompts.test.ts
 *
 * These builders produce the bytes a paid model is asked to work from, and nothing
 * else in the repo looks at them. Every defect this file guards was invisible in
 * review precisely because the prompt "reads fine": a hardcoded 'Growth' stage the
 * product never collects, a duration the calendar never saw, a slug rendered as
 * "the other industry", and whole sections generated at the customer's expense that
 * no screen has ever displayed.
 *
 * Pure — no network, no database. A prebuild gate.
 */
import { buildPlanPrompt } from '../../lib/ai/prompts/plan';
import { buildAnalysisPrompt } from '../../lib/ai/prompts/analysis';
import { buildStoryboardPrompt } from '../../lib/ai/prompts/storyboard';
import { buildPhotoshootPrompt } from '../../lib/ai/prompts/photoshoot';
import { buildEditPrompt } from '../../lib/ai/prompts/edit';

let failures = 0;
let checks = 0;

function contains(label: string, haystack: string, needle: string): void {
  checks++;
  if (!haystack.includes(needle)) {
    failures++;
    console.log(`FAIL  ${label}\n        expected the prompt to contain: ${needle}`);
  }
}

function omits(label: string, haystack: string, needle: string): void {
  checks++;
  if (haystack.includes(needle)) {
    failures++;
    console.log(`FAIL  ${label}\n        expected the prompt NOT to contain: ${needle}`);
  }
}

/** How many times a needle appears. `contains`/`omits` cannot see a DUPLICATE —
 *  which is the whole shape of the plan/analysis two-identities defect below. */
function occurs(label: string, haystack: string, needle: string, expected: number): void {
  checks++;
  const actual = haystack.split(needle).length - 1;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${expected} occurrence(s) of ${needle}, found ${actual}`);
  }
}

/** A builder that MUST refuse. Every field a builder interpolates is customer
 *  text, so "this one reaches the model" and "this one is filtered" are the
 *  same claim — a new field that only ever got the first half is exactly the
 *  gap `prompt-builder-sanitized` exists for. */
function throws(label: string, fn: () => unknown): void {
  checks++;
  try {
    fn();
    failures++;
    console.log(`FAIL  ${label}\n        expected the builder to throw, it returned a prompt`);
  } catch {
    /* expected */
  }
}

const planInput = {
  businessName: 'Acme Coffee',
  industry: 'restaurant',
  goals: ['raise awareness', 'grow followers'],
  targetMarket: 'UAE, 25-40, urban professionals',
  budget: '$1,000 - $2,000',
  duration: 60,
};

// ---- plan ----
{
  const p = buildPlanPrompt(planInput);
  omits('plan: no invented business stage', p, 'Growth');
  contains('plan: the chosen duration constrains the calendar', p, 'exactly 9 entries');
  contains('plan: the duration itself reaches the model', p, '60');
  omits('plan: does not ask for quick_wins nothing renders', p, 'quick_wins');
  omits('plan: does not ask for risks nothing renders', p, '"risks"');
  contains('plan: still asks for objectives', p, '"objectives"');
  contains('plan: still asks for channels', p, '"channels"');
  contains('plan: still asks for calendar', p, '"calendar"');
  contains('plan: still asks for budget', p, '"budget"');
  contains('plan: keeps the customer brief', p, 'Acme Coffee');

  // A caller that DOES have a stage may still pass one.
  contains('plan: an explicit stage is used', buildPlanPrompt({ ...planInput, stage: 'Seed' }), 'Seed');
}

// ---- plan: the industry slug never reaches the model raw ----
{
  const p = buildPlanPrompt({ ...planInput, industry: 'real_estate' });
  omits('plan: no raw slug in the persona', p, 'real_estate businesses');
  contains('plan: slug resolved to a readable name', p, 'real estate');
}
{
  const p = buildPlanPrompt({ ...planInput, industry: 'other' });
  omits('plan: "other" does not become an industry', p, 'other businesses');
  contains('plan: "other" degrades to cross-industry', p, 'cross-industry');
}
{
  // The exact string messages/ar.json:378 tells the customer to type. Before this
  // fix it produced: "expertise in مطاعم businesses".
  const p = buildPlanPrompt({ ...planInput, industry: 'مطاعم' });
  omits('plan: an unknown free-text industry is not spliced into English', p, 'مطاعم businesses');
  // The carried finding, closed at the source: the persona sentence check above
  // proves "مطاعم businesses" never appears, but the OLD `|| safeIndustry`
  // fallback lived on a SEPARATE line ("- Industry: مطاعم") that check cannot
  // see. Free text can still reach this builder — a pre-chip-UI historical plan
  // restored via RecentWork, or a hostile PostgREST write to
  // brand_kits.industry, which migration 045 leaves deliberately unconstrained
  // — so the line itself, not just the persona, must never carry it.
  omits('plan: an unresolvable industry never reaches the "- Industry:" line', p, '- Industry:');
  // The paired POSITIVE, and it has to be here rather than inferred from the
  // block above. `omits('- Industry:')` alone is one-sided: deleting
  // `if (resolvedIndustry) prompt += '\n- Industry: …'` from plan.ts:79 outright
  // would satisfy it, and the checks that look like they cover the other half
  // ("slug resolved to a readable name") are satisfied by the PERSONA sentence,
  // which is a different line. Verified: with that one line deleted the whole
  // suite still passed.
  contains(
    'plan: a RESOLVABLE industry does reach the "- Industry:" line',
    buildPlanPrompt({ ...planInput, industry: 'real_estate' }),
    '- Industry: real estate'
  );
}

// ---- plan: the "other" escape hatch (review finding F11) ----
//
// `plan-industry` used to be a free-text <Input>; it is seven chips now, and
// `INDUSTRY_NAMES.other` is '', so a customer whose trade has no chip picked
// أخرى and spent 5 credits on a plan generated with ZERO knowledge of what
// they sell. This studio has no description field, so there was no other
// channel. `industryOther` is that channel — carried as DESCRIPTION-level
// context, never as `industry`, so `industryName()` still governs the persona.
{
  const p = buildPlanPrompt({ ...planInput, industry: 'other', industryOther: 'car rental' });
  contains('plan: "other" + free text reaches the model', p, '- What the business does: car rental');
  contains('plan: the persona still degrades to cross-industry', p, 'cross-industry');
  omits('plan: free text is never spliced into the persona', p, 'car rental businesses');
  omits('plan: free text never becomes an "- Industry:" line', p, '- Industry:');
}
{
  // The `else` matters and is not decoration. A prompt carrying BOTH a
  // resolved industry and a contradicting free-text one is F2's
  // two-identities defect at half the size, and a hostile or restored payload
  // can send both — the route deliberately does not enum-constrain `industry`.
  const p = buildPlanPrompt({ ...planInput, industry: 'retail', industryOther: 'car rental' });
  contains('plan: a resolvable industry still wins', p, '- Industry: retail');
  omits('plan: the free-text line is suppressed when an industry resolved', p, 'What the business does');
}
{
  // Nothing typed must not print an empty line, and the filter must still run
  // over the free text — it is customer-typed and reaches the model.
  omits(
    'plan: an empty industryOther prints no line',
    buildPlanPrompt({ ...planInput, industry: 'other', industryOther: '' }),
    'What the business does'
  );
  throws(
    'plan: a blocked term in industryOther is refused',
    () => buildPlanPrompt({ ...planInput, industry: 'other', industryOther: 'gun accessories' })
  );
}

// ---- plan: the brand context block is actually wired in, not just correct ----
// See scripts/tests/brand-context.test.ts's file header for why this class of
// check exists: buildBrandContextBlock could be entirely correct on its own and
// this builder could still forget to call it.
{
  const withContext = buildPlanPrompt({
    ...planInput,
    brandContext: {
      name: 'Acme Coffee', industry: 'restaurant',
      description: 'A specialty coffee roaster serving the GCC market.',
      targetAudience: 'Urban professionals aged 25-40', city: 'Dubai',
    },
  });
  const withoutContext = buildPlanPrompt(planInput);
  contains('plan + brandContext: emits the CLIENT CONTEXT heading', withContext, 'CLIENT CONTEXT');
  // `city` is a field ONLY buildBrandContextBlock ever prints here — plan's own
  // "Business Information" block has no city line at all — so this proves the
  // block was populated with the PASSED data, not a static heading appended
  // blindly regardless of input.
  contains('plan + brandContext: carries the city, a field only the block prints', withContext, 'Dubai');
  omits('plan + no brandContext: no CLIENT CONTEXT heading', withoutContext, 'CLIENT CONTEXT');
}

// ---- plan and analysis: ONE business identity per prompt ----
//
// These two are the only studios where the same facts arrive twice — once from
// the request body and once from the brand kit the page attaches — because the
// page prefills Business Name / Industry / Target Market FROM the default kit
// and then sends `brandKitId` regardless of what the customer edited afterwards.
// The routes therefore null out everything the form itself carries and pass on
// only what it does not: `description` (plan has no description field) and
// `city` (no studio form has one).
//
// Built here from EXACTLY the shape those two routes now pass, so a regression
// that puts the kit's `name`/`industry` back shows up as two `- Industry:` lines
// on one paid deliverable. What this cannot see is the route source itself —
// buildPlanPrompt will still faithfully print both lines if a future caller
// hands it both; the rule lives at
// app/api/studios/plan/route.ts and app/api/studios/analysis/route.ts, and this
// pins the consequence rather than the assignment.
{
  const planContext = {
    name: null,
    industry: null,
    description: 'A specialty coffee roaster serving the GCC market.',
    targetAudience: null,
    city: 'Dubai',
  };
  // The customer retyped the business and switched the industry after the
  // prefill: the form says real estate, the kit said restaurant.
  const p = buildPlanPrompt({
    ...planInput,
    businessName: 'Sham Express',
    industry: 'real_estate',
    brandContext: planContext,
  });
  occurs('plan: exactly one "- Industry:" line', p, '- Industry:', 1);
  contains('plan: the industry is the one the FORM carries', p, '- Industry: real estate');
  omits('plan: the kit industry is not restated', p, 'restaurant and food service');
  occurs('plan: exactly one business name', p, 'Sham Express', 1);
  omits('plan: the kit name is not restated', p, 'Sham Shawarma');
  contains('plan: the kit still contributes what the form never asks for', p, 'Dubai');
  contains('plan: and the description the form has no field for', p, 'specialty coffee roaster');

  const analysisContext = {
    name: null, industry: null, description: null, targetAudience: null, city: 'Dubai',
  };
  const a = buildAnalysisPrompt({
    businessName: 'Sham Express',
    industry: 'real_estate',
    description: 'a new venture in property listings',
    competitors: ['Rival A'],
    targetMarket: 'UAE, 25-40',
    painPoints: 'low repeat purchase',
    brandContext: analysisContext,
  });
  occurs('analysis: exactly one "- Industry:" line', a, '- Industry:', 1);
  contains('analysis: the industry is the one the FORM carries', a, '- Industry: real estate');
  occurs('analysis: exactly one "- Description:" line', a, '- Description:', 1);
  contains('analysis: the kit still contributes the city, which no form asks for', a, 'Dubai');
}

// ---- analysis ----
{
  const base = {
    businessName: 'Acme Coffee',
    industry: 'restaurant',
    description: 'specialty coffee roaster',
    competitors: ['Rival A', 'Rival B'],
    targetMarket: 'UAE, 25-40, urban professionals',
    painPoints: 'low repeat purchase',
  };
  const a = buildAnalysisPrompt(base);
  omits('analysis: the raw slug never reaches the persona', a, 'the restaurant industry.');
  contains('analysis: the slug is translated for the model', a, 'restaurant and food service');
  omits('analysis: no invented business stage', a, 'Current Stage');
  omits('analysis: does not ask for usp nothing renders', a, '"usp"');
  omits('analysis: does not ask for gtm nothing renders', a, '"gtm"');
  omits('analysis: does not ask for pricing nothing renders', a, '"pricing"');
  omits('analysis: KPI keys match what the page reads', a, 'target_30d');
  contains('analysis: asks for the KPI key the page reads', a, '"target"');
  contains('analysis: still asks for competitors', a, '"competitors"');
  contains('analysis: still asks for swot', a, '"swot"');
  contains('analysis: still asks for personas', a, '"personas"');
  contains('analysis: still asks for roadmap', a, '"roadmap"');

  // `other` must not produce "the other industry".
  const other = buildAnalysisPrompt({ ...base, industry: 'other' });
  omits('analysis/other: no "the other industry" filler', other, 'the other industry');
  contains('analysis/other: degrades to a general marketer', other, 'cross-industry');

  // An unresolvable industry (free text, not one of the seven slugs — reachable
  // via a pre-chip-UI historical analysis restored through RecentWork, or a
  // hostile PostgREST write to brand_kits.industry, which migration 045 leaves
  // deliberately unconstrained) must never reach the "- Industry:" line itself,
  // not just the persona sentence checked above.
  const unresolved = buildAnalysisPrompt({ ...base, industry: 'مطاعم' });
  omits('analysis: an unresolvable industry never reaches the "- Industry:" line', unresolved, '- Industry:');
  // The paired POSITIVE — see the same pair in the plan block above for why an
  // `omits` on this line is satisfied by deleting the line altogether.
  contains(
    'analysis: a RESOLVABLE industry does reach the "- Industry:" line',
    buildAnalysisPrompt({ ...base, industry: 'real_estate' }),
    '- Industry: real estate'
  );
}

// ---- analysis: the brand context block is actually wired in, not just correct ----
// See scripts/tests/brand-context.test.ts's file header for why this class of
// check exists: buildBrandContextBlock could be entirely correct on its own and
// this builder could still forget to call it.
{
  const base = {
    businessName: 'Acme Coffee', industry: 'restaurant', description: 'specialty coffee roaster',
    competitors: ['Rival A', 'Rival B'], targetMarket: 'UAE, 25-40, urban professionals',
    painPoints: 'low repeat purchase',
  };
  const withContext = buildAnalysisPrompt({
    ...base,
    brandContext: {
      name: 'Acme Coffee', industry: 'restaurant',
      description: 'A specialty coffee roaster serving the GCC market.',
      targetAudience: 'Urban professionals aged 25-40', city: 'Dubai',
    },
  });
  const withoutContext = buildAnalysisPrompt(base);
  contains('analysis + brandContext: emits the CLIENT CONTEXT heading', withContext, 'CLIENT CONTEXT');
  // `city` is a field ONLY buildBrandContextBlock ever prints here — analysis's
  // own "Business Under Analysis" block has no city line at all — so this
  // proves the block was populated with the PASSED data, not a static heading
  // appended blindly regardless of input.
  contains('analysis + brandContext: carries the city, a field only the block prints', withContext, 'Dubai');
  omits('analysis + no brandContext: no CLIENT CONTEXT heading', withoutContext, 'CLIENT CONTEXT');
}

// ---- storyboard ----
{
  const s = buildStoryboardPrompt({ concept: 'a launch film', duration: 30, style: 'cinematic', platform: 'tiktok' });
  contains('storyboard: still asks for nine scenes', s, '9 scenes');
  contains('storyboard: the duration reaches the model', s, '30');
}

// ---- The deliverable is written in the language the customer reads. ----
{
  const ar = buildPlanPrompt({ ...planInput, locale: 'ar' });
  const en = buildPlanPrompt({ ...planInput, locale: 'en' });
  contains('plan/ar: asks for Arabic', ar, 'All text in Arabic');
  contains('plan/en: asks for English', en, 'All text in English');
  omits('plan/en: does not also demand Arabic', en, 'All text in Arabic');
  contains('plan: defaults to Arabic when no locale is given', buildPlanPrompt(planInput), 'All text in Arabic');
}
{
  const base = {
    businessName: 'Acme', industry: 'retail', description: 'a shop',
    competitors: ['A'], targetMarket: 'UAE', painPoints: 'none',
  };
  contains('analysis/en: asks for English', buildAnalysisPrompt({ ...base, locale: 'en' }), 'All text content in English');
  contains('analysis/ar: asks for Arabic', buildAnalysisPrompt({ ...base, locale: 'ar' }), 'All text content in Arabic');
  // The market is the Gulf whichever language the customer reads in.
  contains('analysis/en: still targets the Gulf market', buildAnalysisPrompt({ ...base, locale: 'en' }), 'Gulf/MENA');
}
{
  const sb = { concept: 'a launch film', duration: 30, style: 'cinematic', platform: 'tiktok' };
  contains('storyboard/en: dialogue in English', buildStoryboardPrompt({ ...sb, locale: 'en' }), 'voice-over in English');
  contains('storyboard/ar: dialogue in Arabic', buildStoryboardPrompt({ ...sb, locale: 'ar' }), 'voice-over in Arabic');
}

// ---- photoshoot: food ----
{
  const p = buildPhotoshootPrompt({
    environment: 'food', shotIndex: 0, totalShots: 6, seed: 'seed-a',
  });
  // 'Food photography set' is the preset's OWN `environment` string. The bare word
  // 'food' would not do: the shared isFood branch emits "no plastic, waxy or CGI food"
  // (photoshoot.ts:526) regardless of preset content, so asserting on it tests the
  // conditional rather than the preset — which is how the first version of this block
  // passed for a preset that could have been empty.
  contains('food: the preset names a food set', p, 'Food photography set');
  omits('food: never asks for a product label', p, 'label');
  // 'material finish' was the needle here, and it was a weak one: the string
  // lives in white_studio's MACRO shot recipe, which `shotIndex: 0` never
  // reaches, so the check passed for the white_studio preset too — it could not
  // tell the two apart. These two are emitted by the `isFood ? … : …` branches
  // themselves (photoshoot.ts MUST/AVOID), so they are absent for food and
  // present for every other environment, whatever the shot index.
  omits('food: no manufactured-goods vocabulary in MUST', p, 'printed text');
  omits('food: no manufactured-goods vocabulary in AVOID', p, 'CGI look');
  // And the same needles ARE present for a manufactured product, which is what
  // makes the two above discriminating rather than merely true.
  {
    const product = buildPhotoshootPrompt({
      environment: 'white_studio', shotIndex: 0, totalShots: 6, seed: 'seed-a',
    });
    contains('white_studio: the non-food branch does demand printed text', product, 'printed text');
    contains('white_studio: the non-food branch does forbid a CGI look', product, 'CGI look');
  }
  contains('food: the isFood branch demands freshness', p, 'fresh and appetising');
}
{
  // Every one of the six recipes must be reachable, distinct, AND genuinely from the
  // food preset.
  //
  // Comparing whole prompt strings proves nothing here: photoshoot.ts:486 interpolates
  // `SHOT ${shotIndex + 1} OF ${totalShots}` on every call, so six calls differ even for
  // a stub preset carrying one placeholder shot repeated through the modulo. Compare the
  // shot-SPECIFIC lines, then assert against strings only the real food recipes contain.
  const names = new Set<string>();
  const cameras = new Set<string>();
  let all = '';
  for (let i = 0; i < 6; i++) {
    const p6 = buildPhotoshootPrompt({
      environment: 'food', shotIndex: i, totalShots: 6, seed: 'seed-a',
    });
    all += p6;
    names.add(/SHOT \d+ OF \d+ — (.+)/.exec(p6)?.[1] ?? '');
    cameras.add(/\nCamera: (.+)/.exec(p6)?.[1] ?? '');
  }
  checks++;
  if (names.size !== 6) {
    failures++;
    console.log(`FAIL  food: six DISTINCT shot names\n        got ${names.size}`);
  }
  checks++;
  if (cameras.size !== 6) {
    failures++;
    console.log(`FAIL  food: six DISTINCT camera setups\n        got ${cameras.size}`);
  }
  // Strings only the food recipes carry. A stub preset cannot produce these.
  contains('food: the hero angle is the one a diner actually sees', all,
    'the angle a person sees their own food from');
  contains('food: a cross-section recipe exists', all,
    'every layer readable from edge to edge');
  contains('food: staging is service-realistic', all,
    'as it would actually reach a customer');
}
{
  // An unknown environment must still fall back, not throw.
  const p = buildPhotoshootPrompt({ environment: 'nope', shotIndex: 0, totalShots: 1 });
  contains('photoshoot: unknown environment falls back to white studio', p, 'infinity cove');
}

// ---- edit: text_add accepts the customer's own script ----
{
  const p = buildEditPrompt({ editType: 'text_add', editDescription: 'عرض اليوم' });
  omits('edit/text_add: no Latin-only restriction', p, 'Latin characters');
  omits('edit/text_add: Arabic is no longer forbidden', p, 'Arabic script — it does not render');
  contains('edit/text_add: demands correct contextual letterforms', p, 'contextual form');
  contains('edit/text_add: demands right-to-left', p, 'right-to-left');
  contains('edit/text_add: forbids transliteration', p, 'ransliteration');
  contains('edit/text_add: still forbids extra text', p, 'not between those quotation marks');
  // The craft rules are stated POSITIVELY now. Image models weight negatives
  // poorly, and all four Arabic rules used to sit in `avoid` while every other
  // mode in the file states its craft in `must`. Pinned on the section header
  // ordering: `must` is emitted before `avoid`, so a rule that migrated back
  // into the negative list moves after it.
  const mustBlock = p.slice(p.indexOf('Must:'), p.indexOf('Avoid:'));
  contains('edit/text_add: the Arabic joining rule is a MUST, not an avoid', mustBlock, 'contextual form');
  contains('edit/text_add: the RTL rule is a MUST, not an avoid', mustBlock, 'right-to-left');
}

// ---- edit: text_add gives the rules a delimited referent (review finding F15) ----
//
// One free-text field serves all five modes, and its placeholder was
// mode-INDEPENDENT — a background-change example shown to a customer who had
// picked ✍️ إضافة نص. They write a sentence; the model gets that sentence plus
// "set the text exactly as the customer wrote it" and cannot tell which words
// are the payload, so "اكتب" and "فوق الصورة" end up baked into a paid image.
// The letter-joining and RTL rules cannot help with that — they are downstream
// of knowing WHAT to set.
{
  const p = buildEditPrompt({ editType: 'text_add', editDescription: 'عرض اليوم' });
  contains('edit/text_add: the text is delimited', p, 'Text to set: "عرض اليوم"');
  omits('edit/text_add: it is not ALSO relayed as an instruction', p, 'Customer instruction:');
  // The `must` entries point at that exact line by name; if the line is ever
  // renamed and they are not, they point at nothing.
  contains('edit/text_add: the rules name the line they refer to', p, '"Text to set:" line');
}
{
  // Every other mode keeps the instruction line — their text describes an
  // action, it is not the payload.
  for (const mode of ['background_replace', 'object_remove', 'color_change', 'style_transfer']) {
    const p = buildEditPrompt({ editType: mode, editDescription: 'a modern office' });
    contains(`edit/${mode}: still relays a customer instruction`, p, 'Customer instruction: a modern office');
    omits(`edit/${mode}: no "Text to set" line`, p, 'Text to set:');
  }
}

// ---- edit: the other four modes keep their preservation rules ----
// The EDIT_MODES table is one careless keystroke from losing these.
//
// Every needle below is drawn from a mode's `must` or `avoid` array, NOT from its
// `task`. That is the whole point: when `EDIT_MODES[editType]` is undefined,
// buildEditPrompt falls back to `Apply the requested edit: ${editType.replace(/_/g,' ')}.`
// — so for a DELETED `background_replace` entry the prompt still literally reads
// "background replace", and a `contains(..., 'background')` needle passes against a
// gutted table. Same for 'object remove' and 'emove'. Task-derived needles cannot
// distinguish "the mode exists" from "the mode is gone", which is the only thing
// this block exists to detect.
{
  const bg = buildEditPrompt({ editType: 'background_replace', editDescription: 'x' });
  contains('edit/background_replace: keeps the clean-cut rule', bg, 'no halo, no fringing');
  contains('edit/background_replace: keeps the subject untouched', bg,
    'Altering, moving, cropping or restyling the subject itself');

  const rm = buildEditPrompt({ editType: 'object_remove', editDescription: 'x' });
  contains('edit/object_remove: keeps the reconstruction rule', rm,
    'Reconstruct the occluded area from surrounding texture');
  contains('edit/object_remove: refuses an invented replacement', rm,
    'Inventing a replacement object');

  const cc = buildEditPrompt({ editType: 'color_change', editDescription: 'x' });
  contains('edit/color_change: preserves material response', cc,
    'Preserve shading, texture, reflections, highlights and material response');
  contains('edit/color_change: refuses a flat fill', cc, 'Applying a flat colour fill');

  const st = buildEditPrompt({ editType: 'style_transfer', editDescription: 'x' });
  contains('edit/style_transfer: keeps the subject recognisable', st,
    'Keep the subject recognisable');
  contains('edit/style_transfer: refuses to change what the subject is', st,
    'Changing what the subject IS');
}

// ---- edit: the preamble guarantee, which is NOT per-mode ----
// `must survive it` is emitted unconditionally, BEFORE the EDIT_MODES lookup, so
// this passes even with the table completely empty. It is still worth pinning —
// that line is the whole "the customer's photograph survives the edit" promise —
// but it is a PREAMBLE check and is labelled as one. An earlier version ran it in
// a five-mode loop labelled per-mode, which read as five mode assertions while
// testing one shared string five times.
{
  const p = buildEditPrompt({ editType: 'style_transfer', editDescription: 'x' });
  contains('edit/preamble: the customer photo must survive (all modes)', p, 'must survive it');
}

if (failures > 0) {
  console.log(`\n[prompts] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[prompts] ${checks} checks passed`);
