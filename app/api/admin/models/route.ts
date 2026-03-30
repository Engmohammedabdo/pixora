import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';
import { getModelConfig, setSetting } from '@/lib/admin/settings';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const config = await getModelConfig();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: genData } = await supabase
    .from('generations')
    .select('model, status')
    .gte('created_at', sevenDaysAgo);

  const models = ['gemini', 'gpt', 'flux'].map(model => {
    const modelGens = genData?.filter(g => g.model === model) || [];
    const total = modelGens.length;
    const completed = modelGens.filter(g => g.status === 'completed').length;
    const failed = modelGens.filter(g => g.status === 'failed').length;

    return {
      name: model,
      enabled: config.enabled.includes(model),
      fallbackPosition: config.fallback_order.indexOf(model) + 1,
      stats: {
        total,
        completed,
        failed,
        successRate: total > 0 ? ((completed / total) * 100).toFixed(1) : '100.0',
      },
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      models,
      fallbackOrder: config.fallback_order,
    },
  });
}

export async function PUT(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = await request.json();

  if (!body.enabled?.length) {
    return NextResponse.json(
      { success: false, error: 'At least one model must be enabled' },
      { status: 400 }
    );
  }

  const validModels = ['gemini', 'gpt', 'flux'];
  const enabled = (body.enabled as string[]).filter(m => validModels.includes(m));
  const fallbackOrder = (body.fallback_order as string[]).filter(m => validModels.includes(m));

  if (enabled.length === 0) {
    return NextResponse.json(
      { success: false, error: 'At least one model must be enabled' },
      { status: 400 }
    );
  }

  const config = { enabled, fallback_order: fallbackOrder.length > 0 ? fallbackOrder : enabled };
  const success = await setSetting('model_config', config);

  if (!success) {
    return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 });
  }

  await logAdminAction('model_config_update', 'setting', 'model_config', config, getClientIP(request));

  return NextResponse.json({ success: true });
}
