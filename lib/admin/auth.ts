import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';
import { createAdminClient } from './db';
import { timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'admin_session';
const EXPIRY = '24h';

function getSecret() {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error('ADMIN_JWT_SECRET not configured');
  return new TextEncoder().encode(secret);
}

// Timing-safe string comparison (prevents timing attacks)
function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against a same-length buffer to maintain constant time
    timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// Login rate limiting — one atomic RPC per attempt (migration 039).
//
// The previous version SELECTed the counter and then UPSERTed it as two
// round trips, which meant N concurrent requests all read the same count and
// all wrote count + 1 — the cap cost an attacker one extra connection to step
// past. consume_login_attempt() is a single INSERT ... ON CONFLICT DO UPDATE
// ... RETURNING, so the row lock is taken by the write itself and concurrent
// callers serialise.
const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

// There is a global counter as well, but it does NOT deny. That distinction is
// the whole point of this block, so it is worth stating plainly.
//
// The first version of this made the global budget a hard gate, and adversarial
// review showed it was an unrecoverable lockout: ten distinct addresses failing
// five times each fills it, and from then on EVERY login is refused at the top
// of the route — including the real admin with the correct password, before
// verifyCredentials() is ever reached. resetLoginAttempts() only clears the
// per-IP key, and the success path that calls it is unreachable once the gate
// is shut, so nothing frees it. Ordinary background scanning of an exposed
// /api/admin/auth/login reaches ten source addresses in a fifteen-minute window
// with no attacker intent at all. That is a worse failure than the hole it was
// meant to cover.
//
// It is safe to demote because the per-IP key is trustworthy HERE, measured
// rather than assumed: a request carrying `X-Forwarded-For: 203.0.113.77` was
// recorded by this app as 94.205.181.52 — the real peer. The proxy replaces a
// client-supplied header rather than appending to it. getClientIP() still reads
// the rightmost hop so it stays correct if that is ever reconfigured to append.
//
// So the global counter is kept purely as a signal: crossing it means many
// distinct sources are failing at once, which is worth seeing in the logs, and
// is never worth locking the owner out of their own product for.
const GLOBAL_ALERT_THRESHOLD = 50;

async function consume(key: string, max: number): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('consume_login_attempt', {
    p_key: key,
    p_max: max,
    p_window: `${WINDOW_MINUTES} minutes`,
  });
  if (error) throw new Error(`consume_login_attempt failed: ${error.message}`);
  return data === true;
}

/**
 * True when this login attempt may proceed.
 *
 * FAILS CLOSED. The old implementation ended in
 *   catch { return true }  // If DB fails, allow the attempt
 * which handed an attacker unlimited password guesses against the only
 * password-authenticated entrance to the system the moment anything went wrong
 * with the query — and said so in a comment.
 *
 * Denying on error costs nothing real here: this database IS the admin panel.
 * Every page behind the login reads from it, so if it is unreachable there is
 * nothing to log in to. Allowing, by contrast, costs the entire limit.
 */
export async function checkLoginRateLimit(ip: string): Promise<boolean> {
  try {
    const allowed = await consume(`login_attempts:ip:${ip}`, MAX_ATTEMPTS);

    // Advisory only — never gates. See the note above.
    try {
      if (!(await consume('login_attempts:global', GLOBAL_ALERT_THRESHOLD))) {
        console.warn(
          '[admin] more than %d admin login attempts in %d minutes across all sources — possible distributed brute force',
          GLOBAL_ALERT_THRESHOLD,
          WINDOW_MINUTES
        );
      }
    } catch {
      // The signal is not worth failing a login over.
    }

    return allowed;
  } catch (error) {
    console.error('[admin] login rate limiter unavailable — denying:', error);
    return false;
  }
}

export async function resetLoginAttempts(ip: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.rpc('reset_login_attempts', { p_key: `login_attempts:ip:${ip}` });
  } catch (error) {
    // Non-critical: the window expires on its own.
    console.error('[admin] failed to reset login attempts:', error);
  }
}

export function verifyCredentials(username: string, password: string): boolean {
  const expectedUsername = process.env.ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedUsername || !expectedPassword) return false;

  const usernameMatch = safeCompare(username, expectedUsername);
  const passwordMatch = safeCompare(password, expectedPassword);

  return usernameMatch && passwordMatch;
}

export async function createAdminToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret());
}

export async function verifyAdminSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return false;

  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export { COOKIE_NAME };
