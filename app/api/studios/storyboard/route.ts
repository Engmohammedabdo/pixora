import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { deductCredits } from '@/lib/credits/deduct';
import { checkCredits } from '@/lib/credits/check';
import { generateText } from '@/lib/ai/router';
import { buildStoryboardPrompt, getMockStoryboard } from '@/lib/ai/prompts/storyboard';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { checkRateLimit } from '@/lib/rate-limit';
import { PromptBlockedError } from '@/lib/ai/prompts/safety';

const InputSchema = z.object({
  concept: z.string().min(10).max(2000),
  duration: z.enum(['15', '30', '60']),
  style: z.string().min(1).max(100),
  platform: z.string().min(1).max(100),
  brandKitId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    if (!(await checkRateLimit(supabase, user.id))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    const body = await request.json();
    const input = InputSchema.parse(body);
    const creditCost = CREDIT_COSTS.storyboard;

    const creditCheck = await checkCredits({ supabase, userId: user.id, amount: creditCost });
    if (!creditCheck.hasEnough) {
      return NextResponse.json({ success: false, error: 'insufficient_credits', required: creditCost, available: creditCheck.currentBalance }, { status: 402 });
    }

    let brandKitName: string | undefined;
    if (input.brandKitId) {
      const { data: brandKit } = await supabase.from('brand_kits').select('name').eq('id', input.brandKitId).eq('user_id', user.id).single();
      brandKitName = brandKit?.name;
    }

    const { data: generation } = await supabase.from('generations').insert({
      user_id: user.id, studio: 'storyboard', model: 'gemini', input: { ...input, brandKitName }, credits_used: creditCost, status: 'processing',
    }).select().single();

    const prompt = buildStoryboardPrompt({ ...input, duration: parseInt(input.duration, 10), brandName: brandKitName });
    const result = await generateText({ prompt, maxTokens: 8192 });

    let scenes: Record<string, unknown>[];
    try {
      const jsonMatch = (result.text || '').match(/\[[\s\S]*\]/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : getMockStoryboard();
      scenes = Array.isArray(parsed) ? parsed : getMockStoryboard();
    } catch { scenes = getMockStoryboard(); }

    const deductResult = await deductCredits({ supabase, userId: user.id, amount: creditCost, studio: 'storyboard', description: `Storyboard - ${input.concept.substring(0, 50)}`, generationId: generation?.id });

    if (!deductResult.success) {
      return NextResponse.json(
        { success: false, error: 'credit_deduction_failed' },
        { status: 402 }
      );
    }

    if (generation) {
      await supabase.from('generations').update({ output: { scenes, mock: result.mock }, status: 'completed' }).eq('id', generation.id);
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, scenes, mock: result.mock, creditsUsed: creditCost, newBalance: deductResult.newBalance } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    if (error instanceof PromptBlockedError) {
      return NextResponse.json(
        { success: false, error: 'prompt_blocked', term: error.blockedTerm },
        { status: 400 }
      );
    }
    console.error('Storyboard API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
