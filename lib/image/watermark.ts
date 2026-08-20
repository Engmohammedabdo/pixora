import sharp from 'sharp';
import { getPlan } from '@/lib/stripe/plans';
import type { SupabaseClient } from '@supabase/supabase-js';

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
  const allowedHosts = ['.supabase.co', '.supabase.in', '.pyramedia.cloud', 'placehold.co', 'oaidalleapiprodscus.blob.core.windows.net', 'replicate.delivery'];
  if (!allowedHosts.some((h) => url.hostname.endsWith(h) || url.hostname === h)) {
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
 * Apply diagonal repeating "PyraSuite" watermark across the entire image.
 * Semi-transparent white text with dark shadow for visibility on any background.
 */
export async function applyWatermark(imageBuffer: Buffer): Promise<Buffer> {
  await assertTextRenderingAvailable();

  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  // Guessing 1024x1024 here used to be the quiet half of the same bug the font
  // probe above covers: the overlay was built at the guessed size and pasted at
  // top-left, so on anything larger the rest of the image carried no mark at
  // all — composite() succeeded, nothing threw, and persist-image.ts took the
  // success path. If sharp cannot report the dimensions we cannot cover the
  // image, so refuse rather than half-cover it.
  const { width, height } = metadata;
  if (!width || !height) {
    throw new Error('Cannot watermark: image dimensions unavailable');
  }

  const fontSize = Math.max(24, Math.round(Math.min(width, height) * 0.035));
  const lineHeight = fontSize * 3;

  const watermarkLines: string[] = [];

  for (let y = -height; y < height * 2; y += lineHeight) {
    for (let x = -width; x < width * 2; x += fontSize * 10) {
      // Shadow for readability on light backgrounds
      watermarkLines.push(
        `<text x="${x + 1}" y="${y + 1}" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="bold" fill="black" fill-opacity="0.08" transform="rotate(-30,${x},${y})">PyraSuite</text>`
      );
      // Main watermark text
      watermarkLines.push(
        `<text x="${x}" y="${y}" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" fill-opacity="0.15" transform="rotate(-30,${x},${y})">PyraSuite</text>`
      );
    }
  }

  const svgOverlay = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${watermarkLines.join('')}</svg>`
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
