import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { stripComments } from './lib/strip-comments';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
const promptFiles = walk('lib/ai/prompts');
function defFile(name: string) {
  for (const f of promptFiles) {
    const src = stripComments(readFileSync(f, 'utf8'));
    if (new RegExp(`export\s+function\s+${name}\b`).test(src)) return { f, throws: /\bsanitizePrompt\s*\(/.test(src) };
  }
  return null;
}
for (const route of walk('app/api/studios').filter(f => f.endsWith('route.ts'))) {
  const content = stripComments(readFileSync(route, 'utf8'));
  const reserveIdx = content.indexOf('reserveCredits(');
  if (reserveIdx === -1) { console.log(`${route}  (no reserveCredits — skipped by the rule)`); continue; }
  const re = /\bbuild[A-Za-z0-9_]*Prompt\s*\(|\bbuildBrandContextBlock\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m.index <= reserveIdx) continue;
    const name = m[0].replace(/\s*\($/, '').trim();
    const d = defFile(name);
    console.log(`${route}: ${name} AFTER reserve -> ${d ? (d.throws ? 'FLAGGED (throws)' : `EXEMPT (no direct sanitizePrompt in ${d.f})`) : 'FLAGGED (unresolvable)'}`);
  }
}
