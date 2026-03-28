import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { deductCredits } from '@/lib/credits/deduct';
import { checkCredits } from '@/lib/credits/check';
import { generateImage } from '@/lib/ai/router';
import { buildPhotoshootPrompt } from '@/lib/ai/prompts/photoshoot';

const InputSchema = z.object({
  productImageUrl: z.string().min(1),
  environment: z.enum(['white_studio', 'lifestyle', 'nature', 'urban', 'luxury', 'festive']),
  shots: z.union([z.literal(1), z.literal(3), z.literal(6)]),
  notes: z.string().max(500).optional(),
  brandKitId: z.string().uuid().optional(),
});

const SHOT_COSTS: Record<number, number> = { 1: 2, 3: 4, 6: 8 };

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const input = InputSchema.parse(body);

    const creditCost = SHOT_COSTS[input.shots] || 8;

    const creditCheck = await checkCredits({ supabase, userId: user.id, amount: creditCost });
    if (!creditCheck.hasEnough) {
      return NextResponse.json(
        { success: false, error: 'insufficient_credits', required: creditCost, available: creditCheck.currentBalance },
        { status: 402 }
      );
    }

    // Fetch brand kit
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

    // Create generation record
    const { data: generation, error: genError } = await supabase
      .from('generations')
      .insert({
        user_id: user.id,
        studio: 'photoshoot',
        model: 'flux',
        input: { ...input },
        credits_used: creditCost,
        status: 'processing',
      })
      .select()
      .single();

    if (genError || !generation) {
      return NextResponse.json({ success: false, error: 'failed_to_create_generation' }, { status: 500 });
    }

    // Generate shots in parallel
    const shotPromises = Array.from({ length: input.shots }, (_, i) => {
      const prompt = buildPhotoshootPrompt({
        environment: input.environment,
        shotIndex: i,
        totalShots: input.shots,
        notes: input.notes,
        brandKit,
      });

      return generateImage({
        prompt,
        model: 'flux',
        resolution: '1080p',
      }).catch(() => null);
    });

    const results = await Promise.all(shotPromises);

    const shots = results.map((r, i) => ({
      index: i,
      url: r?.url || null,
      model: r?.model || 'flux',
      mock: r?.mock ?? true,
    }));

    // Deduct credits
    const deductResult = await deductCredits({
      supabase,
      userId: user.id,
      amount: creditCost,
      studio: 'photoshoot',
      description: `Photoshoot - ${input.shots} shots - ${input.environment}`,
      generationId: generation.id,
    });

    // Update generation
    await supabase
      .from('generations')
      .update({
        output: { shots, mock: shots.some((s) => s.mock) },
        status: 'completed',
      })
      .eq('id', generation.id);

    // Save assets
    const assetInserts = shots
      .filter((s) => s.url)
      .map((s) => ({
        user_id: user.id,
        generation_id: generation.id,
        type: 'image' as const,
        url: s.url!,
        format: 'png',
      }));

    if (assetInserts.length > 0) {
      await supabase.from('assets').insert(assetInserts);
    }

    return NextResponse.json({
      success: true,
      data: {
        generationId: generation.id,
        shots,
        creditsUsed: creditCost,
        newBalance: deductResult.newBalance,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    }
    console.error('Photoshoot API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
