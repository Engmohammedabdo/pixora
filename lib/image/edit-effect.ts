import sharp from 'sharp';

/**
 * Did the edit actually change anything?
 *
 * ── THE PROBLEM THIS MEASURES ──────────────────────────────────────────────
 * On 2026-08-27 three paid `edit` generations returned the customer's own
 * photograph, visually unchanged. Every one answered HTTP 200, charged a credit,
 * wrote an asset row and returned an image. Nothing threw. The model had simply
 * DECLINED — faced with contradictory instructions, doing nothing violated no
 * rule — and at the HTTP layer declining is indistinguishable from success.
 *
 * `tsc`, `eslint`, 17 invariants and 300+ prompt checks were green for the broken
 * prompt and the fixed one alike. No gate in this repo can see this class: the
 * code is correct, the model is the thing that did nothing.
 *
 * ── WHY THE OBVIOUS METRIC DOES NOT WORK, MEASURED ─────────────────────────
 * "What percentage of pixels changed" is not merely weak here — on real data it
 * is INVERTED. Against the same input image:
 *
 *     product_label (WORKED)   2.35% of pixels changed
 *     product_label (NO-OP)    2.37% of pixels changed
 *
 * A text edit touches a small area, and a no-op still re-encodes the whole frame,
 * so recompression noise swamps the signal. Any global threshold would have
 * refused the working run and passed the broken one.
 *
 * ── WHAT DOES WORK: THE SHAPE, NOT THE AMOUNT ──────────────────────────────
 * A no-op is weak change spread everywhere. A real edit is strong change
 * concentrated somewhere. So the frame is divided into a grid and the metric is
 * the STRONGEST CELL, not the mean. Measured over eight labelled production runs
 * (two no-ops, six real edits, five different presets):
 *
 *     worst NO-OP     23.3
 *     weakest WORKED  30.1   <- text set onto a busy wrapper, the subtlest case
 *     everything else 56 .. 105
 *
 * ── WHY THIS ONLY WARNS, AND MUST NOT REFUND ───────────────────────────────
 * That is a gap of 6.8 on a sample of eight. It is ample to raise a flag for a
 * human and nowhere near enough to move money: a false positive refunds work the
 * customer actually received and tells them it failed, which is worse than the
 * defect. `LOW_EFFECT_THRESHOLD` is therefore a LOGGING threshold. If it is ever
 * promoted to a refund, it needs a real sample — which is exactly what recording
 * this number on every edit is for.
 */

/** Downsample size. Grayscale, so one byte per pixel — 64 kB per signature. */
const SIGNATURE_PX = 256;

/** 16×16 cells of 16×16 pixels. Coarse enough that a genuine local edit fills a
 *  cell, fine enough that it is not averaged away across the frame. */
const GRID = 16;

/**
 * Below this, log it for review. NOT a refund threshold — see the header. Set
 * below the worst observed no-op (23.3) rather than between the classes, because
 * the cost of a missed no-op is a log line nobody reads, and the cost of a false
 * flag is noise that trains the reader to ignore the signal.
 */
export const LOW_EFFECT_THRESHOLD = 26;

/**
 * A comparable fingerprint of an image.
 *
 * Computed where the bytes ALREADY exist — `lib/ai/gemini.ts` has the reference
 * image in hand to send to the model — so measuring costs no extra fetch, no
 * extra decode of the original, and no bandwidth. Returns null on any failure:
 * this is diagnostics, and diagnostics must never be why a paid generation dies.
 */
export async function effectSignature(input: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(input)
      .resize(SIGNATURE_PX, SIGNATURE_PX, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Signature of an inline `data:` image, or null for anything else.
 *
 * Deliberately does NOT fetch. The model returns its result as a `data:` URL, so
 * the output bytes are already in the route's hand before `persistGeneratedImage`
 * replaces the value with a storage URL — measuring there costs nothing. Handed
 * an https URL this returns null rather than reaching for the network: a
 * diagnostic that makes its own request is a diagnostic that can time out a paid
 * generation, and it would also be a second uncontrolled fetch of a
 * customer-influenced URL, which is the SSRF surface this repo already closed
 * once.
 */
export async function effectSignatureFromDataUrl(url: string): Promise<Buffer | null> {
  if (!url.startsWith('data:')) return null;
  const comma = url.indexOf(',');
  if (comma < 0) return null;
  try {
    return await effectSignature(Buffer.from(url.slice(comma + 1), 'base64'));
  } catch {
    return null;
  }
}

/**
 * The strongest local change between two signatures, or null if they cannot be
 * compared. Higher means more concentrated change; see the header for the
 * measured ranges.
 */
export function strongestLocalChange(before: Buffer, after: Buffer): number | null {
  if (before.length !== after.length || before.length !== SIGNATURE_PX * SIGNATURE_PX) {
    return null;
  }
  const cell = SIGNATURE_PX / GRID;
  const cells = new Float64Array(GRID * GRID);
  for (let y = 0; y < SIGNATURE_PX; y++) {
    const rowCell = Math.floor(y / cell) * GRID;
    for (let x = 0; x < SIGNATURE_PX; x++) {
      const i = y * SIGNATURE_PX + x;
      cells[rowCell + Math.floor(x / cell)] += Math.abs(before[i] - after[i]);
    }
  }
  const perCell = cell * cell;
  let max = 0;
  for (const c of cells) {
    const v = c / perCell;
    if (v > max) max = v;
  }
  return max;
}
