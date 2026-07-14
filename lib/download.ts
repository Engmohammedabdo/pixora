/**
 * Client-side download helpers.
 *
 * Generated assets live on cross-origin (Supabase signed) URLs where the
 * `<a download>` attribute is ignored by browsers — clicking would navigate
 * away instead of saving. These helpers fetch the asset as a blob and
 * trigger a same-origin object-URL download instead.
 */

export async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download_failed_${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    // Fallback: open in a new tab so the user can save manually
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export async function downloadFiles(items: { url: string; filename: string }[]): Promise<void> {
  for (const item of items) {
    await downloadFile(item.url, item.filename);
  }
}
