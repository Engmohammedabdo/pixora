import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { deductCredits } from '@/lib/credits/deduct';
import { checkCredits } from '@/lib/credits/check';
import { generateText } from '@/lib/ai/router';
import { buildAnalysisPrompt, getMockAnalysis } from '@/lib/ai/prompts/analysis';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { rateLimit } from '@/lib/rate-limit';

const InputSchema = z.object({
  businessName: z.string().min(2).max(200),
  industry: z.string().min(2).max(100),
  description: z.string().min(10).max(2000),
  competitors: z.array(z.string().max(200)).max(5),
  targetMarket: z.string().min(5).max(500),
  painPoints: z.string().max(1000).optional().default(''),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    if (!rateLimit(`studio:${user.id}`, 20, 60000)) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    const body = await request.json();
    const input = InputSchema.parse(body);
    const creditCost = CREDIT_COSTS.analysis;

    const creditCheck = await checkCredits({ supabase, userId: user.id, amount: creditCost });
    if (!creditCheck.hasEnough) {
      return NextResponse.json({ success: false, error: 'insufficient_credits', required: creditCost, available: creditCheck.currentBalance }, { status: 402 });
    }

    const { data: generation } = await supabase.from('generations').insert({
      user_id: user.id, studio: 'analysis', model: 'gemini', input: { ...input }, credits_used: creditCost, status: 'processing',
    }).select().single();

    const prompt = buildAnalysisPrompt(input);
    const result = await generateText({ prompt, maxTokens: 8192 });

    let analysis: Record<string, unknown>;
    try {
      const jsonMatch = (result.text || '').match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : getMockAnalysis();
    } catch { analysis = getMockAnalysis(); }

    const deductResult = await deductCredits({ supabase, userId: user.id, amount: creditCost, studio: 'analysis', description: `Marketing Analysis - ${input.businessName}`, generationId: generation?.id });

    if (generation) {
      await supabase.from('generations').update({ output: { analysis, mock: result.mock }, status: 'completed' }).eq('id', generation.id);
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, analysis, mock: result.mock, creditsUsed: creditCost, newBalance: deductResult.newBalance } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    console.error('Analysis API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
