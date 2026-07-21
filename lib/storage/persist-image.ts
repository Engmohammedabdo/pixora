import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlan } from '@/lib/stripe/plans';
import { applyWatermark, urlToBuffer } from '@/lib/image/watermark';

interface PersistOptions {
  userId: string;
  generationId: string;
  index?: number;
  /**
   * When the plan carries a watermark, it is burned into the buffer BEFORE the
   * upload. Omit only where no watermark should ever apply.
   */
  planId?: string;
}

/**
 * Persist a generated image to Supabase Storage and return a public HTTPS URL.
 *
 * Every image provider hands us bytes we cannot serve directly: Pyra's default
 * image path returns `data:<mime>;base64,...`, and the alternate paths return
 * short-lived URLs on hosts we do not control. Both have to land in our own
 * storage before they reach a customer, or:
 *
 *  1. The whole image gets written into `generations.output` (JSONB) and
 *     `assets.url` (TEXT). A six-shot photoshoot put six base64 images in one
 *     row. Measured in production: 13 of 22 `assets` rows, 18 MB.
 *  2. The free-plan watermark is skipped, because the old two-step (upload,
 *     then re-upload a watermarked copy over the same key) needed an UPDATE on
 *     storage.objects that `authenticated` does not have — the live policy set
 *     grants that role INSERT and SELECT only.
 *
 * Watermarking the buffer up front makes it a single INSERT, which is what the
 * policy actually permits. It also removes the window in which an
 * unwatermarked file sat in a public bucket, and halves the upload traffic.
 *
 * Upload failures fall back to the incoming URL so a storage outage degrades
 * quality rather than losing the generation.
 */
export async function persistGeneratedImage(
  supabase: SupabaseClient,
  url: string,
  opts: PersistOptions
): Promise<string> {
  if (!url) return url;
  // Mock/placeholder images have nothing worth storing.
  if (url.includes('placehold.co')) return url;

  const watermark = opts.planId ? getPlan(opts.planId).watermark : false;

  // An image already in our storage only needs revisiting to watermark it, and
  // re-uploading over an existing key would need the UPDATE the policy withholds.
  const alreadyStored = url.includes('/storage/v1/object/public/');
  if (alreadyStored && !watermark) return url;
  if (!url.startsWith('data:') && !url.startsWith('http')) return url;

  try {
    const buffer = await urlToBuffer(url);

    // applyWatermark always re-encodes to PNG, so the stored type must follow it
    // rather than the source's. Getting this wrong uploads PNG bytes labelled
    // image/jpeg — which is exactly why every existing row has format 'png'
    // while half the payloads are actually JPEG.
    const finalBuffer = watermark ? await applyWatermark(buffer) : buffer;
    const mimeType = watermark ? 'image/png' : sniffImageMime(finalBuffer);
    const ext = EXTENSIONS[mimeType] ?? 'png';

    const suffix = opts.index === undefined ? '' : `-${opts.index}`;
    // The user id MUST be the first path segment. The live policy is
    //   INSERT WITH CHECK (bucket_id = 'assets'
    //                      AND (storage.foldername(name))[1] = uid()::text)
    // and this once wrote `generations/<uid>/...`, making segment 1 the literal
    // string 'generations'. Every upload was denied, the error was swallowed by
    // the catch below, and the raw data: URL was returned instead.
    const fileName = `${opts.userId}/generations/${opts.generationId}${suffix}.${ext}`;

    const { error } = await supabase.storage
      .from('assets')
      .upload(fileName, finalBuffer, { contentType: mimeType, upsert: true });

    if (error) {
      console.error('[storage] generated image upload failed:', error.message);
      // Returning `url` here would hand a free-plan user the clean original,
      // because `url` is the source we watermarked away from. Degrade to an
      // inline image instead — bloated, but it still carries the watermark.
      return watermark ? `data:${mimeType};base64,${finalBuffer.toString('base64')}` : url;
    }

    const { data } = supabase.storage.from('assets').getPublicUrl(fileName);
    return data.publicUrl || url;
  } catch (e) {
    console.error('[storage] generated image persist threw:', e);
    return url;
  }
}

/**
 * The stored file's extension, for `assets.format`.
 *
 * The routes used to hard-code 'png' regardless of the payload, which is why
 * every historical row says png while half the bytes are JPEG.
 * app/api/assets/export/route.ts uses this column verbatim as the filename
 * extension inside the export ZIP, so a wrong value hands the customer a .png
 * containing JPEG bytes. Falls back to png when the URL carries no extension
 * (the data: fallback path).
 */
export function formatFromUrl(url: string): string {
  const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return match ? match[1].toLowerCase() : 'png';
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * Identify an image from its magic bytes.
 *
 * Deliberately not the declared type: a data: URL's header is whatever the
 * provider chose to write, and a remote URL has no header here at all — the old
 * code called every remote image PNG, so a Flux JPEG was stored as `.png` with
 * contentType image/png. The bytes are the only source that cannot be wrong.
 *
 * PNG, JPEG and WebP are the raster types the bucket accepts; anything else
 * falls back to PNG, which is what every generator in the router emits.
 */
function sniffImageMime(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return 'image/png';
}
