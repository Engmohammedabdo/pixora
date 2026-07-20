import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Persist a generated image to Supabase Storage and return a public HTTPS URL.
 *
 * Gemini returns images as `data:<mime>;base64,...` rather than a link. Storing
 * that string directly causes two real problems:
 *
 *  1. The free-plan watermark is silently skipped — `watermarkAndReupload()` bails
 *     out early on anything that does not start with "http", so a free user would
 *     receive an unwatermarked image.
 *  2. The whole image is written into `generations.output` (JSONB) and
 *     `assets.url` (TEXT). A six-shot photoshoot puts six base64 images in a
 *     single row, bloating the table and every query that reads it.
 *
 * `creator` already did this inline; extracting it here so photoshoot, edit and
 * any future studio share one implementation instead of a third copy.
 *
 * Non-data URLs are returned unchanged. Upload failures fall back to the original
 * URL so a storage outage degrades quality rather than losing the generation.
 */
export async function persistGeneratedImage(
  supabase: SupabaseClient,
  url: string,
  opts: { userId: string; generationId: string; index?: number }
): Promise<string> {
  if (!url.startsWith('data:')) return url;

  try {
    const matches = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) return url;

    const [, mimeType, base64Data] = matches;
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const suffix = opts.index === undefined ? '' : `-${opts.index}`;
    const fileName = `generations/${opts.userId}/${opts.generationId}${suffix}.${ext}`;
    const buffer = Buffer.from(base64Data, 'base64');

    const { error } = await supabase.storage
      .from('assets')
      .upload(fileName, buffer, { contentType: mimeType, upsert: true });

    if (error) {
      console.error('[storage] generated image upload failed:', error.message);
      return url;
    }

    const { data } = supabase.storage.from('assets').getPublicUrl(fileName);
    return data.publicUrl || url;
  } catch (e) {
    console.error('[storage] generated image upload threw:', e);
    return url;
  }
}
