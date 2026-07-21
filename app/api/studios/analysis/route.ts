import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { generateText } from '@/lib/ai/router';
import { buildAnalysisPrompt } from '@/lib/ai/prompts/analysis';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError } from '@/lib/ai/prompts/safety';
import { resolveProjectId } from '@/lib/projects/verify';
import { refundAwareErrorCode } from '@/lib/studio-errors';

const InputSchema = z.object({
  projectId: z.string().uuid().optional(),
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

    if (!(await checkRateLimit(supabase, user.id))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    const flags = await getCachedFeatureFlags();
    if (flags.maintenance_mode) {
      return NextResponse.json({ success: false, error: 'System is under maintenance' }, { status: 503 });
    }
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'analysis')) {
      return NextResponse.json({ success: false, error: 'This studio is currently disabled' }, { status: 403 });
    }

    const body = await request.json();
    const input = InputSchema.parse(body);

    // Never trust a client-supplied project id: verify it belongs to the caller
    // before filing work into it, or a user could write into another
    // customer's workspace.
    const projectId = await resolveProjectId(supabase, user.id, input.projectId);
    if (projectId === false) {
      return NextResponse.json({ success: false, error: 'project_not_found' }, { status: 404 });
    }
    const creditCost = CREDIT_COSTS.analysis;

    const { data: generation, error: genInsertError } = await supabase.from('generations').insert({
      user_id: user.id, project_id: projectId, studio: 'analysis', model: 'gemini', input: { ...input }, credits_used: creditCost, status: 'processing',
    }).select().single();

    // Fail loudly — otherwise credits are reserved and the model is called while
    // the generations row was never written, and the user is charged for nothing.
    if (genInsertError || !generation) {
      return NextResponse.json(
        { success: false, error: 'failed_to_create_generation' },
        { status: 500 }
      );
    }

    const reserveResult = await reserveCredits({
      userId: user.id, amount: creditCost,
      studio: 'analysis', description: `Marketing Analysis - ${input.businessName}`,
      generationId: generation?.id,
    });
    if (!reserveResult.success) {
      if (generation) await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      return NextResponse.json({ success: false, error: reserveResult.error === 'insufficient_credits' ? 'insufficient_credits' : 'credit_reservation_failed', required: creditCost }, { status: 402 });
    }

    let result: Awaited<ReturnType<typeof generateText>>;
    let analysis: Record<string, unknown>;
    try {
      const prompt = buildAnalysisPrompt(input);
      result = await generateText({ prompt, maxTokens: 8192 });

      // Unparseable output = failure + refund. The old fallback returned canned
      // text containing PyraSuite's OWN pricing page ("مبتدئ: $12/شهر") as if it
      // were an analysis of the customer's business — charged at full price.
      try {
        const jsonMatch = (result.text || '').match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('model returned no JSON object');
        analysis = JSON.parse(jsonMatch[0]);
      } catch {
        if (generation) {
          await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
        }
        const refundResult = await refundCredits({
          userId: user.id, amount: creditCost,
          description: 'Refund: analysis parse failure',
          generationId: generation?.id,
        });
        return NextResponse.json({
          success: false,
          error: refundAwareErrorCode(refundResult, 'generation_parse_failed'),
        }, { status: 500 });
      }
    } catch (genError) {
      const refundResult = await refundCredits({ userId: user.id, amount: creditCost, description: `Refund: analysis generation failed`, generationId: generation?.id });
      if (generation) await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      // PromptBlockedError carries its own dedicated response (400 + `term`),
      // handled by the outer catch below — don't clobber that with refund_failed.
      if (!refundResult.success && !(genError instanceof PromptBlockedError)) {
        console.error('Analysis API error:', genError);
        return NextResponse.json({ success: false, error: 'refund_failed' }, { status: 500 });
      }
      throw genError;
    }

    if (generation) {
      await supabase.from('generations').update({ output: { analysis, mock: result.mock }, status: 'completed' }).eq('id', generation.id);
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, analysis, mock: result.mock, creditsUsed: creditCost, newBalance: reserveResult.newBalance } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    if (error instanceof PromptBlockedError) {
      return NextResponse.json(
        { success: false, error: 'prompt_blocked', term: error.blockedTerm },
        { status: 400 }
      );
    }
    console.error('Analysis API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
