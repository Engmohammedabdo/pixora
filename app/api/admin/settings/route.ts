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

function validateFeatureFlags(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Invalid feature flags object';
  const v = value as Record<string, unknown>;
  const boolFields = ['maintenance_mode', 'registration_enabled', 'free_plan_enabled', 'referral_enabled', 'daily_bonus_enabled'];
  for (const field of boolFields) {
    if (v[field] !== undefined && typeof v[field] !== 'boolean') return `${field} must be a boolean`;
  }
  return null;
}

function validateRateLimits(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Invalid rate limits object';
  const v = value as Record<string, unknown>;
  if (v.requests_per_minute !== undefined) {
    if (typeof v.requests_per_minute !== 'number' || v.requests_per_minute < 1 || v.requests_per_minute > 1000) {
      return 'requests_per_minute must be 1-1000';
    }
  }
  if (v.daily_generations !== undefined) {
    if (typeof v.daily_generations !== 'object' || !v.daily_generations) return 'daily_generations must be an object';
    const dg = v.daily_generations as Record<string, unknown>;
    for (const [plan, limit] of Object.entries(dg)) {
      if (typeof limit !== 'number' || limit < 0 || limit > 10000) {
        return `daily_generations.${plan} must be 0-10000`;
      }
    }
  }
  return null;
}

function validateAppConfig(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Invalid app config object';
  const v = value as Record<string, unknown>;
  if (v.watermark_text !== undefined && typeof v.watermark_text !== 'string') return 'watermark_text must be a string';
  if (v.default_locale !== undefined && !['ar', 'en'].includes(v.default_locale as string)) return 'default_locale must be ar or en';
  return null;
}

const validators: Record<string, (v: unknown) => string | null> = {
  feature_flags: validateFeatureFlags,
  rate_limits: validateRateLimits,
  app_config: validateAppConfig,
};

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

  // Validate payload
  const validationError = validators[group](value);
  if (validationError) {
    return NextResponse.json({ success: false, error: validationError }, { status: 400 });
  }

  // Fetch old value for audit trail
  const oldValue = await getSetting(group);

  const success = await setSetting(group, value);

  if (!success) {
    return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 });
  }

  await logAdminAction('setting_update', 'setting', group, { old: oldValue, new: value }, getClientIP(request));

  return NextResponse.json({ success: true });
}
