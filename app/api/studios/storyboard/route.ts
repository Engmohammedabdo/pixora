import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { failGeneration, finalizeGeneration } from '@/lib/supabase/generation-writes';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { generateText } from '@/lib/ai/router';
import { buildStoryboardPrompt } from '@/lib/ai/prompts/storyboard';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
import { resolveProjectId } from '@/lib/projects/verify';
import { refundAwareErrorCode } from '@/lib/studio-errors';

const InputSchema = z.object({
  projectId: z.string().uuid().optional(),
  concept: z.string().min(10).max(2000),
  duration: z.enum(['15', '30', '60']),
  // Both are closed sets in the only client that posts here
  // (app/[locale]/(dashboard)/storyboard/page.tsx:103-104), and an enum makes the
  // set of reachable prompts finite rather than merely filtered. Same shape as
  // `dialect` in campaign and `duration` two lines above.
  style: z.enum(['cinematic', 'ugc', 'animation', 'documentary']),
  platform: z.enum(['instagram_reel', 'tiktok', 'youtube', 'tv']),
  brandKitId: z.string().uuid().optional(),
});

/*
 * The model's JSON is input we did not write, and it was trusted on shape.
 * `Array.isArray(parsed) && parsed.length > 0` accepted `[{}]`, the route
 * finalized it as `completed` and kept the 14 credits, and the page then threw
 * on `scene.visual_description.substring(...)`. A render throw trips the segment
 * error boundary, so the customer paid 14 credits and got a generic Arabic error
 * where the storyboard should be — with no way to reach the output at all.
 *
 * Shape is therefore checked HERE, before finalizing, so a wrong shape takes the
 * existing parse-failure branch (refund + `generation_parse_failed`) instead of
 * being sold. What is stored and returned is the PARSED value, so the row
 * RecentWork restores months from now is the normalized one too.
 */

/** A field the UI prints. A number where prose was asked for is not worth a
 *  refund; a missing one becomes an empty cell, not `undefined` on screen. */
const printable = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((v) => String(v))
  .catch('');

const numeric = z
  .union([z.number(), z.string()])
  .transform((v) => (Number.isFinite(Number(v)) ? Number(v) : 0))
  .catch(0);

// Only `visual_description` is required: a scene without one is not a scene, and
// that is the field the page dereferences. Everything else is decoration — one
// thin field must never cost the customer the whole 14 credits.
const SceneSchema = z
  .object({
    scene_number: numeric,
    visual_description: z.string().min(1),
    dialogue: printable,
    camera_angle: printable,
    camera_movement: printable,
    duration_seconds: numeric,
    mood: printable,
    music_note: printable,
  })
  .loose();

/**
 * The number of scenes a storyboard is sold as and priced for: the prompt asks for
 * "exactly 9 scenes" (lib/ai/prompts/storyboard.ts) and the flat 14-credit price is
 * built on that. Mirrors campaign's EXPECTED_POSTS.
 */
const EXPECTED_SCENES = 9;

/**
 * `.min(1)` accepted one scene of the nine that were sold, marked the row completed
 * and kept all 14 credits. A storyboard is not a bag of independent items like a
 * campaign's posts — its scene durations must sum to the requested video length, so
 * a short response is unusable rather than partial. Refusing here routes it into the
 * existing parse-failure branch: full refund, `generation_parse_failed`, free retry.
 */
const ScenesSchema = z.array(SceneSchema).min(EXPECTED_SCENES);

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    if (!(await checkRateLimit(supabase, user.id))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    const flags = await getCachedFeatureFlags();
    if (flags.maintenance_mode) {
      return NextResponse.json({ success: false, error: 'System is under maintenance' }, { status: 503 });
    }
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'storyboard')) {
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
    const creditCost = CREDIT_COSTS.storyboard;

    // Sanitize BEFORE the insert and BEFORE the reservation, so a blocked word costs
    // nothing. plan and analysis already do this; storyboard was the one that charged
    // first and filtered second — at 14 credits, the most expensive place to get that
    // order wrong. PromptBlockedError thrown here reaches the OUTER catch directly,
    // which returns 400 + `term` with no credits moved and no orphan row.
    const safeConcept = sanitizePrompt(input.concept, 2000);

    let brandKitName: string | undefined;
    if (input.brandKitId) {
      const { data: brandKit } = await supabase.from('brand_kits').select('name').eq('id', input.brandKitId).eq('user_id', user.id).single();
      // `brand_kits` has no column-level GRANT lockdown (022 covered `profiles` only;
      // 042 constrains logo_url alone), so a customer can PATCH `name` to any string
      // over PostgREST and app/api/brand-kits/route.ts's max(100) never runs.
      brandKitName = brandKit?.name ? sanitizePrompt(String(brandKit.name), 100) : undefined;
    }

    const { data: generation, error: genInsertError } = await supabase.from('generations').insert({
      user_id: user.id, project_id: projectId, studio: 'storyboard', model: 'gemini', input: { ...input, concept: safeConcept, brandKitName }, credits_used: creditCost, status: 'processing',
    }).select().single();

    // Fail loudly — otherwise credits are reserved and the model is called while
    // the generations row was never written, and the user is charged for nothing.
    if (genInsertError || !generation) {
      return NextResponse.json(
        { success: false, error: 'failed_to_create_generation' },
        { status: 500 }
      );
    }

    // Reserve credits (atomic check + deduct)
    const reserveResult = await reserveCredits({
      userId: user.id, amount: creditCost,
      studio: 'storyboard', description: `Storyboard - ${safeConcept.substring(0, 50)}`,
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
        }, 'storyboard');
      }
      return NextResponse.json({
        success: false,
        error: nothingWasCharged ? 'insufficient_credits' : 'credit_reservation_failed',
        required: creditCost,
      }, { status: 402 });
    }

    try {
    const prompt = buildStoryboardPrompt({ ...input, concept: safeConcept, duration: parseInt(input.duration, 10), brandName: brandKitName });
    const result = await generateText({ prompt, maxTokens: 8192 });

    // Unparseable output = failure + refund. The old fallback shipped a canned
    // storyboard whose ninth scene was a PyraSuite advert, billed at full price.
    let scenes: z.infer<typeof ScenesSchema>;
    try {
      const jsonMatch = (result.text || '').match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('model returned no JSON array');
      // Valid JSON of the WRONG shape is a parse failure too — it throws here so
      // it lands in the same refund branch, never in `completed`.
      scenes = ScenesSchema.parse(JSON.parse(jsonMatch[0]));
    } catch {
      // The refund runs BEFORE the terminal write, and the write is conditional on
      // it. Marking the row failed first — as this did — hands the credits nowhere
      // if the refund then fails: the row is already out of the reconciler's scan.
      const refundResult = await refundCredits({
        userId: user.id, amount: creditCost,
        description: 'Refund: storyboard parse failure',
        generationId: generation?.id,
      });
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_parse_failed',
        }, 'storyboard');
      }
      return NextResponse.json({
        success: false,
        error: refundAwareErrorCode(refundResult, 'generation_parse_failed'),
      }, { status: 500 });
    }

    if (generation) {
      await finalizeGeneration(supabase, generation.id, { output: { scenes, mock: result.mock }, status: 'completed' }, 'storyboard');
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, scenes, mock: result.mock, creditsUsed: creditCost, newBalance: reserveResult.newBalance } });
    } catch (genError) {
      const refundResult = await refundCredits({
        userId: user.id, amount: creditCost,
        description: `Refund: storyboard generation failed`,
        generationId: generation?.id,
      });
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_failed',
        }, 'storyboard');
      }
      // PromptBlockedError carries its own dedicated response (400 + `term`),
      // handled by the outer catch below — don't clobber that with refund_failed.
      if (!refundResult.success && !(genError instanceof PromptBlockedError)) {
        console.error('Storyboard API error:', genError);
        return NextResponse.json({ success: false, error: 'refund_failed' }, { status: 500 });
      }
      throw genError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    if (error instanceof PromptBlockedError) {
      return NextResponse.json(
        { success: false, error: 'prompt_blocked', term: error.blockedTerm },
        { status: 400 }
      );
    }
    console.error('Storyboard API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
