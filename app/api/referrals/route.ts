import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

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

    return NextResponse.json({
      success: true,
      data: {
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
