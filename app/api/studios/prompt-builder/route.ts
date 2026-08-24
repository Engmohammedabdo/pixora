import { failGeneration } from '@/lib/supabase/generation-writes';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { PROMPT_BUILDER_RESPONSE_SCHEMA } from '@/lib/ai/response-schemas';
import { createServerClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/router';
import { PROMPT_BUILDER_PROMPT_VERSION, buildPromptBuilderPrompt } from '@/lib/ai/prompts/prompt-builder';
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { resolveProjectId } from '@/lib/projects/verify';

/**
 * What the route hands back. Every field is one the page renders.
 *
 * `printable` rather than z.string(): a model that returns a number for `style`
 * should cost the customer a plain-looking card, not a 500 — the same leaf shape
 * plan and analysis already use.
 */
const printable = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((v) => String(v))
  .catch('');

const PromptListSchema = z
  .array(z.object({ prompt: printable, style: printable, tip: printable }).loose())
  .min(1)
  // Stated on CONTENT, not on length: every leaf above `.catch('')`-defaults, so a
  // non-empty array proves nothing — `[{},{}]` would otherwise pass as a result.
  // This is the same defect the plan studio's completeness gate was rewritten for.
  .refine((list) => list.some((p) => p.prompt.trim().length > 0), 'model returned no usable prompts');

const InputSchema = z.object({
  projectId: z.string().uuid().optional(),
  description: z.string().min(5).max(500),
  outputType: z.enum(['image', 'video', 'copy', 'campaign']),
  style: z.string().max(100).optional(),
});

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

    const flags = await getCachedFeatureFlags();
    if (flags.maintenance_mode) {
      return NextResponse.json({ success: false, error: 'maintenance_mode' }, { status: 503 });
    }
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'prompt-builder')) {
      return NextResponse.json({ success: false, error: 'studio_disabled' }, { status: 403 });
    }

    const body = await request.json();
    const input = InputSchema.parse(body);

    const projectId = await resolveProjectId(supabase, user.id, input.projectId);
    if (projectId === false) {
      return NextResponse.json({ success: false, error: 'project_not_found' }, { status: 404 });
    }

    const { data: generation, error: genInsertError } = await supabase.from('generations').insert({
      user_id: user.id, project_id: projectId, studio: 'prompt-builder', model: 'gemini',
      input: { description: input.description, outputType: input.outputType, promptVersion: PROMPT_BUILDER_PROMPT_VERSION },
      credits_used: 0, status: 'completed',
    }).select().single();

    // No credits are charged here, but silently losing the record is still wrong —
    // it hides a schema mismatch (e.g. a missing project_id column) behind a 200.
    if (genInsertError || !generation) {
      return NextResponse.json(
        { success: false, error: 'failed_to_create_generation' },
        { status: 500 }
      );
    }

    // Every other studio sanitizes before the model sees the text; this one
    // never did, so the user's description reached the model unfiltered.
    const prompt = buildPromptBuilderPrompt({ ...input, description: sanitizePrompt(input.description) });
    const result = await generateText({
      prompt,
      temperature: 0.2,
      responseSchema: PROMPT_BUILDER_RESPONSE_SCHEMA,
    });

    // No credits are charged here, so there is nothing to refund — but returning
    // canned results as if the model had answered is still dishonest. Report the
    // failure and let the user retry.
    let prompts: { prompt: string; style: string; tip: string }[];
    try {
      // Extract the JSON array rather than parsing the raw text: models routinely
      // wrap output in ```json fences, which a bare JSON.parse rejects. The other
      // studios already do this — matching them here avoids failing a response
      // that is actually valid.
      const text = result.text || '';
      const match = text.match(/\[[\s\S]*\]/);
      const parsed = JSON.parse(match ? match[0] : text);
      // Was `prompts = parsed` after an isArray check, so ANY JSON array came back
      // to the customer as success — `[1,2,3]` included. The route charges nothing,
      // so this is not about money; it is about not calling junk a result.
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('model returned no prompt list');
      prompts = PromptListSchema.parse(parsed);
    } catch {
      if (generation) {
        // Nothing was ever reserved for this route, so there is nothing owed and the
        // row is safe to close. Kept explicit rather than left as a raw write so the
        // terminal-write invariant has no exceptions to carve out.
        await failGeneration(supabase, generation.id, {
          creditsSettled: true,
          error: 'generation_parse_failed',
        }, 'prompt-builder');
      }
      return NextResponse.json({
        success: false,
        error: 'generation_parse_failed',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { prompts, mock: result.mock, generationId: generation?.id },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    }
    // Carries the offending word so the UI can name it. This studio charges 0
    // credits, so there is nothing to refund — it is a plain 400.
    if (error instanceof PromptBlockedError) {
      return NextResponse.json(
        { success: false, error: 'prompt_blocked', term: error.blockedTerm },
        { status: 400 }
      );
    }
    console.error('Prompt builder error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
