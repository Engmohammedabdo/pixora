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
 * ground while losing our own.
 *
 * `docs/POSITIONING.md` §4 first answered that with "Egyptian-leaning, one register".
 * THE FOUNDER REVERSED IT THE SAME DAY: the register is clear PROFESSIONAL Arabic,
 * and the ban list below was rebuilt from that decision rather than extended from
 * the old one — which is why `كيف`, `متى` and `ليس` are the target here and were
 * once the violation. If you are reading this file to learn the rule, read §4 as it
 * stands today, not as this paragraph's first sentence describes it.
 *
 * ── WHAT THIS DOES **NOT** POLICE, AND WHY IT MATTERS ──────────────────────────
 *
 * 1. DIALECT IS STILL A PRODUCT FEATURE. `DIALECT_PROMPTS` (lib/ai/tts-router.ts)
 *    and every plan's `dialectsAvailable` carry the real five-value set, and the
 *    voiceover and campaign studios let a customer pick any of them. Selling in one
 *    voice and GENERATING in five is the product working, not a contradiction. So
 *    this gate reads `messages/ar.json` and never `lib/`.
 *
 * 2. ~~ONLY THE MARKETING NAMESPACES.~~ **No longer true, and this paragraph used to
 *    say it was.** The scope widened to EVERY namespace in `messages/ar.json` on
 *    2026-09-09 (see ROOTS below) and, on 2026-09-12, to the Arabic that does not
 *    live in `messages/ar.json` at all: the transactional emails and both
 *    not-found pages (SOURCE_FILES below). A review of the 2026-09-11 round found
 *    that copy had been rewritten by hand and then left with NOTHING holding it —
 *    the gate reported zero while structurally unable to read the files. Same
 *    class as the credit detector that could never fire on Arabic.
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
import { stripComments } from '../lib/strip-comments';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ar = JSON.parse(readFileSync(join(ROOT, 'messages/ar.json'), 'utf8')) as Record<string, unknown>;

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) passed++;
  else failures.push(`FAIL  ${name}${detail ? `  → ${detail}` : ''}`);
}

/**
 * EVERY namespace. Widened 2026-09-09 from three.
 *
 * The three marketing namespaces were the right scope while the rule was about a
 * public page's register. The rule changed: the founder read the copy and called
 * the Egyptian colloquialisms unprofessional, so the whole product moved to clear
 * professional Arabic — and a sweep of `landing`/`studios`/`pricingPage` alone
 * would have left 33 occurrences standing in `studio.errors`, `contact`,
 * `paymentFailed`, `edit.presets` and `waitlist`.
 *
 * Those are the WORST place to leave it. They are what a customer reads when a
 * payment failed, when a generation broke, or when they are asking for help —
 * the moments where sounding careless costs the most.
 */
const MARKETING_ROOTS = null; // every root is scanned; see ROOTS below

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
  // ── Egyptian colloquial ────────────────────────────────────────────────
  'دلوقتي': 'use الآن', 'عايز': 'use تريد', 'عايزة': 'use تريد', 'عاوز': 'use تريد',
  'مش': 'use ليس/لا/غير', 'كده': 'use هكذا', 'إزاي': 'use كيف', 'ازاي': 'use كيف',
  'إمتى': 'use متى', 'امتى': 'use متى', 'بكام': 'use بكم',
  'بتاع': 'use الخاص بـ', 'بتاعك': 'use الخاص بك', 'بتاعتك': 'use الخاصة بك',
  'إحنا': 'use نحن', 'احنا': 'use نحن', 'عشان': 'use حتى/لأن',
  'مافيش': 'use لا يوجد', 'مفيش': 'use لا يوجد', 'خلاص': 'restructure',
  'هتلاقي': 'use ستجد', 'بتدور': 'use تبحث', 'ينخلص': 'use ينتهي',
  'تاني': 'use آخر/مجدداً', 'تانية': 'use أخرى', 'دلوقت': 'use الآن',
  'استنى': 'use انتظر', 'كتير': 'use كثير', 'رسايل': 'use رسائل',
  'حاجة': 'use شيء', 'حاجات': 'use أشياء', 'يشيل': 'use يزيل',
  'تطلّعها': 'use تنتجها', 'بياخد': 'use يحصل على', 'هياخدوا': 'use يحصلون على',
  'اتخصم': 'use خُصم', 'مانجحتش': 'use لم تنجح', 'مجاش': 'use لم يصل',
  // Added 2026-09-11 — found in live copy by adversarial review AFTER the sweep
  // reported zero. None was on this list, which is the only way the count could
  // say zero while the /ar headline read قولها بالعربي.
  'اللي': 'use الذي/التي', 'إيه': 'use ماذا/ما', 'أوي': 'use جداً', 'بالظبط': 'use تحديداً',
  'إنت': 'use أنت', 'ليه': 'use لماذا', 'مين': 'use من', 'بس': 'use فقط/لكن',
  'تقدر': 'use يمكنك', 'أقدر': 'use يمكنني', 'محتاج': 'use تحتاج/يتطلب', 'محتاجة': 'use تحتاج',
  'لوحده': 'use وحده', 'لوحدها': 'use وحدها', 'قولها': 'use قُلها', 'شيل': 'use احذف',
  'عايزه': 'use تريده', 'عايزها': 'use تريدها',
  'مقدرناش': 'use لم نتمكن', 'مظهرش': 'use لم يظهر', 'هتطلع': 'use ستكون',
  // ── Gulf / Levantine ───────────────────────────────────────────────────
  'تبي': 'use تريد', 'تبيه': 'use تريده', 'تبين': 'use تريدين', 'يبي': 'use يريد',
  'أبي': 'use أريد', 'ابي': 'use أريد', 'أبغى': 'use أريد', 'ابغى': 'use أريد',
  'إيش': 'use ماذا', 'ايش': 'use ماذا', 'وش': 'use ماذا', 'شنو': 'use ماذا',
  'ليش': 'use لماذا', 'وين': 'use أين', 'مو': 'use ليس', 'مب': 'use ليس',
  'هذي': 'use هذه', 'هاي': 'use هذه', 'هاد': 'use هذا',
  'زين': 'use جيد', 'كذا': 'use هكذا', 'الحين': 'use الآن',
  'شي': 'use شيء', 'يصير': 'use يحدث', 'بدي': 'use أريد', 'هلق': 'use الآن',
};

/**
 * ── WHAT IS DELIBERATELY *NOT* BANNED, AND WHY IT CHANGED ─────────────────
 *
 * `كيف` · `متى` · `ليس` · `شيء` · `أشياء` · `ثاني` · `ثانية` · `الذي` · `آخر`
 *
 * These are STANDARD ARABIC and are now the target, not the problem. An earlier
 * version of this file banned `كيف` and `متى` outright — correct while the goal
 * was Egyptian colloquial (`إزاي`/`إمتى`), and exactly wrong once the goal became
 * clear professional Arabic. The list was rebuilt rather than extended, because a
 * ban list inherited from a reversed decision fails on correct copy, and a gate
 * that fails on correct copy gets deleted by the next person who hits it.
 *
 * `ثانية` is also the unit of TIME in fifteen live strings. `تاني`/`تانية` are the
 * Egyptian forms and are banned; the standard forms are not. Same letters, and
 * only meaning separates them — which is why this is a hand-kept list and not a
 * stemmer.
 */

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
  ['الكلام قصير أوي', 'أوي'],
  ['اكتب النص اللي عايزه بس', 'اللي'],
  ['تقدر تشحن كريدت إضافي', 'تقدر'],
  ['قولها بالعربي...', 'قولها'],
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
  ['نص بسيط وواضح', 'بس'],
  ['عليه أن يدفع', 'ليه'],
  ['على اليمين', 'مين'],
  ['تقدير التكلفة', 'تقدر'],
  ['قُلها بالعربية', 'قولها'],
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

const ROOTS = Object.keys(ar);
check('messages/ar.json has namespaces to scan', ROOTS.length >= 20, `${ROOTS.length}`);
const all: Leaf[] = [];
for (const root of ROOTS) leaves(ar[root], root, all);

/**
 * Arabic the customer reads that is NOT in `messages/ar.json`.
 *
 * `lib/email/templates.ts` builds the payment-failed, invite and password-reset
 * messages as Arabic string literals in TypeScript; both `not-found.tsx` files do
 * the same. So the 2026-09-11 register sweep rewrote them by hand and this gate —
 * which reads one JSON file — went on reporting zero, structurally unable to see
 * whether they had drifted back. Measured 2026-09-12: 36 Arabic lines across the
 * three, 0 violations. Nothing was holding that.
 *
 * Comments are stripped FIRST, and that is not hygiene: this repo documents its own
 * history by quoting the copy it replaced, so an unstripped scan would fail on a
 * comment recording a defect that is fixed. `prompt-builder-sanitized` states the
 * same rule for the same reason.
 */
const SOURCE_FILES = [
  'lib/email/templates.ts',
  'app/not-found.tsx',
  'app/[locale]/not-found.tsx',
];
for (const rel of SOURCE_FILES) {
  const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
  const arabicLines = src
    .split(/\r?\n/)
    .map((text, i) => ({ path: `${rel}:${i + 1}`, text }))
    .filter((l) => new RegExp(AR).test(l.text));
  // A file that was renamed, moved, or had its Arabic lifted into messages/ar.json
  // must FAIL here rather than quietly contribute nothing — the rule
  // mock-from-schema.test.ts states and this file already applies to the JSON walk.
  check(`${rel} still carries Arabic for this gate to read`, arabicLines.length > 0, `${arabicLines.length} lines`);
  all.push(...arabicLines);
}
// Named explicitly because these five carry the strings a customer reads at their
// worst moment, and a walk that quietly stopped covering them would look clean.
for (const must of ['landing', 'studios', 'pricingPage', 'studio', 'contact']) {
  check(`the sweep opened "${must}"`, ROOTS.includes(must), ROOTS.join(' '));
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
console.log(`[one-dialect] ${passed} checks passed (${all.length} strings from messages/ar.json + ${SOURCE_FILES.length} source files, ${Object.keys(FOREIGN_TOKENS).length} tokens)`);
