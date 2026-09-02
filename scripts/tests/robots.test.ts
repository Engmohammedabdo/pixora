/**
 * Proof that ONE robots.txt ships — the one app/robots.ts writes.
 *
 *   npx tsx scripts/tests/robots.test.ts
 *
 * Measured 2026-09-01: production served public/robots.txt (140 B, static-file
 * headers) while app/robots.ts with 19 disallow rules had never been reachable —
 * Next serves a public/ file over a metadata route of the same name. The three
 * rules that DID ship matched no real URL (`/dashboard/` vs `/ar/dashboard/`).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import robots from '../../app/robots';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}

const ROOT = join(__dirname, '..', '..');
check('public/robots.txt does not exist (it shadows app/robots.ts)', !existsSync(join(ROOT, 'public', 'robots.txt')));

const out = robots();
const rules = Array.isArray(out.rules) ? out.rules : [out.rules];
const star = rules.find((r) => r.userAgent === '*');
check('a * group exists', Boolean(star));
const starDisallow = ([] as string[]).concat((star?.disallow as string[] | string) ?? []);
check('* disallows /admin/', starDisallow.includes('/admin/'), starDisallow.join(', '));
check('* disallows the localized dashboard by wildcard', starDisallow.includes('/*/dashboard/'));
check('* has at least 19 disallow rules', starDisallow.length >= 19, String(starDisallow.length));

const AI = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Bingbot', 'CCBot'];
const aiGroup = rules.find((r) => Array.isArray(r.userAgent) && r.userAgent.includes('GPTBot'));
check('an explicit AI-crawler group exists', Boolean(aiGroup));
for (const ua of AI) check(`AI group names ${ua}`, Array.isArray(aiGroup?.userAgent) && aiGroup!.userAgent.includes(ua));
check('AI group allows /', aiGroup?.allow === '/');
check('AI group carries the same disallows as *', JSON.stringify(aiGroup?.disallow) === JSON.stringify(star?.disallow));
check('sitemap declared', typeof out.sitemap === 'string' && out.sitemap.endsWith('/sitemap.xml'));

if (failures) { console.log(`\n[robots] ${failures} of ${checks} checks FAILED`); process.exit(1); }
console.log(`[robots] ${checks} checks passed`);
