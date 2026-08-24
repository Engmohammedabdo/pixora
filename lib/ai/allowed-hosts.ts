/**
 * Hosts a reference image may be fetched from.
 *
 * Matched by EXACT hostname or as a proper subdomain (`.` + host) — NEVER by bare
 * suffix. `hostname.endsWith('placehold.co')` also matches `xplacehold.co`;
 * `endsWith('replicate.delivery')` also matches `notreplicate.delivery`; and
 * `endsWith('oaidalleapiprodscus.blob.core.windows.net')` also matches
 * `xoaidalleapiprodscus.blob.core.windows.net`, because an Azure Blob storage
 * account name is the FIRST LABEL and is chosen by whoever creates the account.
 * All three are ordinary registrations, so the allowlist was a suffix an attacker
 * could buy a seat on. Same reasoning as lib/storage/export-source.ts, which
 * compares `target.origin` for equality rather than matching a tail.
 *
 * An IP literal ends with none of these names, so 169.254.169.254, localhost and
 * every other bare address stay refused by the exact match itself.
 *
 * This rule lived as two copies — here and in lib/image/watermark.ts — and both
 * had the same bug. Keep it in one place. Also keep it in step with
 * next.config.ts's remotePatterns (which Next matches exactly) and the CSP
 * img-src directive.
 */
export const REFERENCE_IMAGE_ALLOWED_HOSTS = [
  // Self-hosted storage. NOT .supabase.co/.supabase.in: this deployment is
  // self-hosted, so those matched nothing we own while letting a customer point a
  // reference image at any free Supabase project they registered.
  'pyramedia.cloud',
  'placehold.co',
  'oaidalleapiprodscus.blob.core.windows.net',
  'replicate.delivery',
];

/**
 * Exact host, or a real subdomain of it. Lower-cased because `new URL()` already
 * lower-cases `hostname`, and restating it costs nothing.
 */
export function isAllowedImageHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return REFERENCE_IMAGE_ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
