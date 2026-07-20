import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { generateImage } from '@/lib/ai/router';
import { watermarkAndReupload } from '@/lib/image/watermark';
import { persistGeneratedImage } from '@/lib/storage/persist-image';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError } from '@/lib/ai/prompts/safety';
import { resolveProjectId } from '@/lib/projects/verify';

const InputSchema = z.object({
  projectId: z.string().uuid().optional(),
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

    // Never trust a client-supplied project id: verify it belongs to the caller
    // before filing work into it, or a user could write into another
    // customer's workspace.
    const projectId = await resolveProjectId(supabase, user.id, input.projectId);
    if (projectId === false) {
      return NextResponse.json({ success: false, error: 'project_not_found' }, { status: 404 });
    }

    const { data: generation, error: genInsertError } = await supabase.from('generations').insert({
      user_id: user.id, project_id: projectId, studio: 'edit', model: 'gemini', status: 'processing',
      input: { imageUrl: input.imageUrl, editDescription: input.editDescription, editType: input.editType },
      credits_used: CREDIT_COST,
    }).select().single();

    // Fail loudly. Without this the request continues, reserves credits, calls the
    // model and returns 200 — while the generations row (and therefore the asset)
    // was never written. The user pays and receives nothing.
    if (genInsertError || !generation) {
      return NextResponse.json(
        { success: false, error: 'failed_to_create_generation' },
        { status: 500 }
      );
    }

    const reserveResult = await reserveCredits({
      userId: user.id, amount: CREDIT_COST,
      studio: 'edit', description: `Image edit - ${input.editType}`,
      generationId: generation?.id,
    });
    if (!reserveResult.success) {
      if (generation) await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      return NextResponse.json({ success: false, error: reserveResult.error === 'insufficient_credits' ? 'insufficient_credits' : 'credit_reservation_failed', required: CREDIT_COST }, { status: 402 });
    }

    let result: Awaited<ReturnType<typeof generateImage>>;
    try {
      const prompt = `Image editing - ${input.editType.replace(/_/g, ' ')}: ${input.editDescription}`;
      // 'gemini', not 'gpt': lib/ai/router.ts forwards `referenceImageUrl` only in
      // the gemini branch. With 'gpt' the image to edit never reached the model, so
      // "edit this photo" generated an unrelated picture from the instruction alone.
      result = await generateImage({ prompt, model: 'gemini', resolution: '1080p', referenceImageUrl: input.imageUrl });

      // Apply watermark for free plan users
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan_id')
        .eq('id', user.id)
        .single();
      const planId = profile?.plan_id || 'free';
      if (result.url) {
        // Store first — Gemini returns a data: URL, which watermarkAndReupload()
        // skips, dropping the free-plan watermark and writing the whole image
        // into generations.output and assets.url.
        const stored = await persistGeneratedImage(supabase, result.url, {
          userId: user.id, generationId: generation.id,
        });
        result.url = await watermarkAndReupload(stored, planId, supabase);
      }
    } catch (genError) {
      await refundCredits({ userId: user.id, amount: CREDIT_COST, description: `Refund: edit generation failed`, generationId: generation?.id });
      if (generation) await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      throw genError;
    }

    if (generation) {
      await supabase.from('generations').update({ status: 'completed', output: { imageUrl: result.url, mock: result.mock } }).eq('id', generation.id);
      await supabase.from('assets').insert({ user_id: user.id, generation_id: generation.id, type: 'image', url: result.url || '' });
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, imageUrl: result.url, mock: result.mock, creditsUsed: CREDIT_COST, newBalance: reserveResult.newBalance } });
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
