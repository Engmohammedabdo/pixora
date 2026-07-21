import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { generateImage } from '@/lib/ai/router';
import { buildCreatorPrompt } from '@/lib/ai/prompts/creator';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { getStudioConfig, isStudioEnabled, getEffectiveCost, getEffectivePrompt, getCachedFeatureFlags } from '@/lib/admin/settings';
import { getMaxResolution } from '@/lib/stripe/plans';
import { checkRateLimit } from '@/lib/rate-limit';
import { persistGeneratedImage, formatFromUrl } from '@/lib/storage/persist-image';
import { PromptBlockedError } from '@/lib/ai/prompts/safety';
import { getPromptVersion } from '@/lib/ai/prompts/versions';
import type { AIModel } from '@/types/studios';
import { resolveProjectId } from '@/lib/projects/verify';

const InputSchema = z.object({
  prompt: z.string().min(10).max(1000),
  model: z.enum(['gemini', 'gpt', 'flux']),
  projectId: z.string().uuid().optional(),
  resolution: z.enum(['1080p', '2K', '4K']),
  style: z.string().default('photographic'),
  variations: z.union([z.literal(1), z.literal(4)]).default(1),
  brandKitId: z.string().uuid().optional(),
  referenceImageUrl: z.string().url().optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    if (!(await checkRateLimit(supabase, user.id))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    // Check maintenance mode
    const flags = await getCachedFeatureFlags();
    if (flags.maintenance_mode) {
      return NextResponse.json(
        { success: false, error: 'maintenance_mode', message: 'Platform is under maintenance. Please try again later.' },
        { status: 503 }
      );
    }

    // Check if studio is enabled via admin settings
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'creator')) {
      return NextResponse.json({ success: false, error: 'studio_disabled' }, { status: 403 });
    }

    const body = await request.json();
    const input = InputSchema.parse(body);

    // Enforce resolution limit based on user's plan
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single();
    const maxRes = getMaxResolution(profile?.plan_id || 'free');
    const resOrder: string[] = ['1080p', '2K', '4K'];
    if (resOrder.indexOf(input.resolution) > resOrder.indexOf(maxRes)) {
      return NextResponse.json(
        { success: false, error: 'resolution_not_available', maxResolution: maxRes },
        { status: 403 }
      );
    }

    // Calculate credit cost (use admin override if set)
    const creditCost = getEffectiveCost(studioConfig, 'creator', input.resolution);
    const totalCost = creditCost * input.variations;

    // Never trust a client-supplied project id: verify it belongs to the caller
    // before filing work into it.
    const projectId = await resolveProjectId(supabase, user.id, input.projectId);
    if (projectId === false) {
      return NextResponse.json({ success: false, error: 'project_not_found' }, { status: 404 });
    }

    // Fetch brand kit if provided
    let brandKit = null;
    if (input.brandKitId) {
      const { data } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('id', input.brandKitId)
        .eq('user_id', user.id)
        .single();
      brandKit = data;
    }

    // Build prompt (check for admin override first)
    const promptOverride = await getEffectivePrompt('creator');
    const fullPrompt = promptOverride || buildCreatorPrompt({
      userPrompt: input.prompt,
      style: input.style,
      resolution: input.resolution,
      brandKit,
    });

    // Create generation record
    const { data: generation, error: genError } = await supabase
      .from('generations')
      .insert({
        user_id: user.id,
        studio: 'creator',
        model: input.model,
        // Verified above — this is the resolved id, never the raw client value.
        project_id: projectId,
        input: { ...input, fullPrompt },
        credits_used: totalCost,
        status: 'processing',
      })
      .select()
      .single();

    if (genError || !generation) {
      return NextResponse.json(
        { success: false, error: 'failed_to_create_generation' },
        { status: 500 }
      );
    }

    // Reserve credits (atomic check + deduct)
    const reserveResult = await reserveCredits({
      userId: user.id, amount: totalCost,
      studio: 'creator', description: `Image generation - ${input.resolution} x${input.variations}`,
      generationId: generation?.id,
    });
    if (!reserveResult.success) {
      if (generation) await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      return NextResponse.json({
        success: false,
        error: reserveResult.error === 'insufficient_credits' ? 'insufficient_credits' : 'credit_reservation_failed',
        required: totalCost,
      }, { status: 402 });
    }

    try {
    // Generate image(s)
    //
    // This used to be an inline copy of the persist logic that wrote to
    // `generations/<uid>/...`. The live storage policy is
    //   INSERT WITH CHECK (bucket_id = 'assets' AND (storage.foldername(name))[1] = uid()::text)
    // so segment 1 was the literal string 'generations' and every upload was
    // denied — the error was logged and the raw data: URL kept, which is why
    // creator has been writing megabytes of base64 into generations.output and
    // assets.url. The shared helper already has the correct uid-first layout.
    const planId = profile?.plan_id || 'free';
    const uploadImage = (url: string, index: number): Promise<string> =>
      persistGeneratedImage(supabase, url, {
        userId: user.id,
        generationId: generation.id,
        index,
        planId,
      });

    let imageUrls: string[];
    let hasMock = false;
    let hasUsedFallback = false;
    let resultModel = input.model;
    let resultOriginalModel: string | undefined;

    if (input.variations === 4) {
      // Generate 4 variations — track individual successes/failures
      const promises = Array.from({ length: 4 }, () =>
        generateImage({
          prompt: fullPrompt,
          model: input.model,
          resolution: input.resolution,
          referenceImageUrl: input.referenceImageUrl,
        }).catch(() => null)
      );

      const results = await Promise.all(promises);
      const successCount = results.filter((r) => r !== null).length;
      const failedCount = 4 - successCount;

      // If ALL failed → full refund + error
      if (successCount === 0) {
        await refundCredits({
          userId: user.id, amount: totalCost,
          description: 'Full refund: all 4 variations failed',
          generationId: generation.id,
        });
        await supabase.from('generations').update({ status: 'failed', error: 'all_variations_failed' }).eq('id', generation.id);
        return NextResponse.json({ success: false, error: 'All generation attempts failed. Credits refunded.' }, { status: 500 });
      }

      // Partial refund for failed variations
      if (failedCount > 0) {
        const refundAmount = failedCount * creditCost;
        await refundCredits({
          userId: user.id, amount: refundAmount,
          description: `Partial refund: ${failedCount}/4 variations failed (${refundAmount} credits returned)`,
          generationId: generation.id,
        });
      }

      const uploadPromises = results.map((r, i) =>
        r ? uploadImage(r.url || '', i) : Promise.resolve('')
      );
      const urls = await Promise.all(uploadPromises);

      imageUrls = urls.filter((u) => u !== '');
      hasMock = results.some((r) => r?.mock);
      hasUsedFallback = results.some((r) => r?.usedFallback);
      const firstResult = results.find((r) => r !== null);
      if (firstResult) {
        resultModel = firstResult.model as AIModel;
        resultOriginalModel = firstResult.originalModel;
      }
    } else {
      const result = await generateImage({
        prompt: fullPrompt,
        model: input.model,
        resolution: input.resolution,
        referenceImageUrl: input.referenceImageUrl,
      });

      const finalUrl = await uploadImage(result.url || '', 0);
      imageUrls = [finalUrl];
      hasMock = result.mock ?? false;
      hasUsedFallback = result.usedFallback ?? false;
      resultModel = result.model as AIModel;
      resultOriginalModel = result.originalModel;
    }

    // The free-plan watermark is burned in by uploadImage() above, before the
    // single storage upload — see lib/storage/persist-image.ts.

    // Update generation with result. `credits_used` MUST be rewritten here: it was
    // inserted as the full reservation, but failed variations are partially
    // refunded above — leaving the original figure makes the ledger disagree with
    // the credits the user actually kept, and every admin revenue number derived
    // from `generations.credits_used` overstates income.
    await supabase
      .from('generations')
      .update({
        output: { urls: imageUrls, mock: hasMock, usedFallback: hasUsedFallback },
        credits_used: imageUrls.length * creditCost,
        status: 'completed',
      })
      .eq('id', generation.id);

    // Save assets (one per successful image)
    const assetInserts = imageUrls
      .filter((u) => u)
      .map((url) => ({
        user_id: user.id,
        generation_id: generation.id,
        type: 'image' as const,
        url,
        format: formatFromUrl(url),
      }));

    if (assetInserts.length > 0) {
      await supabase.from('assets').insert(assetInserts);
    }

    return NextResponse.json({
      success: true,
      data: {
        generationId: generation.id,
        imageUrls,
        model: resultModel,
        mock: hasMock,
        usedFallback: hasUsedFallback,
        originalModel: resultOriginalModel,
        creditsUsed: imageUrls.length * creditCost,
        totalReserved: totalCost,
        refunded: (input.variations - imageUrls.length) * creditCost,
        newBalance: reserveResult.newBalance,
      },
    });
    } catch (genError) {
      await refundCredits({
        userId: user.id, amount: totalCost,
        description: `Refund: creator generation failed`,
        generationId: generation?.id,
      });
      if (generation) await supabase.from('generations').update({ status: 'failed', error: 'generation_failed' }).eq('id', generation.id);
      throw genError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'validation_error', details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof PromptBlockedError) {
      return NextResponse.json(
        { success: false, error: 'prompt_blocked', term: error.blockedTerm },
        { status: 400 }
      );
    }
    console.error('Creator API error:', error);
    return NextResponse.json(
      { success: false, error: 'generation_failed' },
      { status: 500 }
    );
  }
}
