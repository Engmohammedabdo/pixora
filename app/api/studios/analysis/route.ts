import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { routing } from '@/i18n/routing';
import { ANALYSIS_RESPONSE_SCHEMA } from '@/lib/ai/response-schemas';
import { AnalysisSchema } from '@/lib/ai/studio-output-schemas';
import { createServerClient } from '@/lib/supabase/server';
import { failGeneration, finalizeGeneration } from '@/lib/supabase/generation-writes';
import { reserveCredits, refundCredits, refundMockRun } from '@/lib/credits/deduct';
import { generateText } from '@/lib/ai/router';
import { ANALYSIS_PROMPT_VERSION, buildAnalysisPrompt } from '@/lib/ai/prompts/analysis';
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
  // Optional, and NOT tightened by app/api/brand-kits validation here: the
  // caller only ever sends an id it fetched from its own /api/brand-kits list,
  // and the fetch below is scoped to the caller (.eq('user_id', user.id)), the
  // same pattern as creator/route.ts.
  brandKitId: z.string().uuid().optional(),
  businessName: z.string().min(2).max(200),
  industry: z.string().min(2).max(100),
  description: z.string().min(10).max(2000),
  competitors: z.array(z.string().max(200)).max(5),
  targetMarket: z.string().min(5).max(500),
  painPoints: z.string().max(1000).optional().default(''),
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
    if (!isStudioEnabled(studioConfig, 'analysis')) {
      return NextResponse.json({ success: false, error: 'studio_disabled' }, { status: 403 });
    }

    const body = await request.json();
    const input = InputSchema.parse(body);

    // The safety filter runs HERE, before the generations row and before the
    // reservation — the same order campaign, creator and plan use.
    // buildAnalysisPrompt sanitizes too, but it is called with 3 credits already
    // held, so a blocked prompt had to be refunded back out again; and if that
    // refund failed the loss was silent, because the refund guard below used to
    // exempt PromptBlockedError from its alarm. A blocked analysis now costs
    // nothing and needs no refund at all.
    //
    // EVERY field is free text that reaches the prompt, so every one is filtered
    // — at the caps the builder itself uses (`description` at sanitizePrompt's
    // own 2000 default, the rest at InputSchema's maxima, which the builder
    // interpolates raw), so the builder's second pass over THESE fields
    // truncates nothing and cannot throw.
    //
    // It is not the whole filter, though, and the comment here used to imply it
    // was. The brand kit's own columns are filtered only inside
    // buildBrandContextBlock(), which runs inside buildAnalysisPrompt() — so the
    // guarantee above holds only because that call is hoisted above the
    // reservation below. Do not move it back down.
    const safeInput = {
      ...input,
      businessName: sanitizePrompt(input.businessName, 200),
      industry: sanitizePrompt(input.industry, 100),
      description: sanitizePrompt(input.description, 2000),
      targetMarket: sanitizePrompt(input.targetMarket, 500),
      painPoints: sanitizePrompt(input.painPoints, 1000),
      // Per competitor, not over the joined string: the schema caps each at 200
      // chars and allows five, so sanitizing after the join would apply one
      // 200-char cap to the whole list and silently drop the later names.
      competitors: input.competitors.map((c) => sanitizePrompt(c, 200)),
    };

    // Never trust a client-supplied project id: verify it belongs to the caller
    // before filing work into it, or a user could write into another
    // customer's workspace.
    const projectId = await resolveProjectId(supabase, user.id, input.projectId);
    if (projectId === false) {
      return NextResponse.json({ success: false, error: 'project_not_found' }, { status: 404 });
    }

    // Fetch the caller's brand kit — the migration-045 business columns,
    // reshaped for buildBrandContextBlock. Scoped to the caller, the same
    // pattern as creator/route.ts. plan and analysis were deliberately left out
    // of P4.1 because they receive no brand kit at all; this closes that gap.
    //
    // Only `city` survives, and that is the point. analysis asks the customer
    // for the business name, the industry, the DESCRIPTION and the target
    // market in its own form — and the page prefills all four from the default
    // kit and then sends `brandKitId` regardless of what the customer edited
    // afterwards. Left in, a customer who retyped the name and picked a
    // different industry got a 3-credit prompt carrying two business identities
    // and two `- Industry:` lines. The form is the fresher source for anything
    // the form asks for, so the kit contributes only what the form does NOT:
    // `city`. buildBrandContextBlock returns '' when there is nothing left to
    // say, which is the common case for a kit with no city.
    let brandContext: BrandContextPromptInput | null = null;
    if (input.brandKitId) {
      const { data: kit } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('id', input.brandKitId)
        .eq('user_id', user.id)
        .single();
      brandContext = kit
        ? {
            name: null,
            industry: null,
            description: null,
            targetAudience: null,
            city: kit.city ?? null,
          }
        : null;
    }

    // Built HERE — above the generations insert and above the reservation —
    // because buildBrandContextBlock (called inside buildAnalysisPrompt) is what
    // actually runs sanitizePrompt over the kit's city. Built later, as this
    // route did until now, a blocked term in a brand-kit column was only caught
    // AFTER 3 credits were reserved: refund, a `failed` row attributed to
    // `generation_failed`, and a 500 `refund_failed` with the credits stranded
    // for 45 minutes if the refund itself failed. Exactly the ordering commit
    // c12e928 fixed in storyboard and photoshoot and did not fix here. A
    // PromptBlockedError thrown here reaches the OUTER catch directly — no
    // credits moved, no orphan row — same as `safeInput` above.
    const prompt = buildAnalysisPrompt({
      ...safeInput,
      locale: input.locale ?? routing.defaultLocale,
      brandContext,
    });

    const creditCost = CREDIT_COSTS.analysis;

    const { data: generation, error: genInsertError } = await supabase.from('generations').insert({
      user_id: user.id, project_id: projectId, studio: 'analysis', model: 'gemini', input: { ...input, promptVersion: ANALYSIS_PROMPT_VERSION }, credits_used: creditCost, status: 'processing',
    }).select().single();

    // Fail loudly — otherwise credits are reserved and the model is called while
    // the generations row was never written, and the user is charged for nothing.
    if (genInsertError || !generation) {
      return NextResponse.json(
        { success: false, error: 'failed_to_create_generation' },
        { status: 500 }
      );
    }

    const reserveResult = await reserveCredits({
      userId: user.id, amount: creditCost,
      studio: 'analysis', description: `Marketing Analysis - ${input.businessName}`,
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
        }, 'analysis');
      }
      return NextResponse.json({ success: false, error: nothingWasCharged ? 'insufficient_credits' : 'credit_reservation_failed', required: creditCost }, { status: 402 });
    }

    let result: Awaited<ReturnType<typeof generateText>>;
    let analysis: z.infer<typeof AnalysisSchema>;
    try {
      result = await generateText({
      prompt,
      maxTokens: 8192,
      temperature: 0.2,
      responseSchema: ANALYSIS_RESPONSE_SCHEMA,
    });

      // Unparseable output = failure + refund. The old fallback returned canned
      // text containing PyraSuite's OWN pricing page ("مبتدئ: $12/شهر") as if it
      // were an analysis of the customer's business — charged at full price.
      try {
        const jsonMatch = (result.text || '').match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('model returned no JSON object');
        // Valid JSON of the WRONG shape is a parse failure too — it throws here
        // so it lands in the same refund branch, never in `completed`.
        analysis = AnalysisSchema.parse(JSON.parse(jsonMatch[0]));
      } catch {
        // The refund runs BEFORE the terminal write, and the write is conditional on
        // it. Marking the row failed first — as this did — hands the credits nowhere
        // if the refund then fails: the row is already out of the reconciler's scan.
        const refundResult = await refundCredits({
          userId: user.id, amount: creditCost,
          description: 'Refund: analysis parse failure',
          generationId: generation?.id,
        });
        if (generation) {
          await failGeneration(supabase, generation.id, {
            creditsSettled: refundResult.success,
            error: 'generation_parse_failed',
          }, 'analysis');
        }
        return NextResponse.json({
          success: false,
          error: refundAwareErrorCode(refundResult, 'generation_parse_failed'),
        }, { status: 500 });
      }
    } catch (genError) {
      const refundResult = await refundCredits({ userId: user.id, amount: creditCost, description: `Refund: analysis generation failed`, generationId: generation?.id });
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_failed',
        }, 'analysis');
      }
      // No exemption here. The whole prompt — the customer's fields AND the
      // brand kit's columns — is now built above the reservation, so a blocked
      // prompt cannot reach this arm at all. That was NOT true while
      // buildAnalysisPrompt() was called inside this try: the brand-kit half of
      // the filter ran with 3 credits already held, and this comment asserted
      // the opposite for two commits. Back when a block could reach here,
      // exempting it meant a refund that FAILED still returned a tidy 400 and
      // lost the credits with nothing logged. Credits that did not come back
      // are the alarm, whatever threw.
      if (!refundResult.success) {
        console.error('Analysis API error:', genError);
        return NextResponse.json({ success: false, error: 'refund_failed' }, { status: 500 });
      }
      throw genError;
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
      studio: 'analysis', generationId: generation.id,
    });
    const creditsCharged = mockRefund.refunded ? 0 : creditCost;

    if (generation) {
      await finalizeGeneration(supabase, generation.id, {
        output: { analysis, mock: result.mock },
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
      }, 'analysis');
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, analysis, mock: result.mock, creditsUsed: creditsCharged, newBalance: mockRefund.refunded ? mockRefund.newBalance : reserveResult.newBalance } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    if (error instanceof PromptBlockedError) {
      return NextResponse.json(
        { success: false, error: 'prompt_blocked', term: error.blockedTerm },
        { status: 400 }
      );
    }
    console.error('Analysis API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
