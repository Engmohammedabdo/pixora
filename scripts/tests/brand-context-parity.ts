#!/usr/bin/env tsx
/**
 * Differential test: the Zod `website_url` field in lib/brand-kits/schema.ts
 * and migration 045's `brand_kits_website_url_shape` CHECK constraint must
 * agree — in the direction that matters — about the same string.
 *
 *   npm run test:brand-context-parity
 *
 * NOT part of prebuild — it needs the live database and the service-role key,
 * neither of which a build machine has. Run it after touching either side of
 * this pair (the Zod field or the migration's CHECK).
 *
 * ── WHY IT EXISTS ──────────────────────────────────────────────────────────
 * `lib/storage/uploaded-url.ts` and migration 042's logo guard once stated the
 * same rule twice and disagreed — a route accepted shapes the database then
 * refused, turning a clean 400 into a 500 carrying raw Postgres text.
 * `website_url` is the same shape of rule stated in two places again: a Zod
 * regex in the route's schema, and a Postgres regex in the CHECK constraint.
 * Two statements of one rule drift; this is what notices.
 *
 * ── THE DIRECTION THAT MATTERS ─────────────────────────────────────────────
 * Zod refusing something Postgres would have accepted just wastes a save — the
 * customer gets a 400 for a string that was actually fine. Zod ACCEPTING
 * something Postgres refuses is the dangerous direction: the route validates,
 * reserves nothing extra, writes, and the insert/update 500s with raw Postgres
 * text. Only the second direction fails this test; the first is reported.
 *
 * ── WHAT ACTUALLY GETS TESTED ──────────────────────────────────────────────
 * The Zod field chains `.trim()` BEFORE `.max()`/`.regex()`, and the value that
 * reaches the database is the schema's OUTPUT (post-trim), never the raw
 * input — `CreateBrandKitSchema.parse(body)` is what the route inserts from.
 * So for every corpus string this script first asks Zod: does it accept, and
 * if so, what is the exact written value? THAT value (or the raw string, if
 * Zod already refused it — nothing is written in that case, but Postgres's
 * verdict on the same raw bytes is still worth knowing) is what gets probed
 * against the live database, inside a transaction that ends in ROLLBACK, so
 * nothing here ever touches the live table permanently. There is no SQL
 * function to call (unlike brand_kit_logo_is_own() for the logo) — the CHECK
 * is a bare constraint, so this script proves it the same way migration 045's
 * own probes do: a real UPDATE, inside a subtransaction, watching for
 * check_violation.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://pixoradb.pyramedia.cloud';

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { brandKitBusinessFields } from '../../lib/brand-kits/schema';
import { normalizeWebsiteUrl } from '../../lib/brand-kits/website-url';

const ROOT = process.cwd();
const ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '');

interface CorpusItem {
  label: string;
  raw: string;
  /**
   * `true` for a string BOTH layers must accept. The "dangerous mismatch"
   * check below is one-directional by design (Zod-stricter is only reported),
   * which means a corpus of strings that are all refused everywhere passes
   * trivially — it proves the two layers agree about nothing. These entries
   * are what stop that: every one is the OUTPUT of `normalizeWebsiteUrl`, i.e.
   * exactly the bytes the product now sends, and if either layer refuses one
   * of them the customer cannot save a brand kit at all.
   */
  mustBeAccepted?: boolean;
}

/** The five strings review finding C1 measured, each as the customer types it.
 *  What is probed is what `normalizeWebsiteUrl` turns them into — that is the
 *  value the form now sends, so it is the value both layers must agree on. */
const C1_TYPED = ['mysite.ae', 'www.mysite.ae', 'Https://mysite.ae', 'HTTPS://mysite.ae', 'https://mysite.ae'];

/** Every string worth disagreeing about, per the task brief's required set
 *  plus a few boundary/scheme cases in the same spirit as logo-parity.ts. */
const CORPUS: CorpusItem[] = [
  { label: 'plain https url', raw: 'https://example.com' },
  { label: 'plain http url', raw: 'http://example.com' },
  { label: 'url with a query string', raw: 'https://example.com/path?foo=bar&x=1' },
  { label: 'javascript: scheme', raw: 'javascript:alert(1)' },
  { label: 'data: scheme', raw: 'data:text/html,x' },
  { label: 'leading space', raw: ' https://example.com' },
  { label: 'embedded tab', raw: 'https://exa\tmple.com' },
  { label: 'trailing newline', raw: 'https://example.com\n' },
  { label: '500-char url (exactly at the cap)', raw: `https://${'a'.repeat(492)}` },
  { label: '501-char url (one over the cap)', raw: `https://${'a'.repeat(493)}` },
  { label: 'empty string', raw: '' },
  { label: 'all-whitespace string', raw: '   ' },
  { label: 'U+00A0 inside the host', raw: 'https://exa\u00A0mple.com' },
  { label: 'uppercase scheme', raw: 'HTTPS://example.com' },
  { label: 'url with a fragment', raw: 'https://example.com/page#section' },
  { label: 'unsupported scheme (ftp)', raw: 'ftp://example.com' },
  { label: 'embedded space mid-url', raw: 'https://example.com/foo bar' },
  // ── The C1 case corpus ───────────────────────────────────────────────────
  // Both layers are case-SENSITIVE on the scheme — Zod's `/^https?:\/\/\S+$/`
  // and migration 045's `~ '^https?://[^[:space:]]+$'` (Postgres `~`, not
  // `~*`). These two prove they still refuse identically, i.e. that relaxing
  // one of them alone would have been the 042 defect in reverse.
  { label: 'mixed-case scheme, raw (pre-normalisation)', raw: 'Https://mysite.ae' },
  { label: 'upper-case scheme, raw (pre-normalisation)', raw: 'HTTPS://mysite.ae' },
  // ...and these are what the product now actually sends.
  ...C1_TYPED.map((typed) => ({
    label: `normalizeWebsiteUrl(${JSON.stringify(typed)})`,
    raw: normalizeWebsiteUrl(typed) ?? '',
    mustBeAccepted: true,
  })),
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

interface ZodVerdict {
  accepted: boolean;
  /** The bytes that would actually reach `.insert()`/`.update()` — the
   *  schema's post-`.trim()` output when accepted, the raw input otherwise
   *  (nothing is written in that case; this is only for the DB-side report). */
  written: string;
}

function zodVerdict(raw: string): ZodVerdict {
  const result = brandKitBusinessFields.website_url.safeParse(raw);
  if (!result.success) return { accepted: false, written: raw };
  const value = result.data;
  return { accepted: true, written: typeof value === 'string' ? value : raw };
}

async function main(): Promise<void> {
  const key = readServiceKey();
  if (!key) {
    console.error('[brand-context-parity] SUPABASE_SERVICE_ROLE_KEY not found in .env.local — cannot compare against the database.');
    process.exit(1);
  }

  const verdicts = CORPUS.map((item) => ({ ...item, ...zodVerdict(item.raw) }));
  const values = verdicts
    .map((v, i) => `(${i}, ${sqlLiteral(v.written)})`)
    .join(',\n    ');

  // A real UPDATE against a throwaway probe row, per corpus string, each
  // wrapped in its own subtransaction (BEGIN/EXCEPTION in plpgsql) so one
  // check_violation does not abort the loop. The whole script ends in
  // ROLLBACK — the "rehearse before applying" pattern this repo already uses
  // for migrations — so nothing here is ever committed to the live table.
  const query = `
BEGIN;

CREATE TEMP TABLE parity_result (i int, accepted boolean) ON COMMIT DROP;

DO $probe$
DECLARE
  v_user UUID;
  v_kit  UUID;
  rec    RECORD;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'no user to probe with';
  END IF;

  INSERT INTO public.brand_kits (user_id, name)
  VALUES (v_user, 'brand-context-parity-probe')
  RETURNING id INTO v_kit;

  FOR rec IN SELECT * FROM (VALUES
    ${values}
  ) AS t(i, url)
  LOOP
    BEGIN
      UPDATE public.brand_kits SET website_url = rec.url WHERE id = v_kit;
      INSERT INTO parity_result VALUES (rec.i, true);
    EXCEPTION
      WHEN check_violation THEN
        INSERT INTO parity_result VALUES (rec.i, false);
    END;
  END LOOP;
END
$probe$;

SELECT i, accepted FROM parity_result ORDER BY i;

ROLLBACK;
`;

  const res = await fetch(`${ORIGIN}/pg/query`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[brand-context-parity] query failed (HTTP ${res.status}): ${text.slice(0, 800)}`);
    console.error('Has migration 045 been applied? brand_kits.website_url is added there.');
    process.exit(1);
  }

  let rows: Array<{ i: number; accepted: boolean }>;
  try {
    rows = JSON.parse(text) as Array<{ i: number; accepted: boolean }>;
  } catch {
    console.error(`[brand-context-parity] could not parse response as JSON: ${text.slice(0, 800)}`);
    process.exit(1);
  }
  if (!Array.isArray(rows) || rows.length !== CORPUS.length) {
    console.error(`[brand-context-parity] expected ${CORPUS.length} rows, got ${Array.isArray(rows) ? rows.length : 'non-array'}. Raw response: ${text.slice(0, 800)}`);
    process.exit(1);
  }

  let dangerous = 0;
  let zodStricter = 0;
  let refusedButRequired = 0;
  let sawNbspZodStricter = false;

  for (const row of rows) {
    const v = verdicts[row.i];
    const dbAccepted = row.accepted;
    if (v.mustBeAccepted && !(v.accepted && dbAccepted)) {
      refusedButRequired += 1;
      console.error(
        `  REFUSED but required  ${v.label}  zod=${v.accepted ? 'accept' : 'refuse'} postgres=${dbAccepted ? 'accept' : 'refuse'}`
      );
    }
    if (v.accepted && !dbAccepted) {
      dangerous += 1;
      console.error(
        `  MISMATCH (dangerous: Zod accepts, Postgres refuses)  ${v.label}  written=${JSON.stringify(v.written)}`
      );
    } else if (!v.accepted && dbAccepted) {
      zodStricter += 1;
      console.log(`  Zod-stricter (reported, not a failure): ${v.label}  raw=${JSON.stringify(v.raw)}`);
      if (v.label === 'U+00A0 inside the host') sawNbspZodStricter = true;
    }
  }

  console.log(
    `\n[brand-context-parity] ${CORPUS.length} strings tested. ${dangerous} dangerous mismatch(es), ${refusedButRequired} required-but-refused, ${zodStricter} Zod-stricter case(s) (reported only).`
  );

  if (dangerous > 0) {
    console.error(
      `[brand-context-parity] FAIL — ${dangerous} case(s) where Zod accepts a value Postgres refuses. That is a clean 400 turning into a 500 carrying raw Postgres text.`
    );
    process.exit(1);
  }

  if (refusedButRequired > 0) {
    console.error(
      `[brand-context-parity] FAIL — ${refusedButRequired} normalized value(s) refused by a layer that must accept them. These are the exact bytes BrandKitForm now sends; refusing one means a customer cannot save a brand kit with a website at all (review finding C1).`
    );
    process.exit(1);
  }

  // The brief calls out U+00A0-in-host as the one case Zod should be
  // stricter on (JS \s treats it as whitespace; Postgres's [:space:] class,
  // under this database's locale, does not). Asserting it was actually
  // observed — not just assumed — is what proves this script can detect a
  // real disagreement rather than passing because everything happened to
  // agree. See the task report for the deliberate-breakage proof.
  if (!sawNbspZodStricter) {
    console.error(
      "[brand-context-parity] FAIL — expected the U+00A0-in-host case to be reported as Zod-stricter, and it was not. Either the corpus changed or this database's locale disagrees with that assumption — investigate before trusting this result."
    );
    process.exit(1);
  }

  console.log(
    '[brand-context-parity] OK — no dangerous mismatches, and the expected Zod-stricter case (U+00A0 in the host) was reported as such.'
  );
}

void main();
