/**
 * Proof that snapWhiteField() reaches the background and nothing else.
 *
 *   npx tsx scripts/tests/white-field.test.ts
 *
 * The operation is connectivity-scoped: flood fill from the borders across
 * near-white. These checks pin the three properties that make it safe to run
 * on a paid deliverable:
 *
 *   1. an off-white background field becomes exact 255;
 *   2. a near-white highlight INSIDE the product is untouched, because the
 *      product outline disconnects it from the border;
 *   3. the contact shadow survives, because its values sit below the
 *      threshold and the fill flows around it;
 *   4. an image with no near-white border field comes back byte-identical
 *      (the failed-generation case — the snap must degrade to a no-op).
 */
import sharp from 'sharp';
import { snapWhiteField } from '../../lib/image/white-field';

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail = ''): void {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

const W = 200, H = 160;

/** Synthetic product shot: 250-grey "white" field, a dark 60-grey product
 *  block in the centre carrying a 250 highlight pixel region, and a 180-grey
 *  soft shadow strip beneath the product. */
function makeFixture(): Buffer {
  const data = Buffer.alloc(W * H * 3, 250);
  const set = (x: number, y: number, v: number) => {
    const i = (y * W + x) * 3;
    data[i] = v; data[i + 1] = v; data[i + 2] = v;
  };
  for (let y = 40; y < 120; y++) for (let x = 70; x < 130; x++) set(x, y, 60);   // product
  for (let y = 70; y < 80; y++) for (let x = 90; x < 110; x++) set(x, y, 250);   // inner highlight
  for (let y = 120; y < 126; y++) for (let x = 75; x < 125; x++) set(x, y, 180); // contact shadow
  return data;
}

async function encode(raw: Buffer): Promise<Buffer> {
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}

async function px(buf: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

(async () => {
  const out = await snapWhiteField(await encode(makeFixture()));

  const corner = await px(out, 2, 2);
  check('the off-white field snaps to exact 255', corner.every((v) => v === 255), `corner rgb(${corner})`);
  const midEdge = await px(out, W - 3, Math.floor(H / 2));
  check('the field is 255 all the way round', midEdge.every((v) => v === 255), `edge rgb(${midEdge})`);

  const highlight = await px(out, 100, 74);
  check('a near-white highlight INSIDE the product is untouched', highlight.every((v) => v === 250),
    `highlight rgb(${highlight}) — 255 here means the fill crossed the product outline`);

  const product = await px(out, 100, 60);
  check('the product body is untouched', product.every((v) => v === 60), `product rgb(${product})`);

  const shadow = await px(out, 100, 122);
  check('the contact shadow survives', shadow.every((v) => v === 180), `shadow rgb(${shadow})`);

  // The no-op arm: a mid-grey frame with no near-white anywhere near the
  // border must come back exactly as it went in.
  const grey = Buffer.alloc(W * H * 3, 128);
  const greyPng = await encode(grey);
  const untouched = await snapWhiteField(greyPng);
  check('an image with no white field is returned unchanged', untouched.equals(greyPng));

  if (failures > 0) {
    console.log(`\n[white-field] ${failures} of ${checks} checks FAILED`);
    process.exit(1);
  }
  console.log(`[white-field] ${checks} checks passed`);
})();
