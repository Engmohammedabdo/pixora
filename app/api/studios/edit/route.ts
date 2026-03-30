import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { checkCredits } from '@/lib/credits/check';
import { deductCredits } from '@/lib/credits/deduct';
import { generateImage } from '@/lib/ai/router';
import { maybeWatermark } from '@/lib/image/watermark';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError } from '@/lib/ai/prompts/safety';

const InputSchema = z.object({
  imageUrl: z.string().min(1),
  editDescription: z.string().min(5).max(500),
  editType: z.enum(['background_replace', 'object_remove', 'color_change', 'text_add', 'style_transfer']),
});

const CREDIT_COST = 1;

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    if (!(await checkRateLimit(supabase, user.id))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    const flags = await getCachedFeatureFlags();
    if (flags.maintenance_mode) {
      return NextResponse.json({ success: false, error: 'System is under maintenance' }, { status: 503 });
    }
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'edit')) {
      return NextResponse.json({ success: false, error: 'This studio is currently disabled' }, { status: 403 });
    }

    const body = await req.json();
    const input = InputSchema.parse(body);

    const creditCheck = await checkCredits({ supabase, userId: user.id, amount: CREDIT_COST });
    if (!creditCheck.hasEnough) {
      return NextResponse.json({ success: false, error: 'insufficient_credits', required: CREDIT_COST }, { status: 402 });
    }

    const { data: generation } = await supabase.from('generations').insert({
      user_id: user.id, studio: 'edit', model: 'gpt', status: 'processing',
      input: { imageUrl: input.imageUrl, editDescription: input.editDescription, editType: input.editType },
      credits_used: CREDIT_COST,
    }).select().single();

    const prompt = `Image editing - ${input.editType.replace(/_/g, ' ')}: ${input.editDescription}`;
    const result = await generateImage({ prompt, model: 'gpt', resolution: '1080p', referenceImageUrl: input.imageUrl });

    // Apply watermark for free plan users
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single();
    const planId = profile?.plan_id || 'free';
    result.url = (await maybeWatermark(result.url, planId)) || result.url;

    const deductResult = await deductCredits({ supabase, userId: user.id, amount: CREDIT_COST, studio: 'edit', description: `Image edit - ${input.editType}`, generationId: generation?.id });

    if (!deductResult.success) {
      return NextResponse.json(
        { success: false, error: 'credit_deduction_failed' },
        { status: 402 }
      );
    }

    if (generation) {
      await supabase.from('generations').update({ status: 'completed', output: { imageUrl: result.url, mock: result.mock } }).eq('id', generation.id);
      await supabase.from('assets').insert({ user_id: user.id, generation_id: generation.id, type: 'image', url: result.url || '' });
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, imageUrl: result.url, mock: result.mock, creditsUsed: CREDIT_COST, newBalance: deductResult.newBalance } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    if (error instanceof PromptBlockedError) {
      return NextResponse.json(
        { success: false, error: 'prompt_blocked', term: error.blockedTerm },
        { status: 400 }
      );
    }
    console.error('Edit API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
