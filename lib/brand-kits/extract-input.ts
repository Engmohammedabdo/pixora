import { z } from 'zod/v4';

/**
 * What `POST /api/brand-kits/extract` will forward to the n8n workflow.
 *
 * ── THE HOST IS NOT CHECKED HERE, AND THAT STANDS ──────────────────────────
 * The route's own header says: "Do not add a second host check here — it would
 * be a second rule that can drift from the one in n8n." That is right. The
 * crawl runs in n8n + Apify; this app never `fetch`es a customer-supplied URL,
 * which is the whole point of the split (`POST /api/assets/export` shipped
 * exactly that SSRF once). Whether a host is reachable, private, or ours is
 * the workflow's `Validate URL` node's job, and it stays there.
 *
 * ── THE SCHEME IS DIFFERENT ────────────────────────────────────────────────
 * `z.string().trim().min(4).max(500)` accepted `javascript:`, `data:`,
 * `file:///etc/passwd` and `http://supabase-kong:8000/...` and handed them to
 * a workflow running on the same Coolify VPS as this app, Supabase and the
 * mailserver. Restating `^https?://` here is NOT a second rule: the app
 * already states it twice — `lib/brand-kits/schema.ts`'s `website_url` and
 * migration `045:93` — so a URL with any other scheme can never be STORED in
 * the column this extraction exists to fill. Forwarding it is spending a crawl
 * on something that could not have been saved even if it worked.
 *
 * ── STATED AS "NO SCHEME, OR http/https" ───────────────────────────────────
 * `WebsiteStep` sends a bare `example.com` — that is the common case and must
 * keep working, so this cannot simply require a scheme. The rule is therefore
 * stated on the AUTHORITY (everything before the first `/`, `?` or `#`): it
 * may carry a colon only as a `:port`. That is total — it does not enumerate
 * dangerous schemes, which is a blacklist and would miss the next one.
 *
 *     example.com            -> no colon in the authority          ACCEPT
 *     example.com:8080/x     -> colon followed by digits (a port)  ACCEPT
 *     https://example.com    -> explicit, allowed scheme           ACCEPT
 *     HTTP://example.com     -> explicit, allowed scheme           ACCEPT
 *     javascript:alert(1)    -> authority "javascript:alert(1)"    REFUSE
 *     data:text/html,x       -> authority "data:text"              REFUSE
 *     file:///etc/passwd     -> authority "file:"                  REFUSE
 *     ftp://example.com      -> authority "ftp:"                   REFUSE
 *
 * `http://169.254.169.254/...` is deliberately ACCEPTED here — it is a host
 * question, and the host belongs to n8n.
 */
function schemeIsAcceptable(url: string): boolean {
  if (/^https?:\/\//i.test(url)) return true;
  const authorityEnd = url.search(/[/?#]/);
  const authority = authorityEnd === -1 ? url : url.slice(0, authorityEnd);
  // A colon is only ever a port separator here: `:` followed by digits, to the
  // end of the authority. Anything else means a scheme we did not allow above.
  return !/:(?!\d+$)/.test(authority);
}

/**
 * True if the value carries any C0/C1 control character. `z.string().trim()`
 * removes surrounding whitespace and the `\S` rule below refuses JS
 * whitespace anywhere — but JS
 * `\s` does NOT include the C0 or C1 ranges, so a NUL or a CR embedded in the
 * URL would otherwise reach an HTTP client as a request-splitting shape.
 *
 * Written as a char-code scan rather than a character-class regex on purpose:
 * a regex stating this rule has to contain the literal control characters or
 * their escapes, and both are invisible in a diff — which is precisely the
 * kind of edit nobody can review.
 */
function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

export const ExtractInputSchema = z.object({
  url: z
    .string()
    .trim()
    .min(4)
    .max(500)
    // No whitespace anywhere — a URL with a space in it is not a URL, and it
    // is the shape that turns one forwarded value into two.
    .regex(/^\S+$/)
    .refine((v) => !hasControlCharacter(v))
    .refine(schemeIsAcceptable),
});
