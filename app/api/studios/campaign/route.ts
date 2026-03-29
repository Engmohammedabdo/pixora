import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { deductCredits } from '@/lib/credits/deduct';
import { checkCredits } from '@/lib/credits/check';
import { generateText, generateImage } from '@/lib/ai/router';
import { buildCampaignPrompt } from '@/lib/ai/prompts/campaign';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { rateLimit } from '@/lib/rate-limit';

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

    if (!rateLimit(`studio:${user.id}`, 20, 60000)) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    const body = await request.json();
    const input = InputSchema.parse(body);

    const creditCost = CREDIT_COSTS.campaign; // 12 credits (includes image generation)

    const creditCheck = await checkCredits({
      supabase,
      userId: user.id,
      amount: creditCost,
    });

    if (!creditCheck.hasEnough) {
      return NextResponse.json(
        { success: false, error: 'insufficient_credits', required: creditCost, available: creditCheck.currentBalance },
        { status: 402 }
      );
    }

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

    // Build prompt
    const prompt = buildCampaignPrompt({
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

    // Generate campaign text
    const textResult = await generateText({ prompt });

    // Parse and validate the output
    let posts: z.infer<typeof CampaignPostSchema>[];
    try {
      const parsed = parseJsonFromText(textResult.text || '[]');
      const arr = Array.isArray(parsed) ? parsed : [];
      posts = arr.map((p: unknown) => CampaignPostSchema.parse(p));
    } catch {
      // If parsing fails, use the raw text result
      posts = [];
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

    // Combine posts with images
    const postsWithImages = posts.map((post, i) => ({
      ...post,
      imageUrl: postImages[i],
    }));

    // Deduct credits
    const deductResult = await deductCredits({
      supabase,
      userId: user.id,
      amount: creditCost,
      studio: 'campaign',
      description: `Campaign - 9 posts${input.generateImages ? ' with images' : ''}`,
      generationId: generation.id,
    });

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
        newBalance: deductResult.newBalance,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    }
    console.error('Campaign API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
