import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { routing } from '@/i18n/routing';
import { STORYBOARD_RESPONSE_SCHEMA } from '@/lib/ai/response-schemas';
import { ScenesSchema } from '@/lib/ai/studio-output-schemas';
import { createServerClient } from '@/lib/supabase/server';
import { failGeneration, finalizeGeneration } from '@/lib/supabase/generation-writes';
import { reserveCredits, refundCredits, refundMockRun } from '@/lib/credits/deduct';
import { generateText } from '@/lib/ai/router';
import { STORYBOARD_PROMPT_VERSION, buildStoryboardPrompt } from '@/lib/ai/prompts/storyboard';
import type { BrandContextPromptInput } from '@/lib/ai/prompts/brand-context';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
import { resolveProjectId } from '@/lib/projects/verify';
import { refundAwareErrorCode } from '@/lib/studio-errors';

const InputSchema = z.object({
  // The API sits outside app/[locale], so the caller's language is not recoverable
  // server-side — and profiles.locale is a dead column (lib/stripe/locale.ts).
  // Optional, so any existing caller keeps working and defaults to Arabic.
  locale: z.enum(routing.locales as unknown as [string, ...string[]]).optional(),
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
      return NextResponse.json({ success: false, error: 'maintenance_mode' }, { status: 503 });
    }
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'storyboard')) {
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
    const creditCost = CREDIT_COSTS.storyboard;

    // Sanitize BEFORE the insert and BEFORE the reservation, so a blocked word costs
    // nothing. plan and analysis already do this; storyboard was the one that charged
    // first and filtered second — at 14 credits, the most expensive place to get that
    // order wrong. PromptBlockedError thrown here reaches the OUTER catch directly,
    // which returns 400 + `term` with no credits moved and no orphan row.
    const safeConcept = sanitizePrompt(input.concept, 2000);

    let brandKitName: string | undefined;
    // Also carries the migration-045 business columns so buildStoryboardPrompt's
    // CLIENT CONTEXT block has something to say. sanitizePrompt runs INSIDE that
    // block, not here — this route only reshapes the row, same as campaign does
    // for its own brandContext.
    let brandContext: BrandContextPromptInput | null = null;
    if (input.brandKitId) {
      const { data: brandKit } = await supabase
        .from('brand_kits')
        .select('name, industry, description, target_audience, city')
        .eq('id', input.brandKitId)
        .eq('user_id', user.id)
        .single();
      // `brand_kits` has no column-level GRANT lockdown (022 covered `profiles` only;
      // 042 constrains logo_url alone), so a customer can PATCH `name` to any string
      // over PostgREST and app/api/brand-kits/route.ts's max(100) never runs.
      brandKitName = brandKit?.name ? sanitizePrompt(String(brandKit.name), 100) : undefined;
      brandContext = brandKit
        ? {
            name: brandKit.name ?? null,
            industry: brandKit.industry ?? null,
            description: brandKit.description ?? null,
            targetAudience: brandKit.target_audience ?? null,
            city: brandKit.city ?? null,
          }
        : null;
    }

    // Built HERE — before the insert and before the reservation — because
    // buildBrandContextBlock (called inside buildStoryboardPrompt) is what
    // actually runs sanitizePrompt over industry/description/targetAudience/
    // city. Building the prompt later (as this route previously did, inside
    // the post-reservation try block) meant a blocked term in one of those
    // brand-kit columns was only caught AFTER 14 credits were reserved,
    // reversing the guarantee the comment above makes for `concept`. A
    // PromptBlockedError thrown here reaches the OUTER catch directly — no
    // credits moved, no orphan row — same as `safeConcept` above.
    const prompt = buildStoryboardPrompt({ ...input, concept: safeConcept, duration: parseInt(input.duration, 10), brandName: brandKitName, brandContext, locale: input.locale ?? routing.defaultLocale });

    const { data: generation, error: genInsertError } = await supabase.from('generations').insert({
      user_id: user.id, project_id: projectId, studio: 'storyboard', model: 'gemini', input: { ...input, concept: safeConcept, brandKitName, promptVersion: STORYBOARD_PROMPT_VERSION }, credits_used: creditCost, status: 'processing',
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
    const result = await generateText({
      prompt,
      maxTokens: 8192,
      temperature: 0.2,
      responseSchema: STORYBOARD_RESPONSE_SCHEMA,
    });

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

    // A mock is not a generation. With no API keys configured the adapters return
    // filler that now CONFORMS to the schema, so the parse above succeeds, the row
    // is finalized `completed` and the credits are kept for `[mock] field` text —
    // against the one real Supabase instance this project has. Dev-only by
    // construction: rejectMockInProduction() (lib/ai/router.ts) throws on every
    // return path of generateText when NODE_ENV is production, so `mock` cannot be
    // true there.
    const mockRefund = await refundMockRun({
      mocked: result.mock, userId: user.id, amount: creditCost,
      studio: 'storyboard', generationId: generation.id,
    });
    const creditsCharged = mockRefund.refunded ? 0 : creditCost;

    if (generation) {
      await finalizeGeneration(supabase, generation.id, {
        output: { scenes, mock: result.mock },
        status: 'completed',
        // The net charge after a refund that LANDED, never the intended figure —
        // the same rule campaign, creator and photoshoot state.
        credits_used: creditsCharged,
        // Record the model that ACTUALLY served. The row is inserted before
        // generation from the PREFERRED model, but the router falls back — so a
        // gpt-served run stayed filed under gemini forever, and six admin surfaces
        // read this column. MODEL_COSTS is gemini 0.002 vs gpt 0.01, so every
        // mis-attributed run also understated estimated API cost 5x.
        model: result.model,
      }, 'storyboard');
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, scenes, mock: result.mock, creditsUsed: creditsCharged, newBalance: mockRefund.refunded ? mockRefund.newBalance : reserveResult.newBalance } });
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
