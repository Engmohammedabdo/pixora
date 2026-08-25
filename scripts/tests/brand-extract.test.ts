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
import { UpstreamSuccessSchema } from '../../lib/brand-kits/extract-upstream';
import { ExtractInputSchema } from '../../lib/brand-kits/extract-input';
import { parseExtractDraft, expandMissingFields } from '../../lib/brand-kits/extract-draft';
import { INDUSTRIES } from '../../lib/industries';

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

// ---------------------------------------------------------------------------
// 5. What the upstream workflow returns is BOUNDED and, for `industry`,
//    CONSTRAINED — inside this repo, not by a claim about an unversioned n8n
//    workflow whose response shape has changed four times this session.
//
//    Review finding F4. Sequence A (over-long font names) produced the same
//    dead end as C1 on the branch's headline feature. Sequence B is worse
//    because it is SILENT: an unrecognised slug got no chip AND no
//    "we couldn't find this" badge, was stored, and was then omitted from
//    every studio prompt forever with no error anywhere.
// ---------------------------------------------------------------------------

const wpFontFamily = 'var(--wp--preset--font-family--system-font-that-goes-on-and-on-and-on)';

{
  const parsed = UpstreamSuccessSchema.safeParse({
    ok: true,
    draft: {
      name: 'x'.repeat(300),
      website_url: `https://example.com/${'a'.repeat(900)}`,
      industry: 'y'.repeat(200),
      description: 'd'.repeat(5000),
      target_audience: 't'.repeat(900),
      city: 'c'.repeat(400),
      brand_voice: 'v'.repeat(900),
      primary_color: '#123456789abc',
      secondary_color: null,
      accent_color: null,
      font_primary: wpFontFamily,
      font_secondary: wpFontFamily,
      // An unknown key must still pass — the object is `.loose()` on purpose.
      logo_url: 'https://example.com/logo.png',
    },
    missing: [],
  });

  checks++;
  if (!parsed.success) {
    failures++;
    console.log(
      `FAIL  an over-long upstream draft is TRUNCATED, not rejected — a crawl costs 25-60s and one of five per hour; issues: ${JSON.stringify(parsed.error.issues).slice(0, 300)}`
    );
  } else {
    const d = parsed.data.draft;
    const caps: [string, unknown, number][] = [
      ['name', d.name, 100],
      ['website_url', d.website_url, 500],
      ['industry', d.industry, 40],
      ['description', d.description, 2000],
      ['target_audience', d.target_audience, 500],
      ['city', d.city, 100],
      ['brand_voice', d.brand_voice, 500],
      ['primary_color', d.primary_color, 7],
      ['font_primary', d.font_primary, 50],
      ['font_secondary', d.font_secondary, 50],
    ];
    for (const [field, value, cap] of caps) {
      checks++;
      if (typeof value !== 'string' || value.length !== cap) {
        failures++;
        console.log(
          `FAIL  upstream draft.${field} is capped at ${cap}, got ${typeof value === 'string' ? value.length : typeof value}`
        );
      }
    }
    check('an unknown upstream key survives (.loose())', (d as Record<string, unknown>).logo_url, 'https://example.com/logo.png');
  }
}

// null and absent must both survive — the workflow emits null for anything the
// crawl could not determine, and truncating must not turn that into ''.
{
  const parsed = UpstreamSuccessSchema.safeParse({
    ok: true,
    draft: { name: 'Sham Shawarma', primary_color: null },
    missing: ['colors'],
  });
  checks++;
  if (!parsed.success) {
    failures++;
    console.log('FAIL  a draft of nulls and absent keys is accepted');
  } else {
    check('null survives the cap transform', parsed.data.draft.primary_color, null);
    check('an absent key stays absent', parsed.data.draft.city, undefined);
  }
}

// `industry`: only one of the seven slugs survives parseExtractDraft, and
// anything else is both blanked AND badged.
for (const slug of INDUSTRIES) {
  const draft = parseExtractDraft({ industry: slug });
  check(`parseExtractDraft keeps the recognised slug "${slug}"`, draft.industry, slug);
  checks++;
  if (expandMissingFields([], draft).includes('industry')) {
    failures++;
    console.log(`FAIL  "${slug}" is a real slug and must NOT be badged as missing`);
  }
}

for (const bogus of ['restaurants', 'Restaurant', 'مطاعم', 'car_rental', ' retail', '']) {
  const draft = parseExtractDraft({ industry: bogus });
  check(`parseExtractDraft blanks the unrecognised industry ${JSON.stringify(bogus)}`, draft.industry, '');
  checks++;
  if (!expandMissingFields([], draft).includes('industry')) {
    failures++;
    console.log(
      `FAIL  ${JSON.stringify(bogus)} is not a slug, renders no chip, and must be badged "we couldn't find this" — silence here is the whole defect`
    );
  }
}

// Colours: only `#RRGGBB`. Anything else is null, which makes the missing
// badge render — the truth — instead of seeding a picker with a value that
// then 400s on Save.
for (const good of ['#6366F1', '#abcdef', '#ABCDEF']) {
  check(`parseExtractDraft keeps the hex colour ${good}`, parseExtractDraft({ primary_color: good }).primary_color, good);
}
for (const bad of ['#FFF', 'rgb(255,0,0)', 'red', '6366F1', '#6366F1 ', '']) {
  check(
    `parseExtractDraft refuses the non-hex colour ${JSON.stringify(bad)}`,
    parseExtractDraft({ primary_color: bad }).primary_color,
    null
  );
}

// Fonts are text, not colours — the read used to go through `colorOrNull()`,
// which was behaviourally right and named something false.
check('parseExtractDraft keeps a font name', parseExtractDraft({ font_primary: 'Cairo' }).font_primary, 'Cairo');
check('parseExtractDraft nulls an empty font name', parseExtractDraft({ font_primary: '' }).font_primary, null);
check('parseExtractDraft nulls a non-string font', parseExtractDraft({ font_primary: 42 }).font_primary, null);

// ---------------------------------------------------------------------------
// 6. The URL this route FORWARDS carries a scheme rule (review finding F8).
//
//    n8n runs on the same Coolify VPS as this app, Supabase and the
//    mailserver, and `z.string().trim().min(4).max(500)` handed it anything.
//    The HOST is still the workflow's business — `http://169.254.169.254/…`
//    is deliberately accepted here — but a scheme the column could never
//    store is a crawl spent on something unsaveable.
// ---------------------------------------------------------------------------

function urlAccepted(url: string): boolean {
  return ExtractInputSchema.safeParse({ url }).success;
}

const URL_CASES: [string, boolean][] = [
  // Bare hosts: what WebsiteStep actually sends. These must keep working.
  ['example.com', true],
  ['www.example.com', true],
  ['example.com/menu', true],
  ['example.com:8080/menu', true],
  ['sub.example.co.uk/a?b=c#d', true],
  ['https://example.com', true],
  ['http://example.com', true],
  ['HTTPS://example.com', true],
  ['Http://example.com/x', true],
  // A host question, not a scheme question — n8n's Validate URL node owns it.
  ['http://169.254.169.254/latest/meta-data/', true],
  ['http://supabase-kong:8000/pg/query', true],
  // Schemes the column could never store, so forwarding them is pure loss.
  ['javascript:alert(1)', false],
  ['JavaScript:alert(1)', false],
  ['data:text/html,x', false],
  ['file:///etc/passwd', false],
  ['ftp://example.com', false],
  ['gopher://example.com', false],
  ['mailto:someone@example.com', false],
  // Whitespace anywhere.
  ['exa mple.com', false],
  ['https://example.com/foo bar', false],
  // Too short / empty.
  ['a.b', false],
  ['', false],
];

for (const [url, expected] of URL_CASES) {
  check(`ExtractInputSchema ${expected ? 'accepts' : 'refuses'} ${JSON.stringify(url)}`, urlAccepted(url), expected);
}

// Control characters, which JS `\s` does not cover, so `^\S+$` alone lets them
// through. Built by char code rather than written as literals — a test whose
// inputs are invisible in the diff proves nothing to a reviewer.
for (const code of [0x00, 0x09, 0x0a, 0x0d, 0x1f, 0x7f, 0x85]) {
  const url = `example.com/${String.fromCharCode(code)}x`;
  check(`ExtractInputSchema refuses a URL carrying U+${code.toString(16).padStart(4, '0').toUpperCase()}`, urlAccepted(url), false);
}

if (failures > 0) {
  console.log(`\n[brand-extract] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[brand-extract] ${checks} checks passed`);
