import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { getPromptOverrides, setSetting } from '@/lib/admin/settings';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';

const PROMPT_REGISTRY: Record<string, { variables: string[]; description: string }> = {
  creator: {
    variables: ['user_prompt', 'brand_name', 'brand_colors', 'selected_style', 'resolution', 'mood', 'platform'],
    description: 'Image generation for commercial photos and product shots',
  },
  photoshoot: {
    variables: ['product_description', 'environment', 'angles', 'product_category'],
    description: 'Multi-angle product photography generation',
  },
  campaign: {
    variables: ['product_description', 'target_audience', 'dialect', 'platform', 'occasion', 'brand_name'],
    description: '9-post social media campaign with captions and images',
  },
  plan: {
    variables: ['business_type', 'goals', 'budget', 'duration', 'target_market'],
    description: 'Marketing plan generation with strategy and budget',
  },
  storyboard: {
    variables: ['video_concept', 'duration', 'style', 'brand_name'],
    description: 'Video storyboard with scenes and visual descriptions',
  },
  analysis: {
    variables: ['business_name', 'industry', 'stage', 'target_market', 'competitors'],
    description: 'Competitor and market analysis report',
  },
  voiceover: {
    variables: ['script', 'voice', 'dialect', 'tone', 'speed'],
    description: 'Text-to-speech voiceover generation',
  },
};

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const overrides = await getPromptOverrides();

  // Load actual default prompts from code
  let defaultPrompts: Record<string, string> = {};
  try {
    const { buildCreatorPrompt } = await import('@/lib/ai/prompts/creator');
    defaultPrompts.creator = buildCreatorPrompt({
      userPrompt: '{user_prompt}',
      style: '{selected_style}',
      resolution: '{resolution}',
      brandKit: null,
      mood: '{mood}',
      platform: '{platform}',
    });
  } catch { /* fallback */ }

  try {
    const { buildCampaignPrompt } = await import('@/lib/ai/prompts/campaign');
    defaultPrompts.campaign = buildCampaignPrompt({
      productDescription: '{product_description}',
      targetAudience: '{target_audience}',
      dialect: 'gulf',
      platform: '{platform}',
      occasion: '{occasion}',
      brandName: '{brand_name}',
    });
  } catch { /* fallback */ }

  const prompts = Object.entries(PROMPT_REGISTRY).map(([studio, info]) => ({
    studio,
    description: info.description,
    defaultPrompt: defaultPrompts[studio] || `(Default prompt loaded from lib/ai/prompts/${studio}.ts)`,
    variables: info.variables,
    override: overrides[studio] || null,
    isOverridden: !!overrides[studio],
  }));

  return NextResponse.json({ success: true, data: prompts });
}

export async function PUT(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { studio, prompt } = await request.json();

  if (!studio || !PROMPT_REGISTRY[studio]) {
    return NextResponse.json({ success: false, error: 'Invalid studio' }, { status: 400 });
  }

  const overrides = await getPromptOverrides();

  if (!prompt || prompt.trim() === '') {
    delete overrides[studio];
  } else {
    overrides[studio] = prompt;
  }

  const success = await setSetting('prompt_overrides', overrides);

  if (!success) {
    return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 });
  }

  await logAdminAction(
    prompt ? 'prompt_override_set' : 'prompt_override_clear',
    'prompt',
    studio,
    { prompt: prompt?.substring(0, 200) },
    getClientIP(request)
  );

  return NextResponse.json({ success: true });
}
