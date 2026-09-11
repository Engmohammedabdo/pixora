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
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked on a timer, NOT in this tick. `link.click()` only STARTS the save;
  // the browser reads the object URL afterwards, and revoking synchronously can
  // pull the bytes out from under it. Safari is the one that actually loses the
  // file, which is the market's dominant browser — a shop owner taps Download,
  // nothing happens, and concludes the product is broken. One second is far more
  // than the read needs and the URL is still released.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
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
    //
    // It runs AFTER `await fetch`, so it is outside the user gesture and every
    // popup blocker refuses it silently: the customer taps Download, the fetch
    // fails, and absolutely nothing happens. `window.open` returns null when it
    // is blocked, so the caller can say so instead of the failure being invisible
    // — the same shape lib/export/pdf.ts:283 already uses, where four call sites
    // toast `popupBlocked`.
    //
    // NO `noopener` in the feature string, and that is load-bearing. With
    // `noopener`, or `noreferrer` (which implies it), the HTML spec makes
    // window.open return null EVEN WHEN THE TAB OPENED. The previous version
    // passed both and then tested the return value, so the test could not tell
    // "blocked" from "opened": every fallback threw, and every caller toasted
    // "download failed" over a tab that had in fact appeared. Clearing `opener`
    // by hand, after the check, keeps the protection `noopener` was there for —
    // the opened page cannot reach back into ours. Dropping `noreferrer` costs
    // nothing real: next.config.ts sets `Referrer-Policy:
    // strict-origin-when-cross-origin`, so a cross-origin tab sees our origin
    // and never the path.
    const opened = window.open(url, '_blank');
    if (!opened) throw new Error('download_failed_popup_blocked');
    opened.opener = null;
  }
}

/**
 * Saves every item, then reports failure ONCE, at the end.
 *
 * It used to `await downloadFile()` in a bare loop, so the first failing item
 * threw out of the loop and every item after it was never attempted: one bad URL
 * in a six-shot photoshoot cost the customer the shots behind it, not just that
 * one. Every caller already toasts on a throw, so one summary error after the
 * loop keeps the "say so" contract without abandoning the rest of the set.
 */
export async function downloadFiles(items: { url: string; filename: string }[]): Promise<void> {
  let failed = 0;
  for (const item of items) {
    try {
      await downloadFile(item.url, item.filename);
    } catch {
      failed++;
    }
  }
  if (failed > 0) throw new Error(`download_failed_${failed}_of_${items.length}`);
}
