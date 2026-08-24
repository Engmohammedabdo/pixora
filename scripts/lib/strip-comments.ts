/**
 * Shared comment stripper.
 *
 * Lived inside scripts/check-invariants.ts until 2026-08-24. It moved here when
 * scripts/tests/root-document.test.ts needed it too: importing it from
 * check-invariants.ts runs that file, which is a SCRIPT, not a library — the whole
 * 15-invariant suite executed as an import side effect and its exit code fought
 * with the test's own.
 *
 * It is worth sharing rather than reimplementing. The naive alternative — blanking
 * from the first "//" to end of line with a regex — also blanks inside string
 * literals, so an <html> or an Arabic string sharing a line with a URL becomes
 * invisible and the gate certifies a tree in which the defect has returned.
 */
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
export function stripComments(content: string): string {
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
