/**
 * Exactly one <html> in every document the build actually PRODUCED.
 *
 *   npm run build          (runs automatically as postbuild)
 *   npx tsx scripts/tests/built-document.test.ts [dir]
 *
 * WHY THIS EXISTS ALONGSIDE test:root-document
 *
 * `test:root-document` reads SOURCE: it walks each routable leaf's layout chain
 * and asserts one document owner. That is the right shape for the defect it was
 * written for — a second layout rendering <html> — and it is deliberately not an
 * allowlist of filenames.
 *
 * It cannot see this one. On 2026-08-25 a client component was added to
 * app/[locale]/layout.tsx. No layout gained an <html>, so the chain was still
 * exactly one owner and root-document passed 62 of 62 — while the build emitted:
 *
 *     .next/server/app/ar.html    2 <html> start tags, and NO GA tag at all
 *     .next/server/app/en.html    2 <html> start tags
 *
 * The Arabic landing page — the URL a launch announcement points at — shipped
 * with no analytics at all, and both landing pages had silently regressed the
 * two-document defect app/layout.tsx exists to document. tsc, eslint, all 15
 * invariants, all 13 prebuild test files and `next build` itself were green.
 *
 * The lesson is narrow and worth keeping: **a source-level rule cannot certify a
 * rendered document.** React 19 treats <html> as a host singleton, so a second one
 * can be introduced by a rendering accident rather than by a layout, and nothing
 * upstream of the output can observe it. So this gate counts tags in the bytes
 * that ship, and runs AFTER the build rather than before — the one gate here that
 * cannot be a prebuild, because before the build there is nothing to read.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2] ?? '.next/server/app';

function htmlFiles(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(htmlFiles(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

let files: string[];
try {
  files = htmlFiles(ROOT);
} catch {
  console.log(`[built-document] ${ROOT} not found — run \`npm run build\` first`);
  process.exit(1);
}

// A build that produces no prerendered documents at all is not a pass. It means
// the output moved and this gate is reading an empty directory — the failure mode
// where a green check certifies nothing.
if (files.length === 0) {
  console.log(`[built-document] no .html artifacts under ${ROOT} — the gate would certify nothing`);
  process.exit(1);
}

let failures = 0;
for (const file of files) {
  const html = readFileSync(file, 'utf8');
  // `<html ` or `<html>`. Counted with a global regex, NOT with grep-per-line:
  // a prerendered document is ONE line, so any per-line count reports 1 no matter
  // how many tags are on it. That mistake is how "62 of 62 carry exactly one
  // <html>" was reported for a tree in which two of them carried two.
  const count = (html.match(/<html[\s>]/g) ?? []).length;
  if (count !== 1) {
    failures++;
    console.log(`FAIL  ${count} <html> start tags (expected 1): ${file}`);
  }
}

if (failures > 0) {
  console.log(`\n[built-document] ${failures} of ${files.length} documents FAILED`);
  process.exit(1);
}
console.log(`[built-document] ${files.length} documents checked, each with exactly one <html>`);
