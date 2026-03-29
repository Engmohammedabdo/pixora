import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Get a signed URL for a Supabase Storage asset.
 * If the URL is external (placeholder, base64), returns as-is.
 * If it's a storage URL, extracts the path and creates a signed URL.
 */
export async function getSignedAssetUrl(
  supabase: SupabaseClient,
  url: string,
  expiresIn: number = 900 // 15 minutes
): Promise<string> {
  if (!url) return url;

  // External URLs, placeholders, base64 — return as-is
  if (url.startsWith('data:') || url.includes('placehold.co') || url.startsWith('blob:')) {
    return url;
  }

  // Try to extract storage path from Supabase public URL
  const publicStoragePattern = /\/storage\/v1\/object\/public\/([^/]+)\/(.+)/;
  const match = url.match(publicStoragePattern);

  if (!match) return url; // Not a Supabase storage URL

  const [, bucket, path] = match;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    return url; // Fallback to original URL
  }

  return data.signedUrl;
}

/**
 * Sign multiple asset URLs in parallel.
 */
export async function signAssetUrls(
  supabase: SupabaseClient,
  urls: string[],
  expiresIn: number = 900
): Promise<string[]> {
  return Promise.all(urls.map((url) => getSignedAssetUrl(supabase, url, expiresIn)));
}
