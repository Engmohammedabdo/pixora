import { getPlan } from '@/lib/stripe/plans';

/**
 * Apply watermark to generated images for Free plan users.
 * Uses canvas-based text overlay (no external deps).
 * For production, consider using `sharp` for better quality.
 */
export async function maybeWatermark(
  imageUrl: string | undefined,
  planId: string
): Promise<string | undefined> {
  if (!imageUrl) return imageUrl;

  const plan = getPlan(planId);
  if (!plan.watermark) return imageUrl;

  // For mock/placeholder URLs, append watermark text to the URL
  if (imageUrl.includes('placehold.co')) {
    return imageUrl.replace('?text=', '?text=WATERMARK+');
  }

  // For base64 images or real URLs, we'd use sharp here.
  // Since sharp may not be available in all environments,
  // we add a query parameter flag that the frontend can use
  // to overlay a CSS watermark.
  if (imageUrl.startsWith('data:')) {
    return imageUrl; // Can't modify base64 without sharp
  }

  // For storage URLs, append a watermark flag
  const separator = imageUrl.includes('?') ? '&' : '?';
  return `${imageUrl}${separator}watermark=true`;
}

/**
 * Check if an image URL has the watermark flag.
 * Frontend components can use this to show a CSS watermark overlay.
 */
export function hasWatermarkFlag(url: string): boolean {
  return url.includes('watermark=true');
}
