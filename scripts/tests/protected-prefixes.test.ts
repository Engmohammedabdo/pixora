/**
 * Proof that protected routes are DERIVED from the (dashboard) directory —
 * never a hand-kept list — and that an unknown path is not "protected".
 *
 *   npx tsx scripts/tests/protected-prefixes.test.ts
 *
 * Measured 2026-09-01: /about, /ar/blog/x, /ar/nonexistent-xyz all 307'd to
 * /ar/login. A crawler probing /faq got the login form: a soft-404 on every
 * URL the site does not have. This repo already records what a hand-kept
 * filename list does (app/layout.tsx, 2026-08-24): it lies the day after.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PROTECTED_PREFIXES, isProtectedPath } from '../../lib/routing/protected';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}
const ROOT = join(__dirname, '..', '..');
const dir = join(ROOT, 'app', '[locale]', '(dashboard)');
const fromDisk = readdirSync(dir)
  .filter((e) => statSync(join(dir, e)).isDirectory())
  .map((e) => `/${e}`)
  .sort();
check('the list equals the (dashboard) directory listing', JSON.stringify([...PROTECTED_PREFIXES].sort()) === JSON.stringify(fromDisk), `\n  code: ${[...PROTECTED_PREFIXES].sort().join(' ')}\n  disk: ${fromDisk.join(' ')}`);
check('a scan that finds nothing FAILS', fromDisk.length >= 10, String(fromDisk.length));

for (const p of ['/dashboard', '/creator', '/creator/anything', '/billing', '/onboarding']) check(`${p} is protected`, isProtectedPath(p));
for (const p of ['/', '/pricing', '/about', '/blog/x', '/nonexistent-xyz', '/creators']) check(`${p} is NOT protected`, !isProtectedPath(p));

if (failures) { console.log(`\n[protected-prefixes] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[protected-prefixes] ${checks} checks passed`);
