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
import { persistGeneratedImage, formatFromUrl, WatermarkRequiredError } from '@/lib/storage/persist-image';
import { PromptBlockedError } from '@/lib/ai/prompts/safety';
import { getPromptVersion } from '@/lib/ai/prompts/versions';
import type { AIModel } from '@/types/studios';
import { resolveProjectId } from '@/lib/projects/verify';
import { refundAwareErrorCode } from '@/lib/studio-errors';

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

    // Credits already returned to the user inside the try below. The catch
    // refunds the reservation, and refunding it WHOLE after a partial refund has
    // landed mints credits: refund_credits caps only the slice routed to the
    // purchased pool (supabase/migrations/033_refund_to_source_pool.sql:279) and
    // credits the full p_amount to the balance regardless (033:284-286). Nothing
    // between the partial-refund site and the end of the try throws today, but
    // the persist call used to swallow every failure and now does not, so this
    // stops being an accident of ordering. Declared out here because a `let`
    // inside the try is not in scope in the catch.
    let refundedSoFar = 0;

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
    // Tracks the balance actually left after any partial refund below. Stays at
    // the reservation's balance when no partial refund is needed.
    let balanceAfterPartialRefund = reserveResult.newBalance;

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

      // If ALL failed → full refund + error
      if (successCount === 0) {
        const refundResult = await refundCredits({
          userId: user.id, amount: totalCost,
          description: 'Full refund: all 4 variations failed',
          generationId: generation.id,
        });
        await supabase.from('generations').update({ status: 'failed', error: 'all_variations_failed' }).eq('id', generation.id);
        return NextResponse.json({
          success: false,
          error: refundAwareErrorCode(refundResult, 'All generation attempts failed. Credits refunded.'),
        }, { status: 500 });
      }

      // Persist BEFORE settling the cost, and count a variation we cannot store
      // as a failed variation.
      //
      // On a watermarked plan (free only, lib/stripe/plans.ts:27) uploadImage now
      // THROWS instead of handing back the clean original — see
      // lib/storage/persist-image.ts WatermarkRequiredError. Dropping just that
      // variation feeds it into the partial-refund path this branch already runs
      // for a variation the model never returned; from the customer's side the
      // two are the same event, one of four images is not deliverable. Letting
      // the throw reach the catch instead would take the three good, already
      // watermarked and uploaded images down with it AND refund `totalCost` on
      // top of the partial refund below.
      const uploadPromises = results.map((r, i) =>
        r
          ? uploadImage(r.url || '', i).catch((e: unknown) => {
              // Only the watermark verdict is a droppable image. Anything else is
              // a fault and belongs in the refunding catch below.
              if (!(e instanceof WatermarkRequiredError)) throw e;
              console.error(`[creator] variation ${i} dropped, watermark could not be burned in:`, e.message);
              return '';
            })
          : Promise.resolve('')
      );
      const urls = await Promise.all(uploadPromises);

      imageUrls = urls.filter((u) => u !== '');
      const failedCount = 4 - imageUrls.length;

      // Every variation that generated was then undeliverable — all four failed
      // the watermark. There is nothing to return, so this is a failure and the
      // whole reservation goes back; without this the partial refund below would
      // report `success: true` over an empty grid.
      if (imageUrls.length === 0) {
        const refundResult = await refundCredits({
          userId: user.id, amount: totalCost,
          description: 'Full refund: no variation could be stored',
          generationId: generation.id,
        });
        // Only mark it terminal once the credits are actually back. The
        // reconciler's scan window is `status IN ('pending','processing')`
        // (028_reconcile_orphaned_generations.sql:161), and after migration 038
        // it is the ONLY automated payout left — so writing 'failed' over a
        // refund that did not land takes the row out of reach of the one thing
        // that could still pay the customer, and the credits survive only in a
        // `[credits][OWED]` log line. Leaving it in 'processing' costs a delay
        // of at most one 15-minute tick and cannot double-pay: the reconciler
        // derives what it owes from the ledger (SUM(usage) - SUM(refund),
        // 028:169-176), so a refund that DID land leaves nothing owed.
        if (refundResult.success) {
          await supabase.from('generations').update({ status: 'failed', error: 'all_variations_failed' }).eq('id', generation.id);
        }
        return NextResponse.json({
          success: false,
          error: refundAwareErrorCode(refundResult, 'generation_failed'),
        }, { status: 500 });
      }

      // Partial refund for failed variations. Captured (not bare) so the
      // balance we report back reflects whether the refund actually landed —
      // mirrors photoshoot's analogous partial-refund site.
      if (failedCount > 0) {
        const refundAmount = failedCount * creditCost;
        const partialRefund = await refundCredits({
          userId: user.id, amount: refundAmount,
          description: `Partial refund: ${failedCount}/4 variations failed (${refundAmount} credits returned)`,
          generationId: generation.id,
        });
        if (partialRefund.success) {
          balanceAfterPartialRefund = partialRefund.newBalance;
          refundedSoFar += refundAmount;
        }
      }

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
        newBalance: balanceAfterPartialRefund,
      },
    });
    } catch (genError) {
      // Refund what is still outstanding, never the whole reservation again:
      // the 4-variation branch may already have returned part of it, and
      // refund_credits does not net a second payout against the first
      // (033_refund_to_source_pool.sql:284-286 credits p_amount unconditionally,
      // and only the purchased-pool slice is capped, 033:279). Refunding
      // `totalCost` here after a partial refund would mint credits on the free
      // tier — the same shape as the round-3 rewind defect in CLAUDE.md.
      const outstanding = totalCost - refundedSoFar;
      const refundResult: { success: boolean } = outstanding > 0
        ? await refundCredits({
            userId: user.id, amount: outstanding,
            description: `Refund: creator generation failed`,
            generationId: generation?.id,
          })
        : { success: true };
      if (generation) await supabase.from('generations').update({ status: 'failed', error: 'generation_failed' }).eq('id', generation.id);
      // PromptBlockedError carries its own dedicated response (400 + `term`),
      // handled by the outer catch below — don't clobber that with refund_failed.
      if (!refundResult.success && !(genError instanceof PromptBlockedError)) {
        console.error('Creator API error:', genError);
        return NextResponse.json({ success: false, error: 'refund_failed' }, { status: 500 });
      }
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
