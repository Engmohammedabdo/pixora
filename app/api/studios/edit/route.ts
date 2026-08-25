import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { getStudioCost } from '@/lib/credits/costs';
import { EDIT_PROMPT_VERSION, buildEditPrompt } from '@/lib/ai/prompts/edit';
import { inputImageRef, readableImageUrl } from '@/lib/storage/reference-image';
import { createServerClient } from '@/lib/supabase/server';
import { failGeneration, finalizeGeneration, insertAssets } from '@/lib/supabase/generation-writes';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { generateImage } from '@/lib/ai/router';
import { persistGeneratedImage, formatFromUrl } from '@/lib/storage/persist-image';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
import { resolveProjectId } from '@/lib/projects/verify';
import { refundAwareErrorCode } from '@/lib/studio-errors';

const InputSchema = z.object({
  projectId: z.string().uuid().optional(),
  imageUrl: readableImageUrl,
  editDescription: z.string().min(5).max(500),
  editType: z.enum(['background_replace', 'object_remove', 'color_change', 'text_add', 'style_transfer']),
});

// Read from the one table, not restated here. Every studio price lives in
// lib/credits/costs.ts, which is also what the PUBLIC pricing page imports — a
// second copy is how the published list and the charge drift apart.
const CREDIT_COST = getStudioCost('edit');

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    if (!(await checkRateLimit(supabase, user.id))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    const flags = await getCachedFeatureFlags();
    if (flags.maintenance_mode) {
      return NextResponse.json({ success: false, error: 'maintenance_mode' }, { status: 503 });
    }
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'edit')) {
      return NextResponse.json({ success: false, error: 'studio_disabled' }, { status: 403 });
    }

    const body = await req.json();
    const input = InputSchema.parse(body);

    // Never trust a client-supplied project id: verify it belongs to the caller
    // before filing work into it, or a user could write into another
    // customer's workspace.
    const projectId = await resolveProjectId(supabase, user.id, input.projectId);
    if (projectId === false) {
      return NextResponse.json({ success: false, error: 'project_not_found' }, { status: 404 });
    }

    // Filtered and built HERE — above the insert and above the reservation.
    // Both used to sit inside the post-reservation try block, so a blocked term
    // in the customer's own edit instruction reserved the credits first and
    // refunded them back out again; if that refund failed, the credits were gone
    // for a prompt no model ever saw. The catch below carried an exemption for
    // PromptBlockedError to paper over it. A PromptBlockedError thrown here
    // reaches the OUTER catch directly — no credits moved, no orphan row — the
    // same shape storyboard, plan and analysis use.
    const safeDescription = sanitizePrompt(input.editDescription);
    // `edit` was the only studio with no prompt file: the whole prompt was a slug
    // turned into two English words, with nothing telling the model that a
    // reference image was attached or that the customer's photo had to survive.
    const prompt = buildEditPrompt({
      editType: input.editType,
      editDescription: safeDescription,
    });

    const { data: generation, error: genInsertError } = await supabase.from('generations').insert({
      user_id: user.id, project_id: projectId, studio: 'edit', model: 'gemini', status: 'processing',
      input: { imageUrl: inputImageRef(input.imageUrl), editDescription: input.editDescription, editType: input.editType, promptVersion: EDIT_PROMPT_VERSION },
      credits_used: CREDIT_COST,
    }).select().single();

    // Fail loudly. Without this the request continues, reserves credits, calls the
    // model and returns 200 — while the generations row (and therefore the asset)
    // was never written. The user pays and receives nothing.
    if (genInsertError || !generation) {
      return NextResponse.json(
        { success: false, error: 'failed_to_create_generation' },
        { status: 500 }
      );
    }

    const reserveResult = await reserveCredits({
      userId: user.id, amount: CREDIT_COST,
      studio: 'edit', description: `Image edit - ${input.editType}`,
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
        }, 'edit');
      }
      return NextResponse.json({ success: false, error: nothingWasCharged ? 'insufficient_credits' : 'credit_reservation_failed', required: CREDIT_COST }, { status: 402 });
    }

    let result: Awaited<ReturnType<typeof generateImage>>;
    try {
      // 'gemini', not 'gpt': lib/ai/router.ts forwards `referenceImageUrl` only in
      // the gemini branch. With 'gpt' the image to edit never reached the model, so
      // "edit this photo" generated an unrelated picture from the instruction alone.
      result = await generateImage({ prompt, model: 'gemini', resolution: '1080p', referenceImageUrl: input.imageUrl });

      // Apply watermark for free plan users
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan_id')
        .eq('id', user.id)
        .single();
      const planId = profile?.plan_id || 'free';
      if (result.url) {
        // Pyra returns a data: URL. Persisting it keeps the whole image out of
        // generations.output and assets.url, and burns in the free-plan
        // watermark before the single upload.
        result.url = await persistGeneratedImage(supabase, result.url, {
          userId: user.id, generationId: generation.id, planId,
        });
      }
    } catch (genError) {
      const refundResult = await refundCredits({ userId: user.id, amount: CREDIT_COST, description: `Refund: edit generation failed`, generationId: generation?.id });
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_failed',
        }, 'edit');
      }
      // No exemption for PromptBlockedError. The prompt is now built above the
      // reservation, so a blocked instruction cannot reach this arm at all — and
      // back when it could, exempting it meant a refund that FAILED still
      // returned a tidy 400 and lost the credits with nothing logged. Credits
      // that did not come back are the alarm, whatever threw. Same rule as
      // plan, analysis and storyboard.
      if (!refundResult.success) {
        console.error('Edit API error:', genError);
        return NextResponse.json({ success: false, error: 'refund_failed' }, { status: 500 });
      }
      throw genError;
    }

    if (generation) {
      await finalizeGeneration(supabase, generation.id, { status: 'completed', output: { imageUrl: result.url, mock: result.mock } }, 'edit');
      // `format` was omitted here and nowhere else, so every edit export and library
      // download was named .png regardless of the bytes — the same wrong-extension
      // defect that was fixed for the export ZIP.
      await insertAssets(supabase, [{ user_id: user.id, generation_id: generation.id, type: 'image', url: result.url || '', format: formatFromUrl(result.url || '') }], 'edit');
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, imageUrl: result.url, mock: result.mock, creditsUsed: CREDIT_COST, newBalance: reserveResult.newBalance } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    if (error instanceof PromptBlockedError) {
      return NextResponse.json(
        { success: false, error: 'prompt_blocked', term: error.blockedTerm },
        { status: 400 }
      );
    }
    console.error('Edit API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
