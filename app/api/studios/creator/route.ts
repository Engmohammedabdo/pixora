import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { deductCredits } from '@/lib/credits/deduct';
import { checkCredits } from '@/lib/credits/check';
import { generateImage } from '@/lib/ai/router';
import { buildCreatorPrompt } from '@/lib/ai/prompts/creator';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { getStudioConfig, isStudioEnabled, getEffectiveCost, getEffectivePrompt, getCachedFeatureFlags } from '@/lib/admin/settings';
import { getMaxResolution } from '@/lib/stripe/plans';
import { checkRateLimit } from '@/lib/rate-limit';
import { maybeWatermark } from '@/lib/image/watermark';
import { PromptBlockedError } from '@/lib/ai/prompts/safety';
import { getPromptVersion } from '@/lib/ai/prompts/versions';
import type { AIModel } from '@/types/studios';

const InputSchema = z.object({
  prompt: z.string().min(10).max(1000),
  model: z.enum(['gemini', 'gpt', 'flux']),
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

    // Check credits
    const creditCheck = await checkCredits({
      supabase,
      userId: user.id,
      amount: totalCost,
    });

    if (!creditCheck.hasEnough) {
      return NextResponse.json(
        {
          success: false,
          error: 'insufficient_credits',
          required: totalCost,
          available: creditCheck.currentBalance,
        },
        { status: 402 }
      );
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

    // Generate image(s)
    const uploadImage = async (url: string, index: number): Promise<string> => {
      let finalUrl = url;
      if (finalUrl.startsWith('data:')) {
        try {
          const matches = finalUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            const mimeType = matches[1];
            const base64Data = matches[2];
            const ext = mimeType.includes('png') ? 'png' : 'jpg';
            const fileName = `generations/${user.id}/${generation.id}-${index}.${ext}`;
            const buffer = Buffer.from(base64Data, 'base64');

            const { error: uploadError } = await supabase.storage
              .from('assets')
              .upload(fileName, buffer, { contentType: mimeType, upsert: true });

            if (!uploadError) {
              const { data: urlData } = supabase.storage.from('assets').getPublicUrl(fileName);
              finalUrl = urlData.publicUrl;
            } else {
              console.error('Upload error:', uploadError.message);
            }
          }
        } catch (uploadErr) {
          console.error('Failed to upload to storage:', uploadErr);
        }
      }
      return finalUrl;
    };

    let imageUrls: string[];
    let hasMock = false;
    let hasUsedFallback = false;
    let resultModel = input.model;
    let resultOriginalModel: string | undefined;

    if (input.variations === 4) {
      const promises = Array.from({ length: 4 }, () =>
        generateImage({
          prompt: fullPrompt,
          model: input.model,
          resolution: input.resolution,
          referenceImageUrl: input.referenceImageUrl,
        }).catch(() => null)
      );

      const results = await Promise.all(promises);
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

    // Apply watermark for free plan users
    const planId = profile?.plan_id || 'free';
    imageUrls = await Promise.all(
      imageUrls.map((url) => maybeWatermark(url, planId).then((u) => u || url))
    );

    // Deduct credits
    const deductResult = await deductCredits({
      supabase,
      userId: user.id,
      amount: totalCost,
      studio: 'creator',
      description: `Image generation - ${input.resolution} x${input.variations}`,
      generationId: generation.id,
    });

    if (!deductResult.success) {
      return NextResponse.json(
        { success: false, error: 'credit_deduction_failed' },
        { status: 402 }
      );
    }

    // Update generation with result
    await supabase
      .from('generations')
      .update({
        output: { urls: imageUrls, mock: hasMock, usedFallback: hasUsedFallback },
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
        format: 'png',
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
        creditsUsed: totalCost,
        newBalance: deductResult.newBalance,
      },
    });
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
