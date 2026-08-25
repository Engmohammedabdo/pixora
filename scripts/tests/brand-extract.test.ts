/**
 * Proof that POST /api/brand-kits/extract's error codes all have somewhere to
 * land, that the route's own SOURCE never returns a code the catalog does not
 * know about, and that the "either env var missing -> refuse immediately"
 * rule actually refuses.
 *
 *   npx tsx scripts/tests/brand-extract.test.ts
 *
 * `studio-error-codes` (scripts/check-invariants.ts:1110-1124) only scans
 * app/api/studios/**\/route.ts, so this route's codes get NO automatic check
 * that a message exists in both locales, or that the route never returns a
 * code the catalog does not list — that gap is the whole reason this file
 * exists. Pure: no network, no database. The env-var check is exercised
 * against the real getN8nBrandDnaConfig() the route itself calls, not a
 * re-implementation of its logic — a re-implementation would pass even if the
 * route's own function regressed.
 *
 * ── F1: the route is READ, not assumed ──────────────────────────────────────
 * lib/brand-kits/extract-errors.ts used to claim "a code added to the route
 * with no matching entry here fails typecheck" — false: the route builds its
 * response with a plain object literal, nothing ties it to the
 * `BrandExtractErrorCode` union. Section 2 below regexes the route's actual
 * source for every `error: '...'` literal — the same pattern
 * `studio-error-codes` uses over the studio routes — and asserts exact set
 * equality against `BRAND_EXTRACT_ERROR_CODES`. Proved by adding
 * `error: 'extract_blocked'` to the route: this section fails where it did
 * not before; reverting the addition makes it pass again.
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

/** Resolves a dotted key ('extract.unauthorized') against a nested message
 *  object, the same shape lib/studio-errors.ts:47 resolves at runtime. */
function getMessage(root: unknown, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part];
    return undefined;
  }, root);
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
  const inAr = getMessage(ar?.brandKit, key);
  const inEn = getMessage(en?.brandKit, key);
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
// 2. The ROUTE'S OWN SOURCE (F1) never returns a code the catalog does not
//    list, and the catalog never lists a code the route's source no longer
//    returns — both directions, same reasoning as section 3 below applied one
//    layer earlier. This is the check the false comment in
//    lib/brand-kits/extract-errors.ts claimed TypeScript already provided.
// ---------------------------------------------------------------------------

const routeSource = readFileSync(
  join(ROOT, 'app', 'api', 'brand-kits', 'extract', 'route.ts'),
  'utf8'
);
const ROUTE_ERROR_PATTERN = /success:\s*false,\s*error:\s*'([^']+)'/g;

const routeErrorCodes = new Set<string>();
{
  let m: RegExpExecArray | null;
  ROUTE_ERROR_PATTERN.lastIndex = 0;
  while ((m = ROUTE_ERROR_PATTERN.exec(routeSource))) {
    routeErrorCodes.add(m[1]);
  }
}
const catalogCodes = new Set<string>(BRAND_EXTRACT_ERROR_CODES);

for (const code of routeErrorCodes) {
  checks++;
  if (!catalogCodes.has(code)) {
    failures++;
    console.log(
      `FAIL  app/api/brand-kits/extract/route.ts returns error: '${code}', which is not in BRAND_EXTRACT_ERROR_CODES`
    );
  }
}
for (const code of catalogCodes) {
  checks++;
  if (!routeErrorCodes.has(code)) {
    failures++;
    console.log(
      `FAIL  BRAND_EXTRACT_ERROR_CODES has '${code}', which the route's source never returns`
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Exact set membership, both directions — an added code with no copy must
//    fail, AND a leftover message key for a code the route no longer returns
//    must fail too (a minimum check would miss the second).
// ---------------------------------------------------------------------------

check(
  'BRAND_EXTRACT_ERROR_CODES and BRAND_EXTRACT_ERROR_MESSAGE_KEYS agree exactly on which codes exist',
  JSON.stringify([...BRAND_EXTRACT_ERROR_CODES].sort()),
  JSON.stringify(Object.keys(BRAND_EXTRACT_ERROR_MESSAGE_KEYS).sort())
);

// F4: "which messages.json keys belong to this catalog" used to be inferred
// from a NAMING CONVENTION (`/^extract[A-Z]/`) over the whole `brandKit`
// namespace — and that already needed casing luck to skip the unrelated
// `brandKit.extractionMissing` (a missing-field badge label). Nesting this
// catalog's keys under `brandKit.extract` (see
// BRAND_EXTRACT_ERROR_MESSAGE_KEYS's own comment) makes ownership
// STRUCTURAL: every key under that object belongs to this catalog by
// construction, so this enumerates it directly instead of guessing from
// casing — a sibling like `brandKit.extractionMissing`, or a future
// `brandKit.extractHelpText`, is never even visited.
const expectedKeys = new Set(Object.values(BRAND_EXTRACT_ERROR_MESSAGE_KEYS));

for (const [locale, messages] of [
  ['ar', ar],
  ['en', en],
] as const) {
  const extractNamespace = (messages?.brandKit?.extract ?? {}) as Record<string, unknown>;
  for (const subKey of Object.keys(extractNamespace)) {
    const dottedKey = `extract.${subKey}`;
    checks++;
    if (!expectedKeys.has(dottedKey)) {
      failures++;
      console.log(
        `FAIL  messages/${locale}.json has brandKit.${dottedKey}, which no code in BRAND_EXTRACT_ERROR_CODES maps to (stale key, or the catalog is out of date)`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 4. extract_unavailable is returned when either env var is absent — proved
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
