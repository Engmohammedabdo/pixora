import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlan } from '@/lib/stripe/plans';
import { applyWatermark, urlToBuffer } from '@/lib/image/watermark';
// Re-exported so every existing server-side import keeps working. It lives in its
// own module because CLIENT components need it too, and this file imports sharp.
export { formatFromUrl } from './image-format';
import { EXTENSIONS } from './image-format';

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
 * A watermark was required for this image and could not be burned in.
 *
 * Free is the only plan with `watermark: true` (lib/stripe/plans.ts:27), and a
 * free-plan image handed over without it is a product-rule violation, not a
 * quality degradation — so this path must NOT fall back to the incoming URL the
 * way the unwatermarked path does. `url` is the clean original we watermarked
 * *away from*: returning it delivered exactly the asset the watermark exists to
 * withhold, silently, every time sharp choked on a payload, the 10s fetch
 * aborted, the image was over 20MB, or the host was off the allow-list
 * (lib/image/watermark.ts:89-93, :98, :101, :105-112, :124-156). The catch at
 * the bottom of this file logged it and carried on, so the only trace was a log
 * line nobody reads.
 *
 * Typed so a caller can tell "this one image is undeliverable" apart from a
 * genuine bug, without string-matching a message:
 *
 *  - the multi-image studios (creator x4, campaign, photoshoot) catch it, drop
 *    that one image, and pay for it through the partial-refund path they
 *    already run for an image the model never returned;
 *  - the single-image paths (edit, creator x1) let it reach the catch that
 *    refunds the whole reservation — app/api/studios/edit/route.ts:101-111 and
 *    app/api/studios/creator/route.ts:343-357.
 *
 * Anything that is NOT this error is a real fault, and those catch sites
 * rethrow it rather than swallow it.
 */
export class WatermarkRequiredError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WatermarkRequiredError';
  }
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
 * quality rather than losing the generation — EXCEPT when a watermark was
 * required, because there the incoming URL *is* the clean original. That case
 * throws WatermarkRequiredError instead; see it for why, and for who catches it.
 */
export async function persistGeneratedImage(
  supabase: SupabaseClient,
  url: string,
  opts: PersistOptions
): Promise<string> {
  if (!url) return url;

  const watermark = opts.planId ? getPlan(opts.planId).watermark : false;

  // Mock/placeholder images have nothing worth storing — but on a watermarked
  // plan they must still not come back looking like a clean render, so mark them
  // the same cheap way lib/image/watermark.ts:20-22 does. Every mock URL the
  // router emits carries `?text=` (lib/ai/gemini.ts:25-28, lib/ai/openai.ts:24-27,
  // lib/ai/replicate.ts:17-19), so the replace always lands.
  if (url.includes('placehold.co')) {
    return watermark ? url.replace('?text=', '?text=WATERMARK+') : url;
  }

  // An image already in our storage only needs revisiting to watermark it, and
  // re-uploading over an existing key would need the UPDATE the policy withholds.
  const alreadyStored = url.includes('/storage/v1/object/public/');
  if (alreadyStored && !watermark) return url;

  // Anything that is neither a data: URL nor http(s) cannot be read into a
  // buffer, so a required watermark cannot be burned in. Returning it here was
  // the same fail-open as the catch below, just reached earlier.
  if (!url.startsWith('data:') && !url.startsWith('http')) {
    if (watermark) {
      throw new WatermarkRequiredError('Image cannot be watermarked: unsupported URL scheme');
    }
    return url;
  }

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
    // The last `|| url` in this function, and the same fail-open as the rest:
    // on a watermarked plan `url` is the clean original. getPublicUrl builds its
    // result by string concatenation so an empty value is not reachable through
    // supabase-js today, but the guarantee must not depend on that.
    if (!data.publicUrl) {
      if (watermark) {
        throw new WatermarkRequiredError('Watermarked image uploaded but no public URL was returned');
      }
      return url;
    }
    return data.publicUrl;
  } catch (e) {
    console.error('[storage] generated image persist threw:', e);
    // The branch above can still fail closed on its own: the upload reported an
    // error, but a watermarked buffer exists, so it serves that inline. Here
    // there is no watermarked buffer at all — urlToBuffer() or applyWatermark()
    // is what threw — and the only image in hand is the clean `url`. Returning
    // it was the defect: a free-plan customer got an unwatermarked image
    // whenever sharp failed on an odd payload, the fetch timed out or aborted,
    // or the file was too large. Fail the image instead and let the caller
    // refund; every caller does. Callers: creator route.ts:224-235 (x4) and
    // :288 (x1), campaign route.ts:209-224, photoshoot route.ts:178-197,
    // edit route.ts:97-99.
    if (watermark) {
      throw new WatermarkRequiredError(
        'Watermark could not be applied to the generated image',
        { cause: e }
      );
    }
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
