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

  if (!amount || typeof amount !== 'number' || !Number.isInteger(amount)) {
    return NextResponse.json({ success: false, error: 'Amount required (integer)' }, { status: 400 });
  }
  if (!reason?.trim()) {
    return NextResponse.json({ success: false, error: 'Reason required' }, { status: 400 });
  }

  // Atomic update: use conditional update to prevent race conditions
  // First get current balance for validation
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits_balance')
    .eq('id', id)
    .single();

  if (!profile) {
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
  }

  const expectedNewBalance = profile.credits_balance + amount;
  if (expectedNewBalance < 0) {
    return NextResponse.json({ success: false, error: 'Would result in negative balance' }, { status: 400 });
  }

  // Atomic conditional update: only succeeds if balance hasn't changed since read
  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({ credits_balance: expectedNewBalance })
    .eq('id', id)
    .eq('credits_balance', profile.credits_balance) // Optimistic concurrency check
    .select('credits_balance')
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { success: false, error: 'Balance changed concurrently. Please retry.' },
      { status: 409 }
    );
  }

  const newBalance = updated.credits_balance;

  // Log transaction — if this fails, balance is already updated but we log the error
  const { error: txError } = await supabase.from('credit_transactions').insert({
    user_id: id,
    amount,
    type: 'admin_adjustment',
    description: `[Admin ${amount > 0 ? 'Add' : 'Deduct'}] ${reason}`,
    balance_after: newBalance,
  });

  if (txError) {
    // Balance was updated but transaction log failed — log this critical issue
    console.error('[CRITICAL] Credit transaction log failed after balance update:', txError);
    await logAdminAction('credit_adjustment_tx_log_failed', 'user', id, { amount, reason, newBalance, error: txError.message }, getClientIP(request));
  }

  await logAdminAction('credit_adjustment', 'user', id, { amount, reason, newBalance }, getClientIP(request));

  return NextResponse.json({ success: true, data: { newBalance } });
}
