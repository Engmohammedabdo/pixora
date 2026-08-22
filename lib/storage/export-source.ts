/**
 * Where the bytes for a bulk export are allowed to come from.
 *
 * `assets.url` is customer-writable. The table's only policy is "Users manage
 * own assets" FOR ALL USING (uid() = user_id) (migration 003:53), and
 * `authenticated` still holds the bootstrap INSERT/UPDATE grant on every column
 * — verified against the live database. So the string in that column is
 * attacker input, and the export route used to hand it straight to `fetch()`:
 * the server made a request to an address of the customer's choosing and
 * returned the response inside a ZIP the customer downloads.
 *
 * There are exactly two legitimate sources, and neither dereferences a
 * customer-chosen host:
 *
 *   inlineBytes()       — the row carries its own bytes in a data: URL
 *   ownedStoragePath()  — the row names an object in our bucket, under the
 *                         caller's own folder
 *
 * Anything else is skipped.
 */

/** Segment characters we actually emit. Excludes `%`, which is what makes the
 *  double-encoding attack described below impossible rather than merely detected. */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * Bytes carried inline by the row itself.
 *
 * A data: URL is not a network destination — decoding one reaches nothing, so
 * it carries none of the risk that motivated removing `fetch()`. This matters
 * in practice, not in theory: 13 of the 25 live `assets` rows are data: URLs
 * holding real images. `lib/storage/persist-image.ts` writes one whenever a
 * storage upload fails, and `scripts/backfill-data-uris.ts` has never been run
 * with --apply. Skipping them would have silently emptied most users' archives
 * — one account goes from 16 exportable assets to 1.
 */
export function inlineBytes(url: string): Buffer | null {
  if (!url.startsWith('data:')) return null;

  const comma = url.indexOf(',');
  if (comma === -1) return null;

  const meta = url.slice(5, comma);
  const payload = url.slice(comma + 1);

  try {
    return meta.endsWith(';base64')
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
  } catch {
    return null;
  }
}

/**
 * The object path inside the `assets` bucket, but only if this URL really is
 * one of ours and really belongs to `userId`. Null for anything else.
 *
 * The ownership check is not redundant with the `.eq('user_id', user.id)` on
 * the query that produced the row: the row is the caller's, but the `url`
 * column inside it is caller-written, so the row being theirs says nothing
 * about where the string points.
 *
 * ── WHY THE SEGMENT ALLOWLIST, AND NOT A `..` BLACKLIST ────────────────────
 * An earlier version of this decoded once and then rejected `path.includes('..')`.
 * That is bypassable, and adversarial review broke it: the decoded string is
 * pasted into a URL by @supabase/storage-js WITHOUT re-encoding
 * (`_getFinalPath` -> `${bucketId}/${path}`), and Node then parses that string
 * again. The WHATWG URL parser treats `%2e%2e` as a double-dot segment. So a
 * stored `%252E%252E` decodes ONCE to the literal text `%2E%2E`, contains no
 * `..`, starts with the caller's own uid — and is normalised back into `..` at
 * request time, walking out of the caller's folder to another user's object.
 * One decode is not a fixed point, so the path that was validated was not the
 * path that got fetched.
 *
 * Allow-listing the characters we actually emit closes that whole class: `%`
 * cannot appear at all, so no amount of re-encoding survives and there is
 * nothing left to normalise. Live paths are
 * `<uid>/generations/<uuid>[-n].<ext>` and `<uid>/voiceover-<uuid>.mp3`
 * (verified against production), both of which this accepts.
 */
export function ownedStoragePath(url: string, userId: string): string | null {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) return null;

  let target: URL;
  let expected: URL;
  try {
    target = new URL(url);
    expected = new URL(configured);
  } catch {
    return null;
  }
  if (target.origin !== expected.origin) return null;

  const marker = '/storage/v1/object/public/assets/';
  if (!target.pathname.startsWith(marker)) return null;

  let path: string;
  try {
    path = decodeURIComponent(target.pathname.slice(marker.length));
  } catch {
    return null;
  }

  const segments = path.split('/');
  if (segments.length < 2) return null;
  if (segments[0] !== userId) return null;

  for (const segment of segments) {
    // SAFE_SEGMENT rejects `%`, empty segments and anything exotic; the dot
    // check is separate because `.` and `..` are made only of allowed chars.
    if (!SAFE_SEGMENT.test(segment)) return null;
    if (segment === '.' || segment === '..') return null;
  }

  return path;
}
