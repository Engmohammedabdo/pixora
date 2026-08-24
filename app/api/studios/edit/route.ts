import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { failGeneration, finalizeGeneration, insertAssets } from '@/lib/supabase/generation-writes';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { generateImage } from '@/lib/ai/router';
import { persistGeneratedImage } from '@/lib/storage/persist-image';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
import { resolveProjectId } from '@/lib/projects/verify';
import { refundAwareErrorCode } from '@/lib/studio-errors';

/**
 * The image to edit must be one the SERVER can read, not one that only means
 * something inside the customer's tab.
 *
 * `z.string().min(1)` accepted `blob:http://localhost:3000/8f2c-…`, which is
 * what the studio page sent whenever /api/upload refused the file (HEIC, GIF,
 * AVIF, anything over 10MB) — the refusal was discarded client-side and the
 * object URL was submitted instead. This schema passed it, the generations row
 * was inserted, a credit was reserved, and only then did lib/ai/gemini.ts
 * refuse it ("only HTTPS URLs allowed"). The customer watched a long spinner
 * for a generic failure, was refunded, and retrying the same file failed
 * identically forever.
 *
 * TWO forms are readable server-side and both are accepted:
 *   - `https://`, which lib/ai/gemini.ts:59-63 fetches through its host
 *     allowlist;
 *   - `data:image/`, which lib/ai/gemini.ts:53-57 decodes INLINE before any of
 *     that — no fetch, no timeout, no allowlist. It is the best-supported
 *     reference form, not a refused one, and it is what this product actually
 *     hands over: lib/storage/persist-image.ts returns a data: URL whenever the
 *     storage upload fails, unconditionally on a watermarked free plan because
 *     that is the fail-CLOSED path keeping the watermark on, and
 *     CreatorPreview's "edit this" link forwards whatever URL it holds. An
 *     earlier version of this guard refused `data:` on the claim that gemini.ts
 *     rejects it and that nothing here sends one; both were wrong, and the
 *     result was a hard 400 on the Creator→Edit handoff during exactly the
 *     degraded storage state it was built to survive.
 *
 * The unbounded-payload concern the old comment raised is real but belongs to
 * `generations.input`, not to the request — see inputImageRef() below.
 *
 * Stated on the RAW string and checked BEFORE the insert, so a blob:, http: or
 * relative string costs nothing. Raw bytes rather than `new URL()` for the same
 * reason lib/storage/uploaded-url.ts gives: what is stored is the string the
 * client sent, so anything a parser would normalise is a value we checked but
 * did not write.
 */
const readableImageUrl = z
  .string()
  .min(1)
  .refine((v) => v.startsWith('https://') || v.startsWith('data:image/'), {
    message: 'must be an https:// URL the server can fetch, or an inline data:image/ payload (blob:, http: and relative URLs cannot be read server-side)',
  });

/**
 * What gets recorded in `generations.input`.
 *
 * An inline reference image is a legitimate input but an unbounded one — the
 * measured payloads run to 2.8 MB — and that column is JSONB every admin screen
 * reads row by row. Record that one was supplied; the bytes stay in memory,
 * where the model call is the only thing that needs them.
 */
function inputImageRef(url: string): string {
  if (!url.startsWith('data:')) return url;
  const mime = url.slice(5).split(';')[0] || 'image';
  return `[inline ${mime} reference, ${url.length} chars]`;
}

const InputSchema = z.object({
  projectId: z.string().uuid().optional(),
  imageUrl: readableImageUrl,
  editDescription: z.string().min(5).max(500),
  editType: z.enum(['background_replace', 'object_remove', 'color_change', 'text_add', 'style_transfer']),
});

const CREDIT_COST = 1;

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
      return NextResponse.json({ success: false, error: 'System is under maintenance' }, { status: 503 });
    }
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'edit')) {
      return NextResponse.json({ success: false, error: 'This studio is currently disabled' }, { status: 403 });
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

    const { data: generation, error: genInsertError } = await supabase.from('generations').insert({
      user_id: user.id, project_id: projectId, studio: 'edit', model: 'gemini', status: 'processing',
      input: { imageUrl: inputImageRef(input.imageUrl), editDescription: input.editDescription, editType: input.editType },
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
      // Every other studio sanitizes before the model sees the text; these three
      // never did, so the catch for PromptBlockedError below was unreachable and
      // the two highest-risk image surfaces had no filter at all.
      const safeDescription = sanitizePrompt(input.editDescription);
      const prompt = `Image editing - ${input.editType.replace(/_/g, ' ')}: ${safeDescription}`;
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
      // PromptBlockedError carries its own dedicated response (400 + `term`),
      // handled by the outer catch below — don't clobber that with refund_failed.
      if (!refundResult.success && !(genError instanceof PromptBlockedError)) {
        console.error('Edit API error:', genError);
        return NextResponse.json({ success: false, error: 'refund_failed' }, { status: 500 });
      }
      throw genError;
    }

    if (generation) {
      await finalizeGeneration(supabase, generation.id, { status: 'completed', output: { imageUrl: result.url, mock: result.mock } }, 'edit');
      await insertAssets(supabase, [{ user_id: user.id, generation_id: generation.id, type: 'image', url: result.url || '' }], 'edit');
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
