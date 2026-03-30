import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const [recentGens, recentErrors, lowCreditUsers] = await Promise.all([
    supabase
      .from('generations')
      .select('id, studio, model, status, credits_used, created_at, user_id, profiles(name, email)')
      .order('created_at', { ascending: false })
      .limit(20),

    supabase
      .from('generations')
      .select('id, studio, model, error, created_at, user_id, profiles(name, email)')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(10),

    // Fetch users where either balance is low — filter combined total in JS
    supabase
      .from('profiles')
      .select('id, name, email, plan_id, credits_balance, purchased_credits')
      .lt('credits_balance', 10) // wider fetch, narrow in JS
      .order('credits_balance', { ascending: true })
      .limit(50),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      recentGenerations: recentGens.data || [],
      recentErrors: recentErrors.data || [],
      lowCreditUsers: (lowCreditUsers.data || [])
        .filter(u => ((u.credits_balance as number) + ((u.purchased_credits as number) || 0)) < 5)
        .slice(0, 20),
    },
  });
}
