import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';
import { calculateEngagementScore } from '@/lib/admin/engagement';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);

  // Fetch events from multiple sources in parallel
  const [{ data: generations }, { data: transactions }, { data: subEvents }] = await Promise.all([
    supabase.from('generations')
      .select('id, studio, model, status, credits_used, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('credit_transactions')
      .select('id, amount, type, description, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('subscription_events')
      .select('id, event_type, from_plan, to_plan, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  // Unify into timeline events
  interface TimelineEvent {
    id: string;
    type: string;
    icon: string;
    title: string;
    description: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }

  const events: TimelineEvent[] = [];

  for (const g of (generations || [])) {
    events.push({
      id: g.id,
      type: 'generation',
      icon: g.status === 'completed' ? '🎨' : g.status === 'failed' ? '❌' : '⏳',
      title: `${g.studio} generation`,
      description: `Model: ${g.model} | Credits: ${g.credits_used} | Status: ${g.status}`,
      metadata: { studio: g.studio, model: g.model, status: g.status, credits: g.credits_used },
      created_at: g.created_at,
    });
  }

  for (const t of (transactions || [])) {
    const isPositive = (t.amount as number) > 0;
    events.push({
      id: t.id,
      type: 'transaction',
      icon: isPositive ? '💰' : '💳',
      title: `${t.type}: ${isPositive ? '+' : ''}${t.amount} credits`,
      description: (t.description as string) || '',
      metadata: { amount: t.amount, type: t.type },
      created_at: t.created_at,
    });
  }

  for (const s of (subEvents || [])) {
    const icons: Record<string, string> = {
      subscribe: '🎉', upgrade: '⬆️', downgrade: '⬇️', cancel: '🚪', renew: '🔄',
    };
    events.push({
      id: s.id,
      type: 'subscription',
      icon: icons[s.event_type as string] || '📋',
      title: `${s.event_type}`,
      description: s.from_plan ? `${s.from_plan} → ${s.to_plan}` : `→ ${s.to_plan}`,
      metadata: { event_type: s.event_type, from_plan: s.from_plan, to_plan: s.to_plan },
      created_at: s.created_at,
    });
  }

  // Sort by created_at DESC
  events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Paginate
  const total = events.length;
  const offset = (page - 1) * limit;
  const paginatedEvents = events.slice(offset, offset + limit);

  // Calculate engagement score
  const engagement = await calculateEngagementScore(id);

  return NextResponse.json({
    success: true,
    data: {
      events: paginatedEvents,
      engagement,
      pagination: { page, limit, total },
    },
  });
}
