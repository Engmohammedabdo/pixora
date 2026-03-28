import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('credits_balance, plan_id')
      .eq('id', user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: 'profile_not_found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        balance: data.credits_balance,
        planId: data.plan_id,
      },
    });
  } catch (error) {
    console.error('Credits balance error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
