/**
 * `normalizeWebsiteUrl()` produces bytes `brandKitBusinessFields.website_url`
 * accepts — for everything a customer plausibly types.
 *
 *   npx tsx scripts/tests/website-url.test.ts
 *
 * ── WHY IT EXISTS ──────────────────────────────────────────────────────────
 * Review finding C1: the Zod field is `/^https?:\/\/\S+$/` (scheme required,
 * case-sensitive) and `BrandKitForm` sent `websiteUrl.trim()` raw, so four of
 * the five things a customer types were a `400 validation_error` on an
 * OPTIONAL field, reported as "try again" — advice that can never work.
 *
 * Two rules are asserted here, and they are different rules:
 *
 *   1. NORMALISER -> ZOD. Every typed form normalises to something the schema
 *      accepts. This is the customer-facing claim.
 *   2. NORMALISER -> DATABASE. The scheme is lowercased rather than the regex
 *      relaxed, because migration 045's CHECK uses Postgres `~`, which is
 *      case-sensitive. A case-insensitive Zod over a case-sensitive CHECK is
 *      the 042 defect in reverse (route validates, insert 500s with raw
 *      Postgres text). This file asserts the OUTPUT SHAPE that makes the two
 *      layers agree — a lowercase scheme and no whitespace — because the byte
 *      corpus itself can only be probed against a live database, which
 *      scripts/tests/brand-context-parity.ts does and a build machine cannot.
 *
 * Pure: no network, no database, so it is a prebuild gate.
 */
import { brandKitBusinessFields } from '../../lib/brand-kits/schema';
import { normalizeWebsiteUrl, WEBSITE_URL_MAX_LENGTH } from '../../lib/brand-kits/website-url';

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

function zodAccepts(value: string | null): boolean {
  return brandKitBusinessFields.website_url.safeParse(value).success;
}

// ---------------------------------------------------------------------------
// 1. The C1 corpus: what a customer types must reach a saveable value.
// ---------------------------------------------------------------------------

const TYPED: { typed: string; expected: string }[] = [
  { typed: 'mysite.ae', expected: 'https://mysite.ae' },
  { typed: 'www.mysite.ae', expected: 'https://www.mysite.ae' },
  { typed: 'Https://mysite.ae', expected: 'https://mysite.ae' },
  { typed: 'HTTPS://mysite.ae', expected: 'https://mysite.ae' },
  { typed: 'https://mysite.ae', expected: 'https://mysite.ae' },
  { typed: 'Http://mysite.ae', expected: 'http://mysite.ae' },
  { typed: 'HTTP://MySite.AE/Path', expected: 'http://MySite.AE/Path' },
  { typed: '  mysite.ae  ', expected: 'https://mysite.ae' },
  { typed: 'mysite.ae/menu?lang=ar', expected: 'https://mysite.ae/menu?lang=ar' },
  { typed: 'HttPS://mysite.ae', expected: 'https://mysite.ae' },
];

for (const { typed, expected } of TYPED) {
  const got = normalizeWebsiteUrl(typed);
  check(
    `normalizeWebsiteUrl(${JSON.stringify(typed)})`,
    got === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`
  );
  check(
    `the schema accepts normalizeWebsiteUrl(${JSON.stringify(typed)})`,
    zodAccepts(got),
    `${JSON.stringify(got)} was refused by brandKitBusinessFields.website_url — this is exactly the C1 dead end`
  );
  // The parity rule, stated on the shape rather than on a live probe: only a
  // lowercase scheme can pass migration 045's case-sensitive CHECK.
  check(
    `normalizeWebsiteUrl(${JSON.stringify(typed)}) emits a lowercase scheme`,
    got !== null && /^https?:\/\//.test(got),
    `${JSON.stringify(got)} does not start with a lowercase http:// or https://`
  );
}

// ---------------------------------------------------------------------------
// 2. "Nothing typed" is null, not an empty string — both callers send this to
//    CLEAR the column, and `''` would fail `.regex()` rather than clearing it.
// ---------------------------------------------------------------------------

for (const blank of ['', '   ', '\t', '\n', ' ']) {
  const got = normalizeWebsiteUrl(blank);
  check(`normalizeWebsiteUrl(${JSON.stringify(blank)}) is null`, got === null, `got ${JSON.stringify(got)}`);
  check(`the schema accepts null for ${JSON.stringify(blank)}`, zodAccepts(null));
}

// ---------------------------------------------------------------------------
// 3. The length cap is the column's, so the normaliser can never produce a
//    value the database refuses on length.
// ---------------------------------------------------------------------------

{
  const long = `mysite.ae/${'a'.repeat(1000)}`;
  const got = normalizeWebsiteUrl(long);
  check('an over-long value is truncated to the column cap', got !== null && got.length === WEBSITE_URL_MAX_LENGTH, `got length ${got?.length}`);
  check('the truncated value is still accepted by the schema', zodAccepts(got));
}

// ---------------------------------------------------------------------------
// 4. This is a normaliser, NOT a fixer. A value with whitespace inside is
//    still refused — but now with a message that names the field, which is the
//    actual requirement. Asserting it keeps someone from "helpfully" stripping
//    inner whitespace later and silently changing which host is contacted.
// ---------------------------------------------------------------------------

for (const hostile of ['my site.ae', 'mysite\t.ae', 'mysite .ae/x']) {
  const got = normalizeWebsiteUrl(hostile);
  check(
    `the schema still refuses normalizeWebsiteUrl(${JSON.stringify(hostile)})`,
    !zodAccepts(got),
    `${JSON.stringify(got)} was ACCEPTED — the normaliser must not launder a value into validity`
  );
}

// A dangerous scheme has no `//` after it, so the prefix branch fires and the
// value becomes an ordinary https URL with a strange host. That is the SAFE
// outcome and it is asserted rather than left to chance: the alternative —
// recognising `javascript:` as "already has a scheme" and passing it through —
// would hand the column exactly what migration 045's CHECK exists to refuse,
// and would do it while every layer reported success.
for (const scheme of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd']) {
  const got = normalizeWebsiteUrl(scheme);
  check(
    `normalizeWebsiteUrl(${JSON.stringify(scheme)}) is prefixed, not passed through`,
    got === `https://${scheme}`,
    `got ${JSON.stringify(got)}`
  );
}

if (failures > 0) {
  console.log(`\n[website-url] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[website-url] ${checks} checks passed`);
