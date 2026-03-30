import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  const checks: Record<string, { status: 'ok' | 'error'; ms?: number; error?: string }> = {};
  const start = Date.now();

  // Check 1: Supabase connection
  try {
    const dbStart = Date.now();
    const supabase = await createServiceRoleClient();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    checks.database = {
      status: error ? 'error' : 'ok',
      ms: Date.now() - dbStart,
      ...(error && { error: error.message }),
    };
  } catch (e) {
    checks.database = {
      status: 'error',
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }

  // Check 2: Environment variables
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'ADMIN_JWT_SECRET',
    'ADMIN_USERNAME',
    'ADMIN_PASSWORD',
  ];

  const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);
  checks.env = {
    status: missingEnvVars.length === 0 ? 'ok' : 'error',
    ...(missingEnvVars.length > 0 && { error: `Missing: ${missingEnvVars.join(', ')}` }),
  };

  // Check 3: Stripe key validity
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  checks.stripe = {
    status: stripeKey.startsWith('sk_') ? 'ok' : 'error',
    ...(!stripeKey.startsWith('sk_') && { error: 'Invalid or missing Stripe key' }),
  };

  // Overall status
  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  const totalMs = Date.now() - start;

  return NextResponse.json(
    {
      status: allOk ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: totalMs,
      checks,
    },
    {
      status: allOk ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    }
  );
}
