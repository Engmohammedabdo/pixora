/**
 * Source-level proofs for three small API rules the 2026-09-01 audit rated high.
 *
 *   npx tsx scripts/tests/api-hygiene.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../lib/strip-comments';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}
const ROOT = join(__dirname, '..', '..');
const src = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

// upload: throttled BEFORE the body is read
const up = src('app/api/upload/route.ts');
const throttleAt = up.search(/consumeAttempt\(\s*`upload:/);
const bodyAt = up.indexOf('request.formData()');
check('upload throttles with consumeAttempt', throttleAt !== -1);
check('upload throttle runs before the body is read', throttleAt !== -1 && bodyAt !== -1 && throttleAt < bodyAt, `throttle@${throttleAt} body@${bodyAt}`);
check('upload returns 429 rate_limited', /rate_limited[\s\S]{0,80}429/.test(up));

// assets DELETE: ownership via the shared resolver, never an ad-hoc parse
const del = src('app/api/assets/[id]/route.ts');
check('assets DELETE uses ownedStoragePath', /ownedStoragePath\(/.test(del));
check('assets DELETE no longer splits the public-object marker by hand', !/split\('\/storage\/v1\/object\/public\/'\)/.test(del));

// gate-status: cached briefly
const gate = src('app/api/public/gate-status/route.ts');
check('gate-status sets a short shared cache', /s-maxage=30/.test(gate));

if (failures) { console.log(`\n[api-hygiene] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[api-hygiene] ${checks} checks passed`);
