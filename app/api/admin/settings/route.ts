import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { getFeatureFlags, getRateLimits, getSetting, setSetting } from '@/lib/admin/settings';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const [featureFlags, rateLimits, appConfig] = await Promise.all([
    getFeatureFlags(),
    getRateLimits(),
    getSetting<Record<string, unknown>>('app_config'),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      featureFlags,
      rateLimits,
      appConfig: appConfig || { watermark_text: 'PyraSuite', default_locale: 'ar' },
    },
  });
}

export async function PUT(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { group, value } = await request.json();

  const validGroups = ['feature_flags', 'rate_limits', 'app_config'];
  if (!validGroups.includes(group)) {
    return NextResponse.json({ success: false, error: 'Invalid settings group' }, { status: 400 });
  }

  const success = await setSetting(group, value);

  if (!success) {
    return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 });
  }

  await logAdminAction('setting_update', 'setting', group, value, getClientIP(request));

  return NextResponse.json({ success: true });
}
