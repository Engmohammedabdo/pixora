/**
 * The file extension an image URL's bytes actually are.
 *
 * ── WHY THIS IS ITS OWN MODULE ─────────────────────────────────────────────
 * This lived in lib/storage/persist-image.ts, which imports lib/image/watermark.ts,
 * which imports `sharp` — a Node-only module. The moment a CLIENT component needed
 * it (the download buttons, which were naming every file .png regardless of its
 * bytes), that import chain pulled sharp into the browser bundle and the build
 * failed with `Can't resolve 'child_process'`.
 *
 * It is pure string logic with no dependencies, so it belongs where both sides can
 * reach it. persist-image.ts re-exports it, so every existing import still works.
 */

export const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  // Not a registered type, but providers emit it and it means the same thing.
  'image/jpg': 'jpg',
  'image/webp': 'webp',
};

export function formatFromUrl(url: string): string {
  // A data: URL has no extension — but it does carry the mime type, and the old
  // `?? 'png'` threw it away. That is not hypothetical: on an unwatermarked plan a
  // storage failure returns the provider's `data:${mime};base64,…` verbatim, and 13
  // of the 25 live asset rows are data: URLs. Every JPEG among them was filed as
  // png and exported as `campaign-1.png` containing JPEG bytes.
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    const meta = url.slice(5, comma === -1 ? undefined : comma);
    const mime = meta.split(';')[0].trim().toLowerCase();
    return EXTENSIONS[mime] ?? 'png';
  }
  const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return match ? match[1].toLowerCase() : 'png';
}
