import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { generateText, generateImage } from '@/lib/ai/router';
import { buildCampaignPrompt } from '@/lib/ai/prompts/campaign';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { getStudioConfig, isStudioEnabled, getEffectiveCost, getEffectivePrompt, getCachedFeatureFlags } from '@/lib/admin/settings';
import { maybeWatermark } from '@/lib/image/watermark';
import { checkRateLimit } from '@/lib/rate-limit';
import { PromptBlockedError } from '@/lib/ai/prompts/safety';

const InputSchema = z.object({
  productDescription: z.string().min(10).max(2000),
  targetAudience: z.string().min(5).max(500),
  dialect: z.enum(['saudi', 'emirati', 'egyptian', 'gulf', 'formal']),
  platform: z.string().min(1),
  occasion: z.string().max(200).optional(),
  brandKitId: z.string().uuid().optional(),
  generateImages: z.boolean().default(false),
});

const CampaignPostSchema = z.object({
  scenario: z.string(),
  caption: z.string(),
  tov: z.string(),
  schedule: z.string(),
  hashtags: z.string(),
});

function parseJsonFromText(text: string): unknown {
  // Try to extract JSON array from the text (handle markdown code blocks)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  return JSON.parse(text);
}

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

    // Check maintenance mode
    const flags = await getCachedFeatureFlags();
    if (flags.maintenance_mode) {
      return NextResponse.json(
        { success: false, error: 'maintenance_mode', message: 'Platform is under maintenance. Please try again later.' },
        { status: 503 }
      );
    }

    // Check if studio is enabled via admin settings
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'campaign')) {
      return NextResponse.json({ success: false, error: 'studio_disabled' }, { status: 403 });
    }

    const body = await request.json();
    const input = InputSchema.parse(body);

    // Use admin-configured cost or default
    const creditCost = getEffectiveCost(studioConfig, 'campaign');

    // Fetch brand kit
    let brandName: string | undefined;
    if (input.brandKitId) {
      const { data: kit } = await supabase
        .from('brand_kits')
        .select('name')
        .eq('id', input.brandKitId)
        .eq('user_id', user.id)
        .single();
      brandName = kit?.name;
    }

    // Build prompt (check for admin override first)
    const promptOverride = await getEffectivePrompt('campaign');
    const prompt = promptOverride || buildCampaignPrompt({
      productDescription: input.productDescription,
      targetAudience: input.targetAudience,
      dialect: input.dialect,
      platform: input.platform,
      occasion: input.occasion,
      brandName,
    });

    // Create generation record
    const { data: generation, error: genError } = await supabase
      .from('generations')
      .insert({
        user_id: user.id,
        studio: 'campaign',
        model: 'gemini',
        input: { ...input, fullPrompt: prompt },
        credits_used: creditCost,
        status: 'processing',
      })
      .select()
      .single();

    if (genError || !generation) {
      return NextResponse.json({ success: false, error: 'failed_to_create_generation' }, { status: 500 });
    }

    // Reserve credits (atomic check + deduct)
    const reserveResult = await reserveCredits({
      supabase, userId: user.id, amount: creditCost,
      studio: 'campaign', description: `Campaign - 9 posts${input.generateImages ? ' with images' : ''}`,
      generationId: generation?.id,
    });
    if (!reserveResult.success) {
      if (generation) await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      return NextResponse.json({
        success: false,
        error: reserveResult.error === 'insufficient_credits' ? 'insufficient_credits' : 'credit_reservation_failed',
        required: creditCost,
      }, { status: 402 });
    }

    try {
    // Generate campaign text
    const textResult = await generateText({ prompt });

    // Parse and validate the output
    let posts: z.infer<typeof CampaignPostSchema>[];
    try {
      const parsed = parseJsonFromText(textResult.text || '[]');
      const arr = Array.isArray(parsed) ? parsed : [];
      posts = arr.map((p: unknown) => CampaignPostSchema.parse(p));
    } catch {
      // AI returned invalid JSON — treat as failure
      if (generation) {
        await supabase.from('generations').update({ status: 'failed' }).eq('id', generation.id);
      }
      await refundCredits({
        supabase, userId: user.id, amount: creditCost,
        description: 'Refund: campaign parse failure',
        generationId: generation?.id,
      });
      return NextResponse.json({
        success: false,
        error: 'generation_parse_failed',
        message: 'AI returned invalid response. Please try again.',
      }, { status: 500 });
    }

    // Generate images for each post if requested (included in 12 credits)
    let postImages: (string | null)[] = new Array(posts.length).fill(null);
    if (input.generateImages && posts.length > 0) {
      const imagePromises = posts.map(async (post) => {
        try {
          const imgResult = await generateImage({
            prompt: post.scenario,
            model: 'gemini',
            resolution: '1080p',
          });
          return imgResult.url || null;
        } catch {
          return null;
        }
      });
      postImages = await Promise.all(imagePromises);
    }

    // Apply watermark to campaign images for free plan users
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single();
    const planId = profile?.plan_id || 'free';
    postImages = await Promise.all(
      postImages.map(async (url) =>
        url ? (await maybeWatermark(url, planId)) || url : null
      )
    );

    // Combine posts with images
    const postsWithImages = posts.map((post, i) => ({
      ...post,
      imageUrl: postImages[i],
    }));

    // Update generation
    await supabase
      .from('generations')
      .update({
        output: { posts: postsWithImages, mock: textResult.mock },
        status: 'completed',
      })
      .eq('id', generation.id);

    return NextResponse.json({
      success: true,
      data: {
        generationId: generation.id,
        posts: postsWithImages,
        mock: textResult.mock,
        usedFallback: textResult.usedFallback,
        creditsUsed: creditCost,
        newBalance: reserveResult.newBalance,
      },
    });
    } catch (genError) {
      await refundCredits({
        supabase, userId: user.id, amount: creditCost,
        description: `Refund: campaign generation failed`,
        generationId: generation?.id,
      });
      if (generation) await supabase.from('generations').update({ status: 'failed', error: 'generation_failed' }).eq('id', generation.id);
      throw genError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    }
    if (error instanceof PromptBlockedError) {
      return NextResponse.json(
        { success: false, error: 'prompt_blocked', term: error.blockedTerm },
        { status: 400 }
      );
    }
    console.error('Campaign API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
