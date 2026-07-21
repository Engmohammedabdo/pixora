import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { generateImage } from '@/lib/ai/router';
import { buildPhotoshootPrompt } from '@/lib/ai/prompts/photoshoot';
import { persistGeneratedImage, formatFromUrl } from '@/lib/storage/persist-image';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError } from '@/lib/ai/prompts/safety';
import { resolveProjectId } from '@/lib/projects/verify';
import { refundAwareErrorCode } from '@/lib/studio-errors';

const InputSchema = z.object({
  projectId: z.string().uuid().optional(),
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

    if (!(await checkRateLimit(supabase, user.id))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    // Check maintenance mode
    const flags = await getCachedFeatureFlags();
    if (flags.maintenance_mode) {
      return NextResponse.json({ success: false, error: 'System is under maintenance' }, { status: 503 });
    }
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'photoshoot')) {
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

    const creditCost = SHOT_COSTS[input.shots] || 8;

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
        user_id: user.id, project_id: projectId,
        studio: 'photoshoot',
        model: 'gemini',
        input: { ...input },
        credits_used: creditCost,
        status: 'processing',
      })
      .select()
      .single();

    if (genError || !generation) {
      return NextResponse.json({ success: false, error: 'failed_to_create_generation' }, { status: 500 });
    }

    // Reserve credits (atomic check + deduct)
    const reserveResult = await reserveCredits({
      userId: user.id, amount: creditCost,
      studio: 'photoshoot', description: `Photoshoot - ${input.shots} shots - ${input.environment}`,
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
    // Generate shots in parallel
    const shotPromises = Array.from({ length: input.shots }, (_, i) => {
      const prompt = buildPhotoshootPrompt({
        environment: input.environment,
        shotIndex: i,
        totalShots: input.shots,
        notes: input.notes,
        brandKit,
        // Varies lighting, grade and shot order between runs. The generation id
        // is per-run but fixed within it, so the six shots stay one coherent set
        // and any single shot can be rebuilt byte-for-byte when a user reports it.
        seed: generation.id,
      });

      // MUST be a model the router forwards `referenceImageUrl` to. lib/ai/router.ts
      // only passes it in the 'gemini' branch — with 'flux' the customer's product
      // photo was silently dropped, so this studio invented a random product while
      // the prompt asked for "EXACT product preservation" of an image it never saw.
      return generateImage({
        prompt,
        model: 'gemini',
        resolution: '1080p',
        referenceImageUrl: input.productImageUrl,
      }).catch(() => null);
    });

    const results = await Promise.all(shotPromises);

    const successfulShots = results.filter(r => r !== null).length;

    // Each shot is generated with `.catch(() => null)`, so a provider failure never
    // reaches the outer catch block that refunds. Without the two branches below,
    // all six shots could fail and the user was still charged the full reservation
    // and shown a "successful" grid of empty frames.
    if (successfulShots === 0) {
      if (generation) {
        await supabase.from('generations').update({ status: 'failed', error: 'all_shots_failed' }).eq('id', generation.id);
      }
      const refundResult = await refundCredits({
        userId: user.id, amount: creditCost,
        description: 'Refund: all photoshoot shots failed',
        generationId: generation?.id,
      });
      return NextResponse.json({
        success: false,
        error: refundAwareErrorCode(refundResult, 'generation_failed'),
      }, { status: 500 });
    }

    const actualCost = Math.max(1, Math.ceil((creditCost / input.shots) * successfulShots));

    // Partial failure: return the credits for the shots that never arrived.
    let balanceAfter = reserveResult.newBalance;
    if (actualCost < creditCost) {
      const partial = await refundCredits({
        userId: user.id, amount: creditCost - actualCost,
        description: `Refund: ${input.shots - successfulShots} of ${input.shots} photoshoot shots failed`,
        generationId: generation?.id,
      });
      if (partial.success) balanceAfter = partial.newBalance;
    }

    // Fetch user plan for watermark check
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single();
    const planId = profile?.plan_id || 'free';

    // Pyra returns images as data: URLs. persistGeneratedImage watermarks the
    // buffer and uploads it once — a second pass to watermark in place would
    // need an UPDATE on storage.objects that `authenticated` does not hold.
    const shots = await Promise.all(
      results.map(async (r, i) => {
        if (!r?.url) {
          return { index: i, url: null, model: r?.model || 'gemini', mock: r?.mock ?? true };
        }
        return {
          index: i,
          url: await persistGeneratedImage(supabase, r.url, {
            userId: user.id, generationId: generation.id, index: i, planId,
          }),
          model: r.model || 'gemini',
          mock: r.mock ?? true,
        };
      })
    );

    // Update generation with actual cost
    await supabase
      .from('generations')
      .update({
        output: { shots, mock: shots.some((s) => s.mock) },
        credits_used: actualCost,
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
        format: formatFromUrl(s.url!),
      }));

    if (assetInserts.length > 0) {
      await supabase.from('assets').insert(assetInserts);
    }

    return NextResponse.json({
      success: true,
      data: {
        generationId: generation.id,
        shots,
        creditsUsed: actualCost,
        newBalance: balanceAfter,
      },
    });
    } catch (genError) {
      const refundResult = await refundCredits({
        userId: user.id, amount: creditCost,
        description: `Refund: photoshoot generation failed`,
        generationId: generation?.id,
      });
      if (generation) await supabase.from('generations').update({ status: 'failed', error: 'generation_failed' }).eq('id', generation.id);
      // PromptBlockedError carries its own dedicated response (400 + `term`),
      // handled by the outer catch below — don't clobber that with refund_failed.
      if (!refundResult.success && !(genError instanceof PromptBlockedError)) {
        console.error('Photoshoot API error:', genError);
        return NextResponse.json({ success: false, error: 'refund_failed' }, { status: 500 });
      }
      throw genError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    }
    if (error instanceof PromptBlockedError) {
      return NextResponse.json(
        { success: false, error: 'prompt_blocked', term: error.blockedTerm },
        { status: 400 }
      );
    }
    console.error('Photoshoot API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
