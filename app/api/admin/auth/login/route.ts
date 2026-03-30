import { NextRequest, NextResponse } from 'next/server';
import {
  verifyCredentials,
  createAdminToken,
  checkLoginRateLimit,
  resetLoginAttempts,
  COOKIE_NAME,
} from '@/lib/admin/auth';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  // Rate limit check
  if (!checkLoginRateLimit(ip)) {
    return NextResponse.json(
      { success: false, error: 'Too many login attempts. Try again in 15 minutes.' },
      { status: 429 }
    );
  }

  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password required' },
        { status: 400 }
      );
    }

    const valid = verifyCredentials(username, password);
    if (!valid) {
      await logAdminAction('login_failed', null, null, { username }, ip);
      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Success — create token and set cookie
    resetLoginAttempts(ip);
    const token = await createAdminToken();

    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 86400, // 24 hours
    });

    await logAdminAction('login_success', null, null, null, ip);
    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
