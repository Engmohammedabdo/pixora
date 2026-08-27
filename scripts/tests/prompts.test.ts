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
import {
  EDIT_PRESETS,
  EDIT_PRESET_IDS,
  EDIT_TYPES,
  buildEditPrompt,
  editPresetMatchesType,
  editPresetRequiresBrandColors,
} from '../../lib/ai/prompts/edit';
import { buildBrandContextBlock } from '../../lib/ai/prompts/brand-context';
import type { BrandKit } from '../../lib/supabase/types';

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

/** A plain predicate, for the structural claims about the preset TABLE that no
 *  single golden string can carry — "every preset belongs to a real editType",
 *  "no preset is a one-line stub". */
function ok(label: string, condition: boolean, detail?: string): void {
  checks++;
  if (!condition) {
    failures++;
    console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

/** Order matters in a prompt: the TEXT RULE claims to override everything else,
 *  and a rule that arrives BEFORE the lists it overrides is asking the model to
 *  hold a claim it has not yet been given the content for. `contains` cannot
 *  see position. */
function after(label: string, haystack: string, needle: string, mustFollow: string): void {
  checks++;
  const i = haystack.indexOf(needle);
  const j = haystack.indexOf(mustFollow);
  if (i === -1 || j === -1 || i < j) {
    failures++;
    console.log(
      `FAIL  ${label}\n        expected ${JSON.stringify(needle)} (at ${i}) to come after ${JSON.stringify(mustFollow)} (at ${j})`
    );
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

// ---- edit: the TEXT RULE ----
//
// The one fix in this file with a measured before AND after. On 2026-08-25, on
// production, `gemini` under a loose prompt painted invented garbled Arabic and
// fake Latin onto a wrapper and a menu board in an image whose prompt said "no
// extra words"; the same model under a prompt carrying the rule below produced a
// clean frame. Three things carried it — an override claim, a COUNT plus a NAMED
// SURFACE, and an ENUMERATION of the surfaces invented text lands on — and each
// is pinned separately here, because losing any one of them is a silent
// regression to the version that failed.
//
// Every needle is drawn from buildTextRule()'s own emitted lines. None comes from
// a mode `task`, which is the fallback string an unknown editType also produces.
{
  for (const mode of ['background_replace', 'object_remove', 'color_change', 'style_transfer']) {
    const p = buildEditPrompt({ editType: mode, editDescription: 'a modern office' });
    contains(`edit/${mode}: the containment rule is stated as an override`, p,
      'TEXT RULE — this overrides everything else in this prompt');
    contains(`edit/${mode}: no invented text at all`, p,
      'Do not add, invent, redraw or translate ANY text');
    contains(`edit/${mode}: every other surface is enumerated and blanked`, p,
      'must be COMPLETELY BLANK');
    // The amendment the quoted rule needed for an EDIT studio: the source photo
    // already HAS text on it, and "the only text is X" would order the model to
    // erase the customer's own packaging.
    contains(`edit/${mode}: the customer's own printed text survives`, p,
      "Text already printed on the customer's product in the attached photograph stays exactly as photographed");
    omits(`edit/${mode}: no NEW-text clause on a mode that adds none`, p, 'The only NEW text');
    after(`edit/${mode}: the override is stated AFTER the lists it overrides`, p,
      'TEXT RULE —', '\nAvoid:');
  }
}
{
  const p = buildEditPrompt({ editType: 'text_add', editDescription: 'عرض اليوم' });
  contains('edit/text_add: the rule names the exact string, delimited', p,
    'The only NEW text anywhere in the entire image is: "عرض اليوم"');
  contains('edit/text_add: one occurrence, on a named surface, nowhere else', p,
    'It appears EXACTLY ONCE, on one clear area of empty space in the image, and nowhere else.');
  contains('edit/text_add: existing print still survives', p,
    "Text already printed on the customer's product in the attached photograph stays exactly as photographed");
  // NOT `must be COMPLETELY BLANK` — that assertion pinned the defect. On
  // production 2026-08-27 the blanket list named "packaging, labels" as blank
  // while `product_label` targets the label, and the edit came back a no-op
  // (1.93% of pixels changed vs 81% for a real edit). text_add states
  // containment by EXCLUDING its target instead; the blanket form is still
  // asserted for every mode that adds no text, in the loop above.
  contains('edit/text_add: containment excludes the target rather than listing nouns', p,
    'No text of any kind is added to any surface other than');
  after('edit/text_add: the override is stated AFTER the lists it overrides', p,
    'TEXT RULE —', '\nAvoid:');
  // The old `avoid` bullet is kept as well. It is not what carried the fix — an
  // avoid line has no count, no named surface and no override claim — but
  // deleting it would be a change nothing else here would notice.
  contains('edit/text_add: the older avoid bullet is still there too', p,
    'Adding any word that is not between those quotation marks');
}
{
  // A preset's whole contribution to text_add is naming the ONE surface. This is
  // the half that was measured missing.
  const badge = buildEditPrompt({ editType: 'text_add', editDescription: 'عرض اليوم', editPreset: 'promo_badge' });
  contains('edit/promo_badge: the rule names the badge as the one surface', badge,
    'It appears EXACTLY ONCE, on a single flat badge in the emptiest area of the background, and nowhere else.');
  const label = buildEditPrompt({ editType: 'text_add', editDescription: 'خصم ٥٠٪', editPreset: 'product_label' });
  contains('edit/product_label: the rule names the label as the one surface', label,
    "It appears EXACTLY ONCE, on the product's own front label, and nowhere else.");
  contains('edit/product_label: the text is printed on, not floated over', label,
    "Wrap the text to the label's curvature and perspective");
  contains('edit/promo_badge: the badge never touches the product', badge,
    'Keep the badge entirely off the product');
}

// ---- edit: presets, i.e. the customer picking instead of typing ----
//
// Needles below come from a preset's `direction`, `must` or `avoid` — never from
// the mode `task`, and never from the editType slug. `buildEditPrompt` falls back
// to `Apply the requested edit: <slug with spaces>` for an unknown mode, so a
// needle like 'background' passes against a completely gutted table and proves
// nothing. Same trap the four-mode block above documents.
{
  const p = buildEditPrompt({ editType: 'background_replace', editPreset: 'marketplace_white' });
  // The spec a customer cannot reach by typing "white background", and the
  // reason presets exist at all.
  contains('edit/marketplace_white: white is a measured value, not an impression', p,
    'true RGB 255,255,255');
  contains('edit/marketplace_white: the product fills ~85% of the frame', p,
    'spans about 85% of the corresponding frame dimension');
  contains('edit/marketplace_white: no badge, tag or watermark', p, 'rejected outright');
  contains('edit/marketplace_white: the cutout leaves nothing behind', p,
    'no surviving pixels of the old background');
  // A preset REFINES the mode; it does not replace it. Both of these come from
  // EDIT_MODES.background_replace and must survive a preset being chosen —
  // otherwise a preset is a way to silently opt out of the mode's guarantees.
  contains('edit/marketplace_white: the mode cutout rule survives', p, 'no halo, no fringing');
  contains('edit/marketplace_white: the mode subject rule survives', p,
    'Altering, moving, cropping or restyling the subject itself');
  // And the whole point: no typing happened.
  omits('edit/marketplace_white: a preset needs no customer instruction', p, 'Customer instruction:');
}
{
  // NO text_add RULE MAY BE A PRECONDITION WITH NO LEGAL PLACEMENT.
  //
  // Measured on production 2026-08-27, twice, on the same image: `product_label`
  // returned the customer's photograph visually unchanged while the route
  // answered 200 and charged a credit. The same mode with NO preset rendered the
  // Arabic large, clean and correctly joined on the first try — so the mode, the
  // script rules and the containment rule were all fine. The preset was not.
  //
  // Two of its rules could not both be met on a wrapper printed edge to edge:
  // "place it in existing negative space" (there was none) and "never larger
  // than the product name already printed there" (which drives the type toward
  // invisible). A model facing a precondition it cannot satisfy declines, and
  // declining is indistinguishable from success at the HTTP layer.
  //
  // HONEST LIMIT: no prompt test can prove a model will act. These pin the
  // WORDING that was measured to matter — an ordering the model can always
  // satisfy, and a fallback surface when the first choice has no room.
  const label = buildEditPrompt({
    editType: 'text_add', editPreset: 'product_label', editDescription: 'شاورما الشام',
  } as never);

  omits('edit/product_label: no ceiling that can drive the type to invisible', label,
    'never larger than the product name');
  contains('edit/product_label: legibility is the size rule', label,
    'clearly legible at a glance');
  contains('edit/product_label: a fallback surface when the label has no room', label,
    'If the label carries no clear area large enough');

  // The mode-level placement rule must be a PREFERENCE, not a precondition, for
  // every text_add prompt — including the preset-less path that already works.
  for (const preset of [undefined, 'product_label', 'promo_badge']) {
    const p = buildEditPrompt({
      editType: 'text_add', editPreset: preset, editDescription: 'شاورما الشام',
    } as never);
    contains(`edit/text_add${preset ? `/${preset}` : ''}: placement is an ordering, not a precondition`, p,
      'Place it in the clearest space available, preferring empty areas');
    omits(`edit/text_add${preset ? `/${preset}` : ''}: drops the absolute negative-space demand`, p,
      'Place it in existing negative space');
  }
}
{
  // A text_add prompt MUST NOT declare its own target surface off-limits.
  //
  // Measured on production 2026-08-27: `product_label` was a NO-OP. 1.93% of
  // pixels changed, mean channel delta 1.43 — against 81% / 129 for a
  // background replace on the same image. The customer paid a credit and got
  // their photograph back unchanged.
  //
  // The cause was one sentence. The shared containment line named "packaging,
  // labels" as surfaces that must be COMPLETELY BLANK, and on a product
  // close-up the label IS where the text goes. The model was told to print on
  // the label, to leave labels blank, and not to redraw the label's artwork;
  // doing nothing was the only move that broke no rule.
  //
  // A fixed list of nouns cannot know what the preset aimed at, which is
  // exactly how it came to name it. So the rule is now an EXCLUSION of the
  // target, and that is what these checks pin.
  for (const presetId of ['product_label', 'promo_badge'] as const) {
    const p = buildEditPrompt({
      editType: 'text_add', editPreset: presetId, editDescription: 'شاورما الشام',
    } as never);
    omits(`edit/${presetId}: never declares any surface blanket-BLANK`, p,
      'must be COMPLETELY BLANK');
    contains(`edit/${presetId}: states containment as an exclusion of the target`, p,
      'No text of any kind is added to any surface other than');
    contains(`edit/${presetId}: existing artwork on the target survives the addition`, p,
      'even if that surface already carries printed artwork');
  }

  // The blanket rule is still right for every mode that adds NO text, and must
  // not be lost while fixing text_add — otherwise this trades one defect for
  // the invented-text defect it was written for.
  const bg = buildEditPrompt({
    editType: 'background_replace', editPreset: 'marketplace_white',
  } as never);
  contains('edit/non-text modes keep the blanket blank rule', bg, 'must be COMPLETELY BLANK');
  contains('edit/non-text modes still forbid inventing text', bg,
    'Do not add, invent, redraw or translate ANY text');
}
{
  // THE PALETTE IS GATED ON THE PRESET, NOT ON THE KIT EXISTING.
  //
  // This repo shipped the identical contradiction once in the sibling studio:
  // "The photoshoot BRAND block asked for colour 'in the set dressing' and was
  // appended to `white_studio`, which specifies 'no props'". Handing a model a
  // palette while the same prompt forbids colour is an instruction pulling the
  // other way, and on `marketplace_white` losing that argument means a tinted
  // background — a rejected listing, not a matter of taste.
  const kit = { primary_color: '#C8102E', secondary_color: '#1B1B1B', accent_color: '#F5C518' };

  const white = buildEditPrompt({
    editType: 'background_replace', editPreset: 'marketplace_white', brandKit: kit,
  } as never);
  omits('edit/palette: marketplace_white never carries the brand palette', white, 'Brand Colors:');
  omits('edit/palette: nor the primary hex by any other route', white, '#C8102E');

  // The preset that exists to USE the palette must still receive it, or the
  // gate above would be indistinguishable from deleting the feature.
  const match = buildEditPrompt({
    editType: 'color_change', editPreset: 'brand_color_match', brandKit: kit,
  } as never);
  contains('edit/palette: brand_color_match still receives it', match, 'Brand Colors:');
  contains('edit/palette: brand_color_match receives the real hex', match, '#C8102E');

  // Free text keeps it: the customer may be naming their own colours in words,
  // and the model needs the hex to match what they meant.
  const free = buildEditPrompt({
    editType: 'background_replace', editDescription: 'خلي الخلفية بلون علامتي', brandKit: kit,
  } as never);
  contains('edit/palette: the free-text path still receives it', free, 'Brand Colors:');
}
{
  // A preset from a DIFFERENT editType is refused by the route with a 400. The
  // builder drops it too, so no caller can compose a background swap under a
  // colour-change task.
  const p = buildEditPrompt({ editType: 'color_change', editPreset: 'marketplace_white', editDescription: 'make the lid red' });
  omits('edit: a mismatched preset composes nothing', p, 'true RGB 255,255,255');
  contains('edit: the mode still stands on its own', p, 'Applying a flat colour fill');
  ok('edit: the type-match rule refuses a foreign preset',
    !editPresetMatchesType('marketplace_white', 'color_change'));
  ok('edit: the type-match rule accepts its own preset',
    editPresetMatchesType('marketplace_white', 'background_replace'));
  ok('edit: an unknown preset id matches nothing',
    !editPresetMatchesType('not_a_preset', 'background_replace'));
}
{
  const preset = buildEditPrompt({ editType: 'background_replace', editPreset: 'marketplace_white' });
  omits('edit: preset alone requires no typing', preset, 'Customer instruction:');
  const both = buildEditPrompt({
    editType: 'background_replace', editPreset: 'marketplace_white', editDescription: 'keep the shadow soft',
  });
  contains('edit: a preset and a note compose', both, 'Customer instruction: keep the shadow soft');
  // The recipe is the specification, the free text is the amendment to it.
  after('edit: the recipe is read before the amendment', both, 'Customer instruction:', 'Direction:');
}

// ---- edit: the brand kit reaches the model for the first time ----
// `buildEditPrompt`'s `brandKit` parameter was documented DEAD until 2026-08-27
// (review finding F10): the route had no `brandKitId` and never fetched a kit.
function editKit(overrides: Partial<BrandKit>): BrandKit {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    user_id: '00000000-0000-4000-8000-000000000002',
    name: 'مطعم الشام',
    logo_url: null,
    primary_color: '#1B4D3E',
    secondary_color: '#E8D8C3',
    accent_color: '#C8A24A',
    font_primary: 'Tajawal',
    font_secondary: 'Inter',
    brand_voice: null,
    is_default: true,
    website_url: null,
    industry: null,
    description: null,
    target_audience: null,
    city: null,
    created_at: '2026-08-27T00:00:00.000Z',
    ...overrides,
  };
}
{
  const p = buildEditPrompt({
    editType: 'background_replace', editPreset: 'studio_gradient', brandKit: editKit({}),
  });
  contains('edit/studio_gradient: the primary colour reaches the recipe', p,
    '#1B4D3E in the deeper edge tone');
  contains('edit/studio_gradient: the secondary colour reaches the recipe', p,
    '#E8D8C3 in the lighter centre');

  const noKit = buildEditPrompt({ editType: 'background_replace', editPreset: 'studio_gradient' });
  omits('edit/studio_gradient: no kit means no invented palette', noKit, '#1B4D3E');
  contains('edit/studio_gradient: no kit degrades to a stated neutral', noKit,
    'smooth neutral-grey studio gradient sweep');
}
{
  // Every brand_kits colour column is writable to an arbitrary string over
  // PostgREST — 022's column lockdown covered `profiles`, 042 constrains
  // `logo_url` alone — and a preset interpolates these straight into the prompt.
  // "This one reaches the model" and "this one is filtered" are the same claim.
  throws('edit: a blocked term in a brand colour is refused', () =>
    buildEditPrompt({
      editType: 'background_replace', editPreset: 'studio_gradient',
      brandKit: editKit({ primary_color: 'gun metal' }),
    })
  );
}
{
  const p = buildEditPrompt({
    editType: 'color_change', editPreset: 'brand_color_match', brandKit: editKit({}),
  });
  contains('edit/brand_color_match: the brand colour IS the target', p,
    "Recolour the product's main body panel to exactly #1B4D3E");
  contains('edit/brand_color_match: the colour sits on the surface, not over it', p,
    'must sit ON the existing surface');
  // The route turns this flag into a clean 400 rather than spending a credit on
  // the model's guess at what "the brand colour" might be.
  ok('edit: brand_color_match declares that it needs a palette',
    editPresetRequiresBrandColors('brand_color_match'));
  ok('edit: a preset that degrades cleanly does not declare it',
    !editPresetRequiresBrandColors('accurate_color'));
  ok('edit: an unknown preset id requires nothing',
    !editPresetRequiresBrandColors('not_a_preset'));
}
{
  // The business facts, arriving the way the route sends them: built once, above
  // the reservation, and passed IN.
  const block = buildBrandContextBlock({
    name: 'مطعم الشام', industry: 'restaurant', description: null, targetAudience: null, city: 'دبي',
  });
  const p = buildEditPrompt({
    editType: 'background_replace', editPreset: 'lifestyle_scene', brandContextBlock: block,
  });
  contains('edit: the business facts reach the model', p, '- Business: مطعم الشام');
  contains('edit: the city reaches the model', p, '- City: دبي');
  contains('edit: the industry is resolved, not a raw slug', p, '- Industry: restaurant and food service');
  contains('edit/lifestyle_scene: the recipe points the model AT that block', p,
    'Take the setting from the CLIENT CONTEXT block above');

  // No kit, no heading. `lifestyle_scene` names CLIENT CONTEXT in its own
  // direction line, so the needle has to be the block's first FIELD rather than
  // the heading — otherwise this passes for a prompt that opened a heading over
  // nothing.
  const bare = buildEditPrompt({ editType: 'background_replace', editPreset: 'lifestyle_scene' });
  omits('edit: no facts means no CLIENT CONTEXT body', bare, '- Business:');
}

// ---- edit: the preset table itself ----
// Golden strings above pin the presets that carry the most weight. This block
// pins the SHAPE of every entry, because the failure mode for a table of 14 is
// one stubbed entry nobody wrote a golden string for.
{
  const brand = { safePrimary: '#1B4D3E', safeSecondary: '#E8D8C3', safeAccent: '#C8A24A' };
  for (const id of EDIT_PRESET_IDS) {
    const preset = EDIT_PRESETS[id];
    ok(`edit/${id}: belongs to a real editType`,
      (EDIT_TYPES as readonly string[]).includes(preset.editType));
    // A "real recipe, not a one-line stub" — the standard EDIT_MODES and
    // lib/ai/prompts/photoshoot.ts are held to.
    ok(`edit/${id}: states at least two MUST rules`, preset.must.length >= 2);
    ok(`edit/${id}: states at least two AVOID rules`, preset.avoid.length >= 2);
    ok(`edit/${id}: its direction is a specification, with a brand and without`,
      preset.direction(null).length >= 120 && preset.direction(brand).length >= 120);
    // Only text_add can name a text surface, and it always must — that is what
    // makes "EXACTLY ONCE, on X" statable.
    ok(`edit/${id}: names a text surface iff it is a text_add preset`,
      preset.editType === 'text_add' ? Boolean(preset.textSurface) : preset.textSurface === undefined);

    // …and all of it actually reaches the prompt. A perfect table wired to
    // nothing is the exact shape of the defect this round fixed.
    const p = buildEditPrompt({ editType: preset.editType, editPreset: id, editDescription: 'عرض اليوم' });
    contains(`edit/${id}: its direction reaches the prompt`, p, preset.direction(null));
    contains(`edit/${id}: its first MUST reaches the prompt`, p, preset.must[0]);
    contains(`edit/${id}: its first AVOID reaches the prompt`, p, preset.avoid[0]);
  }
  for (const editType of EDIT_TYPES) {
    ok(`edit/${editType}: has at least one preset`,
      EDIT_PRESET_IDS.some((id) => EDIT_PRESETS[id].editType === editType));
  }
  // The marketplace white background is the one preset this round was required
  // to ship. Pinned by id so "we redesigned the set" cannot quietly drop it.
  ok('edit: the marketplace white preset exists and is a background replace',
    editPresetMatchesType('marketplace_white', 'background_replace'));
}

if (failures > 0) {
  console.log(`\n[prompts] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[prompts] ${checks} checks passed`);
