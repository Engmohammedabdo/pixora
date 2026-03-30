import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/admin/auth';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_NAME);

  await logAdminAction('logout', null, null, null, getClientIP(request));
  return response;
}
