import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { finalizeGeneration } from '@/lib/supabase/generation-writes';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { generateText } from '@/lib/ai/router';
import { buildAnalysisPrompt } from '@/lib/ai/prompts/analysis';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
import { resolveProjectId } from '@/lib/projects/verify';
import { refundAwareErrorCode } from '@/lib/studio-errors';

const InputSchema = z.object({
  projectId: z.string().uuid().optional(),
  businessName: z.string().min(2).max(200),
  industry: z.string().min(2).max(100),
  description: z.string().min(10).max(2000),
  competitors: z.array(z.string().max(200)).max(5),
  targetMarket: z.string().min(5).max(500),
  painPoints: z.string().max(1000).optional().default(''),
});

/*
 * The model's JSON was accepted on "did JSON.parse succeed", finalized as
 * `completed`, and the 3 credits kept. The page then dereferenced the SWOT
 * quadrant arrays — `q.items.map`, guarded only by `analysis.swot` being truthy
 * — and a render throw trips the segment error boundary, so the customer paid
 * and got a generic Arabic error instead of their analysis.
 *
 * Shape is checked HERE so a wrong one takes the existing parse-failure branch
 * (refund + `generation_parse_failed`) rather than being sold, and the value we
 * store and return is the PARSED one — so the row RecentWork restores later is
 * normalized too. Sections nothing renders (usp/gtm/pricing) ride through on the
 * top-level `.loose()` untouched.
 */

/** A field the UI prints. A number where prose was asked for is not worth a
 *  refund; a missing one becomes an empty cell, not `undefined` on screen. */
const printable = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((v) => String(v))
  .catch('');

const printableList = z.array(printable).catch([]);

/** Does this section actually SHOW the customer anything?
 *
 *  Every leaf above is `.catch('')`, which never fails — it turns a
 *  non-printable value into an empty string. So a non-empty array proves
 *  nothing: `{"swot":{"strengths":[{},{}],...}}` parses into two entries of
 *  empty strings, and counting `.length` sold that as an analysis for 3
 *  credits. */
function hasPrintableText(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasPrintableText);
  return false;
}

const AnalysisSchema = z
  .object({
    swot: z
      .object({
        strengths: printableList,
        weaknesses: printableList,
        opportunities: printableList,
        threats: printableList,
      })
      .loose()
      .optional()
      .catch(undefined),
    personas: z
      .array(
        z
          .object({
            name: printable, age: printable, role: printable,
            goals: printable, pain_points: printable, channels: printable,
          })
          .loose(),
      )
      .catch([]),
    competitors: z
      .array(z.object({ name: printable, strengths: printable, weaknesses: printable, market_share: printable }).loose())
      .catch([]),
    roadmap: z
      .object({ day_30: printableList, day_60: printableList, day_90: printableList })
      .loose()
      .optional()
      .catch(undefined),
    kpis: z.array(z.object({ metric: printable, target: printable, timeframe: printable }).loose()).catch([]),
  })
  .loose()
  // Every section above defaults to empty, so `{}` would otherwise parse and be
  // charged for. Nothing in any section is the same failure the campaign studio
  // already treats as one: an empty response sold as a finished deliverable.
  //
  // Stated on CONTENT, not on `.length`: entry COUNT was the wrong question,
  // because `.catch('')` means an entry always parses. A SWOT of two empty
  // objects passed the count and was finalized as `completed`. Only the fields
  // the page and the PDF actually print are considered, so a section of
  // unrendered junk cannot vouch for itself.
  .refine((a) => {
    const swot = a.swot;
    const roadmap = a.roadmap;
    const sections: unknown[] = [
      swot ? [swot.strengths, swot.weaknesses, swot.opportunities, swot.threats] : [],
      roadmap ? [roadmap.day_30, roadmap.day_60, roadmap.day_90] : [],
      a.personas.map((p) => [p.name, p.age, p.role, p.goals, p.pain_points, p.channels]),
      a.competitors.map((c) => [c.name, c.strengths, c.weaknesses, c.market_share]),
      a.kpis.map((k) => [k.metric, k.target, k.timeframe]),
    ];
    return sections.some(hasPrintableText);
  }, 'model returned no usable analysis sections');

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
    if (!isStudioEnabled(studioConfig, 'analysis')) {
      return NextResponse.json({ success: false, error: 'This studio is currently disabled' }, { status: 403 });
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
    // interpolates raw), so the builder's second pass truncates nothing and
    // cannot throw.
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
    const creditCost = CREDIT_COSTS.analysis;

    const { data: generation, error: genInsertError } = await supabase.from('generations').insert({
      user_id: user.id, project_id: projectId, studio: 'analysis', model: 'gemini', input: { ...input }, credits_used: creditCost, status: 'processing',
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
      if (generation) await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      return NextResponse.json({ success: false, error: reserveResult.error === 'insufficient_credits' ? 'insufficient_credits' : 'credit_reservation_failed', required: creditCost }, { status: 402 });
    }

    let result: Awaited<ReturnType<typeof generateText>>;
    let analysis: z.infer<typeof AnalysisSchema>;
    try {
      const prompt = buildAnalysisPrompt(safeInput);
      result = await generateText({ prompt, maxTokens: 8192 });

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
        if (generation) {
          await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
        }
        const refundResult = await refundCredits({
          userId: user.id, amount: creditCost,
          description: 'Refund: analysis parse failure',
          generationId: generation?.id,
        });
        return NextResponse.json({
          success: false,
          error: refundAwareErrorCode(refundResult, 'generation_parse_failed'),
        }, { status: 500 });
      }
    } catch (genError) {
      const refundResult = await refundCredits({ userId: user.id, amount: creditCost, description: `Refund: analysis generation failed`, generationId: generation?.id });
      if (generation) await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      // No exemption here. The filter now runs before the reservation, so a
      // blocked prompt cannot reach this arm at all — and back when it could,
      // exempting it meant a refund that FAILED still returned a tidy 400 and
      // lost the credits with nothing logged. Credits that did not come back
      // are the alarm, whatever threw.
      if (!refundResult.success) {
        console.error('Analysis API error:', genError);
        return NextResponse.json({ success: false, error: 'refund_failed' }, { status: 500 });
      }
      throw genError;
    }

    if (generation) {
      await finalizeGeneration(supabase, generation.id, { output: { analysis, mock: result.mock }, status: 'completed' }, 'analysis');
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, analysis, mock: result.mock, creditsUsed: creditCost, newBalance: reserveResult.newBalance } });
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
