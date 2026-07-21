import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Public, unauthenticated endpoint (see middleware.ts publicApiPaths) so
// uptime monitors can reach it without a session. The checks below run the
// same internal probes as before (DB reachability, required config present,
// Stripe key shape) to decide overall health, but NONE of that detail is
// exposed — no per-check breakdown, no timings, no env var names, no error
// messages. The public body is intentionally just a coarse status + a
// timestamp; anyone needing the detailed breakdown should use an internal/
// authenticated diagnostics route instead of widening this one.
export async function GET(): Promise<NextResponse> {
  let healthy = true;

  try {
    const supabase = await createServiceRoleClient();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) healthy = false;
  } catch {
    healthy = false;
  }

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
  if (requiredEnvVars.some((v) => !process.env[v])) {
    healthy = false;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  if (!stripeKey.startsWith('sk_')) {
    healthy = false;
  }

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    }
  );
}
