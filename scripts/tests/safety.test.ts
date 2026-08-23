/**
 * Prompt-safety filter tests.
 *
 * Runnable and checked in, because the reason two total bypasses shipped green
 * was that nothing re-ran the checks:
 *   - `القتل` passed a whole-word matcher, so Arabic coverage was ~bare forms only;
 *   - `bomb1` passed a stem matcher that treated digits as part of a word.
 * Both were caught by review rather than by anything in the repo.
 *
 *   npm run test:safety     (also runs as part of prebuild)
 *
 * No test framework: this repo has none, and adding one to guard a pure
 * function would be a bigger change than the guard is worth.
 */
import { sanitizePrompt, PromptBlockedError } from '../../lib/ai/prompts/safety';
import { buildPlanPrompt } from '../../lib/ai/prompts/plan';

let failures = 0;
let checks = 0;

function blockedTerm(prompt: string): string | null {
  try {
    sanitizePrompt(prompt);
    return null;
  } catch (error) {
    return error instanceof PromptBlockedError ? error.blockedTerm : 'UNEXPECTED_ERROR';
  }
}

function expectBlocked(prompt: string, why: string): void {
  checks += 1;
  const hit = blockedTerm(prompt);
  if (hit === null || hit === 'UNEXPECTED_ERROR') {
    failures += 1;
    console.error(`  FAIL  should block: ${why}  (${JSON.stringify(prompt)})`);
  }
}

function expectAllowed(prompt: string, why: string): void {
  checks += 1;
  const hit = blockedTerm(prompt);
  if (hit !== null) {
    failures += 1;
    console.error(`  FAIL  should allow: ${why}  -> blocked on "${hit}"`);
  }
}

// ── Real content must still be refused, in both scripts ────────────────────
for (const w of ['nude', 'bomb', 'gun', 'cocaine', 'terrorist']) {
  expectBlocked(`a ${w} scene`, `English: ${w}`);
}
for (const w of ['قتل', 'سلاح', 'مخدرات', 'قنبله', 'ارهاب', 'تعذيب']) {
  expectBlocked(`مشهد ${w} هنا`, `Arabic: ${w}`);
}

// ── Arabic clitics. A whole-word matcher let every one of these through, ────
//    which made the Arabic list almost decorative.
for (const w of ['القتل', 'والقتل', 'بالقتل', 'للقتل', 'السلاح', 'بالسلاح',
                 'الاسلحه', 'المخدرات', 'بالمخدرات', 'القنبله', 'القنابل', 'الارهاب']) {
  expectBlocked(`صورة ${w}`, `affixed: ${w}`);
}

// ── Spelling variants collapse to one entry ────────────────────────────────
expectBlocked('صورة قنبلة', 'ta marbuta');
expectBlocked('مشهد قَتْل', 'harakat');
expectBlocked('أسلحة كثيرة', 'hamza alef + ta marbuta');
expectBlocked('اسلحــة', 'tatweel');

// ── Invisible characters must not split a word ─────────────────────────────
expectBlocked('make a bo​mb', 'ZWSP inside an English word');
expectBlocked('make a bo­mb', 'soft hyphen');
expectBlocked('صورة قن‌بله', 'ZWNJ inside an Arabic word');

// ── Digits must not either. `bomb1` defeated the filter completely. ────────
expectBlocked('bomb1', 'trailing digit');
expectBlocked('bomb2024', 'trailing year');
expectBlocked('1bomb', 'leading digit');
expectBlocked('قتل1', 'Arabic + digit');

// ── The false positives that started all this ──────────────────────────────
expectAllowed('خاتم amethyst فاخر', 'amethyst (contains meth)');
expectAllowed('Bombay Grill مطعم هندي', 'Bombay (contains bomb)');
expectAllowed('دورة skill development', 'skill (contains kill)');
expectAllowed('Shotgun Coffee Roasters', 'Shotgun (contains gun)');
expectAllowed('Killarney للأثاث', 'Killarney');
expectAllowed('Methodology course', 'Methodology');

// ── Ordinary Arabic that must not be caught by stemming ────────────────────
for (const w of ['مقتنيات', 'السلاحف', 'الدماغ', 'الذبيحة', 'المكتبة',
                 'الكرة', 'السلام', 'الاقتصاد', 'التعليم', 'المقاتل']) {
  expectAllowed(`اعلان عن ${w}`, w);
}

// ── Context words deliberately NOT on the list. Each of these is a real ────
//    business a hard blocklist would have refused.
expectAllowed('blood orange juice branding', 'blood orange');
expectAllowed('blood donation drive poster', 'blood donation');
expectAllowed('over the counter drugs pharmacy', 'pharmacy');
expectAllowed('premium chef knife set', 'kitchenware');
expectAllowed('suicide prevention hotline campaign', 'mental-health NGO');
expectAllowed('Gore-Tex jacket', 'Gore-Tex');
expectAllowed('كوكتيل Bloody Mary', 'Bloody Mary');
expectAllowed('مطعم ذبح حلال', 'halal slaughter');
expectAllowed('حملة التبرع بالدماء', 'blood donation drive (Arabic)');
expectAllowed('خدمات الجنسية والإقامة', 'nationality & residency services');
expectAllowed('فندق في البندقية', 'Venice');
expectAllowed('محافظة شبوة', 'Shabwah governorate');
expectAllowed('جدار عاري بلون فاتح', 'a bare wall');
expectAllowed('السيد العريان', 'a surname');

// ── The term must be reported, so the UI can name it ───────────────────────
checks += 1;
if (blockedTerm('صورة القنبله') !== 'قنبله') {
  failures += 1;
  console.error('  FAIL  blocked term should be reported in its canonical form');
}

// ── The plan builder must actually RUN the filter ──────────────────────────
//    lib/ai/prompts/plan.ts imported sanitizePrompt and never called it, so
//    `plan` shipped as the one paid studio with no prompt filter at all and its
//    route's PromptBlockedError arm was dead code. An unused import keeps both
//    tsc and eslint green, so nothing but a test can hold this — and every
//    free-text field is checked, because sanitizing only the "main" one is how
//    the gap reopens.
type PlanInput = Parameters<typeof buildPlanPrompt>[0];

const PLAN_BASE: PlanInput = {
  businessName: 'متجر التمور',
  industry: 'تجزئة',
  goals: ['زيادة المبيعات'],
  targetMarket: 'السعودية',
  budget: '5000 درهم',
  duration: 30,
};

function planBlockedTerm(override: Partial<PlanInput>): string | null {
  try {
    buildPlanPrompt({ ...PLAN_BASE, ...override });
    return null;
  } catch (error) {
    return error instanceof PromptBlockedError ? error.blockedTerm : 'UNEXPECTED_ERROR';
  }
}

const PLAN_FIELDS: [string, Partial<PlanInput>][] = [
  ['businessName', { businessName: 'متجر القنبله' }],
  ['industry', { industry: 'صناعة القنبله' }],
  ['stage', { stage: 'قنبله' }],
  ['targetMarket', { targetMarket: 'سوق القنبله' }],
  ['budget', { budget: '5000 قنبله' }],
  // The second entry, not the first: the goals are sanitized per item, and a
  // loop that only ever checks index 0 passes against a builder that does not.
  ['goals', { goals: ['زيادة المبيعات', 'صورة قنبله'] }],
];

for (const [field, override] of PLAN_FIELDS) {
  checks += 1;
  const hit = planBlockedTerm(override);
  if (hit !== 'قنبله') {
    failures += 1;
    console.error(`  FAIL  buildPlanPrompt must sanitize "${field}"  -> got ${JSON.stringify(hit)}`);
  }
}

// A clean brief must still build, or the guard above could be "satisfied" by a
// builder that throws on everything.
checks += 1;
if (planBlockedTerm({}) !== null) {
  failures += 1;
  console.error('  FAIL  buildPlanPrompt should build an ordinary brief');
}

if (failures > 0) {
  console.error(`\n[safety] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[safety] ${checks} checks passed`);
