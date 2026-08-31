import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { inputImageRef, readableImageUrl } from '@/lib/storage/reference-image';
import { createServerClient } from '@/lib/supabase/server';
import { failGeneration, finalizeGeneration, insertAssets } from '@/lib/supabase/generation-writes';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { settleCharge } from '@/lib/credits/settle';
import { generateImage } from '@/lib/ai/router';
import { CREATOR_PROMPT_VERSION, buildCreatorPrompt } from '@/lib/ai/prompts/creator';
import { buildBrandContextBlock, type BrandContextPromptInput } from '@/lib/ai/prompts/brand-context';
import { PLATFORM_IDS, aspectRatioFor, buildFramingBlock } from '@/lib/ai/prompts/platform-framing';
import { buildImageTextRule } from '@/lib/ai/prompts/image-text-rule';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { getStudioConfig, isStudioEnabled, getEffectivePrompt, getCachedFeatureFlags } from '@/lib/admin/settings';
import { getStudioCost } from '@/lib/credits/costs';
import { getMaxResolution } from '@/lib/stripe/plans';
import { checkRateLimit } from '@/lib/rate-limit';
import { persistGeneratedImage, formatFromUrl, WatermarkRequiredError } from '@/lib/storage/persist-image';
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
import { getPromptVersion } from '@/lib/ai/prompts/versions';
import type { AIModel } from '@/types/studios';
import { resolveProjectId } from '@/lib/projects/verify';
import { refundAwareErrorCode } from '@/lib/studio-errors';

const InputSchema = z.object({
  prompt: z.string().min(10).max(1000),
  model: z.enum(['gemini', 'gpt', 'flux']),
  projectId: z.string().uuid().optional(),
  resolution: z.enum(['1080p', '2K', '4K']),
  // `style` reaches the image model on BOTH branches and had no ceiling at all.
  // 100 is the cap the admin-override branch already truncates it to.
  style: z.string().max(100).default('photographic'),
  // The output canvas, chosen by the customer rather than by the model.
  //
  // Measured 2026-08-31: four requests at this same `resolution` came back as
  // three different aspect ratios (1.79, 1.79, 0.67, 1.89), because gemini picks
  // the shape from prompt content when no `aspectRatio` is sent and no
  // text-to-image caller had ever sent one. A tool sold for producing sets of
  // posts cannot have a canvas that does not reproduce between two identical
  // requests.
  //
  // Optional with a `general` default, so every existing client keeps working.
  // The enum is built from the framing table rather than restated, so a platform
  // added there cannot be silently unreachable here.
  platform: z.enum(PLATFORM_IDS).default('general'),
  variations: z.union([z.literal(1), z.literal(4)]).default(1),
  brandKitId: z.string().uuid().optional(),
  // `z.string().url()` accepted blob: and http: — neither readable server-side —
  // and an unbounded data: payload. edit and photoshoot were fixed for this; creator
  // was the one image studio that never got it, and it also wrote the raw payload
  // into generations.input via a bare ...input spread.
  referenceImageUrl: readableImageUrl.optional(),
});

/**
 * The brief's labels, keyed by the token the admin prompt editor advertises for
 * each one, and matching the headings buildCreatorPrompt emits.
 *
 * Kept in step with that builder by hand — this list claims to mirror it, and a
 * claim like that going stale is how the `app/layout.tsx` comment came to
 * assert the opposite of what the code did. Updated 2026-08-31 when creator
 * moved from a bullet list to headed blocks:
 *   - `resolution` REMOVED. No image model reads pixel dimensions from prose;
 *     it is an API parameter, and /api/admin/prompts no longer offers the chip.
 *   - `platform` ADDED. It is a real field now rather than the fixed string
 *     'General' the old builder invented.
 *   - Labels follow the new headings (SUBJECT / BRAND / STYLE), so an override
 *     that omits a token still reads as one prompt rather than two stapled
 *     together.
 */
const OVERRIDE_BRIEF_LABELS: ReadonlyArray<readonly [token: string, label: string]> = [
  ['user_prompt', 'SUBJECT'],
  ['brand_name', 'Brand'],
  ['brand_colors', 'Brand Colours'],
  ['selected_style', 'STYLE'],
  ['platform', 'Platform'],
];

/**
 * Fill an admin override's {tokens}, then append only the parts of the brief it
 * did not already ask for.
 *
 * /api/admin/prompts:8 advertises these tokens as clickable chips and seeds the
 * copyable default WITH them (`userPrompt: '{user_prompt}'`, :50), so an
 * override written the way the UI teaches contains `{user_prompt}` verbatim.
 * Appending the brief without substituting shipped that literal brace text to
 * the model as content; substituting and then appending everything anyway would
 * state the same subject twice. So: substitute, and append what is left over.
 *
 * A token we do not recognise is left exactly as written. Blanking it would
 * silently delete something the admin typed, and guessing at its meaning is
 * worse than letting them see their own text came through untouched.
 */
function composeOverridePrompt(override: string, values: Readonly<Record<string, string>>): string {
  const substituted = new Set<string>();
  const filled = override.replace(/\{([a-z_]+)\}/g, (match: string, token: string) => {
    if (!(token in values)) return match;
    substituted.add(token);
    return values[token];
  });

  // Same labels buildCreatorPrompt uses, so an override written against the
  // default prompt's shape still reads as one prompt rather than two stapled
  // together.
  const brief = OVERRIDE_BRIEF_LABELS
    .filter(([token]) => !substituted.has(token) && values[token])
    .map(([token, label]) => `- ${label}: ${values[token]}`);

  return brief.length > 0 ? `${filled}\n\n${brief.join('\n')}` : filled;
}

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
        { success: false, error: 'maintenance_mode' },
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

    // Three INDEPENDENT reads that used to run strictly one after another, in front
    // of the first model call: the plan (for the resolution cap), the project id
    // (ownership), and the brand kit. None of them needs another's answer, so they
    // are one round trip's latency instead of three. The auth check and the rate
    // limit deliberately stay above this — they GATE the work rather than race it.
    const [profileResult, projectId, brandKitResult] = await Promise.all([
      supabase.from('profiles').select('plan_id').eq('id', user.id).single(),
      resolveProjectId(supabase, user.id, input.projectId),
      input.brandKitId
        ? supabase.from('brand_kits').select('*').eq('id', input.brandKitId).eq('user_id', user.id).single()
        : Promise.resolve({ data: null }),
    ]);

    // Enforce resolution limit based on the customer's plan
    const profile = profileResult.data;
    const maxRes = getMaxResolution(profile?.plan_id || 'free');
    const resOrder: string[] = ['1080p', '2K', '4K'];
    if (resOrder.indexOf(input.resolution) > resOrder.indexOf(maxRes)) {
      return NextResponse.json(
        { success: false, error: 'resolution_not_available', maxResolution: maxRes },
        { status: 403 }
      );
    }

    // Calculate credit cost (use admin override if set)
    const creditCost = getStudioCost('creator', input.resolution);
    const totalCost = creditCost * input.variations;

    // Never trust a client-supplied project id: resolveProjectId (above, in the
    // Promise.all) verifies it belongs to the caller before any work is filed into it.
    if (projectId === false) {
      return NextResponse.json({ success: false, error: 'project_not_found' }, { status: 404 });
    }

    const brandKit = brandKitResult.data;

    // The safety filter runs HERE, on the customer's own text, before anything
    // branches on the admin override. buildCreatorPrompt() is the only caller of
    // sanitizePrompt on this path, so while the override REPLACED the built
    // prompt, setting one in /admin/settings switched the prompt filter off for
    // the highest-risk paid surface in the product — and PromptBlockedError, the
    // 400 + `term` response the UI is built to render, could never fire. A filter
    // that an unrelated setting can disable is not a filter.
    // Capped at the schema's own maximum (InputSchema.prompt max 1000) rather
    // than sanitizePrompt's 2000 default, so the builder and the override path
    // truncate identically.
    const safeUserPrompt = sanitizePrompt(input.prompt, 1000);

    // The migration-045 business columns, reshaped for buildBrandContextBlock.
    // Built once here and used on BOTH prompt-building paths below — mirrors
    // campaign's brandContext (app/api/studios/campaign/route.ts), built once
    // and reused rather than re-derived per branch. buildCreatorPrompt() already
    // emits this block on the default path (lib/ai/prompts/creator.ts); the
    // admin-override composer below bypassed buildCreatorPrompt entirely and so
    // never emitted it at all, silently dropping the customer's business facts
    // for every generation an admin override touches (review finding F6).
    const brandContext: BrandContextPromptInput | null = brandKit
      ? {
          name: brandKit.name ?? null,
          industry: brandKit.industry ?? null,
          description: brandKit.description ?? null,
          targetAudience: brandKit.target_audience ?? null,
          city: brandKit.city ?? null,
        }
      : null;

    // Build prompt (check for admin override first)
    const promptOverride = await getEffectivePrompt('creator');

    // The override COMPOSES with the customer's brief, it does not replace it.
    // `promptOverride || build(...)` dropped input.prompt entirely — the model
    // was asked to draw nothing in particular while `generations.input` still
    // recorded the customer's request, so the row looked like it had been used.
    // See composeOverridePrompt() for why the brief is substituted first and
    // only then appended.
    //
    // The values are built INSIDE this branch, not above it: sanitizePrompt
    // throws, and running it on fields the default path never uses would let an
    // unrelated brand-kit string block a generation that has no override at all.
    // The brand kit's own columns are filtered here because they are
    // customer-writable and would otherwise reach the model without ever
    // meeting the filter — the same shape of hole the override itself once
    // punched in it.
    const fullPrompt = promptOverride
      ? composeOverridePrompt(promptOverride, {
          user_prompt: safeUserPrompt,
          brand_name: brandKit?.name ? sanitizePrompt(String(brandKit.name), 200) : '',
          brand_colors: brandKit
            ? sanitizePrompt(
                `Primary ${brandKit.primary_color}, Secondary ${brandKit.secondary_color}, Accent ${brandKit.accent_color}`,
                200
              )
            : '',
          selected_style: sanitizePrompt(input.style, 100),
          // `resolution` and `mood` are no longer offered: neither reached the
          // model usefully, and /api/admin/prompts no longer advertises them as
          // chips. `platform` is now a real field rather than the fixed string
          // 'General' the builder used to invent.
          platform: input.platform,
        // Mirrors campaign's override branch: appended after the composed
        // brief, same placement buildCreatorPrompt itself uses (after the
        // subject/brand lines, before the style/technical directives it
        // appends on the default path — this override has none of those).
        }) + buildBrandContextBlock(brandContext)
          // An override REPLACES the built prompt, so without this the one
          // defect this round measured — a street of invented shop signs —
          // stays open on the admin path. The containment rule is not part of
          // the brief an admin is editing; it is the rule the studio holds
          // regardless of who wrote the brief, which is why it is appended
          // rather than offered as a token.
          + buildFramingBlock(input.platform)
          // Same hasReferenceImage branch as the default path. An override that
          // says nothing about text still must not order the customer's own
          // packaging blanked — see buildCreatorPrompt's note and
          // preserveTextRule().
          + buildImageTextRule(input.referenceImageUrl ? 'preserve' : 'contained', safeUserPrompt)
      : buildCreatorPrompt({
          userPrompt: safeUserPrompt,
          style: input.style,
          brandKit,
          platform: input.platform,
          hasReferenceImage: Boolean(input.referenceImageUrl),
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
        // `...input` wrote the raw reference payload into this JSONB column — up to
        // 20 MB of base64 in a row every admin screen reads. Record that one was
        // supplied; the bytes stay in memory, where only the model call needs them.
        // edit and photoshoot already did this.
        input: {
          ...input,
          fullPrompt,
          promptVersion: CREATOR_PROMPT_VERSION,
          ...(input.referenceImageUrl ? { referenceImageUrl: inputImageRef(input.referenceImageUrl) } : {}),
        },
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
        }, 'creator');
      }
      return NextResponse.json({
        success: false,
        error: nothingWasCharged ? 'insufficient_credits' : 'credit_reservation_failed',
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
    // What the customer was ACTUALLY charged. Starts at the reservation and only
    // drops when a refund is CONFIRMED landed. This route used to state the charge
    // as `imageUrls.length * creditCost` — the intended figure — in both the ledger
    // and the response, so a partial refund that failed told the customer and every
    // admin revenue number that credits came back when they had not.
    let creditsCharged = totalCost;

    if (input.variations === 4) {
      // Generate 4 variations — track individual successes/failures
      const promises = Array.from({ length: 4 }, () =>
        generateImage({
          prompt: fullPrompt,
          model: input.model,
          resolution: input.resolution,
          referenceImageUrl: input.referenceImageUrl,
          // Safe to send as of 2026-08-31: gpt and flux forward this now, in
          // that order, which is the precondition router.ts:31 states. Before
          // that it would have been silently dropped on two of the three models
          // this studio lets the customer pick.
          aspectRatio: aspectRatioFor(input.platform),
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
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'all_variations_failed',
        }, 'creator');
        return NextResponse.json({
          success: false,
          // Was the English sentence 'All generation attempts failed. Credits
          // refunded.' — not a registered code, so mapApiError collapsed it to the
          // generic fallback and the Arabic customer was never told their credits
          // had come back, which is the one thing that sentence existed to say.
          error: refundAwareErrorCode(refundResult, 'generation_failed'),
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
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'all_variations_failed',
        }, 'creator');
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
        const settled = settleCharge(totalCost, refundAmount, partialRefund.success);
        creditsCharged = settled.charged;
        if (partialRefund.success) {
          balanceAfterPartialRefund = partialRefund.newBalance;
          // Only advance by what LANDED: `outstanding = totalCost - refundedSoFar`
          // in the outer catch depends on it, and over-advancing mints credits.
          refundedSoFar += settled.refunded;
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
        aspectRatio: aspectRatioFor(input.platform),
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
    await finalizeGeneration(supabase, generation.id, {
      output: { urls: imageUrls, mock: hasMock, usedFallback: hasUsedFallback },
      credits_used: creditsCharged,
      status: 'completed',
      // creator already tracked which model served (resultModel) and echoed it in
      // the response, but never wrote it to the row the admin views read.
      model: resultModel,
    }, 'creator');

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

    await insertAssets(supabase, assetInserts, 'creator');

    return NextResponse.json({
      success: true,
      data: {
        generationId: generation.id,
        imageUrls,
        model: resultModel,
        mock: hasMock,
        usedFallback: hasUsedFallback,
        originalModel: resultOriginalModel,
        creditsUsed: creditsCharged,
        totalReserved: totalCost,
        refunded: totalCost - creditsCharged,
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
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_failed',
        }, 'creator');
      }
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
