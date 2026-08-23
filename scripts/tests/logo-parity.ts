#!/usr/bin/env tsx
/**
 * Differential test: the API's logo validator and the database's logo guard
 * must return the SAME verdict for the same string.
 *
 *   npm run test:logo-parity
 *
 * NOT part of prebuild — it needs the live database and the service-role key,
 * neither of which a build machine has. Run it after applying migration 042 and
 * after touching either side of the pair.
 *
 * ── WHY IT EXISTS ──────────────────────────────────────────────────────────
 * `lib/storage/uploaded-url.ts` and `042_brand_kit_logo_shape.sql` state the
 * same rule twice, in two languages. The first version of that pair did not
 * agree: the route parsed with `new URL()` while the database matched raw
 * bytes, and the routes store the string the CLIENT SENT — so every
 * normalisation the WHATWG parser performs was a place where the value that was
 * checked was not the value that got written. A query string, a leading space,
 * an embedded tab, an uppercase host, a `./` segment and a backslash path were
 * all accepted by the route and then refused by the trigger, turning the clean
 * 400 into a 500 carrying raw Postgres text.
 *
 * Two statements of one rule drift. This is what notices.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://pixoradb.pyramedia.cloud';

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isOwnUploadUrl } from '../../lib/storage/uploaded-url';

const ROOT = process.cwd();
const ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '');
const UID = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-8888-7777-6666-555555555555';
const P = `${ORIGIN}/storage/v1/object/public/uploads/`;

/** Every string worth disagreeing about. */
const CORPUS: string[] = [
  // real
  `${P}${UID}/8f2c0d1e-0000-4000-8000-000000000000.png`,
  `${P}${UID}/a.jpg`,
  `${P}${UID}/a.webp`,
  `${P}${UID}/name_with-dots.1.png`,
  // provenance
  'blob:http://localhost:3000/8f2c-0d1e',
  'data:image/png;base64,AAAA',
  'javascript:alert(1)',
  'http://evil.example/x.png',
  '',
  'not a url',
  // things a URL parser normalises but a column does not
  `${P}${UID}/a.png?x=1`,
  `${P}${UID}/a.png#z`,
  `${P}${UID}/a.png?download=evil.html`,
  `   ${P}${UID}/a.png`,
  `${P}${UID}/a.png   `,
  'https://PIXORADB.PYRAMEDIA.CLOUD/storage/v1/object/public/uploads/' + UID + '/a.png',
  'https://pixoradb。pyramedia。cloud/storage/v1/object/public/uploads/' + UID + '/a.png',
  'https://pixoradb.pyramedia.cloud:443/storage/v1/object/public/uploads/' + UID + '/a.png',
  'https://pixoradb.pyramedia.cloud:8443/storage/v1/object/public/uploads/' + UID + '/a.png',
  'https://user:pass@pixoradb.pyramedia.cloud/storage/v1/object/public/uploads/' + UID + '/a.png',
  'https://pixoradb.pyramedia.cloud\\storage\\v1\\object\\public\\uploads\\' + UID + '\\a.png',
  'https://pixoradb.pyramedia.\tcloud/storage/v1/object/public/uploads/' + UID + '/a.png',
  `${P}${UID}/a\n.png`,
  `${P}${UID}/a.png\n`,
  `${P}${UID}/a.png\nevil`,
  `${P}${UID}/./a.png`,
  // bucket / path / ownership
  `${ORIGIN}/storage/v1/object/public/assets/${UID}/a.png`,
  `${ORIGIN}/storage/v1/object/public/uploads-evil/${UID}/a.png`,
  `${ORIGIN}/storage/v1/object/sign/uploads/${UID}/a.png`,
  `${P}${OTHER}/a.png`,
  `${P}a.png`,
  `${P}${UID}/sub/a.png`,
  `${P}${UID}/`,
  `${P}${UID}/../${OTHER}/a.png`,
  `${P}${UID}/%2E%2E/a.png`,
  `${P}${UID}/%252E%252E/a.png`,
  `${P}${UID}/..`,
  `${P}${UID}/.`,
  `${P}${UID.toUpperCase()}/a.png`,
  `${P}${UID}/a%20b.png`,
  `${P}${UID}/شعار.png`,
];

function readServiceKey(): string | null {
  const envPath = join(ROOT, '.env.local');
  if (!existsSync(envPath)) return null;
  const m = readFileSync(envPath, 'utf8').match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
  return m ? m[1].trim() : null;
}

function sqlLiteral(value: string): string {
  // standard_conforming_strings is on, so a backslash is literal and only the
  // quote needs doubling.
  return `'${value.replace(/'/g, "''")}'`;
}

async function main(): Promise<void> {
  const key = readServiceKey();
  if (!key) {
    console.error('[logo-parity] SUPABASE_SERVICE_ROLE_KEY not found in .env.local — cannot compare against the database.');
    process.exit(1);
  }

  const values = CORPUS.map((s, i) => `(${i}, ${sqlLiteral(s)})`).join(',\n    ');
  const query = `
    WITH corpus(i, url) AS (VALUES
    ${values}
    )
    SELECT i, public.brand_kit_logo_is_own(url, '${UID}'::uuid) AS db
    FROM corpus ORDER BY i;
  `;

  const res = await fetch(`${ORIGIN}/pg/query`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[logo-parity] query failed (HTTP ${res.status}): ${text.slice(0, 400)}`);
    console.error('Has migration 042 been applied? brand_kit_logo_is_own() is defined there.');
    process.exit(1);
  }

  const rows = JSON.parse(text) as Array<{ i: number; db: boolean }>;
  if (rows.length !== CORPUS.length) {
    console.error(`[logo-parity] expected ${CORPUS.length} rows, got ${rows.length}`);
    process.exit(1);
  }

  let mismatches = 0;
  for (const row of rows) {
    const ts = isOwnUploadUrl(CORPUS[row.i], UID);
    if (ts !== row.db) {
      mismatches += 1;
      console.error(
        `  MISMATCH  ts=${ts} db=${row.db}  ${JSON.stringify(CORPUS[row.i])}`
      );
    }
  }

  const accepted = rows.filter((r) => r.db).length;
  if (mismatches > 0) {
    console.error(`\n[logo-parity] ${mismatches} of ${CORPUS.length} strings disagree`);
    process.exit(1);
  }
  console.log(
    `[logo-parity] ${CORPUS.length} strings, TypeScript and Postgres agree on every one (${accepted} accepted, ${CORPUS.length - accepted} refused)`
  );
}

void main();
