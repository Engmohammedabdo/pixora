/**
 * The no-op detector must separate "the model declined" from "the model did a
 * small, real edit" — and must never be able to fail a paid generation.
 *
 *   npx tsx scripts/tests/edit-effect.test.ts
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * On 2026-08-27 three paid `edit` generations returned the customer's own
 * photograph, visually unchanged, each answering 200 with a credit charged. No
 * gate in this repo could see it: the code was correct and the MODEL did
 * nothing. The prompt defects behind it are fixed, but the class is permanent —
 * any future prompt can be over-constrained the same way.
 *
 * ── THE TRAP THIS TEST IS BUILT AROUND ─────────────────────────────────────
 * The obvious metric is inverted on real data. Against one input image:
 *
 *     product_label WORKED   2.35% of pixels changed
 *     product_label NO-OP    2.37% of pixels changed
 *
 * So the tests below are written on SHAPE, not amount: strong change
 * concentrated in one place versus weak change spread everywhere. Synthetic
 * fixtures are built to that description rather than to a percentage, and the
 * ordering constants come from the eight labelled production runs recorded in
 * lib/image/edit-effect.ts.
 */
import sharp from 'sharp';
import {
  LOW_EFFECT_THRESHOLD,
  effectSignature,
  effectSignatureFromDataUrl,
  strongestLocalChange,
} from '../../lib/image/edit-effect';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail?: string): void {
  checks++;
  if (!ok) { failures++; console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`); }
}

/** A plain grey field. */
function base(): sharp.Sharp {
  return sharp({ create: { width: 512, height: 512, channels: 3, background: '#8a8a8a' } });
}

/** Recompression-style noise: weak, everywhere. This is what a NO-OP looks like. */
async function withDiffuseNoise(): Promise<Buffer> {
  const px = Buffer.alloc(512 * 512 * 3);
  for (let i = 0; i < px.length; i++) {
    // +/- 6 levels, deterministic so the test cannot flake.
    px[i] = 138 + ((i * 7919) % 13) - 6;
  }
  return sharp(px, { raw: { width: 512, height: 512, channels: 3 } }).png().toBuffer();
}

/** One small strong block. This is what a REAL local edit looks like. */
async function withLocalBlock(): Promise<Buffer> {
  const block = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#000000' } })
    .png().toBuffer();
  return base().composite([{ input: block, left: 100, top: 100 }]).png().toBuffer();
}

async function main(): Promise<void> {
  const flat = await base().png().toBuffer();
  const sigFlat = await effectSignature(flat);
  const sigNoise = await effectSignature(await withDiffuseNoise());
  const sigBlock = await effectSignature(await withLocalBlock());

  check('a signature is produced for a valid image', sigFlat !== null && sigFlat.length > 0);
  if (!sigFlat || !sigNoise || !sigBlock) {
    console.log(`\n[edit-effect] ${checks - failures}/${checks}`);
    process.exit(1);
  }

  const identical = strongestLocalChange(sigFlat, sigFlat);
  const noise = strongestLocalChange(sigFlat, sigNoise);
  const local = strongestLocalChange(sigFlat, sigBlock);

  check('an identical image scores zero', identical === 0, `got ${String(identical)}`);
  check('diffuse noise stays below the flag threshold', noise !== null && noise < LOW_EFFECT_THRESHOLD,
    `diffuse noise scored ${String(noise)}, threshold ${LOW_EFFECT_THRESHOLD}`);
  check('one small strong block clears the flag threshold', local !== null && local > LOW_EFFECT_THRESHOLD,
    `local block scored ${String(local)}`);
  check('a concentrated edit outscores diffuse noise', local !== null && noise !== null && local > noise * 2,
    `local ${String(local)} vs noise ${String(noise)}`);

  // The measured ordering from production. If someone retunes the threshold,
  // these are the numbers it has to stay consistent with.
  check('threshold sits below the worst observed no-op (23.3)', LOW_EFFECT_THRESHOLD >= 23.3);
  check('threshold sits below the weakest observed real edit (30.1)', LOW_EFFECT_THRESHOLD < 30.1);

  // ── It must never be able to break a generation ──────────────────────────
  check('mismatched signature lengths return null, not a throw',
    strongestLocalChange(Buffer.alloc(10), Buffer.alloc(20)) === null);
  check('a wrong-sized signature returns null', strongestLocalChange(Buffer.alloc(10), Buffer.alloc(10)) === null);
  check('garbage bytes produce a null signature rather than throwing',
    (await effectSignature(Buffer.from('not an image'))) === null);

  // ── It must not reach for the network ────────────────────────────────────
  // An https URL is where a diagnostic would be tempted to fetch. That would be
  // a second uncontrolled fetch of a customer-influenced URL — the SSRF surface
  // this repo already closed once — and it could time out a paid generation.
  check('an https URL yields null instead of a fetch',
    (await effectSignatureFromDataUrl('https://example.com/a.png')) === null);
  check('a malformed data URL yields null',
    (await effectSignatureFromDataUrl('data:image/png;base64')) === null);
  const dataUrl = `data:image/png;base64,${flat.toString('base64')}`;
  const fromData = await effectSignatureFromDataUrl(dataUrl);
  check('a real data URL produces a comparable signature',
    fromData !== null && strongestLocalChange(sigFlat, fromData) === 0);

  console.log(`\n[edit-effect] ${checks - failures}/${checks}`);
  process.exit(failures > 0 ? 1 : 0);
}

void main();
