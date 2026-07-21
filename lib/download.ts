/**
 * Client-side download helpers.
 *
 * Generated assets live on cross-origin (Supabase signed) URLs where the
 * `<a download>` attribute is ignored by browsers — clicking would navigate
 * away instead of saving. These helpers fetch the asset as a blob and
 * trigger a same-origin object-URL download instead.
 */

/**
 * Decode a `data:<mime>;base64,...` URL into a Blob without touching the network.
 *
 * Split on the first comma rather than matching the whole URL with a regex — the
 * payload is the entire image, often several megabytes, and there is no reason to
 * run a backtracking matcher across it.
 */
function dataUrlToBlob(url: string): Blob | null {
  const comma = url.indexOf(',');
  if (comma === -1) return null;

  const header = url.slice('data:'.length, comma);
  const payload = url.slice(comma + 1);
  const isBase64 = header.endsWith(';base64');
  const mimeType = (isBase64 ? header.slice(0, -';base64'.length) : header).split(';')[0]
    || 'application/octet-stream';

  try {
    if (!isBase64) {
      return new Blob([decodeURIComponent(payload)], { type: mimeType });
    }
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  } catch {
    return null;
  }
}

function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadFile(url: string, filename: string): Promise<void> {
  // data: URLs must never go through fetch() or window.open():
  //   - `connect-src` in next.config.ts does not allow `data:`, so fetch() is
  //     blocked by CSP and lands in the catch below.
  //   - Chrome has blocked top-level navigation to data: URLs since v60, so the
  //     old fallback opened a blank white tab showing a megabytes-long URL.
  // Decoding locally avoids both. Images should reach the client as https URLs
  // now that lib/storage/persist-image.ts uploads successfully, but a storage
  // outage still falls back to a data: URL and that must remain downloadable.
  if (url.startsWith('data:')) {
    const blob = dataUrlToBlob(url);
    if (blob) {
      saveBlob(blob, filename);
      return;
    }
    throw new Error('download_failed_bad_data_url');
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download_failed_${res.status}`);
    saveBlob(await res.blob(), filename);
  } catch {
    // Fallback: open in a new tab so the user can save manually. Safe here —
    // this branch is only reachable for http(s) URLs.
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function downloadFiles(items: { url: string; filename: string }[]): Promise<void> {
  for (const item of items) {
    await downloadFile(item.url, item.filename);
  }
}
