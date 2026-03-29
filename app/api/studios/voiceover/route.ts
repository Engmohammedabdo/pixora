import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import OpenAI from 'openai';
import { createServerClient } from '@/lib/supabase/server';
import { checkCredits } from '@/lib/credits/check';
import { deductCredits } from '@/lib/credits/deduct';
import { rateLimit } from '@/lib/rate-limit';

const InputSchema = z.object({
  script: z.string().min(1).max(500),
  voice: z.string(),
  dialect: z.string(),
  speed: z.enum(['0.75', '1', '1.25']),
  tone: z.string(),
});

const VOICE_MAP: Record<string, 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'> = {
  male: 'onyx',
  female: 'nova',
  neutral: 'alloy',
  young: 'echo',
  professional: 'fable',
  warm: 'shimmer',
};

function mapVoice(voice: string): 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' {
  const lower = voice.toLowerCase();
  return VOICE_MAP[lower] ?? 'alloy';
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    if (!rateLimit(`studio:${user.id}`, 20, 60000)) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    const body = await req.json();
    const input = InputSchema.parse(body);

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ success: false, error: 'tts_not_configured' }, { status: 503 });
    }

    const creditCost = Math.max(1, Math.ceil(input.script.length / 150));

    const creditCheck = await checkCredits({ supabase, userId: user.id, amount: creditCost });
    if (!creditCheck.hasEnough) {
      return NextResponse.json({ success: false, error: 'insufficient_credits', required: creditCost }, { status: 402 });
    }

    const { data: generation } = await supabase.from('generations').insert({
      user_id: user.id, studio: 'voiceover', model: 'tts-1', status: 'processing',
      input: { ...input }, credits_used: creditCost,
    }).select().single();

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: mapVoice(input.voice),
      input: input.script,
      speed: parseFloat(input.speed),
    });

    const audioBuffer = Buffer.from(await mp3.arrayBuffer());
    const fileName = `${user.id}/voiceover-${generation?.id ?? Date.now()}.mp3`;

    const { error: uploadError } = await supabase.storage
      .from('assets')
      .upload(fileName, audioBuffer, { contentType: 'audio/mpeg', upsert: false });

    let audioUrl: string;
    if (uploadError) {
      audioUrl = '';
    } else {
      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(fileName);
      audioUrl = urlData.publicUrl;
    }

    const estimatedDuration = Math.round((input.script.length / 150) * 30 / parseFloat(input.speed));

    const deductResult = await deductCredits({
      supabase, userId: user.id, amount: creditCost, studio: 'voiceover',
      description: `Voiceover - ${input.voice} (${input.dialect})`, generationId: generation?.id,
    });

    if (generation) {
      await supabase.from('generations').update({
        status: 'completed',
        output: { audioUrl, duration: estimatedDuration },
      }).eq('id', generation.id);
      await supabase.from('assets').insert({
        user_id: user.id, generation_id: generation.id, type: 'audio', url: audioUrl,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        generationId: generation?.id,
        audioUrl,
        duration: estimatedDuration,
        creditsUsed: creditCost,
        newBalance: deductResult.newBalance,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    console.error('Voiceover API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
