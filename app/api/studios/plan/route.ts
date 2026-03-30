import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { generateText } from '@/lib/ai/router';
import { buildPlanPrompt, getMockPlan } from '@/lib/ai/prompts/plan';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError } from '@/lib/ai/prompts/safety';

const InputSchema = z.object({
  businessName: z.string().min(2).max(200),
  industry: z.string().min(2).max(100),
  goals: z.array(z.string().max(200)).min(1).max(10),
  targetMarket: z.string().min(5).max(500),
  budget: z.string().min(1).max(200),
  duration: z.enum(['30', '60', '90']),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    if (!(await checkRateLimit(supabase, user.id))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    const flags = await getCachedFeatureFlags();
    if (flags.maintenance_mode) {
      return NextResponse.json({ success: false, error: 'System is under maintenance' }, { status: 503 });
    }
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'plan')) {
      return NextResponse.json({ success: false, error: 'This studio is currently disabled' }, { status: 403 });
    }

    const body = await request.json();
    const input = InputSchema.parse(body);
    const creditCost = CREDIT_COSTS.plan;

    const { data: generation } = await supabase.from('generations').insert({
      user_id: user.id, studio: 'plan', model: 'gemini', input: { ...input }, credits_used: creditCost, status: 'processing',
    }).select().single();

    // Reserve credits (atomic check + deduct)
    const reserveResult = await reserveCredits({
      supabase, userId: user.id, amount: creditCost,
      studio: 'plan', description: `Marketing Plan - ${input.businessName}`,
      generationId: generation?.id,
    });
    if (!reserveResult.success) {
      if (generation) await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      return NextResponse.json({
        success: false,
        error: reserveResult.error === 'insufficient_credits' ? 'insufficient_credits' : 'credit_reservation_failed',
        required: creditCost,
      }, { status: 402 });
    }

    try {
    const prompt = buildPlanPrompt({ ...input, duration: parseInt(input.duration, 10) });
    const result = await generateText({ prompt, maxTokens: 8192 });

    let plan: Record<string, unknown>;
    try {
      const jsonMatch = (result.text || '').match(/\{[\s\S]*\}/);
      plan = jsonMatch ? JSON.parse(jsonMatch[0]) : getMockPlan();
    } catch { plan = getMockPlan(); }

    if (generation) {
      await supabase.from('generations').update({ output: { plan, mock: result.mock }, status: 'completed' }).eq('id', generation.id);
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, plan, mock: result.mock, creditsUsed: creditCost, newBalance: reserveResult.newBalance } });
    } catch (genError) {
      await refundCredits({
        supabase, userId: user.id, amount: creditCost,
        description: `Refund: plan generation failed`,
        generationId: generation?.id,
      });
      if (generation) await supabase.from('generations').update({ status: 'failed', error: 'generation_failed' }).eq('id', generation.id);
      throw genError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    if (error instanceof PromptBlockedError) {
      return NextResponse.json(
        { success: false, error: 'prompt_blocked', term: error.blockedTerm },
        { status: 400 }
      );
    }
    console.error('Plan API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
