#!/usr/bin/env tsx
/**
 * npm run check:invariants [-- --only=id1,id2] [-- --skip=id1,id2]
 *
 * Automated invariant checker for PyraSuite.
 *
 * WHY THIS EXISTS:
 *   Over a long remediation session, ~15 correctness/quality invariants were
 *   established and verified BY HAND, repeatedly (contrast ratios recomputed
 *   with a calculator, z-index usages grepped one-off, refund calls read
 *   line-by-line). Manual verification does not survive the next contributor
 *   — nothing stops someone reintroducing `pl-4` or a bare `await
 *   refundCredits(...)` next week, and nothing will notice until a user
 *   reports it. This script encodes every one of those invariants as an
 *   executable check, so a regression fails a command instead of silently
 *   shipping. It is meant to run in CI and locally before a PR.
 *
 * DESIGN:
 *   - Every rule implements the single `Invariant` interface below.
 *   - `check()` returns a flat list of `Violation`s; an empty list = pass.
 *   - Two heuristic checks (`theme-aware-text-color`, `no-arabic-literals`)
 *     cannot be made 100% precise with regex/string analysis alone (see the
 *     long comments above each for exactly why). Their violations carry
 *     `severity: 'warning'` when the heuristic itself is not confident about
 *     a specific match; warnings are printed but do not fail the run or the
 *     exit code. Everything else is `severity: 'error'` (the default).
 *   - No new dependencies: node:fs + node:path only, run via `tsx`.
 *
 * USAGE:
 *   npx tsx scripts/check-invariants.ts                  # run everything
 *   npx tsx scripts/check-invariants.ts --only=msg-parity,contrast-tokens
 *   npx tsx scripts/check-invariants.ts --skip=no-arabic-literals-in-tsx
 *   npx tsx scripts/check-invariants.ts --update-baseline # regenerate the
 *                                                          # known-debt file
 *
 * BASELINE (pre-existing debt, NOT a general-purpose suppression tool):
 *   scripts/invariants-baseline.json records violations that already
 *   existed when a rule was introduced and cannot be fixed immediately
 *   (currently: the 130 pre-existing Arabic-literal strings in un-localized
 *   pages, tracked as a separate localization project). A baselined
 *   violation is reported as known debt and does NOT fail the run; a NEW
 *   violation (not in the baseline) always fails the run, even for a rule
 *   that also has baseline entries. Only `no-arabic-literals-in-tsx` is
 *   allowed to consult the baseline at all (see BASELINE_ELIGIBLE_IDS) —
 *   this is enforced in code, not just convention, specifically so the
 *   baseline can never become a way to silence a new violation in any other
 *   rule. See docs/INVARIANTS.md "Baseline mechanism" section.
 *
 * See docs/INVARIANTS.md for the full rationale behind each rule.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

interface Violation {
  /** Repo-relative path, forward slashes, e.g. "components/layout/Sidebar.tsx" */
  file: string;
  /** 1-indexed line number. Use 1 when a rule genuinely has no single line
   *  (e.g. "key is missing entirely" — see msg-parity). */
  line: number;
  /** The offending text: the line itself, or a short description. */
  text: string;
  /** 'error' fails the run (default). 'warning' is printed but does not. */
  severity?: 'error' | 'warning';
}

interface Invariant {
  id: string;
  title: string;
  /** Why this rule exists — the thing that stops someone deleting it. */
  why: string;
  check(): Promise<Violation[]>;
}

// ---------------------------------------------------------------------------
// Shared filesystem helpers
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.superpowers']);

/** Recursively collects files under `root` (relative to repo root) whose
 *  extension is in `exts`, skipping build/vcs directories. */
function walk(root: string, exts: string[]): string[] {
  const absRoot = join(ROOT, root);
  const out: string[] = [];
  function recurse(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        recurse(full);
      } else if (exts.includes(extname(entry))) {
        out.push(full);
      }
    }
  }
  recurse(absRoot);
  return out;
}

/** Repo-relative, forward-slash path for reporting. */
function toRel(absPath: string): string {
  return relative(ROOT, absPath).split('\\').join('/');
}

/** True if any path segment is exactly "admin" — excludes app/admin/** and
 *  components/admin/** (both are deliberately English-only admin surfaces,
 *  out of scope for the Arabic-first / theming rules below). */
function isAdminPath(relPath: string): boolean {
  return relPath.split('/').includes('admin');
}

/** 1-indexed line number of a character offset in `content`. */
function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/** Trimmed source line containing `index`, for the violation's `text` field. */
function lineTextAt(content: string, index: number): string {
  const start = content.lastIndexOf('\n', index) + 1;
  let end = content.indexOf('\n', index);
  if (end === -1) end = content.length;
  return content.slice(start, end).trim();
}

/** App+components file set, .ts/.tsx, optionally excluding admin/. Cached
 *  per (roots, exts, excludeAdmin) so repeated invariants don't re-walk disk. */
const fileListCache = new Map<string, string[]>();
function listFiles(roots: string[], exts: string[], excludeAdmin: boolean): string[] {
  const key = JSON.stringify({ roots, exts, excludeAdmin });
  const cached = fileListCache.get(key);
  if (cached) return cached;
  const files = roots
    .flatMap((r) => walk(r, exts))
    .filter((f) => !excludeAdmin || !isAdminPath(toRel(f)));
  fileListCache.set(key, files);
  return files;
}

// ---------------------------------------------------------------------------
// Invariant 1: msg-parity
// ---------------------------------------------------------------------------

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

/** Flattens a JSON value to dot-path -> leaf, treating arrays as a single
 *  leaf (matching how the 774-key baseline was originally counted — arrays
 *  like `landing.pricing.features.free` are one translatable unit, not N). */
function flattenKeys(obj: JsonValue, prefix = ''): Map<string, JsonValue> {
  const out = new Map<string, JsonValue>();
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const k of Object.keys(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      const v = (obj as Record<string, JsonValue>)[k];
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        for (const [ck, cv] of flattenKeys(v, path)) out.set(ck, cv);
      } else {
        out.set(path, v);
      }
    }
  }
  return out;
}

/** Best-effort line locator for a flattened dot-path in a pretty-printed,
 *  2-space-indented JSON file (which is the house style for messages/*.json).
 *  Not a real JSON-with-positions parser — tracks a key/indent stack against
 *  a `"key":` regex per line. Good enough for "file:line" pointers; if the
 *  file's formatting style changes this degrades to "line 1", not a crash. */
function buildJsonLineMap(raw: string): Map<string, number> {
  const lines = raw.split('\n');
  const map = new Map<string, number>();
  const stack: { key: string; indent: number }[] = [];
  const keyRe = /^(\s*)"((?:[^"\\]|\\.)*)"\s*:/;
  lines.forEach((line, idx) => {
    const m = keyRe.exec(line);
    if (!m) return;
    const indent = m[1].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    stack.push({ key: m[2], indent });
    const path = stack.map((s) => s.key).join('.');
    if (!map.has(path)) map.set(path, idx + 1);
  });
  return map;
}

function loadMessages(locale: string): { raw: string; data: JsonValue; lineMap: Map<string, number> } {
  const path = join(ROOT, 'messages', `${locale}.json`);
  const raw = readFileSync(path, 'utf8');
  return { raw, data: JSON.parse(raw) as JsonValue, lineMap: buildJsonLineMap(raw) };
}

const msgParity: Invariant = {
  id: 'msg-parity',
  title: 'messages/ar.json and messages/en.json have identical flattened key sets',
  why:
    'next-intl looks up a key in the active locale\'s file only. A key present ' +
    'in one locale and missing in the other renders the raw dotted key (or ' +
    'throws, depending on config) for every user of that locale — silently, ' +
    'because the other locale still works fine in manual testing.',
  async check(): Promise<Violation[]> {
    const ar = loadMessages('ar');
    const en = loadMessages('en');
    const arKeys = flattenKeys(ar.data);
    const enKeys = flattenKeys(en.data);
    const violations: Violation[] = [];

    for (const key of arKeys.keys()) {
      if (!enKeys.has(key)) {
        const arLine = ar.lineMap.get(key) ?? 1;
        violations.push({
          file: 'messages/en.json',
          line: 1,
          text: `Missing key "${key}" (present in messages/ar.json:${arLine})`,
        });
      }
    }
    for (const key of enKeys.keys()) {
      if (!arKeys.has(key)) {
        const enLine = en.lineMap.get(key) ?? 1;
        violations.push({
          file: 'messages/ar.json',
          line: 1,
          text: `Missing key "${key}" (present in messages/en.json:${enLine})`,
        });
      }
    }
    return violations;
  },
};

// ---------------------------------------------------------------------------
// Invariant 2: msg-no-empty
// ---------------------------------------------------------------------------

const msgNoEmpty: Invariant = {
  id: 'msg-no-empty',
  title: 'No message value (including array elements) is empty or whitespace-only',
  why:
    'A placeholder value ("", " ") that ships even once is an invisible gap ' +
    'in the UI — a blank button label, an empty toast. It looks correct in ' +
    'the JSON diff and only surfaces when a real user hits that exact string.',
  async check(): Promise<Violation[]> {
    const violations: Violation[] = [];
    for (const locale of ['ar', 'en']) {
      const { data, lineMap } = loadMessages(locale);
      const file = `messages/${locale}.json`;

      function walkValue(value: JsonValue, path: string): void {
        if (Array.isArray(value)) {
          value.forEach((v, i) => walkValue(v, `${path}[${i}]`));
        } else if (value !== null && typeof value === 'object') {
          for (const k of Object.keys(value)) {
            walkValue((value as Record<string, JsonValue>)[k], path ? `${path}.${k}` : k);
          }
        } else if (typeof value === 'string') {
          if (value.trim() === '') {
            // Best-effort: line map is keyed by the nearest containing key
            // (array elements don't get their own map entry), so strip any
            // "[i]" suffix to find the parent key's line.
            const parentKey = path.replace(/\[\d+\]$/, '');
            const line = lineMap.get(parentKey) ?? 1;
            violations.push({ file, line, text: `Empty value at "${path}"` });
          }
        }
      }
      walkValue(data, '');
    }
    return violations;
  },
};

// ---------------------------------------------------------------------------
// Invariant 3: refund-captured
// ---------------------------------------------------------------------------

const refundCaptured: Invariant = {
  id: 'refund-captured',
  title: 'Every refundCredits(...) call in studio routes is assigned to a variable',
  why:
    'refundCredits() returns a result the caller MUST check — it reports ' +
    'whether the refund actually succeeded. A bare, discarded ' +
    '`await refundCredits(...)` throws away that signal: if the refund RPC ' +
    'fails, the user silently keeps the deduction and never gets their ' +
    'credits back, with nothing in the response or logs pointing at it.',
  async check(): Promise<Violation[]> {
    const violations: Violation[] = [];
    const files = listFiles(['app/api/studios'], ['.ts', '.tsx'], false).filter((f) =>
      /[\\/]route\.ts$/.test(f)
    );
    // Matches `await refundCredits(` NOT preceded (ignoring whitespace) by
    // an assignment ("= await refundCredits(" or "const x = await ..."). We
    // scan token-by-token rather than a single regex so we correctly ignore
    // an `=` that belongs to a *different* statement above.
    const callRe = /\bawait\s+refundCredits\s*\(/g;
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const rel = toRel(file);
      let m: RegExpExecArray | null;
      while ((m = callRe.exec(content))) {
        // Look at everything on the same logical statement before "await":
        // walk backward from the match to the previous statement terminator
        // (';', '{', '}') or start of file, and check whether that stretch
        // contains an assignment operator '=' (not '==', '===', '=>').
        const idx = m.index;
        let start = idx;
        while (start > 0 && !';{}'.includes(content[start - 1])) start--;
        const prefix = content.slice(start, idx);
        const hasAssignment = /(?<![=!<>])=(?!=|>)/.test(prefix);
        if (!hasAssignment) {
          violations.push({ file: rel, line: lineAt(content, idx), text: lineTextAt(content, idx) });
        }
      }
    }
    return violations;
  },
};

// ---------------------------------------------------------------------------
// Invariant 4: no-hardcoded-date-locale
// ---------------------------------------------------------------------------

const noHardcodedDateLocale: Invariant = {
  id: 'no-hardcoded-date-locale',
  title: "No toLocaleDateString/toLocaleString/toLocaleTimeString with a literal 'ar'/'en' locale",
  why:
    "Date().toLocaleDateString('ar-SA') renders Arabic-Indic digits (٢٠٢٦) " +
    'even on the English site, because the literal locale wins regardless of ' +
    "which locale the page is actually rendering. It shipped once as a copy-" +
    'pasted formatter; next-intl\'s useFormatter() resolves the *active* ' +
    'locale instead of a frozen one.',
  async check(): Promise<Violation[]> {
    const violations: Violation[] = [];
    const files = listFiles(['app', 'components'], ['.ts', '.tsx'], true);
    const re = /\.(toLocaleDateString|toLocaleString|toLocaleTimeString)\(\s*['"](ar|en)/g;
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const rel = toRel(file);
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        violations.push({ file: rel, line: lineAt(content, m.index), text: lineTextAt(content, m.index) });
      }
    }
    return violations;
  },
};

// ---------------------------------------------------------------------------
// Invariant 5: no-raw-zindex
// ---------------------------------------------------------------------------

const noRawZindex: Invariant = {
  id: 'no-raw-zindex',
  title: 'No raw z-<number> or z-[...] classes — only the named scale',
  why:
    'Radix portals dialogs, dropdowns and tooltips to document.body, so their ' +
    'stacking order is decided purely by z-index value, not DOM nesting. An ' +
    'unnamed z-50 sprinkled in by whoever needed "something on top" collided ' +
    'with the bottom nav\'s z-index and painted above a modal scrim. The ' +
    'named scale (z-header/nav/scrim/drawer/modal/popover, see ' +
    'tailwind.config.ts) is the only place stacking order is decided.',
  async check(): Promise<Violation[]> {
    const violations: Violation[] = [];
    const files = listFiles(['app', 'components'], ['.ts', '.tsx'], true);
    // Named tokens (z-header, z-nav, ...) never match \d or [ so they pass
    // through untouched — no explicit allowlist needed.
    const re = /(?<![\w-])z-(\d+|\[[^\]]*\])/g;
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const rel = toRel(file);
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        violations.push({ file: rel, line: lineAt(content, m.index), text: lineTextAt(content, m.index) });
      }
    }
    return violations;
  },
};

// ---------------------------------------------------------------------------
// Shared JSX tag-boundary scanner (invariants 6 and 8)
// ---------------------------------------------------------------------------

/** Finds the end of a JSX opening tag starting at `content[tagStart]` (the
 *  '<'), honoring quotes and `{...}` expressions so a stray '>' inside a
 *  ternary or template literal doesn't terminate the tag early. Returns the
 *  index of the terminating '>' (inclusive). */
function scanTagEnd(content: string, tagStart: number): number {
  let curly = 0;
  let quote: string | null = null;
  for (let i = tagStart; i < content.length; i++) {
    const c = content[i];
    if (quote) {
      if (c === '\\') i++; // skip escaped char
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') curly++;
    else if (c === '}') curly--;
    else if (c === '>' && curly <= 0) return i;
  }
  return content.length - 1;
}

interface EnclosingTag {
  start: number;
  tagEnd: number; // index of the tag's own terminating '>'
  name: string;
  selfClosing: boolean;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Walks backward from `matchIndex` to the nearest preceding '<Letter',
 *  which — for the class-attribute matches this is used for — is the
 *  opening tag whose attributes contain the match. This assumes the match
 *  sits inside that tag's own attribute text (true for every className /
 *  cn(...) match in real JSX; documented limitation: a stray unescaped '<'
 *  earlier in the same string literal could fool it, which does not occur
 *  in this codebase's Tailwind class strings). */
function findEnclosingTag(content: string, matchIndex: number): EnclosingTag | null {
  let i = matchIndex;
  while (i >= 0) {
    if (content[i] === '<' && /[A-Za-z]/.test(content[i + 1] ?? '')) {
      const tagEnd = scanTagEnd(content, i);
      const nameMatch = /^<([A-Za-z][\w.]*)/.exec(content.slice(i, i + 60));
      return {
        start: i,
        tagEnd,
        name: nameMatch ? nameMatch[1] : '',
        selfClosing: content[tagEnd - 1] === '/',
      };
    }
    i--;
  }
  return null;
}

/** Text of the element's children, from just after its opening tag's '>' to
 *  its own matching closing tag (tracking nesting depth so an inner element
 *  of the *same* tag name doesn't terminate the scan early). Capped so a
 *  missing closing tag can't scan the rest of the file. */
function childrenText(content: string, tag: EnclosingTag, maxScan = 20000): string {
  if (tag.selfClosing) return '';
  const openRe = new RegExp(`<${escapeRegExp(tag.name)}(?=[\\s/>])`, 'g');
  const closeRe = new RegExp(`</${escapeRegExp(tag.name)}\\s*>`, 'g');
  const from = tag.tagEnd + 1;
  const end = Math.min(content.length, from + maxScan);
  let depth = 1;
  let pos = from;
  while (pos < end) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;
    const om = openRe.exec(content);
    const cm = closeRe.exec(content);
    if (!cm) return content.slice(from, end);
    if (om && om.index < cm.index) {
      depth++;
      pos = om.index + om[0].length;
    } else {
      depth--;
      pos = cm.index + cm[0].length;
      if (depth === 0) return content.slice(from, cm.index);
    }
  }
  return content.slice(from, end);
}

/** local-name -> true for every symbol imported from 'lucide-react' in this
 *  file (handles multi-line `import { A, B as C } from 'lucide-react'`). */
function lucideImportNames(content: string): Set<string> {
  const names = new Set<string>();
  const importRe = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]lucide-react['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content))) {
    for (const raw of m[1].split(',')) {
      const part = raw.trim();
      if (!part) continue;
      const asMatch = /^(\w+)\s+as\s+(\w+)$/.exec(part);
      names.add(asMatch ? asMatch[2] : part);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// Invariant 6: theme-aware-text-color
// ---------------------------------------------------------------------------

/*
 * HEURISTIC, documented per the task brief:
 *
 * "Renders text" cannot be decided by regex alone without a real JSX/DOM
 * parser (a <span> can hold a text node, an icon, or nothing at all). The
 * approach here: for every literal `text-primary-500` / `text-primary-600`
 * class-token match, find the JSX tag whose attributes contain it (Zone A),
 * and — if that tag isn't self-closing — its actual children up to its own
 * matching closing tag (Zone B). The match is EXEMPT (not a real text-color
 * violation) when any of these hold:
 *
 *   1. Zone A's own text contains "<svg", OR contains the substring "icon"
 *      case-insensitively (covers the tag's own name being icon-like, e.g.
 *      <Icon>, <persona.icon>, <currentStep.icon>, and covers attributes
 *      that self-describe as icons, e.g. size="icon" on an icon-only
 *      <Button>). A loose substring match is acceptable here because Zone A
 *      is *only* this element's own opening tag — there's no unrelated
 *      sibling code for a stray "icon" substring to false-positive against.
 *   2. Zone A's tag name is exactly `input` — native <input> elements never
 *      render a text child; `text-*` on a checkbox/radio themes the native
 *      check/dot mark, not readable text.
 *   3. Zone A's tag name is itself an identifier imported from
 *      'lucide-react' in this file (e.g. <FileText>, <ToggleLeft>) — a
 *      precise, file-scoped check rather than guessing at lucide's full
 *      icon list.
 *   4. Zone B (the element's real children, bounded to its own closing tag)
 *      contains "<svg", or a child JSX tag whose NAME matches /icon/i, or a
 *      child JSX tag whose name is a lucide import from this file.
 *      Deliberately narrower than Zone A: a *loose* "icon" substring search
 *      here produces a real false negative — components/layout/Sidebar.tsx
 *      renders `{item.icon}` as a *sibling* of the actual text label inside
 *      the same <Link>, and a bare substring match on "icon" would wrongly
 *      exempt the Link's own hardcoded text-primary-600. Requiring the
 *      match to be an actual "<Name" JSX tag (not a bare identifier
 *      reference) avoids that.
 *   5. Zone B's plain text (JSX tags stripped), trimmed, is 1-3 characters
 *      long and consists ENTIRELY of characters from a small curated
 *      "decorative glyph" set (DECORATIVE_GLYPH_RE below) — list-item bullet
 *      markers ("●") and a blinking typewriter cursor ("|") are visually
 *      "content" but convey no reading text, the same non-text category as
 *      an icon; WCAG's text-contrast requirement targets *readable* text,
 *      not marker glyphs. Verified by hand against the 3 sites this exempts:
 *      the roadmap-item and calendar-item bullets in analysis/page.tsx and
 *      plan/page.tsx, and the HeroSection typewriter cursor span. Kept
 *      deliberately narrow (a short explicit character class, length capped
 *      at 3) rather than "any non-letter content", so it can't swallow a
 *      real short string like a "-" placeholder for missing data.
 *
 * Everything else is reported as a real violation. This was cross-checked
 * by hand against every current match in the repo (icon-only buttons,
 * checkboxes, decorative bullets, nav links, pricing badges) and the
 * classification matched manual judgment in each case, so violations here
 * are reported at normal (error) severity, not downgraded to warnings.
 */
/** Curated set of glyphs used purely as decoration (list bullets, blinking
 *  cursors) rather than readable text — see exemption rule 5 above. */
const DECORATIVE_GLYPH_RE = /^[•◦●○▪▸►·|]+$/;
const themeAwareTextColor: Invariant = {
  id: 'theme-aware-text-color',
  title: 'No text-primary-500/600 on an element that renders text (excludes icons)',
  why:
    'text-primary-500 and text-primary-600 are fixed Tailwind hexes that do ' +
    'not flip with .dark — they measured 2.33:1 against dark surface, an AA ' +
    'failure. --color-brand (globals.css) is the token that IS solved for ' +
    'both themes; icons tinted via currentColor are unaffected by this and ' +
    'stay on the raw Tailwind scale intentionally.',
  async check(): Promise<Violation[]> {
    const violations: Violation[] = [];
    const files = listFiles(['app', 'components'], ['.tsx'], true);
    const re = /\btext-primary-(500|600)\b/g;
    const iconRe = /icon/i;
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const rel = toRel(file);
      const lucideNames = lucideImportNames(content);
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        const idx = m.index;
        const tag = findEnclosingTag(content, idx);
        if (!tag) {
          // No enclosing JSX tag found (e.g. a plain .ts constant) — can't
          // apply the icon heuristic at all; report defensively but at
          // warning severity since we have no tag context to judge by.
          violations.push({
            file: rel,
            line: lineAt(content, idx),
            text: lineTextAt(content, idx),
            severity: 'warning',
          });
          continue;
        }
        const zoneA = content.slice(tag.start, tag.tagEnd + 1);
        const exemptA =
          /<svg\b/i.test(zoneA) || iconRe.test(zoneA) || tag.name === 'input' || lucideNames.has(tag.name);
        if (exemptA) continue;

        const zoneB = childrenText(content, tag);
        const childTagRe = /<([A-Za-z][\w.]*)/g;
        let exemptB = /<svg\b/i.test(zoneB);
        if (!exemptB) {
          let cm: RegExpExecArray | null;
          while ((cm = childTagRe.exec(zoneB))) {
            if (iconRe.test(cm[1]) || lucideNames.has(cm[1])) {
              exemptB = true;
              break;
            }
          }
        }
        if (!exemptB) {
          // Decorative-glyph exemption (rule 5, see comment above).
          const bareText = zoneB.replace(/<[^>]*>/g, '').trim();
          if (bareText.length > 0 && bareText.length <= 3 && DECORATIVE_GLYPH_RE.test(bareText)) {
            exemptB = true;
          }
        }
        if (exemptB) continue;

        violations.push({ file: rel, line: lineAt(content, idx), text: lineTextAt(content, idx) });
      }
    }
    return violations;
  },
};

// ---------------------------------------------------------------------------
// Invariant 7: rtl-logical-properties
// ---------------------------------------------------------------------------

const rtlLogicalProperties: Invariant = {
  id: 'rtl-logical-properties',
  title: 'No physical-direction utility classes (pl-/pr-/ml-/mr-/text-left/text-right/border-l-/border-r-/rounded-l-/rounded-r-)',
  why:
    "PyraSuite is Arabic-first and RTL by default. Physical-direction " +
    "utilities don't mirror when the page flips to RTL — pl-4 stays on the " +
    "left even when 'left' is now the trailing edge. Logical properties " +
    "(ps-/pe-/ms-/me-/text-start/text-end/rounded-s-/rounded-e-, and the " +
    "'start'/'end' CSS logical values) flip automatically with dir.",
  async check(): Promise<Violation[]> {
    const violations: Violation[] = [];
    const files = listFiles(['app', 'components'], ['.ts', '.tsx'], true);
    // Each pattern captures the *whole* class token (all variant prefixes)
    // via a preceding-boundary lookbehind, so we can tell whether the
    // token's own variant chain includes "rtl:" or "ltr:" (see below).
    const patterns: RegExp[] = [
      /(?<![\w-])pl-(?:\d|\[)/g,
      /(?<![\w-])pr-(?:\d|\[)/g,
      /(?<![\w-])ml-(?:\d|\[)/g,
      /(?<![\w-])mr-(?:\d|\[)/g,
      /(?<![\w-])text-left\b/g,
      /(?<![\w-])text-right\b/g,
      /(?<![\w-])border-[lr](?:-|\b)/g,
      /(?<![\w-])rounded-[lr](?:-|\b)/g,
    ];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const rel = toRel(file);
      for (const re of patterns) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content))) {
          const idx = m.index;
          // Recover the full class token (including variant prefixes) by
          // walking back to the previous whitespace/quote boundary, so
          // `rtl:placeholder-shown:text-right` is judged as a whole token,
          // not just its `text-right` tail. A class explicitly gated behind
          // the `rtl:` (or `ltr:`) variant IS direction-aware by
          // construction — it is deliberately mirroring, by hand, rather
          // than via a logical-property utility, which is exactly what the
          // login/signup placeholder-alignment inputs do — so it is exempt.
          // components/ui/dialog.tsx's `left-[50%] translate-x-[-50%]` is
          // unaffected either way: "left-[50%]" and "translate-x-[-50%]"
          // don't match any of the patterns above (none of them are
          // "left-" or "translate-x-"), so no allowlist entry is needed.
          let tokenStart = idx;
          while (tokenStart > 0 && !/[\s"'`]/.test(content[tokenStart - 1])) tokenStart--;
          const token = content.slice(tokenStart, idx);
          const variants = token.split(':').slice(0, -1);
          if (variants.includes('rtl') || variants.includes('ltr')) continue;
          violations.push({ file: rel, line: lineAt(content, idx), text: lineTextAt(content, idx) });
        }
      }
    }
    return violations;
  },
};

// ---------------------------------------------------------------------------
// Invariant 8: mobile-16px-inputs
// ---------------------------------------------------------------------------

// <input> types exempt from the 16px-zoom rule: none of these ever show a
// text caret + software keyboard, which is specifically what triggers iOS
// Safari's auto-zoom-on-focus behavior.
//   - "file"     opens the native file picker/camera sheet — no text field.
//   - "checkbox"/"radio" render a fixed-size native check/dot control — the
//     user taps it, never types into it.
//   - "range" renders a native slider thumb — dragged, not typed into.
// A font-size class on any of these themes a label/marker element, not an
// editable text field, so it cannot cause the zoom this rule guards against.
const ZOOM_EXEMPT_INPUT_TYPES = new Set(['file', 'checkbox', 'radio', 'range']);

const mobile16pxInputs: Invariant = {
  id: 'mobile-16px-inputs',
  title: 'No <input>/<textarea>/<select> carrying a bare text-sm or text-xs',
  why:
    'iOS Safari auto-zooms the viewport when a focused form field computes ' +
    'to under 16px font-size. A bare (unprefixed) text-sm/text-xs on a form ' +
    'field IS its mobile font-size (mobile-first, no breakpoint override), ' +
    'so it always triggers the zoom. The fix pattern is mobile-first ' +
    '"text-base sm:text-sm" — 16px on mobile, smaller only at sm+ where iOS ' +
    "zoom doesn't apply — which never has a *bare* text-sm/text-xs token, " +
    'only breakpoint-prefixed ones. EXCEPTION: <input type="file"/' +
    '"checkbox"/"radio"/"range"> never shows a text caret or software ' +
    "keyboard on focus, so iOS's zoom-on-focus behavior does not apply to " +
    'them regardless of font-size — see ZOOM_EXEMPT_INPUT_TYPES above.',
  async check(): Promise<Violation[]> {
    const violations: Violation[] = [];
    const files = listFiles(['app', 'components'], ['.tsx'], true);
    // Elements often span multiple lines (attributes on their own lines);
    // scanTagEnd is index-based over the whole file content, not per-line,
    // so multi-line tags are handled naturally.
    const tagRe = /<(input|textarea|select)\b/g;
    const bareSizeRe = /(?<![\w:-])text-(sm|xs)\b/;
    const typeAttrRe = /\btype\s*=\s*["']([\w-]+)["']/;
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const rel = toRel(file);
      tagRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = tagRe.exec(content))) {
        const tagEnd = scanTagEnd(content, m.index);
        const tagText = content.slice(m.index, tagEnd + 1);
        if (m[1] === 'input') {
          const typeMatch = typeAttrRe.exec(tagText);
          if (typeMatch && ZOOM_EXEMPT_INPUT_TYPES.has(typeMatch[1])) continue;
        }
        const sizeMatch = bareSizeRe.exec(tagText);
        if (sizeMatch) {
          const absIdx = m.index + sizeMatch.index;
          violations.push({ file: rel, line: lineAt(content, absIdx), text: lineTextAt(content, absIdx) });
        }
      }
    }
    return violations;
  },
};

// ---------------------------------------------------------------------------
// Invariant 9: no-vh-dialog-override
// ---------------------------------------------------------------------------

const noVhDialogOverride: Invariant = {
  id: 'no-vh-dialog-override',
  title: 'No max-h-[<n>vh] anywhere in app/ or components/',
  why:
    "'vh' resolves against the LARGE viewport on mobile Safari (the address " +
    "bar collapsed, maximum-height reading), not the actual visible area. " +
    "DialogContent's base class already uses max-h-[85dvh] (the dynamic " +
    "viewport unit, which tracks the real visible height); a local `vh` " +
    "override on a specific dialog wins through twMerge's specificity " +
    "resolution and reintroduces the overflow-behind-the-address-bar bug " +
    "that dvh was adopted to fix.",
  async check(): Promise<Violation[]> {
    const violations: Violation[] = [];
    // No admin exclusion — this is a device/viewport correctness bug, not a
    // branding/RTL rule, so it applies everywhere including admin.
    const files = listFiles(['app', 'components'], ['.ts', '.tsx', '.css'], false);
    const re = /max-h-\[\s*\d+(?:\.\d+)?vh\s*\]/g;
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const rel = toRel(file);
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        violations.push({ file: rel, line: lineAt(content, m.index), text: lineTextAt(content, m.index) });
      }
    }
    return violations;
  },
};

// ---------------------------------------------------------------------------
// Invariant 10: no-arabic-literals-in-tsx
// ---------------------------------------------------------------------------

/*
 * Comment-stripping approach and its limits, documented per the task brief:
 *
 * A single-pass state machine walks the raw source tracking: single-line
 * `//...` comments, block `/* ... *\/` comments, and string/template literal
 * state (so `//` or `/*` inside a string — e.g. a URL — is not mistaken for
 * a comment start). This is NOT a full TS/TSX tokenizer: it does not
 * understand regex literals (a `/pattern/` containing "//" could in theory
 * confuse it) and treats backtick template literals as opaque spans without
 * parsing `${...}` interpolation. Neither pattern occurs in this codebase's
 * .tsx files (regex literals and interpolation-heavy JSX text are both
 * rare/absent here), so in practice this correctly strips both comment
 * styles including the layout.tsx `// Was "..."` example found during
 * development. Given that residual risk, any match that survives stripping
 * is reported at normal (error) severity — these were spot-checked by hand
 * (terms/privacy pages, community/portfolio/team pages, several shared
 * components) and are genuine hardcoded Arabic UI strings, not artifacts of
 * an imperfect strip.
 */
function stripComments(content: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < content.length) {
    const c = content[i];
    const c2 = content[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += c2 ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      i++;
      continue;
    }
    if (c === '/' && c2 === '/') {
      // single-line comment: skip to end of line, keep the newline itself
      // so line numbers in `out` stay aligned with the original file.
      while (i < content.length && content[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) {
        out += content[i] === '\n' ? '\n' : ' ';
        i++;
      }
      i += 2; // consume closing */
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const noArabicLiteralsInTsx: Invariant = {
  id: 'no-arabic-literals-in-tsx',
  title: 'No Arabic characters (U+0600-U+06FF) in .tsx source outside comments',
  why:
    'A hardcoded Arabic string renders unconditionally regardless of the ' +
    "active locale — it shows up on the English site (or breaks a future " +
    'third locale) and cannot be updated by a translator without a code ' +
    'change. Arabic copy belongs in messages/*.json, resolved via next-intl.',
  async check(): Promise<Violation[]> {
    const violations: Violation[] = [];
    const files = listFiles(['app', 'components'], ['.tsx'], true);
    const arabicRe = /[؀-ۿ]/;
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const rel = toRel(file);
      const stripped = stripComments(content);
      // Walk stripped content line-by-line so line numbers are exact and we
      // report the ORIGINAL line's text (not the space-blanked version).
      const strippedLines = stripped.split('\n');
      const originalLines = content.split('\n');
      for (let ln = 0; ln < strippedLines.length; ln++) {
        if (arabicRe.test(strippedLines[ln])) {
          violations.push({ file: rel, line: ln + 1, text: originalLines[ln].trim() });
        }
      }
    }
    return violations;
  },
};

// ---------------------------------------------------------------------------
// Invariant 11: contrast-tokens
// ---------------------------------------------------------------------------

const TEXT_TIER_VARS = [
  'color-text-primary',
  'color-text-secondary',
  'color-text-muted',
  'color-success',
  'color-warning',
  'color-error',
  'color-link',
  'color-brand',
];
const BACKGROUND_VARS = ['color-surface', 'color-bg', 'color-surface-2'];
const AA_MIN_CONTRAST = 4.5;

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const num = parseInt(h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** WCAG relative luminance, real sRGB gamma-correction math (no approximation). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const chan = (c: number): number => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastRatio(hexA: string, hexB: string): number | null {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) return null;
  const lA = relativeLuminance(rgbA);
  const lB = relativeLuminance(rgbB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Extracts the `{ ... }` body of the first top-level rule whose selector
 *  text is exactly `selector` (matched with a following '{', so ':root' and
 *  '.dark' aren't confused with mentions of the same text inside comments —
 *  a comment mention isn't immediately followed by '{'). */
function extractCssBlock(content: string, selector: string): { body: string; bodyStart: number } | null {
  const selRe = new RegExp(`${escapeRegExp(selector)}\\s*\\{`);
  const m = selRe.exec(content);
  if (!m) return null;
  const braceStart = m.index + m[0].length - 1;
  let depth = 1;
  let i = braceStart + 1;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  return { body: content.slice(braceStart + 1, i - 1), bodyStart: braceStart + 1 };
}

function parseCssVars(content: string, block: { body: string; bodyStart: number }): Map<string, { value: string; line: number }> {
  const vars = new Map<string, { value: string; line: number }>();
  const re = /--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block.body))) {
    const absIdx = block.bodyStart + m.index;
    vars.set(m[1], { value: m[2], line: lineAt(content, absIdx) });
  }
  return vars;
}

const contrastTokens: Invariant = {
  id: 'contrast-tokens',
  title: 'Every text-tier token meets WCAG AA (4.5:1) against every surface, in both themes',
  why:
    'This is the single check that would have caught the original defect: ' +
    'dark-mode --color-text-secondary and --color-text-muted were the same ' +
    'hex, so the two-tier hierarchy did not exist, and both measured 4.04:1 ' +
    'against dark surface-2 — an AA failure that a quick visual check in ' +
    'the default theme (light) never surfaces. Real sRGB relative-luminance ' +
    'math, not an approximation, because eyeballing hex codes is exactly ' +
    'how the original defect passed review.',
  async check(): Promise<Violation[]> {
    const violations: Violation[] = [];
    const cssPath = join(ROOT, 'app', 'globals.css');
    const content = readFileSync(cssPath, 'utf8');
    const rel = toRel(cssPath);

    const themes: { name: string; selector: string }[] = [
      { name: ':root', selector: ':root' },
      { name: '.dark', selector: '.dark' },
    ];

    for (const theme of themes) {
      const block = extractCssBlock(content, theme.selector);
      if (!block) {
        violations.push({ file: rel, line: 1, text: `Could not find "${theme.selector} { ... }" block` });
        continue;
      }
      const vars = parseCssVars(content, block);

      for (const tierVar of TEXT_TIER_VARS) {
        const tier = vars.get(tierVar);
        if (!tier) continue; // token not (re)defined in this theme block — nothing to check here
        for (const bgVar of BACKGROUND_VARS) {
          const bg = vars.get(bgVar);
          if (!bg) continue;
          const ratio = contrastRatio(tier.value, bg.value);
          if (ratio === null) {
            violations.push({
              file: rel,
              line: tier.line,
              text: `Could not parse color for --${tierVar} (${tier.value}) or --${bgVar} (${bg.value})`,
            });
            continue;
          }
          if (ratio < AA_MIN_CONTRAST) {
            violations.push({
              file: rel,
              line: tier.line,
              text: `[${theme.name}] --${tierVar} (${tier.value}) vs --${bgVar} (${bg.value}) = ${ratio.toFixed(2)}:1 (needs >= ${AA_MIN_CONTRAST}:1)`,
            });
          }
        }
      }
    }
    return violations;
  },
};

// ---------------------------------------------------------------------------
// Baseline (pre-existing debt) mechanism
// ---------------------------------------------------------------------------

/*
 * WHAT THE BASELINE IS FOR, AND WHAT IT IS NOT FOR:
 *
 * `no-arabic-literals-in-tsx` has 130 genuine, pre-existing violations —
 * entire un-localized pages (terms/, privacy/) and components that never
 * got i18n applied. That is real, tracked debt (a separate localization
 * project), not something this task fixes. But a checker that is
 * permanently red gets ignored — the next genuinely NEW violation lands in
 * a wall of 130 pre-existing ones and nobody notices it. The baseline file
 * (scripts/invariants-baseline.json) exists to solve exactly that: it
 * freezes the CURRENT set of accepted violations so the checker can
 * distinguish "still there from before" (reported, not failing) from
 * "new since the baseline was written" (always fails).
 *
 * It must NEVER be used to silence a new violation in ANY rule — baselining
 * is for pre-existing debt only. This is enforced structurally, not just by
 * convention: BASELINE_ELIGIBLE_IDS is the only invariant id allowed to
 * consult the file at all. Even if someone manually added a
 * "refund-captured::..." key to invariants-baseline.json, it would be
 * ignored — every other invariant's violations always fail the run,
 * unconditionally, exactly as before this mechanism existed.
 *
 * KEY DESIGN — why "${invariantId}::${file}::${text}" and not "file:line":
 *
 * A line-number key is brittle: adding a single line anywhere ABOVE a
 * baselined violation shifts every line number below it, so the same
 * unfixed violation would appear to be "a new one" (line moved) while an
 * actually-fixed one could coincidentally match a stale line number and
 * hide a real regression. Editing terms/page.tsx to add one sentence near
 * the top would otherwise invalidate the entire rest of the baseline for
 * that file. The offending TEXT (the trimmed source line, already what the
 * script prints) does not move when unrelated lines shift, so it survives
 * routine edits elsewhere in the file. It only goes stale when the
 * violating line ITSELF is edited or removed — which is precisely the
 * "this entry needs attention" signal we want (see staleness reporting
 * below): either it was fixed (remove it) or it was reformatted (regenerate
 * with --update-baseline). Prefixing with the invariant id keeps the key
 * self-describing in a flat, single-array JSON file (greppable on its own,
 * no dependency on which top-level object key it lives under) and leaves
 * room for another invariant to use the same mechanism later without a
 * structural change. Confirmed by hand: all 130 current violations produce
 * distinct (file, text) pairs, so this key has no collisions today.
 */

interface BaselineFile {
  version: number;
  entries: string[];
}

const BASELINE_PATH = join(ROOT, 'scripts', 'invariants-baseline.json');

/** The ONLY invariant id(s) allowed to consult the baseline. Deliberately a
 *  fixed allowlist rather than "any invariant with entries in the file" —
 *  see the long comment above. */
const BASELINE_ELIGIBLE_IDS = new Set<string>(['no-arabic-literals-in-tsx']);

function violationKey(invariantId: string, v: Violation): string {
  return `${invariantId}::${v.file}::${v.text}`;
}

function loadBaseline(): Set<string> {
  if (!existsSync(BASELINE_PATH)) return new Set();
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as BaselineFile;
    return new Set(parsed.entries ?? []);
  } catch (err) {
    console.error(`Could not parse ${toRel(BASELINE_PATH)}: ${(err as Error).message}`);
    process.exit(2);
  }
}

function writeBaselineFile(entries: string[]): void {
  const data: BaselineFile = { version: 1, entries: [...entries].sort((a, b) => a.localeCompare(b)) };
  writeFileSync(BASELINE_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const INVARIANTS: Invariant[] = [
  msgParity,
  msgNoEmpty,
  refundCaptured,
  noHardcodedDateLocale,
  noRawZindex,
  themeAwareTextColor,
  rtlLogicalProperties,
  mobile16pxInputs,
  noVhDialogOverride,
  noArabicLiteralsInTsx,
  contrastTokens,
];

function parseArgList(flag: string): Set<string> | null {
  const arg = process.argv.find((a) => a.startsWith(flag));
  if (!arg) return null;
  const value = arg.slice(flag.length);
  return new Set(value.split(',').map((s) => s.trim()).filter(Boolean));
}

/** `--update-baseline` mode: regenerate scripts/invariants-baseline.json
 *  from the CURRENT violations of the baseline-eligible invariant(s) only.
 *  This is a full snapshot rewrite (like `jest --updateSnapshot`), not a
 *  merge — anything fixed since the last snapshot is dropped automatically,
 *  anything new is captured, and the printed diff makes both visible.
 *  Deliberately does not touch or report on any other invariant: this mode
 *  exists solely to refresh accepted pre-existing debt. */
async function runUpdateBaseline(): Promise<void> {
  const oldEntries = loadBaseline();
  const newEntries = new Set<string>();

  for (const invariant of INVARIANTS) {
    if (!BASELINE_ELIGIBLE_IDS.has(invariant.id)) continue;
    const violations = await invariant.check();
    const errors = violations.filter((v) => (v.severity ?? 'error') === 'error');
    for (const v of errors) newEntries.add(violationKey(invariant.id, v));
  }

  writeBaselineFile([...newEntries]);

  const added = [...newEntries].filter((k) => !oldEntries.has(k));
  const removed = [...oldEntries].filter((k) => !newEntries.has(k));

  console.log(`Wrote ${toRel(BASELINE_PATH)}: ${newEntries.size} entries.`);
  if (added.length > 0) {
    console.log(`  + ${added.length} added:`);
    for (const k of added) console.log(`    ${k}`);
  }
  if (removed.length > 0) {
    console.log(`  - ${removed.length} removed (no longer occurring):`);
    for (const k of removed) console.log(`    ${k}`);
  }
  if (added.length === 0 && removed.length === 0) {
    console.log('  (no change from the previous baseline)');
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--update-baseline')) {
    await runUpdateBaseline();
    process.exit(0);
  }

  const only = parseArgList('--only=');
  const skip = parseArgList('--skip=');

  const knownIds = new Set(INVARIANTS.map((i) => i.id));
  for (const set of [only, skip]) {
    if (!set) continue;
    for (const id of set) {
      if (!knownIds.has(id)) {
        console.error(`Unknown invariant id: "${id}"`);
        console.error(`Known ids: ${[...knownIds].join(', ')}`);
        process.exit(2);
      }
    }
  }

  const baseline = loadBaseline();

  console.log('PyraSuite invariant check');
  console.log('='.repeat(60));

  let errorCount = 0; // NEW violations only — these fail the run
  let warningCount = 0;
  let knownDebtCount = 0; // baselined violations — reported, do not fail
  let staleBaselineCount = 0; // baseline entries that no longer occur
  let ranCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const invariant of INVARIANTS) {
    const isSkipped = (only && !only.has(invariant.id)) || (skip && skip.has(invariant.id));
    if (isSkipped) {
      console.log(`\n[SKIP] ${invariant.id} - ${invariant.title}`);
      skippedCount++;
      continue;
    }

    ranCount++;
    console.log(`\n[${invariant.id}] ${invariant.title}`);
    const violations = await invariant.check();
    const allErrors = violations.filter((v) => (v.severity ?? 'error') === 'error');
    const warnings = violations.filter((v) => v.severity === 'warning');

    const eligible = BASELINE_ELIGIBLE_IDS.has(invariant.id);
    const currentKeys = new Set(allErrors.map((v) => violationKey(invariant.id, v)));
    const newErrors = eligible ? allErrors.filter((v) => !baseline.has(violationKey(invariant.id, v))) : allErrors;
    const knownDebt = eligible ? allErrors.filter((v) => baseline.has(violationKey(invariant.id, v))) : [];
    const prefix = `${invariant.id}::`;
    const staleBaseline = eligible
      ? [...baseline].filter((k) => k.startsWith(prefix) && !currentKeys.has(k))
      : [];

    if (newErrors.length === 0 && warnings.length === 0 && knownDebt.length === 0 && staleBaseline.length === 0) {
      console.log('  PASS');
    } else {
      if (newErrors.length > 0) {
        failedCount++;
        console.log(`  FAIL (${newErrors.length} NEW violation${newErrors.length === 1 ? '' : 's'}, not in baseline)`);
        for (const v of newErrors) {
          console.log(`    ${v.file}:${v.line}: ${v.text}`);
        }
      } else {
        console.log(eligible ? '  PASS (0 new violations)' : '  PASS');
      }
      if (knownDebt.length > 0) {
        console.log(`  KNOWN DEBT (${knownDebt.length} baselined, pre-existing — not failing the build)`);
        for (const v of knownDebt) {
          console.log(`    ${v.file}:${v.line}: ${v.text}`);
        }
      }
      if (staleBaseline.length > 0) {
        console.log(`  STALE BASELINE (${staleBaseline.length}) — no longer occurring; fixed, remove via --update-baseline`);
        for (const k of staleBaseline) {
          console.log(`    ${k}`);
        }
      }
      if (warnings.length > 0) {
        console.log(`  WARN (${warnings.length} heuristic-uncertain match${warnings.length === 1 ? '' : 'es'}, not failing the build)`);
        for (const v of warnings) {
          console.log(`    ${v.file}:${v.line}: ${v.text}`);
        }
      }
    }
    errorCount += newErrors.length;
    warningCount += warnings.length;
    knownDebtCount += knownDebt.length;
    staleBaselineCount += staleBaseline.length;
  }

  console.log('\n' + '='.repeat(60));
  console.log(
    `Summary: ${ranCount} run, ${ranCount - failedCount} passed, ${failedCount} failed, ${skippedCount} skipped, ` +
      `${errorCount} new violations, ${knownDebtCount} known-debt (baselined), ${staleBaselineCount} stale baseline entries, ${warningCount} total warnings`
  );

  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('check-invariants crashed:', err);
  process.exit(2);
});
