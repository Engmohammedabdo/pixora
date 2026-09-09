/**
 * ONE DIALECT ON THE MARKETING SURFACE.
 *
 * WHY THIS EXISTS. On 2026-09-09 the shipped Arabic marketing copy carried FOURTEEN
 * Gulf tokens beside eighty-eight Egyptian ones — `ليش PyraSuite؟` as a section
 * heading, `إيش تبي` in the studios subtitle, `سؤال عدل` opening the comparison,
 * `هذي التكلفة` on the pricing table. Measured, not impressionistic.
 *
 * A reader does not experience that as "supports many dialects". They experience one
 * writer who cannot hold a voice — and the competitor this was measured against
 * (crewzo.ai) sells a NAMED Khaleeji claim, so a half-Gulf page is contesting their
 * ground while losing our own. `docs/POSITIONING.md` §4 takes the decision: the
 * marketing surface speaks Egyptian-leaning, one register, and Riyadh is conceded
 * deliberately.
 *
 * ── WHAT THIS DOES **NOT** POLICE, AND WHY IT MATTERS ──────────────────────────
 *
 * 1. DIALECT IS STILL A PRODUCT FEATURE. `DIALECT_PROMPTS` (lib/ai/tts-router.ts)
 *    and every plan's `dialectsAvailable` carry the real five-value set, and the
 *    voiceover and campaign studios let a customer pick any of them. Selling in one
 *    voice and GENERATING in five is the product working, not a contradiction. So
 *    this gate reads `messages/ar.json` and never `lib/`.
 *
 * 2. ONLY THE MARKETING NAMESPACES. `landing`, `studios`, `pricingPage` — the copy a
 *    stranger reads before they have an account. The app's own surfaces (`admin`,
 *    `billing`, studio forms, error strings) are out of scope: nobody is being sold
 *    to there, and a sweep of 863 keys is a different, riskier change.
 *
 * 3. MODERN STANDARD ARABIC IS NOT A VIOLATION. `نفسه`, `الآن`, and `ثانية` as a
 *    unit of TIME all survive here on purpose. MSA is the neutral baseline every
 *    Arabic marketing page uses and no reader clocks it as foreign; a Gulf pronoun
 *    inside Egyptian copy is clocked instantly. The rule is about what a reader
 *    NOTICES, not about lexical purity — which is also why `ثانية` cannot simply be
 *    banned: it is the time unit in five surviving strings and meant "another" in
 *    four that were fixed. Same word, and only meaning separates them.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ar = JSON.parse(readFileSync(join(ROOT, 'messages/ar.json'), 'utf8')) as Record<string, unknown>;

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failures.push(`FAIL  ${name}${detail ? `  → ${detail}` : ''}`);
}

/** The namespaces a logged-out visitor reads. */
const MARKETING_ROOTS = ['landing', 'studios', 'pricingPage'] as const;

/**
 * Arabic letters. Used as a lookaround so a token matches as a WHOLE WORD.
 *
 * JS `\b` is ASCII-only and is USELESS here — after the non-ASCII `ي` of `تبي` it
 * demands a following ASCII word character, so a space or a full stop kills the
 * match, i.e. every real sentence. `studio-pages.test.ts` records the same trap
 * costing that gate its entire Arabic arm; this file was written knowing it.
 */
const AR = '[\\u0621-\\u064A]';
const whole = (t: string): RegExp => new RegExp(`(?<!${AR})${t}(?!${AR})`, 'gu');

/**
 * Tokens a Gulf or Levantine speaker uses and an Egyptian one does not. Every entry
 * appeared in this file's own copy on 2026-09-09 or is its immediate paradigm-mate —
 * `تبي` was present, so `تبين`/`يبي` belong here even though they were not, because
 * the next edit reaches for them.
 */
const FOREIGN_TOKENS: Record<string, string> = {
  'تبي': 'EGY: عايز', 'تبيه': 'EGY: عايزه', 'تبين': 'EGY: عايزة', 'يبي': 'EGY: عايز',
  'أبي': 'EGY: عايز', 'ابي': 'EGY: عايز', 'أبغى': 'EGY: عايز', 'ابغى': 'EGY: عايز',
  'إيش': 'EGY: إيه', 'ايش': 'EGY: إيه', 'وش': 'EGY: إيه', 'شنو': 'EGY: إيه',
  'ليش': 'EGY: ليه', 'كيف': 'EGY: إزاي', 'متى': 'EGY: إمتى', 'وين': 'EGY: فين',
  'مو': 'EGY: مش', 'مب': 'EGY: مش',
  'هذي': 'EGY: دي', 'هاي': 'EGY: دي', 'هاد': 'EGY: ده',
  'زين': 'EGY: كويس', 'عدل': 'EGY: في محله', 'كذا': 'EGY: كده', 'الحين': 'EGY: دلوقتي',
  'شي': 'EGY: حاجة', 'أشياء': 'EGY: حاجات',
  'يصير': 'EGY: يحصل', 'بدي': 'EGY: عايز', 'هلق': 'EGY: دلوقتي',
  'ثاني': 'EGY: تاني (when it means "another")',
};

// ── The detector proves itself BEFORE it is trusted ─────────────────────────
// studio-pages.test.ts shipped a credit detector that could never fire on Arabic
// and reported everything clean for weeks. A gate that passes on broken input is
// worse than no gate, so this corpus runs first and these are the checks that fail
// if a future edit breaks the matcher itself.
const MUST_MATCH: [string, string][] = [
  ['ليش PyraSuite؟', 'ليش'],
  ['إنت بس تقول لبايرا إيش تبي', 'تبي'],
  ['سؤال عدل. والإجابة مش في جودة الصورة', 'عدل'],
  ['مو عارف توصف؟', 'مو'],
  ['هذي التكلفة الفعلية', 'هذي'],
  ['اكتب أي شي', 'شي'],
  ['إيش يصير لو خلصت الكريدت؟', 'يصير'],
  ['كيف يشتغل نظام الكريدت؟', 'كيف'],
];
for (const [sentence, token] of MUST_MATCH) {
  check(`the detector CATCHES ${JSON.stringify(token)} in a real sentence`, whole(token).test(sentence), sentence);
}

// Words that CONTAIN a token's letters but are not the token. Every one of these is
// live copy in messages/ar.json, so a matcher that is not whole-word-anchored fails
// here rather than deleting a correct sentence.
const MUST_NOT_MATCH: [string, string][] = [
  ['المشهد والإضاءة والزاوية', 'شي'],
  ['بيئات جاهزة ومشيت عليها', 'شي'],
  ['كل عملية لها تكلفة واضحة', 'كيف'],
  ['هذيان', 'هذي'],
  ['الموقع', 'مو'],
  ['وشك', 'وش'],
  ['ثانية واحدة من الصوت', 'ثاني'],
];
for (const [sentence, token] of MUST_NOT_MATCH) {
  check(`the detector does NOT fire on ${JSON.stringify(sentence)} for ${JSON.stringify(token)}`, !whole(token).test(sentence), sentence);
}

// ── The scan ────────────────────────────────────────────────────────────────
type Leaf = { path: string; text: string };
function leaves(node: unknown, path: string, out: Leaf[]): void {
  if (typeof node === 'string') { out.push({ path, text: node }); return; }
  if (Array.isArray(node)) { node.forEach((v, i) => leaves(v, `${path}[${i}]`, out)); return; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) leaves(v, `${path}.${k}`, out);
  }
}

const all: Leaf[] = [];
for (const root of MARKETING_ROOTS) {
  check(`messages/ar.json has a "${root}" namespace to scan`, Boolean(ar[root]));
  leaves(ar[root], root, all);
}

// A scan that matches nothing must FAIL rather than certify an empty result — the
// rule mock-from-schema.test.ts states and studio-pages.test.ts repeats. Without
// this, a `leaves()` that silently stopped recursing would report a clean sweep.
check('the sweep visited a plausible number of strings', all.length >= 300, `${all.length} strings`);

for (const { path, text } of all) {
  for (const [token, hint] of Object.entries(FOREIGN_TOKENS)) {
    const hit = text.match(whole(token));
    if (hit) {
      // `ثانية` is the time unit in five live strings and meant "another" in four
      // that were rewritten. `ثاني` is listed above and `ثانية` deliberately is
      // NOT: banning it would fail five correct sentences, and no regex can read
      // the meaning. It is left to review, and this comment is the record of that.
      check(`${path} is one dialect`, false, `${hit.length}x ${JSON.stringify(token)} — ${hint}`);
    }
  }
}
check('the marketing copy carries no Gulf or Levantine token', failures.length === 0, `${failures.length} string(s)`);

if (failures.length) {
  console.error(failures.join('\n'));
  console.error(`\n[one-dialect] ${failures.length} of ${passed + failures.length} checks FAILED`);
  console.error('See docs/POSITIONING.md §4 — the marketing surface speaks ONE register.');
  process.exit(1);
}
console.log(`[one-dialect] ${passed} checks passed (${all.length} strings, ${Object.keys(FOREIGN_TOKENS).length} tokens)`);
