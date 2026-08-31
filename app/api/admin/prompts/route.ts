import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { getPromptOverrides, setSetting } from '@/lib/admin/settings';
import { logAdminAction, getClientIP } from '@/lib/admin/logger';

const PROMPT_REGISTRY: Record<string, { variables: string[]; description: string }> = {
  creator: {
    // `resolution` and `mood` were removed 2026-08-31 and this list is why it
    // matters: the admin UI renders these as clickable chips, so advertising a
    // token the route cannot substitute is an invitation to ship literal
    // `{resolution}` text to the image model. composeOverridePrompt() leaves an
    // unrecognised token exactly as written — deliberately, so an admin sees
    // their own text came through — which makes this list, not the substituter,
    // the thing that has to stay honest.
    //
    // `mood` never had a field to come from. `resolution` had one, but pixel
    // dimensions are an API parameter and no image model reads them from prose.
    variables: ['user_prompt', 'brand_name', 'brand_colors', 'selected_style', 'platform'],
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
    // `resolution` and `mood` are gone from CreatorPromptInput, and this seed
    // must not advertise tokens the builder no longer emits: an admin who
    // copies this default and keeps `{resolution}` gets that literal brace text
    // shipped to the model as content, because composeOverridePrompt() only
    // substitutes tokens it recognises and leaves the rest exactly as written.
    //
    // `resolution` was never read by the model in the first place (pixel
    // dimensions are an API parameter), and `mood` had no field to come from —
    // the route has never passed either. See creator.ts's header.
    defaultPrompts.creator = buildCreatorPrompt({
      userPrompt: '{user_prompt}',
      style: '{selected_style}',
      brandKit: null,
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
