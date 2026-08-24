import { z } from 'zod/v4';

/**
 * The shape a studio's reference image may take, stated ONCE.
 *
 * This lived as a byte-identical copy in app/api/studios/edit/route.ts and
 * app/api/studios/photoshoot/route.ts, and the copies had drifted in the way
 * duplicated rules always drift: both accepted `data:image/` with NO ceiling at
 * all, while the https form they were written alongside is capped at
 * MAX_REFERENCE_IMAGE_BYTES in lib/ai/gemini.ts. The cheapest way in was the
 * branch that skipped the cap.
 *
 * ── WHY BOTH FORMS ARE ACCEPTED ────────────────────────────────────────────
 * The image must be one the SERVER can read, not one that only means something
 * inside the customer's tab.
 *
 * `z.string().min(1)` accepted `blob:http://localhost:3000/8f2c-…`, which is what
 * the studio page sent whenever /api/upload refused the file (HEIC, GIF, AVIF,
 * anything over 10MB) — the refusal was discarded client-side and the object URL
 * was submitted instead. That passed, the generations row was inserted, a credit
 * was reserved, and only then did lib/ai/gemini.ts refuse it. The customer watched
 * a long spinner for a generic failure, was refunded, and retrying the same file
 * failed identically forever.
 *
 * So two forms are readable server-side and both are accepted:
 *   - `https://`, which lib/ai/gemini.ts fetches through its host allowlist;
 *   - `data:image/`, which lib/ai/gemini.ts decodes INLINE before any of that. It
 *     is the best-supported reference form, not a refused one, and it is what this
 *     product actually hands over: lib/storage/persist-image.ts returns a data:
 *     URL whenever the storage upload fails, unconditionally on a watermarked free
 *     plan because that is the fail-CLOSED path keeping the watermark on, and
 *     CreatorPreview's "edit this" link forwards whatever URL it holds. An earlier
 *     version of this guard refused `data:` on the claim that gemini.ts rejects it
 *     and that nothing here sends one; both were wrong, and the result was a hard
 *     400 on the Creator→Edit handoff during exactly the degraded storage state it
 *     was built to survive.
 *
 * Stated on the RAW string and checked BEFORE the insert, so an oversized or
 * unreadable value costs nothing. Raw bytes rather than `new URL()` for the same
 * reason lib/storage/uploaded-url.ts gives: what is stored is the string the client
 * sent, so anything a parser would normalise is a value we checked but did not write.
 */

/** The decoded ceiling lib/ai/gemini.ts already enforces on the fetched (https)
 *  path. Restated here so both paths share one number; change one, change both. */
export const MAX_REFERENCE_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * The same ceiling expressed as a length limit on the `data:` STRING, because that
 * is what the request carries. base64 is 4 characters per 3 bytes, so a string no
 * longer than this can never decode past the ceiling; the +128 covers the
 * `data:<mime>;base64,` header. An https URL is far shorter than this, so one cap
 * serves both forms.
 */
export const MAX_REFERENCE_IMAGE_URL_CHARS =
  Math.ceil((MAX_REFERENCE_IMAGE_BYTES / 3) * 4) + 128;

export const readableImageUrl = z
  .string()
  .min(1)
  .max(MAX_REFERENCE_IMAGE_URL_CHARS, {
    message: `reference image is too large (inline payloads are capped at ${MAX_REFERENCE_IMAGE_BYTES} bytes)`,
  })
  .refine((v) => v.startsWith('https://') || v.startsWith('data:image/'), {
    message:
      'must be an https:// URL the server can fetch, or an inline data:image/ payload (blob:, http: and relative URLs cannot be read server-side)',
  });

/**
 * What gets recorded in `generations.input`.
 *
 * An inline reference image is a legitimate input but an unbounded one — the
 * measured payloads run to 2.8 MB — and that column is JSONB every admin screen
 * reads row by row. Record that one was supplied; the bytes stay in memory, where
 * the model call is the only thing that needs them.
 */
export function inputImageRef(url: string): string {
  if (!url.startsWith('data:')) return url;
  const mime = url.slice(5).split(';')[0] || 'image';
  return `[inline ${mime} reference, ${url.length} chars]`;
}
