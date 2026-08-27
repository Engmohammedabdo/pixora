/**
 * Deterministic white-point snap for the marketplace presets.
 *
 * ── WHY THIS EXISTS, measured rather than reasoned ─────────────────────────
 * Both marketplace presets promise "a true RGB 255,255,255 background —
 * measured as a value, not as an impression of brightness", and the live
 * harness measures exactly that. On 2026-08-27 the same prompt wording
 * produced an exact-255 field on the Amazon square and a 246–253 warm
 * photographic white on the noon portrait, in the same run, on the same
 * fixture. The model treats "pure white" as a look; the marketplace treats it
 * as a number. A property the spec states as a number and the code can
 * guarantee mechanically should not be left to a probability distribution.
 *
 * ── WHAT IT DOES ───────────────────────────────────────────────────────────
 * Flood-fills from the frame borders across near-white pixels (all channels
 * ≥ NEAR_WHITE) and sets every reached pixel to exact 255. Because the fill
 * starts at the borders and only crosses near-white, it reaches the
 * background field and nothing else:
 *
 *   - the PRODUCT's interior is untouched — its near-white highlights are not
 *     connected to the border through near-white paths, the product outline
 *     interrupts them;
 *   - the CONTACT SHADOW survives — its pixels sit well below NEAR_WHITE, so
 *     the fill flows around it, which is what the specs want (noon allows a
 *     light shadow; Amazon expects a natural grounding);
 *   - an output that is not white-backed at all (a failed generation) has few
 *     near-white border pixels, and the snap degrades to a no-op.
 *
 * This is the same operation a product retoucher performs as "levels: clip
 * the white point", scoped to the background by connectivity instead of by a
 * mask. It runs ONLY for presets that declare `pureWhiteField` — for every
 * other edit an off-white background is the customer's photograph, not a
 * defect.
 *
 * Fail-OPEN: a slightly warm white delivered is better than a paid edit
 * failed. The watermark stays fail-closed for business reasons; this is a
 * polish step, not a protection.
 */
import sharp from 'sharp';

/** Everything at or above this (all three channels) counts as "the white
 *  field rendered slightly off". Measured: the noon miss was 246–253; the
 *  soft contact shadow lives far below. */
const NEAR_WHITE = 244;

export async function snapWhiteField(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const nearWhite = (p: number): boolean => {
    const i = p * channels;
    return data[i] >= NEAR_WHITE && data[i + 1] >= NEAR_WHITE && data[i + 2] >= NEAR_WHITE;
  };

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const seed = (p: number) => {
    if (!visited[p] && nearWhite(p)) {
      visited[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }

  let snapped = 0;
  while (stack.length > 0) {
    const p = stack.pop() as number;
    const i = p * channels;
    if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) snapped++;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    const x = p % width;
    if (x > 0) seed(p - 1);
    if (x < width - 1) seed(p + 1);
    if (p >= width) seed(p - width);
    if (p < (height - 1) * width) seed(p + width);
  }

  if (snapped === 0) return input;
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * The data:-URL wrapper the edit route actually holds at the point this runs
 * (before persistGeneratedImage uploads it). A non-data URL is returned
 * untouched — this module never fetches.
 */
export async function snapWhiteFieldOnDataUrl(url: string): Promise<string> {
  if (!url.startsWith('data:image/')) return url;
  const comma = url.indexOf(',');
  if (comma < 0 || !url.slice(0, comma).includes(';base64')) return url;
  try {
    const out = await snapWhiteField(Buffer.from(url.slice(comma + 1), 'base64'));
    return `data:image/png;base64,${out.toString('base64')}`;
  } catch (e) {
    console.warn('[edit][white-field] snap failed, serving the model output as-is:', (e as Error).message);
    return url;
  }
}
