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
 */
async function urlToBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith('data:')) {
    const base64Data = imageUrl.split(',')[1];
    if (!base64Data) throw new Error('Invalid base64 data URL');
    return Buffer.from(base64Data, 'base64');
  }

  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Apply diagonal repeating "PyraSuite" watermark across the entire image.
 * Semi-transparent white text with dark shadow for visibility on any background.
 */
async function applyWatermark(imageBuffer: Buffer): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;

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
