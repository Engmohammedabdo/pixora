/**
 * Proof the landing copy says what the product is, in the words people search.
 *
 *   npx tsx scripts/tests/landing-copy.test.ts
 *
 * Measured 2026-09-01 on the live /ar (1,215 visible words): "الذكاء الاصطناعي"
 * once (the <title>), "الإمارات" 0, "منصة تسويق" 0, no definition sentence; the
 * H1 carried the typewriter cursor "|" as text. /en: "UAE" 0, "clinic" 0.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}
const ROOT = join(__dirname, '..', '..');
const ar = JSON.parse(readFileSync(join(ROOT, 'messages/ar.json'), 'utf8')).landing.hero;
const en = JSON.parse(readFileSync(join(ROOT, 'messages/en.json'), 'utf8')).landing.hero;
const hero = readFileSync(join(ROOT, 'components/landing/HeroSection.tsx'), 'utf8');

check('ar definition exists', typeof ar.definition === 'string' && ar.definition.length > 60);
check('ar definition names the product', /PyraSuite/.test(ar.definition));
check('ar definition carries the head term', /الذكاء الاصطناعي/.test(ar.definition));
check('ar definition names the market', /الإمارات/.test(ar.definition) && /الخليج/.test(ar.definition));
check('ar definition names a customer type', /مطاعم|مطعم/.test(ar.definition));
check('en definition exists', typeof en.definition === 'string' && en.definition.length > 60);
check('en definition says "PyraSuite is"', /PyraSuite is/.test(en.definition));
check('en definition names the market', /UAE/.test(en.definition) && /Gulf/.test(en.definition));
check('en definition names customer types', /restaurant/.test(en.definition) && /clinic/.test(en.definition));
check('en H1 targets the English searcher', /AI marketing/i.test(en.titleLine1), en.titleLine1);
check('hero renders the definition', /hero\.definition/.test(hero));
check('no cursor glyph as H1 text', !/>\s*\|\s*<\/span>/.test(hero));
check('cursor is CSS content, not text', /after:content-\['\|'\]/.test(hero));

if (failures) { console.log(`\n[landing-copy] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[landing-copy] ${checks} checks passed`);
