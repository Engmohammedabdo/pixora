import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * Is the product invite-only right now?
 *
 * This is a DISPLAY signal, not the gate. The gate is a BEFORE INSERT trigger on
 * auth.users (migration 035) and it cannot be reached from the browser at all. This
 * route exists so the signup page can show the right screen — "you need an invite"
 * versus the form — instead of letting someone fill in a form that Postgres is
 * always going to refuse.
 *
 * Replaces `/api/public/registration-check`, which was read by the browser and then
 * ignored: signup called supabase.auth.signUp() regardless, straight to GoTrue with
 * the public anon key. That route was deleted rather than fixed, because two
 * switches that look like the same switch is how the wrong one gets flipped.
 *
 * Fails CLOSED. If the status cannot be read, report invite-only. The cost of being
 * wrong that way is a visitor sent to the waitlist; the cost of the opposite is a
 * signup form that collects a password and then throws a 500.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const db = await createServiceRoleClient();
    const { data, error } = await db.rpc('invite_gate_status');

    if (error || !data) {
      console.error('[gate-status] unreadable, reporting invite-only:', error?.message);
      return NextResponse.json({ inviteOnly: true });
    }

    const status = data as { installed?: boolean; enabled?: boolean };

    // Both must hold. A disabled flag with the trigger still installed is open; an
    // enabled flag with no trigger is a gate that is not actually there, and the
    // signup page should not claim otherwise.
    //
    // Cached briefly on the SUCCESS branch only. This is a service-role query
    // run on every landing visit, and the answer changes about once a launch.
    // The two failure branches above stay uncached on purpose: they fail CLOSED,
    // so caching one would keep the wall up for a further 30 s after the gate
    // became readable again.
    return NextResponse.json(
      { inviteOnly: status.installed === true && status.enabled === true },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    );
  } catch (error) {
    console.error('[gate-status] failed, reporting invite-only:', error);
    return NextResponse.json({ inviteOnly: true });
  }
}
