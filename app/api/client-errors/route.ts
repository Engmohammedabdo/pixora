import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { checkKeyedRateLimit, getRequestIp } from '@/lib/rate-limit';

// Caps are generous enough for a real stack trace but small enough that a
// single report can't meaningfully fill a log volume.
const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 4000;
const MAX_DIGEST_LENGTH = 100;
const MAX_URL_LENGTH = 500;
const MAX_USER_AGENT_LENGTH = 300;

// `.strict()` rejects anything beyond this exact shape — an unvalidated
// logging endpoint is a log-injection and disk-fill vector, so nothing
// extra is accepted, let alone echoed back into the log line.
const BodySchema = z
  .object({
    message: z.string().max(MAX_MESSAGE_LENGTH),
    stack: z.string().max(MAX_STACK_LENGTH).optional(),
    digest: z.string().max(MAX_DIGEST_LENGTH).optional(),
    url: z.string().max(MAX_URL_LENGTH).optional(),
    userAgent: z.string().max(MAX_USER_AGENT_LENGTH).optional(),
  })
  .strict();

/**
 * Strips CR/LF from a logged field so a crafted `message` (or any other
 * field) can't forge additional log lines — the specific attack an endpoint
 * that writes arbitrary client-supplied text to stderr invites.
 */
function stripNewlines(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Resolve the user id when a session exists, but never require auth —
  // errors on the login page or before hydration are exactly the ones worth
  // seeing. Any failure here (missing env vars, no cookie, etc.) just
  // leaves userId null; it must never block the report.
  let userId: string | null = null;
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  // Rate limit before touching the body: an unauthenticated endpoint that
  // writes to logs is a trivial spam target. Keyed by user id when known,
  // otherwise by IP. checkRateLimit() (lib/rate-limit.ts) can't be reused
  // as-is here — it counts rows in `generations`, which has nothing to do
  // with this endpoint and no row at all for anonymous callers — so this
  // uses the generic checkKeyedRateLimit() added alongside it in the same
  // file for exactly this kind of route.
  const identity = userId ? `user:${userId}` : `ip:${getRequestIp(request)}`;
  const withinLimit = await checkKeyedRateLimit(`client_error:${identity}`, 20, 60000);
  if (!withinLimit) {
    return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ success: false, error: 'validation_error' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'validation_error' }, { status: 400 });
  }

  const { message, stack, digest, url, userAgent } = parsed.data;

  try {
    // Never log PII beyond the user id — no email, no request body echo
    // beyond these five explicitly-validated, newline-stripped fields. One
    // JSON line so it stays greppable/machine-parseable in the host's log
    // viewer.
    console.error(
      '[client-error]',
      JSON.stringify({
        userId,
        message: stripNewlines(message),
        stack: stack !== undefined ? stripNewlines(stack) : undefined,
        digest: digest !== undefined ? stripNewlines(digest) : undefined,
        url: url !== undefined ? stripNewlines(url) : undefined,
        userAgent: userAgent !== undefined ? stripNewlines(userAgent) : undefined,
        timestamp: new Date().toISOString(),
      })
    );
  } catch {
    // A failure to log must never surface to the user or throw — this is a
    // best-effort diagnostic endpoint, not a critical path.
  }

  return new NextResponse(null, { status: 204 });
}
