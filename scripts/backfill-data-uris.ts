#!/usr/bin/env tsx
/**
 * npm run db:backfill-images -- [--apply]
 *
 * Moves historical base64 images out of the database and into Supabase Storage.
 *
 * WHY THIS EXISTS:
 *   lib/storage/persist-image.ts used to upload to `generations/<uid>/...`. The
 *   live storage policy is
 *     INSERT WITH CHECK (bucket_id = 'assets'
 *                        AND (storage.foldername(name))[1] = uid()::text)
 *   so segment 1 was the literal string 'generations', every upload was denied,
 *   and the swallowed error left the raw `data:` URL in the database. Measured
 *   before this script ran: 13 of 22 `assets` rows and 7 `generations` rows,
 *   18 MB of base64 across `assets.url` and `generations.output`.
 *
 *   The code paths are fixed; this repairs the rows they already wrote.
 *
 * WHAT IT DOES NOT DO:
 *   It does not watermark. Every affected row belongs to a free-plan account, so
 *   these images should have carried a watermark and do not — but they were
 *   already delivered to the customer unmarked, and burning one in now would
 *   alter artwork someone already downloaded. That is a product decision, not a
 *   data-integrity one. Pass --watermark to opt in.
 *
 * SAFETY:
 *   Dry-run by default: it reports every planned change and writes nothing.
 *   Uploads happen before any row is updated, and a row is only rewritten once
 *   its object is confirmed in storage — an abort halfway leaves orphaned
 *   objects (harmless, and overwritten on re-run) rather than dangling URLs.
 *
 * Security: SUPABASE_SERVICE_ROLE_KEY is read from .env.local ONLY, never from
 * CLI args, never printed. See docs/ROTATE_SECRETS.md.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const ENV_FILE = '.env.local';
const BUCKET = 'assets';

const APPLY = process.argv.includes('--apply');
const WATERMARK = process.argv.includes('--watermark');

function fail(msg: string): never {
  console.error(`\n[FAIL] ${msg}\n`);
  process.exit(1);
}

function readEnv(name: string, minLength = 1): string {
  if (!existsSync(ENV_FILE)) fail(`${ENV_FILE} not found — run from the repo root.`);
  const env = readFileSync(ENV_FILE, 'utf8');
  const match = env.match(new RegExp(`^${name}=(.+)$`, 'm'));
  if (!match) fail(`${name} not found in ${ENV_FILE}.`);
  const value = match[1].trim().replace(/^["']|["']$/g, '');
  if (value.length < minLength) fail(`${name} in ${ENV_FILE} looks malformed.`);
  return value;
}

/** Split a data: URL on the first comma — the payload is megabytes, so no regex. */
function decodeDataUrl(url: string): { mimeType: string; buffer: Buffer } | null {
  const comma = url.indexOf(',');
  if (comma === -1) return null;
  const header = url.slice('data:'.length, comma);
  if (!header.endsWith(';base64')) return null;
  const mimeType = header.slice(0, -';base64'.length).split(';')[0] || 'image/png';
  return { mimeType, buffer: Buffer.from(url.slice(comma + 1), 'base64') };
}

/**
 * Every data: URL inside a generations.output payload, with the storage index the
 * application would have used for it.
 *
 * Four incompatible shapes exist in production — creator alone has two, from
 * different eras: {urls:[...]} and {url:"..."}. Rather than hardcode those, walk
 * the tree and take the array position as the index, matching how the routes call
 * persistGeneratedImage(..., { index }). A scalar field gets no index for `edit`
 * (which persists without one) and index 0 for creator (which passes 0).
 */
function collectDataUrls(
  node: unknown,
  path: (string | number)[],
  out: { path: (string | number)[]; url: string }[]
): void {
  if (typeof node === 'string') {
    if (node.startsWith('data:')) out.push({ path, url: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => collectDataUrls(child, [...path, i], out));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, child] of Object.entries(node)) {
      collectDataUrls(child, [...path, key], out);
    }
  }
}

function setAtPath(root: unknown, path: (string | number)[], value: string): void {
  let node = root as Record<string | number, unknown>;
  for (const segment of path.slice(0, -1)) {
    node = node[segment] as Record<string | number, unknown>;
  }
  node[path[path.length - 1]] = value;
}

/** The index the route would have passed, derived from the payload shape. */
function indexForPath(studio: string, path: (string | number)[]): number | undefined {
  const numeric = path.find((s) => typeof s === 'number');
  if (typeof numeric === 'number') return numeric;
  // Scalar field. `edit` persists with no index; `creator` always passes 0.
  return studio === 'edit' ? undefined : 0;
}

interface GenerationRow {
  id: string;
  user_id: string;
  studio: string;
  output: unknown;
}

interface AssetRow {
  id: string;
  user_id: string;
  generation_id: string | null;
  url: string;
  format: string | null;
}

async function main(): Promise<void> {
  const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL', 8);
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY', 100);
  const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey);

  let applyWatermarkFn: ((b: Buffer) => Promise<Buffer>) | null = null;
  if (WATERMARK) {
    ({ applyWatermark: applyWatermarkFn } = await import('../lib/image/watermark'));
  }

  console.log(`mode      : ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);
  console.log(`watermark : ${WATERMARK ? 'yes' : 'no'}\n`);

  // ── 1. Generations ───────────────────────────────────────────────────────
  // Driven off generations rather than assets: generations carries the payload
  // shape, which is what yields the storage index. Campaign images live ONLY
  // here and have no assets row at all, so an assets-driven pass would miss them.
  //
  // No server-side filter: PostgREST cannot express `output::text LIKE ...` on a
  // jsonb column without a cast in the column name, which supabase-js would send
  // verbatim and the server would reject. The table is small (18 rows), so the
  // predicate lives in collectDataUrls() below instead.
  const { data: allGenerations, error: genErr } = await supabase
    .from('generations')
    .select('id, user_id, studio, output');

  if (genErr) fail(`reading generations: ${genErr.message}`);

  const generations = ((allGenerations ?? []) as GenerationRow[]).filter((g) =>
    JSON.stringify(g.output ?? null).includes('data:')
  );

  // dataUrl -> what was actually stored. Shared with the assets pass so identical
  // bytes upload once and both tables end up pointing at the same object.
  //
  // It carries mimeType and size rather than just the URL because --watermark
  // re-encodes to PNG: deriving assets.format from the decoded *source* would
  // label a stored PNG as 'jpg', and app/api/assets/export/route.ts uses that
  // column verbatim as the archive extension.
  const uploaded = new Map<string, { url: string; mimeType: string; size: number }>();
  let bytesFreed = 0;

  for (const gen of generations) {
    const found: { path: (string | number)[]; url: string }[] = [];
    collectDataUrls(gen.output, [], found);
    if (found.length === 0) continue;

    const nextOutput = JSON.parse(JSON.stringify(gen.output));

    for (const { path, url } of found) {
      const decoded = decodeDataUrl(url);
      if (!decoded) {
        console.log(`  SKIP  ${gen.studio} ${gen.id} ${path.join('.')} — unparseable data: URL`);
        continue;
      }

      let buffer = decoded.buffer;
      let mimeType = decoded.mimeType;
      if (applyWatermarkFn) {
        buffer = await applyWatermarkFn(buffer);
        mimeType = 'image/png';
      }
      const ext = mimeType.includes('png') ? 'png' : 'jpg';

      const index = indexForPath(gen.studio, path);
      const suffix = index === undefined ? '' : `-${index}`;
      // Byte-identical to what lib/storage/persist-image.ts writes today, so a
      // later watermark or delete resolves the same key.
      const fileName = `${gen.user_id}/generations/${gen.id}${suffix}.${ext}`;

      bytesFreed += url.length;
      console.log(
        `  ${gen.studio.padEnd(11)} ${path.join('.').padEnd(12)} ` +
          `${(url.length / 1024 / 1024).toFixed(2)} MB -> ${fileName}`
      );

      if (!APPLY) {
        uploaded.set(url, { url: `<${fileName}>`, mimeType, size: buffer.length });
        continue;
      }

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, buffer, { contentType: mimeType, upsert: true });
      if (upErr) fail(`uploading ${fileName}: ${upErr.message}`);

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
      if (!pub.publicUrl) fail(`no public URL for ${fileName}`);

      uploaded.set(url, { url: pub.publicUrl, mimeType, size: buffer.length });
      setAtPath(nextOutput, path, pub.publicUrl);
    }

    if (APPLY) {
      const { error: updErr } = await supabase
        .from('generations')
        .update({ output: nextOutput })
        .eq('id', gen.id);
      if (updErr) fail(`updating generation ${gen.id}: ${updErr.message}`);
    }
  }

  // ── 2. Assets ────────────────────────────────────────────────────────────
  // Matched to the generations pass by exact payload string, so both tables
  // reference one object. An asset whose bytes were not seen above (its
  // generation row was deleted, say) is uploaded on its own.
  const { data: assets, error: assetErr } = await supabase
    .from('assets')
    .select('id, user_id, generation_id, url, format')
    .like('url', 'data:%');

  if (assetErr) fail(`reading assets: ${assetErr.message}`);

  let orphans = 0;
  for (const asset of (assets ?? []) as AssetRow[]) {
    const decoded = decodeDataUrl(asset.url);
    if (!decoded) {
      console.log(`  SKIP  asset ${asset.id} — unparseable data: URL`);
      continue;
    }

    let stored = uploaded.get(asset.url);
    if (!stored) {
      orphans++;
      // Same watermark treatment as the generations pass, or the two would
      // diverge for an asset whose generation row no longer exists.
      let buffer = decoded.buffer;
      let mimeType = decoded.mimeType;
      if (applyWatermarkFn) {
        buffer = await applyWatermarkFn(buffer);
        mimeType = 'image/png';
      }
      const ext = mimeType.includes('png') ? 'png' : 'jpg';
      const fileName = `${asset.user_id}/generations/orphan-${asset.id}.${ext}`;
      console.log(`  ORPHAN asset ${asset.id} -> ${fileName}`);
      bytesFreed += asset.url.length;
      if (!APPLY) continue;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(fileName, buffer, { contentType: mimeType, upsert: true });
      if (upErr) fail(`uploading ${fileName}: ${upErr.message}`);
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
      stored = { url: pub.publicUrl, mimeType, size: buffer.length };
    }

    if (!APPLY) continue;

    // Both columns describe the object that was actually uploaded, not the
    // decoded source — under --watermark those differ. format was hardcoded
    // 'png' by the routes even for JPEG payloads; size_bytes was never populated.
    const { error: updErr } = await supabase
      .from('assets')
      .update({
        url: stored.url,
        format: stored.mimeType.includes('png') ? 'png' : 'jpg',
        size_bytes: stored.size,
      })
      .eq('id', asset.id);
    if (updErr) fail(`updating asset ${asset.id}: ${updErr.message}`);
  }

  console.log(
    `\ngenerations rows : ${generations.length}` +
      `\nassets rows      : ${(assets ?? []).length}  (orphans: ${orphans})` +
      `\nbase64 removed   : ${(bytesFreed / 1024 / 1024).toFixed(1)} MB`
  );
  if (!APPLY) console.log('\nDry run — nothing written. Re-run with --apply to commit.');
}

main().catch((err) => fail(String(err)));
