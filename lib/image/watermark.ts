import sharp from 'sharp';
import { isAllowedImageHost } from '@/lib/ai/allowed-hosts';
import { getPlan } from '@/lib/stripe/plans';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The wordmark burned into free-plan output.
 *
 * `system_settings.app_config.watermark_text` holds the same string on the live
 * database and is read by NOTHING — the previous implementation hardcoded it
 * here too. Left as a literal rather than wired up, because a watermark that
 * changes on a database write is a way to ship an image marked with someone
 * else's brand, and this is a fail-closed path. If it ever should be
 * configurable, that is a deliberate feature with its own validation, not a
 * `.select()` added here.
 */
const MARK_TEXT = 'PyraSuite';

/**
 * Apply "PyraSuite" watermark to generated images for Free plan users.
 * Uses sharp to composite a semi-transparent diagonal text overlay.
 * The watermark is burned into the pixels — not a CSS overlay.
 */
export async function maybeWatermark(
  imageUrl: string | undefined,
  planId: string
): Promise<string | undefined> {
  if (!imageUrl) return imageUrl;

  const plan = getPlan(planId);
  if (!plan.watermark) return imageUrl;

  // Skip placeholder/mock URLs
  if (imageUrl.includes('placehold.co')) {
    return imageUrl.replace('?text=', '?text=WATERMARK+');
  }

  try {
    const imageBuffer = await urlToBuffer(imageUrl);
    const watermarked = await applyWatermark(imageBuffer);
    return `data:image/png;base64,${watermarked.toString('base64')}`;
  } catch (error) {
    console.error('Watermark failed, returning original:', error);
    return imageUrl;
  }
}

/**
 * Watermark + re-upload to Supabase Storage (replaces original in-place).
 * Use this in studio routes instead of maybeWatermark directly.
 */
export async function watermarkAndReupload(
  imageUrl: string,
  planId: string,
  supabase: SupabaseClient
): Promise<string> {
  const plan = getPlan(planId);
  if (!plan.watermark) return imageUrl;

  // Skip placeholder/mock URLs
  if (imageUrl.includes('placehold.co') || !imageUrl.startsWith('http')) {
    return imageUrl;
  }

  try {
    const imageBuffer = await urlToBuffer(imageUrl);
    const watermarked = await applyWatermark(imageBuffer);

    // Extract storage path from Supabase public URL
    const pathMatch = imageUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
    if (pathMatch) {
      const [, bucket, filePath] = pathMatch;
      await supabase.storage.from(bucket).upload(decodeURIComponent(filePath), watermarked, {
        contentType: 'image/png',
        upsert: true,
      });
      return imageUrl; // Same URL, file replaced in-place
    }

    // Not a Supabase URL — return base64
    return `data:image/png;base64,${watermarked.toString('base64')}`;
  } catch (error) {
    console.error('Watermark+reupload failed, returning original:', error);
    return imageUrl;
  }
}

/**
 * Convert a URL or base64 data URL to a Buffer.
 *
 * Exported so lib/storage/persist-image.ts can watermark an image *before* its
 * single upload rather than uploading twice. See that file for why.
 */
export async function urlToBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith('data:')) {
    const base64Data = imageUrl.split(',')[1];
    if (!base64Data) throw new Error('Invalid base64 data URL');
    return Buffer.from(base64Data, 'base64');
  }

  // SSRF protection: only allow HTTPS and known domains
  const url = new URL(imageUrl);
  if (url.protocol !== 'https:') throw new Error('Only HTTPS URLs allowed');
  // The allowlist lives in lib/ai/allowed-hosts.ts and is matched by exact host or
  // proper subdomain. This file used to keep its own copy matched by bare suffix —
  // the same bug in two places, which is what having two copies buys you.
  if (!isAllowedImageHost(url.hostname)) {
    throw new Error(`Host not allowed: ${url.hostname}`);
  }

  // Fetch with 10s timeout + 20MB size limit
  const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(imageUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);

    // Check Content-Length header if available
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large: ${contentLength} bytes (max ${MAX_IMAGE_SIZE})`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_SIZE) {
      throw new Error(`Image too large: ${buffer.length} bytes (max ${MAX_IMAGE_SIZE})`);
    }

    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

let textRenderingProbe: Promise<void> | null = null;

/**
 * Refuse to watermark unless glyphs actually rasterise.
 *
 * The watermark is SVG `<text>`, which sharp renders through
 * librsvg -> pango -> fontconfig. Handed a system with no font files, pango
 * does not fail: it draws every character as .notdef — an empty box — and
 * reports success. The production runner was `node:24-alpine` with no font
 * package (Dockerfile), so `composite()` returned cleanly, persist-image.ts
 * took its SUCCESS path, and every free-plan image shipped a row of blank
 * rectangles where the product name should be. Nothing threw, so no amount of
 * error handling downstream could have caught it — that is why this is a
 * positive check and not another try/catch.
 *
 * The probe rasterises "IIII" and "WWWW" at the same size and compares the raw
 * pixels. With a real font those differ by a wide margin; with .notdef every
 * glyph is the same box, so the two are byte-identical. That distinguishes
 * "text is being drawn" from "boxes are being drawn", which a
 * did-any-pixel-change test cannot do — boxes change pixels too.
 *
 * Cached per process: it costs two 160x60 rasterisations, and the answer cannot
 * change while the process lives. A failure clears the cache so a later request
 * re-probes rather than being permanently poisoned by one bad render.
 */
export function assertTextRenderingAvailable(): Promise<void> {
  if (!textRenderingProbe) {
    textRenderingProbe = probeTextRendering().catch((error: unknown) => {
      textRenderingProbe = null;
      throw error;
    });
  }
  return textRenderingProbe;
}

async function probeTextRendering(): Promise<void> {
  const render = (glyphs: string): Promise<Buffer> => {
    const svg = Buffer.from(
      `<svg width="160" height="60" xmlns="http://www.w3.org/2000/svg">` +
        `<text x="4" y="44" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="bold" fill="white">${glyphs}</text>` +
        `</svg>`
    );
    return sharp({
      create: { width: 160, height: 60, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .composite([{ input: svg, top: 0, left: 0 }])
      .raw()
      .toBuffer();
  };

  const [narrow, wide] = await Promise.all([render('IIII'), render('WWWW')]);

  if (narrow.equals(wide)) {
    throw new Error(
      'Refusing to watermark: no usable font. "IIII" and "WWWW" rasterise identically, ' +
        'so every glyph is being drawn as an empty .notdef box and the watermark would carry ' +
        'no text. Install fonts in the runtime image (Dockerfile: apk add fontconfig ttf-dejavu).'
    );
  }
}

/**
 * Apply the free-plan "PyraSuite" mark to one corner of the image.
 *
 * ── WHY A CORNER MARK AND NOT THE TILED DIAGONAL IT REPLACED ───────────────
 * This used to stamp rotated "PyraSuite" across the WHOLE frame at 15% opacity,
 * roughly 30 times on a 1024px image. Founder decision, 2026-08-25: keep the
 * mark, move it to a single corner the way Gemini marks its own output.
 *
 * The reasoning is commercial, and it is worth writing down because the tiled
 * version looks like the "safer" choice and is not:
 *
 *   - This is a PRODUCT PHOTOGRAPHY product. A tiled overlay does not protect a
 *     product shot, it destroys it — the mark sits directly on the merchandise,
 *     which is the one part of the frame a customer is judging. The free tier
 *     stops being a demonstration of quality and becomes a demonstration of
 *     watermarking.
 *   - A free plan exists to show someone what they would be buying. A mark that
 *     makes the output unshowable does not convert; it just makes the free tier
 *     look worse than a competitor's free tier.
 *
 * What it does NOT change: the mark is still burned in before the single upload,
 * still fail-CLOSED (see `assertTextRenderingAvailable` above and the refusal on
 * unknown dimensions below), and the clean original is still never served.
 *
 * ── ONE THING TO KNOW BEFORE ANYONE CALLS THIS "SOLVED" ────────────────────
 * Amazon.ae and Noon both REQUIRE a main product image with no watermark, no
 * text and no logo of any kind, on a pure-white background. A corner mark is
 * still a mark: a free-plan image cannot be listed as a main image on either
 * marketplace. That is a pricing decision (mark-free output is a paid feature),
 * not a bug — recorded here so it is discovered now rather than by a customer
 * whose listing was rejected.
 *
 * ── WHY A PILL BEHIND THE TEXT ─────────────────────────────────────────────
 * White text alone is invisible on exactly the background this product produces
 * most often: the pure-white studio sweep. A single translucent dark pill is
 * legible on white, on black and on a busy lifestyle scene, and reads as a
 * deliberate credit rather than as damage. The tiled version needed no such
 * thing only because it covered everything and was therefore always over
 * *something*.
 */
export async function applyWatermark(imageBuffer: Buffer): Promise<Buffer> {
  await assertTextRenderingAvailable();

  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  // Guessing 1024x1024 here used to be the quiet half of the same bug the font
  // probe above covers: the overlay was built at the guessed size and pasted at
  // top-left, so on anything larger the rest of the image carried no mark at
  // all — composite() succeeded, nothing threw, and persist-image.ts took the
  // success path. If sharp cannot report the dimensions we cannot place the
  // mark correctly, so refuse rather than mark the wrong place.
  const { width, height } = metadata;
  if (!width || !height) {
    throw new Error('Cannot watermark: image dimensions unavailable');
  }

  const shorterSide = Math.min(width, height);

  // Scales with the image so a 4K shot is not marked with 14px type and a small
  // thumbnail is not half-covered. Clamped at both ends because the ratio alone
  // misbehaves outside the sizes this product actually generates.
  const fontSize = Math.min(44, Math.max(13, Math.round(shorterSide * 0.028)));
  const margin = Math.max(10, Math.round(shorterSide * 0.022));

  // Arial Bold advances at roughly 0.58em per character across this wordmark.
  // Approximate on purpose: sharp cannot measure text, and the pill only has to
  // contain the glyphs, not fit them exactly.
  const textWidth = Math.round(MARK_TEXT.length * fontSize * 0.58);
  const padX = Math.round(fontSize * 0.6);
  const padY = Math.round(fontSize * 0.34);

  const pillWidth = textWidth + padX * 2;
  const pillHeight = fontSize + padY * 2;
  const pillX = width - margin - pillWidth;
  const pillY = height - margin - pillHeight;

  // A mark that would not fit inside its own image is not a mark. Better to
  // return the image unmarked-shaped than to paste a pill larger than the frame
  // — but this must still FAIL, because free-plan output is never served clean.
  if (pillX < 0 || pillY < 0) {
    throw new Error(
      `Cannot watermark: image ${width}x${height} is too small for the corner mark ` +
        `(${pillWidth}x${pillHeight} plus margin)`
    );
  }

  const textX = pillX + padX;
  const textBaseline = pillY + padY + Math.round(fontSize * 0.8);
  const radius = Math.round(pillHeight / 2);

  const svgOverlay = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="${pillX}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" ` +
      `rx="${radius}" ry="${radius}" fill="black" fill-opacity="0.30"/>` +
      `<text x="${textX}" y="${textBaseline}" font-family="Arial,Helvetica,sans-serif" ` +
      `font-size="${fontSize}" font-weight="bold" fill="white" fill-opacity="0.92">${MARK_TEXT}</text>` +
      `</svg>`
  );

  return image
    .composite([{ input: svgOverlay, top: 0, left: 0 }])
    .png({ quality: 90 })
    .toBuffer();
}

/**
 * Check if an image URL has the watermark flag (legacy compatibility).
 */
export function hasWatermarkFlag(url: string): boolean {
  return url.includes('watermark=true');
}
