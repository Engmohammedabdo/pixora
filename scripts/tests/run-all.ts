/**
 * Runs every prebuild gate and reports ALL failures, not the first.
 *
 *   npm run gates
 *
 * `prebuild` is one long && chain by design — the build must STOP at the first
 * failing gate. This runner is for humans and CI, where the useful answer is
 * every failure at once: it READS that chain out of package.json, so the two
 * can never list different gates and this file carries no gate list of its own.
 *
 * The chain length is deliberately NOT written down here. It was 31 links on
 * 2026-09-02 and every round of this repo adds to it, so a count in a comment
 * is exactly the shape of claim this repo keeps finding false in place.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
const chain = pkg.scripts.prebuild ?? '';
const names = chain.split('&&').map((s) => s.trim().replace(/^npm run /, '')).filter(Boolean);
if (names.length === 0) { console.error('run-all: prebuild chain is empty — nothing to run'); process.exit(1); }

function lastLine(stream: string | null): string {
  const lines = (stream ?? '').trim().split('\n');
  return (lines[lines.length - 1] ?? '').trim();
}

const failed: string[] = [];
const started = Date.now();
for (const name of names) {
  const t = Date.now();
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', name], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', shell: process.platform === 'win32' });
  const ok = r.status === 0;
  // A PASSING gate is summarised by its own last stdout line; a FAILING one is
  // summarised by whatever it said last, wherever it said it. Reading both
  // streams for the pass case is wrong and was measured: test:generation-terminal
  // logs two [generations] diagnostics to stderr AFTER printing
  // "[generation-terminal] 11 checks passed", so a concatenated tail labelled a
  // green gate "could not be marked failed after 3 attempts".
  const tail = lastLine(ok ? r.stdout : r.stdout + r.stderr);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(28)} ${String(Date.now() - t).padStart(6)} ms  ${tail}`);
  if (!ok) failed.push(name);
}
console.log(`\n${names.length - failed.length}/${names.length} gates passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
if (failed.length) { console.log(`FAILED: ${failed.join(', ')}`); process.exit(1); }
