import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { routing } from '@/i18n/routing';
import { PLAN_RESPONSE_SCHEMA } from '@/lib/ai/response-schemas';
import { PlanSchema } from '@/lib/ai/studio-output-schemas';
import { createServerClient } from '@/lib/supabase/server';
import { failGeneration, finalizeGeneration } from '@/lib/supabase/generation-writes';
import { reserveCredits, refundCredits, refundMockRun } from '@/lib/credits/deduct';
import { generateText } from '@/lib/ai/router';
import { PLAN_PROMPT_VERSION, buildPlanPrompt } from '@/lib/ai/prompts/plan';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
import { resolveProjectId } from '@/lib/projects/verify';
import { resolveWorkingIdentity } from '@/lib/brand-kits/working-identity';
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
  // Free text the customer typed after picking أخرى. Deliberately NOT
  // `z.enum(INDUSTRIES)` on `industry` above and deliberately not required
  // here: tightening the slug would turn a quality loss into a 400 on every
  // restore of a historical row, and this field is what carries the fact
  // instead. It reaches the prompt as description-level context only —
  // `industryName()` still governs the persona (lib/ai/prompts/plan.ts).
  industryOther: z.string().max(100).optional(),
  goals: z.array(z.string().max(200)).min(1).max(10),
  targetMarket: z.string().min(5).max(500),
  budget: z.string().min(1).max(200),
  duration: z.enum(['30', '60', '90']),
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
    if (!isStudioEnabled(studioConfig, 'plan')) {
      return NextResponse.json({ success: false, error: 'studio_disabled' }, { status: 403 });
    }

    const body = await request.json();
    const input = InputSchema.parse(body);

    // The safety filter runs HERE, before the generations row and before the
    // reservation — the same order campaign and creator use. buildPlanPrompt
    // sanitizes too, but it is called with 5 credits already held, so a blocked
    // prompt had to be refunded back out again; and if that refund failed the
    // loss was silent, because the refund guard below used to exempt
    // PromptBlockedError from its alarm. A blocked plan now costs nothing and
    // needs no refund at all.
    //
    // EVERY field is free text that reaches the prompt, so every one is filtered
    // — at the caps the builder itself uses (which mirror InputSchema's maxima),
    // so the builder's second pass over THESE fields truncates nothing and
    // cannot throw.
    //
    // It is not the whole filter, though, and the comment here used to imply it
    // was. The brand kit's own columns are filtered only inside
    // buildBrandContextBlock(), which runs inside buildPlanPrompt() — so the
    // guarantee above holds only because that call is hoisted above the
    // reservation below. Do not move it back down.
    const safeInput = {
      ...input,
      businessName: sanitizePrompt(input.businessName, 200),
      industry: sanitizePrompt(input.industry, 100),
      industryOther: input.industryOther ? sanitizePrompt(input.industryOther, 100) : undefined,
      targetMarket: sanitizePrompt(input.targetMarket, 500),
      budget: sanitizePrompt(input.budget, 200),
      goals: input.goals.map((g) => sanitizePrompt(g, 200)),
    };

    // Never trust a client-supplied project id: verify it belongs to the caller
    // before filing work into it, or a user could write into another
    // customer's workspace.
    const projectId = await resolveProjectId(supabase, user.id, input.projectId);
    if (projectId === false) {
      return NextResponse.json({ success: false, error: 'project_not_found' }, { status: 404 });
    }

    // The Working Identity — see CONTEXT.md and lib/brand-kits/working-identity.ts.
    //
    // This route used to read `input.brandKitId` and nothing else, so the
    // project was ignored entirely: a customer could select a client in the
    // ProjectSelector this page renders, pay 5 credits, and receive a plan
    // written for a different client's business. The module resolves
    // explicit -> project -> account default, once, for all seven studios.
    //
    // `name`, `industry` and `targetAudience` are OMITTED, and that is not a
    // detail. plan and analysis are the only two studios where the same facts
    // arrive twice — once from the kit and once from the request body, because
    // the page prefills Business Name / Industry / Target Market FROM the kit
    // and then sends `brandKitId` regardless of what the customer edited
    // afterwards. Left in, a customer who retyped the name and picked a
    // different industry got a 5-credit prompt carrying two business identities
    // and two `- Industry:` lines. The form is the fresher source for anything
    // the form asks for, so the kit contributes only what the form does NOT:
    // `description` (plan has no description field) and `city` (no studio form
    // has one).
    //
    // Called HERE — above the insert and above the reservation — because
    // `sanitizePrompt` runs inside it and throws PromptBlockedError, which must
    // reach the OUTER catch with no credits moved and no orphan row. The
    // `working-identity-before-reserve` invariant fails the build otherwise.
    const identity = await resolveWorkingIdentity(supabase, user.id, {
      brandKitId: input.brandKitId,
      projectId,
      omit: ['name', 'industry', 'targetAudience'],
    });
    if (input.brandKitId && identity.source === 'none') {
      // ADR-0001: a stale or foreign id resolves to nothing and deliberately
      // does not fall through. Logged rather than returned — the customer did
      // not type this id and cannot act on it — but logged, because before this
      // line no console output anywhere under app/api/studios mentioned a brand
      // kit, which is how six studios ran with no identity for a month.
      console.warn(`[working-identity][plan] brandKitId ${input.brandKitId} did not resolve for user ${user.id}`);
    }
    const brandContext = identity.context;

    // Built HERE — above the generations insert and above the reservation —
    // because buildBrandContextBlock (called inside buildPlanPrompt) is what
    // actually runs sanitizePrompt over the kit's description and city. Built
    // later, as this route did until now, a blocked term in a brand-kit column
    // was only caught AFTER 5 credits were reserved: refund, a `failed` row
    // attributed to `generation_failed`, and a 500 `refund_failed` with the
    // credits stranded for 45 minutes if the refund itself failed. Exactly the
    // ordering commit c12e928 fixed in storyboard and photoshoot and did not
    // fix here. A PromptBlockedError thrown here reaches the OUTER catch
    // directly — no credits moved, no orphan row — same as `safeInput` above.
    const prompt = buildPlanPrompt({
      ...safeInput,
      duration: parseInt(safeInput.duration, 10),
      locale: input.locale ?? routing.defaultLocale,
      brandContext,
    });

    const creditCost = CREDIT_COSTS.plan;

    const { data: generation, error: genInsertError } = await supabase.from('generations').insert({
      user_id: user.id, project_id: projectId, studio: 'plan', model: 'gemini', input: { ...input, brandKitId: identity.kit?.id ?? null, promptVersion: PLAN_PROMPT_VERSION }, credits_used: creditCost, status: 'processing',
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
      studio: 'plan', description: `Marketing Plan - ${input.businessName}`,
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
        }, 'plan');
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
      responseSchema: PLAN_RESPONSE_SCHEMA,
    });

    // A model response we cannot parse is a FAILURE, not a result. Previously this
    // fell back to canned Arabic filler, marked the generation `completed` and
    // charged full price — so the customer paid to receive boilerplate that was
    // not about their business at all.
    let plan: z.infer<typeof PlanSchema>;
    try {
      const jsonMatch = (result.text || '').match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('model returned no JSON object');
      // Valid JSON of the WRONG shape is a parse failure too — it throws here so
      // it lands in the same refund branch, never in `completed`.
      plan = PlanSchema.parse(JSON.parse(jsonMatch[0]));
    } catch {
      // The refund runs BEFORE the terminal write, and the write is conditional on
      // it. Marking the row failed first — as this did — hands the credits nowhere
      // if the refund then fails: the row is already out of the reconciler's scan.
      const refundResult = await refundCredits({
        userId: user.id, amount: creditCost,
        description: 'Refund: plan parse failure',
        generationId: generation?.id,
      });
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_parse_failed',
        }, 'plan');
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
      studio: 'plan', generationId: generation.id,
    });
    const creditsCharged = mockRefund.refunded ? 0 : creditCost;

    if (generation) {
      await finalizeGeneration(supabase, generation.id, {
        output: { plan, mock: result.mock },
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
      }, 'plan');
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, plan, mock: result.mock, creditsUsed: creditsCharged, newBalance: mockRefund.refunded ? mockRefund.newBalance : reserveResult.newBalance } });
    } catch (genError) {
      const refundResult = await refundCredits({
        userId: user.id, amount: creditCost,
        description: `Refund: plan generation failed`,
        generationId: generation?.id,
      });
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_failed',
        }, 'plan');
      }
      // No exemption here. The whole prompt — the customer's fields AND the
      // brand kit's columns — is now built above the reservation, so a blocked
      // prompt cannot reach this arm at all. That was NOT true while
      // buildPlanPrompt() was called inside this try: the brand-kit half of the
      // filter ran with 5 credits already held, and this comment asserted the
      // opposite for two commits. Back when a block could reach here, exempting
      // it meant a refund that FAILED still returned a tidy 400 and lost the
      // credits with nothing logged. Credits that did not come back are the
      // alarm, whatever threw.
      if (!refundResult.success) {
        console.error('Plan API error:', genError);
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
    console.error('Plan API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
