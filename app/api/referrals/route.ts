import { NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getCachedFeatureFlags } from '@/lib/admin/settings';

/**
 * GET /api/referrals — the signed-in user's referral code and results.
 *
 * The referrals page previously invented a code client-side
 * (`'PYRA-' + profile.id.slice(0,6)`) that existed nowhere in the database, so
 * every invite link pointed at a code that could never be claimed.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('referral_code')
      .eq('id', user.id)
      .single();

    // RLS on `referrals` limits this to rows where the user is referrer or referee.
    const { data: rows } = await supabase
      .from('referrals')
      .select('id, referee_id, credits_each, created_at')
      .eq('referrer_id', user.id)
      .order('created_at', { ascending: false });

    const referrals = rows ?? [];

    // Whether sharing a link can actually produce anything, answered HERE rather
    // than by a second client fetch.
    //
    // Two independent switches can make a share pointless, and the page used to
    // consult neither:
    //   - invite-only signup: the friend lands on /signup?ref=CODE with no invite
    //     token, hits the wall, and cannot register at all;
    //   - the admin "Referral System" flag, which /api/referrals/claim already
    //     enforces with a 403 — so a share could complete signup and still award
    //     nothing.
    // Answering both from this one authenticated call also removes a race: a
    // separate gate fetch resolving first flipped the page's `loading` flag while
    // the stats were still null, painting an empty link box and "0 signups".
    let enabled = false;
    try {
      const flags = await getCachedFeatureFlags();
      const db = await createServiceRoleClient();
      const { data: gate } = await db.rpc('invite_gate_status');
      const g = (gate ?? {}) as { installed?: boolean; enabled?: boolean };
      const inviteOnly = g.installed === true && g.enabled === true;
      enabled = flags.referral_enabled === true && !inviteOnly;
    } catch (error) {
      // Fail closed: better to say "not yet" than to hand out a link that
      // silently earns nothing.
      console.error('[referrals] could not resolve availability, reporting closed:', error);
      enabled = false;
    }

    return NextResponse.json({
      success: true,
      data: {
        enabled,
        code: profile?.referral_code ?? null,
        totalReferred: referrals.length,
        creditsEarned: referrals.reduce((sum, r) => sum + (r.credits_each ?? 0), 0),
        recent: referrals.slice(0, 10).map((r) => ({ id: r.id, createdAt: r.created_at, credits: r.credits_each })),
      },
    });
  } catch (error) {
    console.error('Referrals API error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
