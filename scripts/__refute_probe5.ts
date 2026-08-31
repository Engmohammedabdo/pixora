import { readdirSync, statSync } from 'fs';
import { join } from 'path';
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}
console.log(walk('lib/ai/prompts'));
