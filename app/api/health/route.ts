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

    // The invite gate is a trigger on auth.users — a table the Supabase auth
    // service owns, not this repo. A Coolify redeploy, an image upgrade, or a
    // restore that recreates the auth schema drops it, and signup silently reverts
    // to fully open with no error anywhere and nothing in the UI to notice.
    //
    // Checking it here means the uptime monitor that is already polling this route
    // is the detector, instead of the founder happening to open an admin page.
    // Only the coarse `healthy` flag is exposed (see the note above), so this leaks
    // nothing about whether the gate is on.
    const { data: gate } = await supabase.rpc('invite_gate_status');
    const status = gate as { installed?: boolean; enabled?: boolean } | null;
    if (status && status.enabled === true && status.installed !== true) {
      console.error('[health] INVITE GATE MISSING: the trigger is gone from auth.users but the gate is marked enabled — signup is open to anyone. Re-apply supabase/migrations/035_invite_gate.sql');
      healthy = false;
    }
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
