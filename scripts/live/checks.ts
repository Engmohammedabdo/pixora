import sharp from 'sharp';
import { effectSignature, overallChange, strongestLocalChange } from '../../lib/image/edit-effect';

/**
 * The deterministic half of live verification.
 *
 * Everything here is a MEASUREMENT, never an impression. Each check answers a
 * question with a number, so a run can be compared against the last one and a
 * regression is a changed figure rather than someone's recollection of how the
 * output looked.
 *
 * What this half CANNOT do is judge whether an image is any good, or whether the
 * model quietly invented something. That is the vision-review half, and the
 * runner exists to hand it a contact sheet. Splitting them is the point: the
 * numbers are cheap and repeatable, the judgement is expensive and occasional.
 */

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

/** Share of pixels that are pure white, and whether sampled corners are exactly 255. */
export async function whiteBackground(buf: Buffer): Promise<{ pureShare: number; samplesPure: number; samples: number }> {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let pure = 0;
  for (let i = 0; i < data.length; i += channels) {
    if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) pure++;
  }
  // Sample points avoid two places where non-white is CORRECT, and getting this
  // wrong made the first sweep flag a `marketplace_white` output that was
  // perfect: the bottom-centre samples landed in the contact shadow, which the
  // preset explicitly asks for ("ground the product with a soft contact shadow
  // directly beneath it"). A check that contradicts the rule it is checking is
  // worse than no check.
  //   - bottom CENTRE: the contact shadow
  //   - bottom RIGHT:  our own watermark pill
  const pts: [number, number][] = [
    [0.04, 0.06], [0.5, 0.05], [0.96, 0.06],
    [0.03, 0.5], [0.97, 0.5],
    [0.03, 0.93],
  ];
  let samplesPure = 0;
  for (const [fx, fy] of pts) {
    const x = Math.round(width * fx), y = Math.round(height * fy);
    const i = (y * width + x) * channels;
    if (data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255) samplesPure++;
  }
  return { pureShare: pure / (width * height), samplesPure, samples: pts.length };
}

/**
 * How concentrated the change between two images is.
 *
 * The same metric the edit route records, reused deliberately: if the harness
 * measured effect differently from production, a run could pass here and the
 * live warning could fire on the same generation, and nobody would know which to
 * believe.
 */
export async function editEffect(before: Buffer, after: Buffer): Promise<{ maxLocal: number | null; overall: number | null }> {
  const a = await effectSignature(before);
  const b = await effectSignature(after);
  if (!a || !b) return { maxLocal: null, overall: null };
  return { maxLocal: strongestLocalChange(a, b), overall: overallChange(a, b) };
}

/** Longest side of the non-white subject, as a share of the corresponding frame
 *  dimension — the quantity `marketplace_white` actually states. Recorded
 *  because comparing it against an AREA figure once cost a whole module. */
export async function subjectSpan(buf: Buffer): Promise<number | null> {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      if (data[i] >= 248 && data[i + 1] >= 248 && data[i + 2] >= 248) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < x0) return null;
  return Math.max(x1 - x0 + 1, y1 - y0 + 1) / Math.max(width, height);
}

/**
 * Is the free-plan mark present in the bottom-right corner?
 *
 * The watermark is fail-closed in production, so its absence on a free-plan
 * image is a money-and-brand defect, not a cosmetic one — and it shipped for a
 * week in August as empty boxes because a font was missing from the runtime
 * image, with nothing thrown and nothing logged. Detected as "the corner is not
 * uniform", which is true of a pill with text on it and false of bare backdrop.
 */
export async function cornerMarkPresent(buf: Buffer): Promise<boolean> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  if (!w || !h) return false;
  const cw = Math.max(1, Math.round(w * 0.22));
  const ch = Math.max(1, Math.round(h * 0.10));
  const { data, info } = await sharp(buf)
    .extract({ left: w - cw, top: h - ch, width: cw, height: ch })
    .grayscale().raw().toBuffer({ resolveWithObject: true });
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
  }
  // A mark forces both a dark pill and light glyphs into one small region.
  return max - min > 60;
}

/**
 * The output canvas's width/height ratio. A marketplace preset's shape IS the
 * deliverable — Amazon main images are 1:1, noon's are 2:3 — and the shape is
 * the one property the customer cannot repair after the fact. Measured from
 * the decoded pixels, not the container metadata.
 */
export async function frameAspect(buf: Buffer): Promise<number | null> {
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) return null;
  return meta.width / meta.height;
}
