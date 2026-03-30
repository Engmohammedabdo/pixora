import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  let body: { amount?: number; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }

  const { amount, reason } = body;

  if (!amount || typeof amount !== 'number') {
    return NextResponse.json({ success: false, error: 'Amount required (number)' }, { status: 400 });
  }
  if (!reason?.trim()) {
    return NextResponse.json({ success: false, error: 'Reason required' }, { status: 400 });
  }

  // Get current balance
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits_balance')
    .eq('id', id)
    .single();

  if (!profile) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  const newBalance = profile.credits_balance + amount;
  if (newBalance < 0) {
    return NextResponse.json({ success: false, error: 'Would result in negative balance' }, { status: 400 });
  }

  // Update balance
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ credits_balance: newBalance })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
  }

  // Log transaction
  await supabase.from('credit_transactions').insert({
    user_id: id,
    amount,
    type: 'admin_adjustment',
    description: `[Admin ${amount > 0 ? 'Add' : 'Deduct'}] ${reason}`,
    balance_after: newBalance,
  });

  // Log admin action
  await logAdminAction('credit_adjustment', 'user', id, { amount, reason, newBalance }, getClientIP(request));

  return NextResponse.json({ success: true, data: { newBalance } });
}
