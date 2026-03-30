import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { checkCredits } from '@/lib/credits/check';
import { deductCredits } from '@/lib/credits/deduct';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
import { generateTTS } from '@/lib/ai/tts-router';
import { calculateVoiceoverCost, estimateVoiceoverDuration, getVoiceoverConfig } from '@/lib/credits/voiceover-costs';

const InputSchema = z.object({
  script: z.string().min(1).max(2000),
  voice: z.string(),
  dialect: z.string(),
  speed: z.enum(['0.5', '0.75', '1', '1.25', '1.5']),
  tone: z.string(),
});

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
    if (!isStudioEnabled(studioConfig, 'voiceover')) {
      return NextResponse.json({ success: false, error: 'This studio is currently disabled' }, { status: 403 });
    }

    const body = await req.json();
    const input = InputSchema.parse(body);

    // Sanitize script
    const safeScript = sanitizePrompt(input.script, 2000);

    // Get user's plan
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single();

    const planId = profile?.plan_id || 'free';
    const config = getVoiceoverConfig(planId);

    // Check duration limit
    const estimatedDuration = estimateVoiceoverDuration(safeScript.length, parseFloat(input.speed));
    if (estimatedDuration > config.maxDurationSeconds) {
      return NextResponse.json({
        success: false,
        error: 'duration_exceeded',
        maxDuration: config.maxDurationSeconds,
        estimatedDuration,
      }, { status: 403 });
    }

    // Check if voice is available for this plan
    if (!config.voicesAvailable.includes(input.voice)) {
      return NextResponse.json({
        success: false,
        error: 'voice_not_available',
        availableVoices: config.voicesAvailable,
      }, { status: 403 });
    }

    // Check if dialect is available for this plan
    if (!config.dialectsAvailable.includes(input.dialect)) {
      return NextResponse.json({
        success: false,
        error: 'dialect_not_available',
        availableDialects: config.dialectsAvailable,
      }, { status: 403 });
    }

    // Calculate credit cost based on plan
    const creditCost = calculateVoiceoverCost(safeScript.length, parseFloat(input.speed), planId);

    // Check credits
    const creditCheck = await checkCredits({ supabase, userId: user.id, amount: creditCost });
    if (!creditCheck.hasEnough) {
      return NextResponse.json({
        success: false,
        error: 'insufficient_credits',
        required: creditCost,
        available: creditCheck.currentBalance,
      }, { status: 402 });
    }

    // Create generation record
    const { data: generation } = await supabase.from('generations').insert({
      user_id: user.id,
      studio: 'voiceover',
      model: config.provider === 'elevenlabs' ? 'elevenlabs' : config.quality,
      status: 'processing',
      input: { ...input, planId, provider: config.provider },
      credits_used: creditCost,
    }).select().single();

    // Generate TTS via router (handles dialect/tone enhancement + provider routing)
    const ttsResult = await generateTTS({
      script: safeScript,
      voice: input.voice,
      dialect: input.dialect,
      speed: input.speed,
      tone: input.tone,
      planId,
    });

    // Upload audio to storage
    let audioUrl = '';
    if (ttsResult.audioBuffer.length > 0) {
      const fileName = `${user.id}/voiceover-${generation?.id ?? Date.now()}.mp3`;
      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(fileName, ttsResult.audioBuffer, { contentType: 'audio/mpeg', upsert: false });

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('assets').getPublicUrl(fileName);
        audioUrl = urlData.publicUrl;
      }
    }

    // Deduct credits
    const deductResult = await deductCredits({
      supabase,
      userId: user.id,
      amount: creditCost,
      studio: 'voiceover',
      description: `Voiceover (${config.provider}) - ${input.voice} - ${input.dialect} - ${estimatedDuration}s`,
      generationId: generation?.id,
    });

    if (!deductResult.success) {
      return NextResponse.json({ success: false, error: 'credit_deduction_failed' }, { status: 402 });
    }

    // Update generation record
    if (generation) {
      await supabase.from('generations').update({
        status: 'completed',
        output: {
          audioUrl,
          duration: estimatedDuration,
          provider: ttsResult.provider,
          enhanced: ttsResult.enhanced,
          mock: ttsResult.mock,
        },
      }).eq('id', generation.id);

      await supabase.from('assets').insert({
        user_id: user.id,
        generation_id: generation.id,
        type: 'audio',
        url: audioUrl,
        format: 'mp3',
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        generationId: generation?.id,
        audioUrl,
        duration: estimatedDuration,
        provider: ttsResult.provider,
        enhanced: ttsResult.enhanced,
        mock: ttsResult.mock,
        creditsUsed: creditCost,
        newBalance: deductResult.newBalance,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    }
    if (error instanceof PromptBlockedError) {
      return NextResponse.json({ success: false, error: 'prompt_blocked', term: error.blockedTerm }, { status: 400 });
    }
    console.error('Voiceover API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
