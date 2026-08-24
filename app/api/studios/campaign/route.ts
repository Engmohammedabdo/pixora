import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { CAMPAIGN_RESPONSE_SCHEMA } from '@/lib/ai/response-schemas';
import { createServerClient } from '@/lib/supabase/server';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { generateText, generateImage } from '@/lib/ai/router';
import { CAMPAIGN_PROMPT_VERSION, buildCampaignPrompt } from '@/lib/ai/prompts/campaign';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { getStudioConfig, isStudioEnabled, getEffectiveCost, getEffectivePrompt, getCachedFeatureFlags } from '@/lib/admin/settings';
import { persistGeneratedImage, formatFromUrl, WatermarkRequiredError } from '@/lib/storage/persist-image';
import { failGeneration, finalizeGeneration, insertAssets } from '@/lib/supabase/generation-writes';
import { checkRateLimit } from '@/lib/rate-limit';
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
import { resolveProjectId } from '@/lib/projects/verify';
import { refundAwareErrorCode } from '@/lib/studio-errors';

const InputSchema = z.object({
  projectId: z.string().uuid().optional(),
  productDescription: z.string().min(10).max(2000),
  targetAudience: z.string().min(5).max(500),
  dialect: z.enum(['saudi', 'emirati', 'egyptian', 'gulf', 'formal']),
  // A closed set in the only client that posts here
  // (components/studios/campaign/CampaignForm.tsx:36), and it is interpolated into
  // both the campaign prompt and each image prompt. An enum makes the set of
  // reachable prompts finite rather than merely bounded.
  platform: z.enum(['instagram', 'tiktok', 'linkedin', 'twitter', 'facebook']),
  occasion: z.string().max(200).optional(),
  brandKitId: z.string().uuid().optional(),
  generateImages: z.boolean().default(false),
});

const CampaignPostSchema = z.object({
  scenario: z.string(),
  caption: z.string(),
  tov: z.string(),
  schedule: z.string(),
  hashtags: z.string(),
});

/**
 * The number of posts a campaign is sold as and priced for:
 * lib/ai/prompts/campaign.ts:40 asks for "exactly 9 posts", the reservation is
 * described as "Campaign - 9 posts", and the flat 12-credit price decomposes as
 * 9 images x 1 credit + 3 for the text. Every refund below is sized against
 * this, never against what the model happened to return.
 */
const EXPECTED_POSTS = 9;

/**
 * The dialect name and guideline buildCampaignPrompt() sends, duplicated rather
 * than imported because lib/ai/prompts/campaign.ts does not export its
 * DIALECT_MAP — keep the two in step.
 *
 * Needed because the override branch below composes the brief by hand and had
 * no dialect line: the customer picked مصري, paid 12 credits for it and
 * `generations.input` recorded `dialect: "egyptian"`, while the model was never
 * told — verbatim the "the row looked like it was used" defect the composing
 * override exists to remove. Dialect is the most load-bearing field in the
 * built prompt: it sets the persona, the caption language, the tone-of-voice
 * language and the closing guideline.
 */
const DIALECTS: Record<z.infer<typeof InputSchema>['dialect'], { name: string; guideline: string }> = {
  saudi: { name: 'Saudi Arabian', guideline: 'Use Saudi expressions, avoid formal Arabic, add local flavor' },
  emirati: { name: 'Emirati', guideline: 'UAE-specific references, cosmopolitan yet local' },
  egyptian: { name: 'Egyptian', guideline: 'Egyptian humor and warmth, colloquial Egyptian' },
  gulf: { name: 'Pan-Gulf', guideline: 'Pan-Gulf friendly, avoids country-specific slang' },
  formal: { name: 'Modern Standard Arabic', guideline: 'Professional فصحى, clear and eloquent' },
};

function parseJsonFromText(text: string): unknown {
  // Try to extract JSON array from the text (handle markdown code blocks)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  return JSON.parse(text);
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
    if (!isStudioEnabled(studioConfig, 'campaign')) {
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

    // Use admin-configured cost or default, DECOMPOSED — see EXPECTED_POSTS
    // above: the flat price is 9 images x the 1080p image price plus a remainder
    // that buys the nine text posts. The form has always offered a "Generate All
    // Images" checkbox, so reserving the flat price unconditionally charged the
    // 12-credit campaign for the 3-credit half of it, and nothing downstream
    // could return the difference — both the image recount and the partial
    // refund are reached only when images were actually asked for, and with the
    // box unchecked every image slot is null by construction.
    const perImageCost = CREDIT_COSTS.image['1080p'];
    const fullCost = getEffectiveCost(studioConfig, 'campaign');
    // Clamped at 1, so an admin override set at or below the image half cannot
    // make the text-only campaign reserve nothing and generate for free.
    const textCost = Math.max(1, fullCost - EXPECTED_POSTS * perImageCost);
    const creditCost = input.generateImages ? fullCost : textCost;

    // Fetch brand kit
    let brandName: string | undefined;
    let brandVoice: string | undefined;
    let brandColors: string | undefined;
    if (input.brandKitId) {
      const { data: kit } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('id', input.brandKitId)
        .eq('user_id', user.id)
        .single();
      brandName = kit?.name;
      // buildCampaignPrompt has declared brandVoice and brandColors since it was
      // written and this caller never passed them, so a customer who attached a
      // brand kit got a NAME and nothing else. creator/route.ts already selects '*'.
      brandVoice = kit?.brand_voice ?? undefined;
      brandColors = kit
        ? `Primary ${kit.primary_color}, Secondary ${kit.secondary_color}, Accent ${kit.accent_color}`
        : undefined;
    }

    // The safety filter runs HERE, on the customer's own text, before anything
    // branches on the admin override. buildCampaignPrompt() is the only caller of
    // sanitizePrompt on this path, so while the override REPLACED the built
    // prompt, setting one in /admin/settings switched the prompt filter off for
    // a 12-credit paid surface — and PromptBlockedError, the 400 + `term`
    // response the UI is built to render, could never fire. A filter an
    // unrelated setting can disable is not a filter.
    //
    // All THREE free-text fields go through it, each capped at its own schema
    // maximum so the two branches truncate identically. Filtering only the
    // product description left the 500-character audience and the 200-character
    // occasion reaching the model unfiltered on both branches —
    // buildCampaignPrompt sanitizes only the description too, so nothing
    // downstream covered them.
    const safeProductDescription = sanitizePrompt(input.productDescription, 2000);
    const safeTargetAudience = sanitizePrompt(input.targetAudience, 500);
    const safeOccasion = input.occasion ? sanitizePrompt(input.occasion, 200) : undefined;

    // Build prompt (check for admin override first)
    const promptOverride = await getEffectivePrompt('campaign');
    // The override COMPOSES with the client brief, it does not replace it.
    // `promptOverride || build(...)` dropped every field the customer filled in —
    // product, audience, platform, occasion, brand — while `generations.input`
    // still recorded them, so the row looked like they had been used. The labels
    // below are buildCampaignPrompt's own, so an override written against the
    // default prompt's shape still reads as one prompt.
    let prompt: string;
    if (promptOverride) {
      // Same name and guideline the default prompt sends — see DIALECTS above
      // for why an override that drops the dialect charges for a campaign the
      // customer did not order.
      const dialectInfo = DIALECTS[input.dialect];
      prompt = `${promptOverride}\n\nClient Brief:`;
      prompt += `\n- Product/Service: ${safeProductDescription}`;
      prompt += `\n- Target Audience: ${safeTargetAudience}`;
      prompt += `\n- Dialect: ${dialectInfo.name}`;
      prompt += `\n- Platform: ${input.platform}`;
      if (safeOccasion) prompt += `\n- Occasion/Season: ${safeOccasion}`;
      if (brandName) prompt += `\n- Brand: ${brandName}`;
      // The override composer restates the builder's own labels by hand, so a field
      // added to buildCampaignPrompt and not added here is silently dropped whenever
      // an admin sets an override — which is the exact defect the DIALECTS comment
      // above records from the last time it happened.
      if (brandVoice) prompt += `\n- Brand Voice: ${sanitizePrompt(brandVoice, 500)}`;
      if (brandColors) prompt += `\n- Brand Colors: ${sanitizePrompt(brandColors, 200)}`;
      prompt += `\n\nDialect Guideline for ${dialectInfo.name}: ${dialectInfo.guideline}`;
    } else {
      prompt = buildCampaignPrompt({
        productDescription: safeProductDescription,
        targetAudience: safeTargetAudience,
        dialect: input.dialect,
        platform: input.platform,
        occasion: safeOccasion,
        brandName,
        brandVoice,
        brandColors,
      });
    }

    // Create generation record
    const { data: generation, error: genError } = await supabase
      .from('generations')
      .insert({
        user_id: user.id, project_id: projectId,
        studio: 'campaign',
        model: 'gemini',
        input: { ...input, fullPrompt: prompt, promptVersion: CAMPAIGN_PROMPT_VERSION },
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
      studio: 'campaign', description: `Campaign - 9 posts${input.generateImages ? ' with images' : ''}`,
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
        }, 'campaign');
      }
      return NextResponse.json({
        success: false,
        error: nothingWasCharged ? 'insufficient_credits' : 'credit_reservation_failed',
        required: creditCost,
      }, { status: 402 });
    }

    // Credits already returned to the user inside the try below. The catch
    // refunds the reservation, and refunding it WHOLE after a partial refund has
    // landed mints credits: refund_credits caps only the slice routed to the
    // purchased pool (supabase/migrations/033_refund_to_source_pool.sql:279) and
    // credits the full p_amount to the balance regardless (033:284-286). The
    // partial refund below now fires on `refundAmount > 0`, i.e. on the
    // images-OFF path too, so a short response followed by any throw before the
    // return — the finalize write, the asset write — would refund a 3-credit
    // reservation twice over. Declared out here because a `let` inside the try
    // is not in scope in the catch. Mirrors creator.
    let refundedSoFar = 0;

    try {
    // Generate campaign text
    // Nine posts x five fields of Arabic does not fit in the 4096 default, so a
    // full-length campaign truncated mid-JSON and the whole 12-credit run failed to
    // parse. Every other multi-item text studio already raises this to 8192.
    const textResult = await generateText({
      prompt,
      maxTokens: 8192,
      temperature: 0.2,
      responseSchema: CAMPAIGN_RESPONSE_SCHEMA,
    });

    // Parse and validate the output
    let posts: z.infer<typeof CampaignPostSchema>[];
    try {
      const parsed = parseJsonFromText(textResult.text || '[]');
      const arr = Array.isArray(parsed) ? parsed : [];
      // An empty result is a FAILURE, not a successful empty campaign. The
      // `|| '[]'` above turns an empty model response into a parseable array,
      // `arr.map` over it throws nothing, and every refund path below is sized
      // from `posts.length` — so zero posts refunded zero credits and the route
      // returned `success: true` with `posts: []` after charging 12. Nothing
      // reads `generations.output` from the customer side, so there was nothing
      // to recover afterwards either. prompt-builder
      // already guards exactly this at its own parse site.
      if (arr.length === 0) throw new Error('campaign returned no posts');
      // Sold as nine, priced as nine (12 credits = 9 images x 1 + 3 text), refunded
      // against nine. The image loop below iterates THIS array, so an over-delivering
      // model used to drive one paid image generation per extra post — 20 posts meant
      // 20 image calls, 20 asset rows and 20 stored posts against a 9-image price.
      //
      // And `.map(parse)` threw on the FIRST malformed entry, discarding eight good
      // posts and refunding everything. The partial-refund path below was built for
      // exactly this — it sizes the refund from EXPECTED_POSTS minus what arrived —
      // so dropping a bad post pays the customer back for it and delivers the rest.
      posts = arr
        .slice(0, EXPECTED_POSTS)
        .map((p: unknown) => {
          const parsed = CampaignPostSchema.safeParse(p);
          return parsed.success ? parsed.data : null;
        })
        .filter((p): p is z.infer<typeof CampaignPostSchema> => p !== null);
      if (posts.length === 0) throw new Error('campaign returned no usable posts');
    } catch {
      // AI returned invalid JSON — treat as failure
      // The refund runs BEFORE the terminal write, and the write is conditional on
      // it. Marking the row failed first — as this did — hands the credits nowhere
      // if the refund then fails: the row is already out of the reconciler's scan.
      const refundResult = await refundCredits({
        userId: user.id, amount: creditCost,
        description: 'Refund: campaign parse failure',
        generationId: generation?.id,
      });
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_parse_failed',
        }, 'campaign');
      }
      return NextResponse.json({
        success: false,
        error: refundAwareErrorCode(refundResult, 'generation_parse_failed'),
        message: 'AI returned invalid response. Please try again.',
      }, { status: 500 });
    }

    // Generate images for each post if requested (included in 12 credits)
    let postImages: (string | null)[] = new Array(posts.length).fill(null);
    // Tracks how many of the requested images never came back, so the block
    // below can refund the credits those images were never worth generating.
    // creator (per failed variation) and photoshoot (per failed shot) already
    // do this — campaign was the only studio silently dropping failed images
    // (via the catch below) without ever returning their cost.
    let failedImageCount = 0;
    // Computed once, not once per post: nine identical sanitizePrompt calls buy
    // nothing.
    const safeBrandColorsLine = brandColors ? sanitizePrompt(brandColors, 200) : '';

    if (input.generateImages && posts.length > 0) {
      const imagePromises = posts.map(async (post, i) => {
        // `post.scenario` is MODEL-authored text going straight to the image model,
        // and it was the only image path in the product that never met the filter.
        // The customer's own text IS filtered, above — which is exactly what made
        // this the way around it: steer the text model with a brief that passes, and
        // whatever scenario it writes is handed to the image model verbatim.
        //
        // Blocked => drop THIS image, never the campaign. Nine text posts and up to
        // eight other images are legitimate delivered work, and this block runs
        // inside the try, so throwing would reach the outer catch and refund the
        // whole reservation over one bad scenario. Returning null needs no new
        // branch: failedImageCount is sized from what was DELIVERED, so the partial
        // refund below already pays the customer back for a dropped image.
        let safeScenario: string;
        try {
          safeScenario = sanitizePrompt(post.scenario, 2000);
        } catch (e: unknown) {
          if (!(e instanceof PromptBlockedError)) throw e;
          console.error(
            `[campaign] post ${i} image skipped, model-written scenario blocked on "${e.blockedTerm}"`
          );
          return null;
        }

        // `post.scenario` alone is ONE model-written sentence. Every other image in
        // the product goes to the model with platform framing, brand colours and the
        // no-text rule; this path had none of it, which is why campaign images looked
        // nothing like the rest of the product's output.
        const imagePrompt =
          `Create a professional social media image.` +
          `\n- Scene: ${safeScenario}` +
          `\n- Platform: ${input.platform}` +
          (safeBrandColorsLine ? `\n- Brand Colors: ${safeBrandColorsLine}` : '') +
          `\n\nTechnical Requirements:` +
          // Kept even though these are social posts: CLAUDE.md records that Arabic
          // text inside generated images is not handled, and the caption is
          // delivered as text alongside the image.
          `\n- NO text, logos or watermarks in the image` +
          `\n- Professional lighting, high contrast, commercially appealing composition` +
          `\n- Composed for ${input.platform}`;

        try {
          const imgResult = await generateImage({
            prompt: imagePrompt,
            model: 'gemini',
            resolution: '1080p',
          });
          return imgResult.url || null;
        } catch {
          return null;
        }
      });
      postImages = await Promise.all(imagePromises);
      failedImageCount = postImages.filter((url) => url === null).length;
    }

    // Apply watermark to campaign images for free plan users
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single();
    const planId = profile?.plan_id || 'free';
    // Pyra returns images as data: URLs; without persisting them a nine-post
    // campaign wrote nine base64 images into one generations.output row. The
    // watermark is burned in before the upload — see lib/storage/persist-image.ts.
    // A post image whose free-plan watermark cannot be burned in is dropped, not
    // delivered clean: persistGeneratedImage throws WatermarkRequiredError there
    // instead of returning the original. Dropping just that image keeps the other
    // eight images and all nine text posts, and the partial refund below pays for
    // it; letting the throw reach the catch would refund the whole 12 credits and
    // destroy a campaign that is mostly intact.
    postImages = await Promise.all(
      postImages.map(async (url, i) => {
        if (!url) return null;
        try {
          return await persistGeneratedImage(supabase, url, {
            userId: user.id, generationId: generation.id, index: i, planId,
          });
        } catch (e: unknown) {
          // Only the watermark verdict is a droppable image. Anything else is a
          // fault and belongs in the refunding catch at the end of this try.
          if (!(e instanceof WatermarkRequiredError)) throw e;
          console.error(`[campaign] post image ${i} dropped, watermark could not be burned in:`, e.message);
          return null;
        }
      })
    );

    // Recounted AFTER persisting. failedImageCount was taken at :190 from what
    // the model returned, which is one stage too early now that an image can also
    // be lost on the way into storage — the partial refund below must cover every
    // image the customer does not receive, whichever stage lost it. Guarded on
    // `generateImages` because with images switched off every entry is null by
    // construction and there is nothing to refund.
    if (input.generateImages) {
      // Against EXPECTED_POSTS, not postImages.length. The reservation is taken
      // for a nine-post campaign ("Campaign - 9 posts"), and postImages is sized
      // from what the model actually returned — so a four-post response used to
      // produce four images, count zero failures, and refund nothing while the
      // customer paid for nine. Clamped at 0 because a model that over-delivers
      // must not mint credits.
      const delivered = postImages.filter((url) => url !== null).length;
      failedImageCount = Math.max(0, EXPECTED_POSTS - delivered);
    }

    // Combine posts with images
    const postsWithImages = posts.map((post, i) => ({
      ...post,
      imageUrl: postImages[i],
    }));

    // Partial refund. TWO independent shortfalls, summed, because a short
    // campaign usually produces both at once:
    //
    //  - images the customer paid for and did not receive. One is worth exactly
    //    what a 1080p image costs everywhere else (`perImageCost`), which is the
    //    same decomposition the reservation above is built from. Zero by
    //    construction when images were not requested, so this term needs no
    //    gate of its own.
    //  - posts the model never wrote. This used to sit INSIDE the
    //    `generateImages` gate, so a four-post response with images switched off
    //    refunded nothing at all — and even with images on, only the image share
    //    of the five missing posts came back, never the text share the customer
    //    had also paid for. `textCost` is what the nine posts cost, so an
    //    under-delivering model owes back the share of it that never arrived.
    //
    // Floored, never rounded: the text share of one post is a fraction of a
    // credit, and rounding up across a short campaign refunds more than was
    // charged. Capped at `creditCost` — the amount actually reserved — so a
    // model that over-delivers can never mint credits. The posts that did
    // arrive are valid work, so this stays a success response, never an error.
    const missingPosts = Math.max(0, EXPECTED_POSTS - posts.length);
    const refundAmount = Math.min(
      failedImageCount * perImageCost + Math.floor((missingPosts * textCost) / EXPECTED_POSTS),
      creditCost
    );

    let balanceAfterPartialRefund = reserveResult.newBalance;
    let actualCreditsCharged = creditCost;
    if (refundAmount > 0) {
      const partialRefund = await refundCredits({
        userId: user.id, amount: refundAmount,
        description: `Partial refund: ${missingPosts}/${EXPECTED_POSTS} posts and ${failedImageCount}/${EXPECTED_POSTS} images not delivered (${refundAmount} credits returned)`,
        generationId: generation.id,
      });
      if (partialRefund.success) {
        balanceAfterPartialRefund = partialRefund.newBalance;
        actualCreditsCharged = creditCost - refundAmount;
        refundedSoFar += refundAmount;
      }
    }

    // Update generation. `credits_used` reflects the net charge after any
    // partial refund above — mirrors creator/photoshoot, whose ledger rows
    // would otherwise disagree with the credits the user actually kept.
    await finalizeGeneration(supabase, generation.id, {
      output: { posts: postsWithImages, mock: textResult.mock },
      credits_used: actualCreditsCharged,
      status: 'completed',
      // Record the model that ACTUALLY served. The row is inserted before
      // generation from the PREFERRED model, but the router falls back — so a
      // gpt-served run stayed filed under gemini forever, and six admin surfaces
      // read this column. MODEL_COSTS is gemini 0.002 vs gpt 0.01, so every
      // mis-attributed run also understated estimated API cost 5x.
      model: textResult.model,
    }, 'campaign');

    // Campaign was the only image-producing studio that never wrote `assets` —
    // creator, photoshoot, edit and voiceover all do. So a 12-credit campaign
    // persisted its images to storage, embedded them in generations.output, and
    // left them unreachable from ملفاتي: not listed, not downloadable, not in an
    // export. Nothing to backfill — there are zero campaign generations in the
    // live database, so this is the first release where the write can matter.
    await insertAssets(
      supabase,
      postImages
        .filter((url): url is string => Boolean(url))
        .map((url) => ({
          user_id: user.id,
          generation_id: generation.id,
          type: 'image' as const,
          url,
          format: formatFromUrl(url),
        })),
      'campaign'
    );

    return NextResponse.json({
      success: true,
      data: {
        generationId: generation.id,
        posts: postsWithImages,
        mock: textResult.mock,
        usedFallback: textResult.usedFallback,
        creditsUsed: actualCreditsCharged,
        newBalance: balanceAfterPartialRefund,
        // The screen showed nine empty tiles offering to "generate an image
        // elsewhere" with no message and no notice of the refund that DID happen.
        // These two let it say what actually occurred.
        imagesRequested: input.generateImages,
        failedImageCount,
        refunded: creditCost - actualCreditsCharged,
      },
    });
    } catch (genError) {
      // Refund what is still outstanding, never the whole reservation again:
      // the partial refund above may already have returned part of it, and
      // refund_credits does not net a second payout against the first
      // (033_refund_to_source_pool.sql:284-286 credits p_amount unconditionally,
      // and only the purchased-pool slice is capped, 033:279). Worked example
      // without this: images off, model returns 4 posts, 1 credit partially
      // refunded, then a throw refunds 3 more — 4 credits back against a
      // 3-credit reservation, i.e. minted.
      const outstanding = creditCost - refundedSoFar;
      const refundResult: { success: boolean } = outstanding > 0
        ? await refundCredits({
            userId: user.id, amount: outstanding,
            description: `Refund: campaign generation failed`,
            generationId: generation?.id,
          })
        : { success: true };
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_failed',
        }, 'campaign');
      }
      // PromptBlockedError carries its own dedicated response (400 + `term`),
      // handled by the outer catch below — don't clobber that with refund_failed.
      if (!refundResult.success && !(genError instanceof PromptBlockedError)) {
        console.error('Campaign API error:', genError);
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
    console.error('Campaign API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
