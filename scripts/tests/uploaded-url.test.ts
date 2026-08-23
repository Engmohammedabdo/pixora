/**
 * Provenance tests for `brand_kits.logo_url`.
 *
 * Checked in for the same reason as safety.test.ts: the defect this replaces
 * shipped and stayed shipped because nothing ever asserted what the validator
 * accepts. `z.string().url()` was in the schema, looked like validation, and
 * passed all four of the values that actually reach this column — including the
 * `blob:` URL the upload component was producing, which is why 1 of 1 rows in
 * the live database pointed at nothing.
 *
 *   npm run test:uploads     (also runs as part of prebuild)
 */
const ORIGIN = 'https://pixoradb.pyramedia.cloud';
process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGIN;

import { isOwnUploadUrl } from '../../lib/storage/uploaded-url';

const UID = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';
const OK = `${ORIGIN}/storage/v1/object/public/uploads/${UID}/8f2c0d1e-0000-4000-8000-000000000000.png`;

let failures = 0;
let checks = 0;

function expect(url: string, userId: string, want: boolean, why: string): void {
  checks += 1;
  const got = isOwnUploadUrl(url, userId);
  if (got !== want) {
    failures += 1;
    console.error(`  FAIL  expected ${want ? 'accept' : 'reject'}: ${why}  (${JSON.stringify(url)})`);
  }
}

// ── What /api/upload actually produces ─────────────────────────────────────
expect(OK, UID, true, 'a real upload URL');
expect(OK.replace('.png', '.jpg'), UID, true, 'jpg');
expect(OK.replace('.png', '.webp'), UID, true, 'webp');
expect(`${ORIGIN}/storage/v1/object/public/uploads/${UID}/name_with-dots.1.png`, UID, true, 'dots, dashes, underscores');

// ── The four values that all passed z.string().url() ───────────────────────
expect('blob:http://localhost:3000/8f2c-0d1e', UID, false, 'blob: — dies with the page that made it');
expect('data:image/png;base64,AAAA', UID, false, 'data: — unbounded payload into a TEXT column');
expect('javascript:alert(1)', UID, false, 'javascript:');
expect('http://evil.example/x.png', UID, false, 'a foreign host');

// ── Origin must match exactly, not merely contain ──────────────────────────
expect(`http://pixoradb.pyramedia.cloud/storage/v1/object/public/uploads/${UID}/a.png`, UID, false, 'http, not https');
expect(`https://pixoradb.pyramedia.cloud.evil.test/storage/v1/object/public/uploads/${UID}/a.png`, UID, false, 'suffix-extended host');
expect(`https://evil.test/pixoradb.pyramedia.cloud/storage/v1/object/public/uploads/${UID}/a.png`, UID, false, 'our host in the path');
expect(`https://pixoradb.pyramedia.cloud:8443/storage/v1/object/public/uploads/${UID}/a.png`, UID, false, 'different port');
expect(`https://user:pass@pixoradb.pyramedia.cloud/storage/v1/object/public/uploads/${UID}/a.png`, UID, false, 'embedded credentials — not a shape /api/upload emits');
expect(`https://PIXORADB.PYRAMEDIA.CLOUD/storage/v1/object/public/uploads/${UID}/a.png`, UID, false, 'uppercase host — URL() would lowercase it, the DB would not');
expect(`https://pixoradb。pyramedia。cloud/storage/v1/object/public/uploads/${UID}/a.png`, UID, false, 'IDEOGRAPHIC FULL STOP — URL() maps it to "."');
expect(`https://pixoradb.pyramedia.cloud:443/storage/v1/object/public/uploads/${UID}/a.png`, UID, false, 'explicit default port — URL() drops it');
expect(
  'https://pixoradb.pyramedia.cloud\\storage\\v1\\object\\public\\uploads\\' + UID + '\\a.png',
  UID, false, 'backslashes — URL() treats them as separators'
);
expect(`   ${OK}`, UID, false, 'leading whitespace — URL() strips it, the column keeps it');
expect(
  'https://pixoradb.pyramedia.\tcloud/storage/v1/object/public/uploads/' + UID + '/a.png',
  UID, false, 'embedded TAB — URL() strips it'
);
expect(`${ORIGIN}/storage/v1/object/public/uploads/${UID}/./a.png`, UID, false, 'dot segment — URL() collapses it');

// ── Bucket must be the one we write to ─────────────────────────────────────
expect(`${ORIGIN}/storage/v1/object/public/assets/${UID}/a.png`, UID, false, 'the assets bucket is not the logo bucket');
expect(`${ORIGIN}/storage/v1/object/public/uploads-evil/${UID}/a.png`, UID, false, 'bucket-name prefix match');
expect(`${ORIGIN}/storage/v1/object/sign/uploads/${UID}/a.png`, UID, false, 'signed path, not public');

// ── Ownership. Owning the ROW says nothing about where the STRING points. ──
expect(OK, OTHER, false, "another user's folder");
expect(`${ORIGIN}/storage/v1/object/public/uploads/a.png`, UID, false, 'no user folder at all');
expect(`${ORIGIN}/storage/v1/object/public/uploads/${UID}/sub/a.png`, UID, false, 'deeper than /api/upload writes');

// ── Traversal, including the double-encoding that broke the export fix ─────
expect(`${ORIGIN}/storage/v1/object/public/uploads/${UID}/../${OTHER}/a.png`, UID, false, 'literal ..');
expect(`${ORIGIN}/storage/v1/object/public/uploads/${UID}/%2E%2E/a.png`, UID, false, 'percent-encoded ..');
expect(`${ORIGIN}/storage/v1/object/public/uploads/${UID}/%252E%252E/a.png`, UID, false, 'double-encoded .. — the export bypass');
expect(`${ORIGIN}/storage/v1/object/public/uploads/${UID}/`, UID, false, 'empty filename');

// ── Degenerate input ───────────────────────────────────────────────────────
expect('', UID, false, 'empty string');
expect('not a url', UID, false, 'not a URL');
// The routes store the string the CLIENT SENT, and migration 042 matches raw
// bytes — so anything a URL parser would normalise away must be refused here
// too, or the route blesses a value the database then rejects with a 500.
expect(`${ORIGIN}/storage/v1/object/public/uploads/${UID}/a.png?x=1`, UID, false, 'query string — not part of the object name');
expect(`${ORIGIN}/storage/v1/object/public/uploads/${UID}/a.png#z`, UID, false, 'fragment');
expect(`${ORIGIN}/storage/v1/object/public/uploads/${UID}/a.png?download=evil.html`, UID, false, 'query that renames the download');

// ── Operator configuration variants ───────────────────────────────────────
checks += 1;
{
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `${ORIGIN}/`;
  if (!isOwnUploadUrl(OK, UID)) {
    failures += 1;
    console.error('  FAIL  a trailing slash in NEXT_PUBLIC_SUPABASE_URL must not break the prefix');
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
}

// ── Unconfigured environment must not become a wildcard ────────────────────
checks += 1;
{
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (isOwnUploadUrl(OK, UID)) {
    failures += 1;
    console.error('  FAIL  with NEXT_PUBLIC_SUPABASE_URL unset, everything must be rejected');
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
}

if (failures > 0) {
  console.error(`\n[uploaded-url] ${failures} of ${checks} checks FAILED`);
  process.exit(1);
}
console.log(`[uploaded-url] ${checks} checks passed`);
