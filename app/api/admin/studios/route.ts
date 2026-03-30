import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';
import { getStudioConfig, isStudioEnabled, setSetting } from '@/lib/admin/settings';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';

const STUDIOS = [
  { name: 'creator', icon: '🎨', defaultCosts: { '1080p': 1, '2K': 2, '4K': 4 } },
  { name: 'photoshoot', icon: '📸', defaultCosts: { default: 8 } },
  { name: 'campaign', icon: '📋', defaultCosts: { default: 12 } },
  { name: 'plan', icon: '🗺️', defaultCosts: { default: 5 } },
  { name: 'storyboard', icon: '🎬', defaultCosts: { default: 14 } },
  { name: 'analysis', icon: '📊', defaultCosts: { default: 3 } },
  { name: 'voiceover', icon: '🎙️', defaultCosts: { default: 1 } },
  { name: 'edit', icon: '✏️', defaultCosts: { default: 1 } },
  { name: 'prompt-builder', icon: '💡', defaultCosts: { default: 0 } },
];

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const config = await getStudioConfig();

  const todayStr = new Date().toISOString().split('T')[0];

  const [{ data: allGens }, { data: todayGens }] = await Promise.all([
    supabase.from('generations').select('studio'),
    supabase.from('generations').select('studio').gte('created_at', todayStr + 'T00:00:00Z'),
  ]);

  const result = STUDIOS.map(s => ({
    ...s,
    enabled: isStudioEnabled(config, s.name),
    costs: config[s.name]?.costs || s.defaultCosts,
    totalGenerations: allGens?.filter(g => g.studio === s.name).length || 0,
    todayGenerations: todayGens?.filter(g => g.studio === s.name).length || 0,
  }));

  return NextResponse.json({ success: true, data: result });
}

export async function PUT(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const success = await setSetting('studio_config', body);

  if (!success) {
    return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 });
  }

  await logAdminAction('studio_config_update', 'setting', 'studio_config', body, getClientIP(request));

  return NextResponse.json({ success: true });
}
