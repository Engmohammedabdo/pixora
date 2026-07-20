#!/usr/bin/env tsx
/**
 * npm run db:query -- <file.sql | "ASCII-only SQL">
 *
 * UTF-8-safe manual query runner for the Supabase pg/query endpoint.
 * Ported from pyra-workspace-3 — same discipline, different host.
 *
 * WHY THIS EXISTS:
 *   Windows shells (PowerShell / cmd, and even some Git Bash pipelines)
 *   default to legacy code pages (cp1252/cp720), so Arabic passed INLINE on a
 *   command line reaches the server as `?????` (each Arabic char replaced by a
 *   literal '?') or mojibake (Ø/Ù/├┐ sequences). The damage happens BEFORE the
 *   DB, so nothing errors and nothing can recover the original text. PyraSuite
 *   is Arabic-first — every seed row and every RLS policy comment is at risk.
 *
 * THE RULE:
 *   Any SQL containing non-ASCII (Arabic!) MUST go through a UTF-8 file:
 *     1. Write the SQL to a .sql file (UTF-8, no BOM needed).
 *     2. npm run db:query -- path/to/statement.sql
 *     3. Re-read the affected rows afterwards to confirm the Arabic renders.
 *   This script ENFORCES the rule: inline SQL is accepted only when it is
 *   pure ASCII; inline non-ASCII aborts with instructions.
 *
 * Security: SUPABASE_SERVICE_ROLE_KEY is read from .env.local ONLY (never
 * hardcoded, never from CLI args). .env.local is gitignored — the key must
 * never reach a tracked file. See docs/ROTATE_SECRETS.md for why this matters.
 */

import { existsSync, readFileSync } from 'node:fs';

const SUPABASE_HOST = 'pixoradb.pyramedia.cloud';
const ENV_FILE = '.env.local';

function fail(msg: string): never {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function readServiceRoleKey(): string {
  if (!existsSync(ENV_FILE)) {
    fail(`${ENV_FILE} not found — run from the repo root.`);
  }
  const env = readFileSync(ENV_FILE, 'utf8');
  const match = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
  if (!match) {
    fail(`SUPABASE_SERVICE_ROLE_KEY not found in ${ENV_FILE}.`);
  }
  const stripped = match[1].trim().replace(/^["']|["']$/g, '');
  if (stripped.length < 100) {
    fail(`SUPABASE_SERVICE_ROLE_KEY in ${ENV_FILE} looks malformed (length ${stripped.length}).`);
  }
  return stripped;
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    fail('Usage: npm run db:query -- <file.sql | "ASCII-only SQL">');
  }

  let query: string;
  if (existsSync(arg)) {
    // File mode — the ONLY safe path for Arabic / any non-ASCII SQL.
    query = readFileSync(arg, 'utf8').replace(/^﻿/, ''); // strip BOM if present
  } else {
    // Inline mode — convenience for quick ASCII-only reads. Reject non-ASCII:
    // by the time it reaches us the shell may ALREADY have corrupted it, and
    // there is no way to detect silent '?' substitution reliably.
    // eslint-disable-next-line no-control-regex
    if (/[^\x00-\x7F]/.test(arg)) {
      fail(
        'Inline SQL contains non-ASCII characters (Arabic?). Windows shells corrupt these.\n' +
          '   Write the SQL to a UTF-8 .sql file and run: npm run db:query -- path/to/file.sql',
      );
    }
    query = arg;
  }

  if (!query.trim()) fail('Empty query.');

  const key = readServiceRoleKey();
  const res = await fetch(`https://${SUPABASE_HOST}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      apikey: key,
    },
    body: JSON.stringify({ query }),
  });

  const text = await res.text();
  if (!res.ok) {
    fail(`pg/query HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }

  // Friendly reminder for write statements touching Arabic-bearing content
  if (/\b(insert|update)\b/i.test(query) && /[؀-ۿ]/.test(query)) {
    console.log(
      '\n🔎 تذكير: أعد قراءة الصفوف المتأثرة للتأكد من سلامة العربي (SELECT ... ) — التحقق بعد الكتابة إلزامي.',
    );
  }
}

main().catch((err) => fail(String(err)));
