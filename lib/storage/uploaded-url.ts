/**
 * Validates that a URL is one this product produced through POST /api/upload.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * `brand_kits.logo_url` was validated with `z.string().url()`, which is a
 * syntax check, not a provenance check. Measured against the four values that
 * actually reach it, all four passed:
 *
 *     blob:http://localhost:3000/8f2c-…   PASS   dies with the browser tab
 *     data:image/png;base64,…             PASS   unbounded payload into a TEXT column
 *     javascript:alert(1)                 PASS
 *     http://evil.example/x.png           PASS   a customer-chosen host
 *
 * The first one was not hypothetical. `components/brand-kit/LogoUpload.tsx`
 * called `URL.createObjectURL(file)` and handed the result to `onChange`, so
 * every logo ever saved was a pointer into a page that no longer exists — 1 of
 * 1 rows in the live database.
 *
 * ── WHY THIS COMPARES RAW BYTES AND DOES NOT PARSE ─────────────────────────
 * The first version of this file decided on `new URL(url)`. Adversarial review
 * broke it, and the break is worth stating because it looks like the safer
 * choice: the routes store the string the CLIENT SENT (`.insert({ ...input })`),
 * not the parsed one, so every normalisation the WHATWG parser performs is a
 * place where the value that was checked is not the value that gets written.
 * Measured against the real function, all of these were accepted:
 *
 *     …/uploads/<uid>/a.png?download=evil.html   query lives in .search, never .pathname
 *     …/uploads/<uid>/a.png#z                    fragment lives in .hash
 *     "   https://…/uploads/<uid>/a.png"         leading whitespace is stripped by URL()
 *     https://…clo<TAB>ud/…/a.png                C0 controls are stripped by URL()
 *     https://…cloud\storage\v1\…\a.png          backslashes become separators
 *     https://PIXORADB.PYRAMEDIA.CLOUD/…         host is lowercased
 *     https://pixoradb。pyramedia。cloud/…       IDEOGRAPHIC FULL STOP is mapped to '.'
 *     …/uploads/<uid>/./a.png                    the dot segment collapses
 *     https://…cloud:443/…                       the default port is dropped
 *
 * None of those is a URL `/api/upload` can return, and each one is stored
 * verbatim. Migration 042 then refuses the row — it matches raw bytes — so the
 * clean 400 this check exists to produce turned into a 500 carrying raw
 * Postgres text.
 *
 * So the rule is stated once, on the raw string, in the form the database also
 * uses: a literal prefix, then `<owner uuid>/<filename>`, with the filename
 * drawn from an ALLOWLIST of the characters we emit. `%` cannot appear, so
 * `%252E%252E`-style double-encoding has nothing to decode into and one decode
 * is a fixed point — the same reasoning as `lib/storage/export-source.ts`.
 * Anything a parser would have had to normalise is simply not equal to what we
 * write, and is refused.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 * A logo is legitimate only if it is an object in our own `uploads` bucket,
 * under the folder of the user who is saving it. That is exactly and only what
 * `/api/upload` can produce, so anything else did not come from us.
 *
 * The ownership segment is checked even though the row is already scoped by
 * `user_id`: owning the ROW says nothing about where the STRING points, which
 * is the same distinction migration 040 exists to enforce on `assets.url`.
 */

/** The bucket `/api/upload` writes a brand-kit logo to. `brand-kits` is NOT a
 *  bucket: the route's ALLOWED_BUCKETS lists it, but only `assets`, `avatars`
 *  and `uploads` exist on this deployment. */
export const LOGO_BUCKET = 'uploads';

/** Characters we actually emit: `<uuid>.<ext>` under `<uid>/`. Excludes `%`,
 *  `/`, `?`, `#`, whitespace and every control character. Must stay identical
 *  to the class in supabase/migrations/042_brand_kit_logo_shape.sql. */
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

/**
 * The literal a legitimate logo URL starts with, e.g.
 * `https://pixoradb.pyramedia.cloud/storage/v1/object/public/uploads/`.
 *
 * Built from the configured Supabase origin rather than hard-coded so dev and
 * production agree; trailing slashes are trimmed because that is operator
 * configuration, not customer input, and `…cloud/` + `/storage/…` would
 * otherwise produce a prefix nothing matches.
 */
function uploadPrefix(): string | null {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) return null;
  const base = configured.replace(/\/+$/, '');
  if (!base.startsWith('https://') && !base.startsWith('http://')) return null;
  return `${base}/storage/v1/object/public/${LOGO_BUCKET}/`;
}

/**
 * True when `url` names an object in our own upload bucket belonging to
 * `userId`. False for every other string, including well-formed URLs and
 * near-misses a URL parser would have normalised into a match.
 */
export function isOwnUploadUrl(url: string, userId: string): boolean {
  const prefix = uploadPrefix();
  if (!prefix) return false;
  if (!url.startsWith(prefix)) return false;

  const segments = url.slice(prefix.length).split('/');
  // Exactly `<uid>/<file>`. A deeper path is not something /api/upload writes.
  if (segments.length !== 2) return false;
  if (segments[0] !== userId) return false;

  for (const segment of segments) {
    if (!SAFE_SEGMENT.test(segment)) return false;
    if (segment === '.' || segment === '..') return false;
  }

  return true;
}
