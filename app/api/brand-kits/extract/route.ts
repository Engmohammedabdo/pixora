import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { checkKeyedRateLimit } from '@/lib/rate-limit';
import { getN8nBrandDnaConfig } from '@/lib/brand-kits/extract-config';
// A route.ts cannot export anything but its handlers (Next's generated types
// constrain every other name to `never`), so the upstream shape lives in lib/
// where scripts/tests/brand-extract.test.ts can drive the REAL schema rather
// than a re-implementation that would pass while this route regressed.
import { UpstreamSuccessSchema } from '@/lib/brand-kits/extract-upstream';
import { ExtractInputSchema } from '@/lib/brand-kits/extract-input';

/**
 * POST /api/brand-kits/extract — the app side of URL -> brand-DNA extraction.
 *
 * The crawl itself runs entirely in n8n + Apify (P3.1). This route never
 * touches the customer's URL with our own `fetch` — it hands the string to a
 * FIXED webhook URL read from env and lets that workflow's own `Validate URL`
 * node decide whether it is reachable. That split is deliberate: a
 * customer-supplied URL is an SSRF surface, and this repo has already shipped
 * that exact bug once (`POST /api/assets/export` did `fetch()` on a
 * customer-writable column). Do not add a second HOST check here — it would
 * be a second rule that can drift from the one in n8n.
 *
 * The SCHEME is a different question and is decided here, in
 * lib/brand-kits/extract-input.ts. `z.string().trim().min(4).max(500)` used to
 * accept `javascript:`, `data:`, `file:///etc/passwd` and
 * `http://supabase-kong:8000/...` and hand them to a workflow running on the
 * same Coolify VPS as this app, Supabase and the mailserver. Restating
 * `^https?://` is not a second rule: the app already states it twice
 * (lib/brand-kits/schema.ts and migration 045:93), so a URL with any other
 * scheme could never be STORED in the column this extraction exists to fill.
 *
 * This route returns the DRAFT only. It never writes `brand_kits` — extraction
 * is a guess, and the customer edits and saves it through the existing
 * `POST /api/brand-kits`. Saving here would present a guess as a fact.
 */

// Measured crawls take 25-60s — and the FIRST live end-to-end run of the
// success arm (2026-08-28, pyramedia.info, a JS-heavy site through
// playwright:adaptive) took 123s and returned a real draft. A 90s ceiling
// would have aborted a request the upstream then completed and threw away.
// The workflow's own crawl budget is 120s + model time, so the ceiling sits
// above the whole upstream budget, not above the average case.
const UPSTREAM_TIMEOUT_MS = 150_000;

// The draft is well under 4 kB. 256 kB is ample headroom and stops a
// misbehaving upstream from streaming unbounded bytes into this process.
const MAX_UPSTREAM_RESPONSE_BYTES = 256 * 1024;

// Free onboarding step, no credit cost, and every call spends real Apify
// credits plus a real model call — tighter than the studios on purpose. This
// throttle is the only thing bounding spend on this route.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MINUTES = 60;

// Deliberately loose: only used to read optional diagnostic fields for OUR
// logs, never returned to the client, so there is nothing to gain from
// requiring `ok: false` here — and every use site already arrives via
// isRecord(), which is the real narrowing.
interface UpstreamErrorBody {
  error?: unknown;
  reason?: unknown;
  detail?: unknown;
  node?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads the response body up to `maxBytes`, throwing rather than buffering
 * past it. `Response.text()` has no such ceiling on its own — it will happily
 * hold whatever the socket delivers.
 */
async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new Error(`upstream response exceeded ${maxBytes} bytes`);
    }
    return text;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error(`upstream response exceeded ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth first, before the body is even read — an unauthenticated caller
    //    must not be able to probe behaviour with malformed input. Inside the
    //    try/catch (not before it) so a Supabase network hiccup on
    //    getUser() itself still resolves to the registered `internal_error`
    //    below, rather than an unhandled rejection with no JSON body.
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    // 2. Validate the body. Ahead of the throttle below (moved here — review
    //    finding F3): a request that fails validation spends nothing, so it
    //    must not burn any of the customer's 5-per-60-minutes budget either.
    //    SSRF HOST rules are NOT re-implemented here — the workflow's
    //    `Validate URL` node owns them and Apify performs the fetch, so a bad
    //    URL comes back as the workflow's 400 and is mapped below
    //    (extract_invalid_url). The SCHEME is ours: see
    //    lib/brand-kits/extract-input.ts for why that is the same rule rather
    //    than a second one.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'validation_error' }, { status: 400 });
    }
    const input = ExtractInputSchema.parse(body);

    // 3. Both env vars are required. Also ahead of the throttle (F3): if this
    //    was never going to work, refusing immediately must not cost the
    //    customer any of their throttle budget either — forgetting to set
    //    these at deploy used to lock a customer out for 58 minutes having
    //    spent nothing, after five instant 503s each burned an attempt.
    //    Onboarding falls back to the typed form instantly either way.
    const config = getN8nBrandDnaConfig();
    if (!config) {
      console.error(
        '[brand-kits/extract] N8N_BRAND_DNA_WEBHOOK_URL or N8N_BRAND_DNA_SECRET is not set; refusing without attempting the call.'
      );
      return NextResponse.json({ success: false, error: 'extract_unavailable' }, { status: 503 });
    }

    // 4. Throttle, per user, failing CLOSED — now that we know the request is
    //    well-formed and could actually reach the upstream workflow.
    //    checkKeyedRateLimit already denies on any store error and logs it —
    //    do not wrap this in a catch that opens it back up.
    const allowed = await checkKeyedRateLimit(
      `brand-extract:${user.id}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MINUTES
    );
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    // 5. Call the webhook, bounded on time. Any throw here — abort/timeout or
    //    a socket-level network failure — maps to the same code: from the
    //    caller's side both look identical, and both mean "try again later".
    let upstream: Response;
    try {
      upstream = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-HookLens-Secret': config.secret,
        },
        body: JSON.stringify({ url: input.url }),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (e: unknown) {
      console.error(
        '[brand-kits/extract] webhook call failed or timed out:',
        e instanceof Error ? e.message : String(e)
      );
      return NextResponse.json({ success: false, error: 'extract_timeout' }, { status: 504 });
    }

    // Bounded read, then a bounded parse.
    let bodyText: string;
    try {
      bodyText = await readBoundedText(upstream, MAX_UPSTREAM_RESPONSE_BYTES);
    } catch (e: unknown) {
      console.error(
        '[brand-kits/extract] upstream response could not be read within the byte cap:',
        e instanceof Error ? e.message : String(e)
      );
      return NextResponse.json({ success: false, error: 'extract_failed' }, { status: 502 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      console.error(
        `[brand-kits/extract] upstream returned non-JSON body (status ${upstream.status})`
      );
      return NextResponse.json({ success: false, error: 'extract_failed' }, { status: 502 });
    }

    // 6. Map the workflow's outcome to a registered code. The upstream body
    //    is never passed through — `detail`/`node`/`reason` describe OUR
    //    infrastructure and are logged, not returned.
    //
    //    A 200 + `ok: true` used to be CAST straight to `UpstreamSuccessBody`
    //    and relayed unchecked — a malformed upstream success (this workflow's
    //    response shape has changed four times this session) was forwarded to
    //    the client as a successful extraction instead of failing loudly.
    //    Validated with Zod instead: on mismatch this takes the SAME
    //    `extract_failed` (502) path as an unparseable body below, not a new
    //    code.
    if (upstream.status === 200 && isRecord(payload) && payload.ok === true) {
      const parsed = UpstreamSuccessSchema.safeParse(payload);
      if (!parsed.success) {
        console.error(
          '[brand-kits/extract] upstream 200 payload failed shape validation:',
          parsed.error.issues
        );
        return NextResponse.json({ success: false, error: 'extract_failed' }, { status: 502 });
      }
      return NextResponse.json(
        { success: true, data: { draft: parsed.data.draft, missing: parsed.data.missing } },
        { status: 200 }
      );
    }

    const errorBody = isRecord(payload) ? (payload as UpstreamErrorBody) : undefined;

    if (upstream.status === 400) {
      console.error(
        '[brand-kits/extract] workflow rejected the URL:',
        errorBody?.reason,
        errorBody?.detail
      );
      return NextResponse.json({ success: false, error: 'extract_invalid_url' }, { status: 400 });
    }

    if (upstream.status === 502) {
      console.error('[brand-kits/extract] crawl_failed upstream');
      return NextResponse.json({ success: false, error: 'extract_crawl_failed' }, { status: 502 });
    }

    // 500, or any shape/status the workflow's contract does not document.
    console.error(
      `[brand-kits/extract] upstream failure (status ${upstream.status}):`,
      errorBody?.error,
      errorBody?.node
    );
    return NextResponse.json({ success: false, error: 'extract_failed' }, { status: 502 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error' }, { status: 400 });
    }
    console.error('[brand-kits/extract] unexpected error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
