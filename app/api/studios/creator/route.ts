import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { deductCredits } from '@/lib/credits/deduct';
import { checkCredits } from '@/lib/credits/check';
import { generateImage } from '@/lib/ai/router';
import { buildCreatorPrompt } from '@/lib/ai/prompts/creator';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { getMaxResolution } from '@/lib/stripe/plans';
import { rateLimit } from '@/lib/rate-limit';

const InputSchema = z.object({
  prompt: z.string().min(10).max(1000),
  model: z.enum(['gemini', 'gpt', 'flux']),
  resolution: z.enum(['1080p', '2K', '4K']),
  style: z.string().default('photographic'),
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

    if (!rateLimit(`studio:${user.id}`, 20, 60000)) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
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

    // Calculate credit cost
    const creditCost = CREDIT_COSTS.image[input.resolution];

    // Check credits
    const creditCheck = await checkCredits({
      supabase,
      userId: user.id,
      amount: creditCost,
    });

    if (!creditCheck.hasEnough) {
      return NextResponse.json(
        {
          success: false,
          error: 'insufficient_credits',
          required: creditCost,
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

    // Build prompt
    const fullPrompt = buildCreatorPrompt({
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
        credits_used: creditCost,
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

    // Generate image
    const result = await generateImage({
      prompt: fullPrompt,
      model: input.model,
      resolution: input.resolution,
      referenceImageUrl: input.referenceImageUrl,
    });

    // Upload base64 image to Supabase Storage if not a URL
    let finalUrl = result.url || '';
    if (finalUrl.startsWith('data:')) {
      try {
        const matches = finalUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const mimeType = matches[1];
          const base64Data = matches[2];
          const ext = mimeType.includes('png') ? 'png' : 'jpg';
          const fileName = `generations/${user.id}/${generation.id}.${ext}`;
          const buffer = Buffer.from(base64Data, 'base64');

          const { error: uploadError } = await supabase.storage
            .from('assets')
            .upload(fileName, buffer, { contentType: mimeType, upsert: true });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('assets').getPublicUrl(fileName);
            finalUrl = urlData.publicUrl;
          } else {
            console.error('Upload error:', uploadError.message);
            // Keep base64 as fallback
          }
        }
      } catch (uploadErr) {
        console.error('Failed to upload to storage:', uploadErr);
        // Keep base64 as fallback
      }
    }

    // Deduct credits
    const deductResult = await deductCredits({
      supabase,
      userId: user.id,
      amount: creditCost,
      studio: 'creator',
      description: `Image generation - ${input.resolution}`,
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
        output: { url: finalUrl, mock: result.mock },
        status: 'completed',
      })
      .eq('id', generation.id);

    // Save asset
    await supabase.from('assets').insert({
      user_id: user.id,
      generation_id: generation.id,
      type: 'image',
      url: finalUrl,
      format: 'png',
    });

    return NextResponse.json({
      success: true,
      data: {
        generationId: generation.id,
        imageUrl: finalUrl,
        model: result.model,
        mock: result.mock,
        usedFallback: result.usedFallback,
        originalModel: result.originalModel,
        creditsUsed: creditCost,
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
    console.error('Creator API error:', error);
    return NextResponse.json(
      { success: false, error: 'generation_failed' },
      { status: 500 }
    );
  }
}
