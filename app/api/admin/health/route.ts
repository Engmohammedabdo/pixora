import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';

const STUDIOS = ['creator', 'photoshoot', 'campaign', 'plan', 'storyboard', 'analysis', 'voiceover', 'edit', 'prompt-builder'];
const MODELS = ['gemini', 'gpt', 'flux'];

// Estimated API cost per call (USD)
const MODEL_COSTS: Record<string, number> = {
  gemini: 0.002,
  gpt: 0.01,
  flux: 0.03,
};

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const url = new URL(request.url);
  const period = url.searchParams.get('period') || '7d';

  const periodMs = period === '24h' ? 86400000 : period === '30d' ? 30 * 86400000 : 7 * 86400000;
  const since = new Date(Date.now() - periodMs).toISOString();

  const { data: generations } = await supabase
    .from('generations')
    .select('studio, model, status, credits_used, error, created_at')
    .gte('created_at', since);

  const gens = generations || [];
  const totalGens = gens.length;
  const completedGens = gens.filter(g => g.status === 'completed').length;
  const failedGens = gens.filter(g => g.status === 'failed').length;
  const overallSuccessRate = totalGens > 0 ? ((completedGens / totalGens) * 100) : 100;
  const overallErrorRate = totalGens > 0 ? ((failedGens / totalGens) * 100) : 0;
  const totalCredits = gens.reduce((sum, g) => sum + ((g.credits_used as number) || 0), 0);

  // Per-studio metrics
  const studioMetrics = STUDIOS.map(studio => {
    const studioGens = gens.filter(g => g.studio === studio);
    const total = studioGens.length;
    const completed = studioGens.filter(g => g.status === 'completed').length;
    const failed = studioGens.filter(g => g.status === 'failed').length;
    const successRate = total > 0 ? ((completed / total) * 100) : 100;
    const credits = studioGens.reduce((sum, g) => sum + ((g.credits_used as number) || 0), 0);

    // Common errors for this studio
    const errors = studioGens
      .filter(g => g.error)
      .map(g => g.error as string);
    const errorCounts: Record<string, number> = {};
    errors.forEach(e => { errorCounts[e] = (errorCounts[e] || 0) + 1; });
    const topError = Object.entries(errorCounts).sort(([, a], [, b]) => b - a)[0];

    return {
      studio,
      total,
      completed,
      failed,
      successRate: parseFloat(successRate.toFixed(1)),
      credits,
      topError: topError ? { message: topError[0], count: topError[1] } : null,
    };
  });

  // Per-model metrics
  const modelMetrics = MODELS.map(model => {
    const modelGens = gens.filter(g => g.model === model);
    const total = modelGens.length;
    const completed = modelGens.filter(g => g.status === 'completed').length;
    const failed = modelGens.filter(g => g.status === 'failed').length;
    const successRate = total > 0 ? ((completed / total) * 100) : 100;

    // Estimate API cost
    const estimatedCost = total * (MODEL_COSTS[model] || 0.01);

    // Check if model was used as fallback (output contains usedFallback: true)
    // Approximation: we can't easily tell from DB, so estimate from generation patterns

    return {
      model,
      total,
      completed,
      failed,
      successRate: parseFloat(successRate.toFixed(1)),
      estimatedCost: parseFloat(estimatedCost.toFixed(2)),
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      period,
      overview: {
        totalGenerations: totalGens,
        completed: completedGens,
        failed: failedGens,
        successRate: parseFloat(overallSuccessRate.toFixed(1)),
        errorRate: parseFloat(overallErrorRate.toFixed(1)),
        totalCredits,
        estimatedApiCost: parseFloat(modelMetrics.reduce((sum, m) => sum + m.estimatedCost, 0).toFixed(2)),
      },
      studios: studioMetrics,
      models: modelMetrics,
    },
  });
}
