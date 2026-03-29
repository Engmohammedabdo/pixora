import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { generateText } from '@/lib/ai/router';
import { buildPromptBuilderPrompt, getMockPromptResults } from '@/lib/ai/prompts/prompt-builder';
import { checkRateLimit } from '@/lib/rate-limit';

const InputSchema = z.object({
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

    const body = await request.json();
    const input = InputSchema.parse(body);

    const { data: generation } = await supabase.from('generations').insert({
      user_id: user.id, studio: 'prompt-builder', model: 'gemini',
      input: { description: input.description, outputType: input.outputType },
      credits_used: 0, status: 'completed',
    }).select().single();

    const prompt = buildPromptBuilderPrompt(input);
    const result = await generateText({ prompt });

    let prompts: { prompt: string; style: string; tip: string }[];
    try {
      const parsed = JSON.parse(result.text || '[]');
      prompts = Array.isArray(parsed) ? parsed : getMockPromptResults();
    } catch {
      prompts = getMockPromptResults();
    }

    return NextResponse.json({
      success: true,
      data: { prompts, mock: result.mock, generationId: generation?.id },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    }
    console.error('Prompt builder error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
