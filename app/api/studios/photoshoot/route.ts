import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { getMaxResolution } from '@/lib/stripe/plans';
import { inputImageRef, readableImageUrl } from '@/lib/storage/reference-image';
import { createServerClient } from '@/lib/supabase/server';
import { failGeneration, finalizeGeneration, insertAssets } from '@/lib/supabase/generation-writes';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { settleCharge } from '@/lib/credits/settle';
import { generateImage } from '@/lib/ai/router';
import { PHOTOSHOOT_PROMPT_VERSION, buildPhotoshootPrompt } from '@/lib/ai/prompts/photoshoot';
import { persistGeneratedImage, formatFromUrl, WatermarkRequiredError } from '@/lib/storage/persist-image';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
import { resolveProjectId } from '@/lib/projects/verify';
import { refundAwareErrorCode } from '@/lib/studio-errors';

const InputSchema = z.object({
  projectId: z.string().uuid().optional(),
  productImageUrl: readableImageUrl,
  environment: z.enum(['white_studio', 'food', 'lifestyle', 'nature', 'urban', 'luxury', 'festive']),
  shots: z.union([z.literal(1), z.literal(3), z.literal(6)]),
  notes: z.string().max(500).optional(),
  brandKitId: z.string().uuid().optional(),
});

const SHOT_COSTS: Record<number, number> = { 1: 2, 3: 4, 6: 8 };

/** One frame of the set. `url` is null when the shot never arrived from the
 *  model, or arrived and could not be watermarked — either way the customer does
 *  not receive it, and the partial refund below pays for it. */
type PhotoshootShot = {
  index: number;
  url: string | null;
  model: string;
  mock: boolean;
};

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
      return NextResponse.json({ success: false, error: 'maintenance_mode' }, { status: 503 });
    }
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'photoshoot')) {
      return NextResponse.json({ success: false, error: 'studio_disabled' }, { status: 403 });
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

    // The plan decides the resolution the customer is SOLD. This read used to sit
    // after Promise.all because it only fed the watermark decision, which is why
    // every paid plan received a 1K product photo while lib/stripe/plans.ts sells
    // Starter 2K and Pro/Business/Agency 4K. Read once, used for both.
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single();
    const planId = profile?.plan_id || 'free';
    const shotResolution = getMaxResolution(planId);

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
        // Never the raw payload: `...input` would spill a multi-megabyte inline
        // product photo into this JSONB column. See inputImageRef().
        input: { ...input, productImageUrl: inputImageRef(input.productImageUrl), resolution: shotResolution, promptVersion: PHOTOSHOOT_PROMPT_VERSION },
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
      // Only a verdict from the RPC BODY proves nothing was charged.
      // `insufficient_credits` is such a verdict (017_reserve_credits.sql:31) — the
      // function ran and declined. Any other failure is a transport error, and the
      // reservation may well have committed with only the reply lost, so the row
      // must stay in the reconciler's window until the ledger is consulted.
      const nothingWasCharged = reserveResult.error === 'insufficient_credits';
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: nothingWasCharged,
          error: 'credit_reservation_failed',
        }, 'photoshoot');
      }
      return NextResponse.json({
        success: false,
        error: nothingWasCharged ? 'insufficient_credits' : 'credit_reservation_failed',
        required: creditCost,
      }, { status: 402 });
    }

    // Credits already returned to the user inside the try below. The catch
    // refunds the reservation, and refunding it WHOLE after the partial refund
    // has landed mints credits: refund_credits caps only the slice routed to the
    // purchased pool (supabase/migrations/033_refund_to_source_pool.sql:279) and
    // credits the full p_amount to the balance regardless (033:284-286). A
    // 6-shot job with 1 good shot would otherwise return 14 credits against an
    // 8-credit reservation. Declared out here because a `let` inside the try is
    // not in scope in the catch.
    let refundedSoFar = 0;

    try {
    // Every other studio sanitizes before the model sees the text; these three
    // never did, so the catch for PromptBlockedError below was unreachable and
    // the two highest-risk image surfaces had no filter at all.
    const safeNotes = input.notes ? sanitizePrompt(input.notes) : undefined;

    // Generate shots in parallel
    const shotPromises = Array.from({ length: input.shots }, (_, i) => {
      const prompt = buildPhotoshootPrompt({
        environment: input.environment,
        shotIndex: i,
        totalShots: input.shots,
        notes: safeNotes,
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
        resolution: shotResolution,
        referenceImageUrl: input.productImageUrl,
      }).catch(() => null);
    });

    const results = await Promise.all(shotPromises);

    // `planId` is read once, above the reservation — it decides BOTH the resolution
    // the customer is sold and whether the watermark is required.

    // Pyra returns images as data: URLs. persistGeneratedImage watermarks the
    // buffer and uploads it once — a second pass to watermark in place would
    // need an UPDATE on storage.objects that `authenticated` does not hold.
    //
    // This runs BEFORE the cost is settled below, because a shot that cannot be
    // stored is a shot the customer never gets. On a watermarked plan (free only,
    // lib/stripe/plans.ts:27) persistGeneratedImage now THROWS rather than
    // returning the clean original — see lib/storage/persist-image.ts
    // WatermarkRequiredError. Dropping that one shot hands it to the same
    // partial-refund path a shot the model never returned already uses. Letting
    // the throw reach the catch instead would discard the five good shots AND
    // refund `creditCost` on top of the partial refund below, which mints
    // credits: refund_credits caps only the purchased-pool slice
    // (supabase/migrations/033_refund_to_source_pool.sql:279) and credits the
    // full p_amount to the balance regardless (033:284-286).
    const shots: PhotoshootShot[] = await Promise.all(
      results.map(async (r, i): Promise<PhotoshootShot> => {
        const frame = { index: i, model: r?.model || 'gemini', mock: r?.mock ?? true };
        if (!r?.url) return { ...frame, url: null };
        try {
          return {
            ...frame,
            url: await persistGeneratedImage(supabase, r.url, {
              userId: user.id, generationId: generation.id, index: i, planId,
            }),
          };
        } catch (e: unknown) {
          // Only the watermark verdict is a droppable shot. Anything else is a
          // fault and belongs in the refunding catch at the end of this try.
          if (!(e instanceof WatermarkRequiredError)) throw e;
          console.error(`[photoshoot] shot ${i} dropped, watermark could not be burned in:`, e.message);
          return { ...frame, url: null };
        }
      })
    );

    // Counted from what is actually deliverable, not from what the model
    // returned: a shot that generated but could not be watermarked costs the
    // customer nothing, same as one that never generated.
    const successfulShots = shots.filter((s) => s.url).length;

    // Each shot is generated with `.catch(() => null)`, so a provider failure never
    // reaches the outer catch block that refunds. Without the two branches below,
    // all six shots could fail and the user was still charged the full reservation
    // and shown a "successful" grid of empty frames.
    if (successfulShots === 0) {
      // The refund runs BEFORE the terminal write, and the write is conditional on
      // it. Marking the row failed first — as this did — hands the credits nowhere
      // if the refund then fails: the row is already out of the reconciler's scan.
      const refundResult = await refundCredits({
        userId: user.id, amount: creditCost,
        description: 'Refund: all photoshoot shots failed',
        generationId: generation?.id,
      });
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_parse_failed',
        }, 'photoshoot');
      }
      return NextResponse.json({
        success: false,
        error: refundAwareErrorCode(refundResult, 'generation_failed'),
      }, { status: 500 });
    }

    const actualCost = Math.max(1, Math.ceil((creditCost / input.shots) * successfulShots));

    // Partial failure: return the credits for the shots that never arrived.
    let balanceAfter = reserveResult.newBalance;
    // What the customer was ACTUALLY charged. `actualCost` is the INTENDED figure;
    // writing it to the ledger and the response without checking that the refund
    // landed told the customer credits came back when they had not.
    let creditsCharged = creditCost;
    if (actualCost < creditCost) {
      const refundAmount = creditCost - actualCost;
      const partial = await refundCredits({
        userId: user.id, amount: refundAmount,
        description: `Refund: ${input.shots - successfulShots} of ${input.shots} photoshoot shots failed`,
        generationId: generation?.id,
      });
      const settled = settleCharge(creditCost, refundAmount, partial.success);
      creditsCharged = settled.charged;
      if (partial.success) {
        balanceAfter = partial.newBalance;
        // Only advance by what LANDED — the outer catch's
        // `outstanding = creditCost - refundedSoFar` depends on it.
        refundedSoFar += settled.refunded;
      }
    }

    // Update generation with actual cost
    await finalizeGeneration(supabase, generation.id, {
      output: { shots, mock: shots.some((s) => s.mock) },
      credits_used: creditsCharged,
      status: 'completed',
    }, 'photoshoot');

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

    await insertAssets(supabase, assetInserts, 'photoshoot');

    return NextResponse.json({
      success: true,
      data: {
        generationId: generation.id,
        shots,
        creditsUsed: creditsCharged,
        newBalance: balanceAfter,
      },
    });
    } catch (genError) {
      // Refund what is still outstanding, never the whole reservation again —
      // the partial-refund site above may already have returned part of it, and
      // refund_credits does not net a second payout against the first
      // (033_refund_to_source_pool.sql:284-286). See `refundedSoFar` above.
      const outstanding = creditCost - refundedSoFar;
      const refundResult: { success: boolean } = outstanding > 0
        ? await refundCredits({
            userId: user.id, amount: outstanding,
            description: `Refund: photoshoot generation failed`,
            generationId: generation?.id,
          })
        : { success: true };
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_failed',
        }, 'photoshoot');
      }
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
