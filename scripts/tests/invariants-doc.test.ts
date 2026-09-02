/** Every rule in check-invariants.ts has a `## <id>` section in docs/INVARIANTS.md. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = join(__dirname, '..', '..');
const ids = [...readFileSync(join(ROOT, 'scripts/check-invariants.ts'), 'utf8').matchAll(/^\s*id:\s*'([a-z0-9-]+)'/gm)].map((m) => m[1]);
const doc = readFileSync(join(ROOT, 'docs/INVARIANTS.md'), 'utf8');
const missing = ids.filter((id) => !new RegExp(`^##+\\s+\`?${id}\`?`, 'm').test(doc));
if (ids.length < 10) { console.log('[invariants-doc] FAIL: found fewer than 10 rule ids — the scan matched nothing'); process.exit(1); }
if (missing.length) { console.log(`[invariants-doc] ${missing.length} rule(s) undocumented: ${missing.join(', ')}`); process.exit(1); }
console.log(`[invariants-doc] ${ids.length} rules documented`);
