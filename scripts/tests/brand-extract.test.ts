/**
 * Proof that POST /api/brand-kits/extract's error codes all have somewhere to
 * land, and that the "either env var missing -> refuse immediately" rule
 * actually refuses.
 *
 *   npx tsx scripts/tests/brand-extract.test.ts
 *
 * `studio-error-codes` (scripts/check-invariants.ts:1110-1124) only scans
 * app/api/studios/**\/route.ts, so this route's codes get NO automatic check
 * that a message exists in both locales — that gap is the whole reason this
 * file exists. Pure: no network, no database. The env-var check is exercised
 * against the real getN8nBrandDnaConfig() the route itself calls, not a
 * re-implementation of its logic — a re-implementation would pass even if the
 * route's own function regressed.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BRAND_EXTRACT_ERROR_CODES,
  BRAND_EXTRACT_ERROR_MESSAGE_KEYS,
} from '../../lib/brand-kits/extract-errors';
import { getN8nBrandDnaConfig } from '../../lib/brand-kits/extract-config';

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  checks++;
  if (actual !== expected) {
    failures++;
    console.log(`FAIL  ${label}\n        expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Every code in the catalog has a message in BOTH locales.
// ---------------------------------------------------------------------------

const ROOT = join(__dirname, '..', '..');
const ar = JSON.parse(readFileSync(join(ROOT, 'messages', 'ar.json'), 'utf8'));
const en = JSON.parse(readFileSync(join(ROOT, 'messages', 'en.json'), 'utf8'));

for (const code of BRAND_EXTRACT_ERROR_CODES) {
  const key = BRAND_EXTRACT_ERROR_MESSAGE_KEYS[code];
  checks++;
  if (!key) {
    failures++;
    console.log(`FAIL  ${code} has no entry in BRAND_EXTRACT_ERROR_MESSAGE_KEYS`);
    continue;
  }
  const inAr = ar?.brandKit?.[key];
  const inEn = en?.brandKit?.[key];
  if (typeof inAr !== 'string' || inAr.length === 0) {
    failures++;
    console.log(`FAIL  brandKit.${key} (code "${code}") is missing from messages/ar.json`);
  }
  if (typeof inEn !== 'string' || inEn.length === 0) {
    failures++;
    console.log(`FAIL  brandKit.${key} (code "${code}") is missing from messages/en.json`);
  }
}

// ---------------------------------------------------------------------------
// 2. Exact set membership, both directions — an added code with no copy must
//    fail, AND a leftover message key for a code the route no longer returns
//    must fail too (a minimum check would miss the second).
// ---------------------------------------------------------------------------

check(
  'BRAND_EXTRACT_ERROR_CODES and BRAND_EXTRACT_ERROR_MESSAGE_KEYS agree exactly on which codes exist',
  JSON.stringify([...BRAND_EXTRACT_ERROR_CODES].sort()),
  JSON.stringify(Object.keys(BRAND_EXTRACT_ERROR_MESSAGE_KEYS).sort())
);

const expectedKeys = new Set(Object.values(BRAND_EXTRACT_ERROR_MESSAGE_KEYS));
const extractKeyPattern = /^extract[A-Z]/; // this catalog's naming convention

for (const [locale, messages] of [
  ['ar', ar],
  ['en', en],
] as const) {
  const presentExtractKeys = Object.keys(messages.brandKit ?? {}).filter((k) =>
    extractKeyPattern.test(k)
  );
  for (const k of presentExtractKeys) {
    checks++;
    if (!expectedKeys.has(k)) {
      failures++;
      console.log(
        `FAIL  messages/${locale}.json has brandKit.${k}, which no code in BRAND_EXTRACT_ERROR_CODES maps to (stale key, or the catalog is out of date)`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. extract_unavailable is returned when either env var is absent — proved
//    against the exact function the route calls, not a copy of its logic.
// ---------------------------------------------------------------------------

const ENV_URL = 'N8N_BRAND_DNA_WEBHOOK_URL';
const ENV_SECRET = 'N8N_BRAND_DNA_SECRET';
const savedUrl = process.env[ENV_URL];
const savedSecret = process.env[ENV_SECRET];

function setEnv(url: string | undefined, secret: string | undefined): void {
  if (url === undefined) delete process.env[ENV_URL];
  else process.env[ENV_URL] = url;
  if (secret === undefined) delete process.env[ENV_SECRET];
  else process.env[ENV_SECRET] = secret;
}

setEnv(undefined, undefined);
check('both vars absent -> null (extract_unavailable)', getN8nBrandDnaConfig(), null);

setEnv('https://n8n.pyramedia.info/webhook/pyra-brand-dna', undefined);
check('URL set, secret absent -> null (extract_unavailable)', getN8nBrandDnaConfig(), null);

setEnv(undefined, 'a-real-secret');
check('secret set, URL absent -> null (extract_unavailable)', getN8nBrandDnaConfig(), null);

setEnv('', '');
check('both vars present but empty string -> null (extract_unavailable)', getN8nBrandDnaConfig(), null);

setEnv('https://n8n.pyramedia.info/webhook/pyra-brand-dna', 'a-real-secret');
{
  const cfg = getN8nBrandDnaConfig();
  checks++;
  if (
    !cfg ||
    cfg.url !== 'https://n8n.pyramedia.info/webhook/pyra-brand-dna' ||
    cfg.secret !== 'a-real-secret'
  ) {
    failures++;
    console.log(
      `FAIL  both vars present -> a config carrying exactly those values, got ${JSON.stringify(cfg)}`
    );
  }
}

// Restore, so this file has no effect on anything run after it in the same
// process (e.g. `prebuild` chains many of these together).
setEnv(savedUrl, savedSecret);

if (failures > 0) {
  console.log(`\n[brand-extract] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[brand-extract] ${checks} checks passed`);
