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

if (failures > 0) {
  console.log(`\n[prompts] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[prompts] ${checks} checks passed`);
