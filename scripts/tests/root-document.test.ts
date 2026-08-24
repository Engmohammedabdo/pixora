/**
 * ONE DOCUMENT PER ROUTE.
 *
 * On 2026-08-24, 61 of the 64 prerendered documents in this app carried TWO
 * <html> start tags — 23 ar, 23 en, 15 admin. app/layout.tsx rendered one and
 * so did every branch layout beneath it, and the App Router root layout wraps
 * every nested layout, always. The HTML parser's "in body" rule merges only the
 * attributes not already present, so the root's `lang="ar" dir="rtl"` won:
 * every English page and the entire admin panel shipped right-to-left, in
 * Arabic-tagged HTML, in the UA default serif.
 *
 * Nothing in the toolchain modelled it. tsc, eslint, all 15 invariants and a
 * clean production build were green the whole time. Next's own
 * "Missing <html> and <body> tags in the root layout" check is a DEV-ONLY scan
 * of the response stream, satisfied by any layout in the chain — it fires when a
 * document has zero <html>, never when it has two.
 *
 * ── WHY THE RULE IS STATED ON THE CHAIN ────────────────────────────────────
 * The comment this gate replaces was, in effect, a hardcoded list of filenames:
 * "app/[locale]/layout.tsx and app/admin/layout.tsx are each self-contained ...
 * so this root layout never double-wraps them". It was wrong the day it was
 * written and stayed wrong through every later edit, because a list of names
 * cannot notice a new branch. So this walks the ACTUAL layout chain of every
 * routable leaf and counts document owners in it. A new branch, a new
 * not-found, a moved layout — all are covered without anyone remembering to
 * add them here.
 *
 * ── WHY THE ASSERTIONS ARE ON THE TAG, NOT THE FILE ────────────────────────
 * `dir=` appears in app/[locale]/layout.tsx as `<DirectionProvider dir={dir}>`,
 * so a file-wide substring test for it passes even if the <html> element's own
 * dir attribute is deleted — i.e. exactly the production defect, undetected, on
 * the branch that serves 46 of the 61 affected documents. Every attribute check
 * below therefore runs against the extracted `<html ...>` start tag.
 *
 * Comments are stripped with check-invariants.ts's stripComments(), which tracks
 * string state, rather than a naive line regex. These files quote their own
 * history, and a regex that blanks from the first "//" to end of line does the
 * same inside a string literal — so an <html> sharing a line with a URL becomes
 * invisible, and the gate certifies a tree in which the bug has returned.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { stripComments } from '../lib/strip-comments';

const ROOT = process.cwd();
const APP = join(ROOT, 'app');

/** Files that own a document, i.e. render an <html> element. */
const HTML_TAG = /<html[\s\S]*?>/;

/**
 * Route leaves. `page.tsx` is a rendered route; `not-found.tsx` is a rendered
 * boundary with its own chain. `route.ts` handlers return Responses, never HTML,
 * so they have no document and are excluded.
 */
const LEAF_FILES = new Set(['page.tsx', 'not-found.tsx']);

/**
 * global-error.tsx REPLACES the root layout rather than rendering inside it, so
 * it must render its own <html> and is checked separately, not as a chain leaf.
 */
const GLOBAL_ERROR = join(APP, 'global-error.tsx');

interface Failure {
  file: string;
  message: string;
}

const failures: Failure[] = [];
let checks = 0;

function check(condition: boolean, file: string, message: string): void {
  checks++;
  if (!condition) failures.push({ file, message });
}

function rel(p: string): string {
  return relative(ROOT, p).split(sep).join('/');
}

function source(path: string): string {
  return stripComments(readFileSync(path, 'utf8'));
}

function rendersHtml(path: string): boolean {
  return HTML_TAG.test(source(path));
}

function htmlTag(path: string): string {
  return HTML_TAG.exec(source(path))?.[0] ?? '';
}

/** Every directory under app/, excluding api/ (route handlers only). */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (full === join(APP, 'api')) continue;
      walk(full, out);
    } else if (LEAF_FILES.has(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The layout chain for a leaf: every layout.tsx from app/ down to the leaf's own
 * directory, plus the leaf itself (a not-found.tsx can own its document).
 */
function chain(leaf: string): string[] {
  const parts = relative(APP, leaf).split(sep);
  parts.pop();
  const files: string[] = [];
  let dir = APP;
  for (const segment of ['', ...parts]) {
    if (segment) dir = join(dir, segment);
    const layout = join(dir, 'layout.tsx');
    try {
      if (statSync(layout).isFile()) files.push(layout);
    } catch {
      /* no layout at this level */
    }
  }
  files.push(leaf);
  return files;
}

const leaves = walk(APP);
check(leaves.length > 0, 'app/', 'found no page.tsx/not-found.tsx leaves to check — the walker is broken');

const owners = new Set<string>();

for (const leaf of leaves) {
  const files = chain(leaf);
  const documentOwners = files.filter(rendersHtml);
  documentOwners.forEach((o) => owners.add(o));

  check(
    documentOwners.length === 1,
    rel(leaf),
    documentOwners.length === 0
      ? 'nothing in its layout chain renders <html> — this route would serve Next\'s __next_error__ shell'
      : `${documentOwners.length} files in its layout chain render <html> (${documentOwners
          .map(rel)
          .join(', ')}) — the browser keeps the OUTERMOST lang/dir and discards the rest`
  );
}

// Every document owner must be a COMPLETE document and carry the brand faces.
for (const owner of [...owners].sort()) {
  const src = source(owner);
  const tag = htmlTag(owner);

  check(/<body[\s\S]*?>/.test(src), rel(owner), 'renders <html> but no <body>');
  check(/\blang=/.test(tag), rel(owner), `its <html> tag declares no lang: ${tag.slice(0, 80)}`);
  check(/\bdir=/.test(tag), rel(owner), `its <html> tag declares no dir: ${tag.slice(0, 80)}`);
  check(
    tag.includes('fontVariables'),
    rel(owner),
    'its <html> tag does not apply fontVariables — globals.css\'s [lang] font-family rules become ' +
      'invalid at computed-value time and the page renders in the UA default serif'
  );
}

// The root layout specifically must NOT own a document: it wraps every branch.
const rootLayout = join(APP, 'layout.tsx');
check(
  !rendersHtml(rootLayout),
  'app/layout.tsx',
  'the ROOT layout renders <html>. It wraps every nested layout, so every branch that renders its ' +
    'own document now emits two — and the root\'s lang/dir win.'
);

// global-error.tsx replaces the root layout, so it must supply a full document.
check(rendersHtml(GLOBAL_ERROR), 'app/global-error.tsx', 'must render its own <html> — it replaces the root layout');
check(/<body[\s\S]*?>/.test(source(GLOBAL_ERROR)), 'app/global-error.tsx', 'must render its own <body>');

if (failures.length > 0) {
  console.error(`\n[root-document] ${failures.length} of ${checks} checks FAILED\n`);
  for (const f of failures) console.error(`  FAIL  ${f.file}: ${f.message}`);
  console.error('');
  process.exit(1);
}

console.log(`[root-document] ${checks} checks passed (${leaves.length} routes, ${owners.size} document owners)`);
