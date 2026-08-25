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
  contains('food: names a food set', p, 'food');
  omits('food: never asks for a product label', p, 'label');
  omits('food: never asks for material finish', p, 'material finish');
  contains('food: asks for freshness', p, 'fresh');
}
{
  // Every one of the six recipes must be reachable and food-appropriate.
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    seen.add(buildPhotoshootPrompt({
      environment: 'food', shotIndex: i, totalShots: 6, seed: 'seed-a',
    }));
  }
  checks++;
  if (seen.size !== 6) {
    failures++;
    console.log(`FAIL  food: a 6-shot set produces 6 distinct frames\n        got ${seen.size}`);
  }
}
{
  // An unknown environment must still fall back, not throw.
  const p = buildPhotoshootPrompt({ environment: 'nope', shotIndex: 0, totalShots: 1 });
  contains('photoshoot: unknown environment falls back to white studio', p, 'infinity cove');
}

// ---- edit: text_add accepts the customer's own script ----
{
  const p = buildEditPrompt({ editType: 'text_add', editDescription: 'اكتب: عرض اليوم' });
  omits('edit/text_add: no Latin-only restriction', p, 'Latin characters');
  omits('edit/text_add: Arabic is no longer forbidden', p, 'Arabic script — it does not render');
  contains('edit/text_add: demands correct letter joining', p, 'joining');
  contains('edit/text_add: demands right-to-left', p, 'right-to-left');
  contains('edit/text_add: forbids transliteration', p, 'ransliterat');
  contains('edit/text_add: still forbids extra text', p, 'beyond what was asked for');
}

// ---- edit: the other four modes keep their preservation rules ----
// The EDIT_MODES table is one careless keystroke from losing these.
{
  const bg = buildEditPrompt({ editType: 'background_replace', editDescription: 'x' });
  contains('edit/background_replace: names the mode task', bg, 'background');

  const rm = buildEditPrompt({ editType: 'object_remove', editDescription: 'x' });
  contains('edit/object_remove: names the mode task', rm, 'emove');

  const cc = buildEditPrompt({ editType: 'color_change', editDescription: 'x' });
  contains('edit/color_change: names the mode task', cc, 'olour');

  const st = buildEditPrompt({ editType: 'style_transfer', editDescription: 'x' });
  contains('edit/style_transfer: keeps the subject recognisable', st, 'recognisable');
}

// ---- edit: every mode still says the customer's photo must survive ----
{
  for (const m of ['background_replace', 'object_remove', 'color_change', 'text_add', 'style_transfer']) {
    const p = buildEditPrompt({ editType: m, editDescription: 'x' });
    contains(`edit/${m}: the customer's photo must survive`, p, 'must survive it');
  }
}

if (failures > 0) {
  console.log(`\n[prompts] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[prompts] ${checks} checks passed`);
