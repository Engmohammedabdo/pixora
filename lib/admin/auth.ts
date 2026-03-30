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

// Login rate limiting — persisted in Supabase (survives serverless cold starts)
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function checkLoginRateLimit(ip: string): Promise<boolean> {
  try {
    const supabase = createAdminClient();
    const now = Date.now();

    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', `login_attempts:${ip}`)
      .single();

    if (!data) {
      // No record — first attempt
      await supabase.from('system_settings').upsert({
        key: `login_attempts:${ip}`,
        value: { count: 1, resetAt: now + WINDOW_MS },
        updated_at: new Date().toISOString(),
        updated_by: 'system',
      });
      return true;
    }

    const record = data.value as { count: number; resetAt: number };

    if (now > record.resetAt) {
      // Window expired — reset
      await supabase.from('system_settings').upsert({
        key: `login_attempts:${ip}`,
        value: { count: 1, resetAt: now + WINDOW_MS },
        updated_at: new Date().toISOString(),
        updated_by: 'system',
      });
      return true;
    }

    if (record.count >= MAX_ATTEMPTS) return false;

    // Increment
    await supabase.from('system_settings').upsert({
      key: `login_attempts:${ip}`,
      value: { count: record.count + 1, resetAt: record.resetAt },
      updated_at: new Date().toISOString(),
      updated_by: 'system',
    });
    return true;
  } catch {
    // If DB fails, allow the attempt (don't lock out admin)
    return true;
  }
}

export async function resetLoginAttempts(ip: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from('system_settings').delete().eq('key', `login_attempts:${ip}`);
  } catch {
    // Non-critical, ignore
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
