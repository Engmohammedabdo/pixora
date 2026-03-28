import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { checkCredits } from '@/lib/credits/check';
import { deductCredits } from '@/lib/credits/deduct';

const InputSchema = z.object({
  script: z.string().min(1).max(500),
  voice: z.string(),
  dialect: z.string(),
  speed: z.enum(['0.75', '1', '1.25']),
  tone: z.string(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    const body = await req.json();
    const input = InputSchema.parse(body);

    const creditCost = Math.max(1, Math.ceil(input.script.length / 150));

    const creditCheck = await checkCredits({ supabase, userId: user.id, amount: creditCost });
    if (!creditCheck.hasEnough) {
      return NextResponse.json({ success: false, error: 'insufficient_credits', required: creditCost }, { status: 402 });
    }

    const { data: generation } = await supabase.from('generations').insert({
      user_id: user.id, studio: 'voiceover', model: 'tts', status: 'processing',
      input: { ...input }, credits_used: creditCost,
    }).select().single();

    // Mock TTS response
    const estimatedDuration = Math.round((input.script.length / 150) * 30 / parseFloat(input.speed));
    const mockAudioUrl = 'https://placehold.co/mock-audio';

    const deductResult = await deductCredits({ supabase, userId: user.id, amount: creditCost, studio: 'voiceover', description: `Voiceover - ${input.voice} (${input.dialect})`, generationId: generation?.id });

    if (generation) {
      await supabase.from('generations').update({ status: 'completed', output: { audioUrl: mockAudioUrl, duration: estimatedDuration, mock: true } }).eq('id', generation.id);
      await supabase.from('assets').insert({ user_id: user.id, generation_id: generation.id, type: 'audio', url: mockAudioUrl });
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, audioUrl: mockAudioUrl, duration: estimatedDuration, mock: true, creditsUsed: creditCost, newBalance: deductResult.newBalance } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    console.error('Voiceover API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
