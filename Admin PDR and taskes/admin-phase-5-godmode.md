# Phase 5: God Mode — Studios + AI Models + System Prompts

> **Goal:** Admin can control studios, AI models, and prompts from the dashboard.
> **Estimate:** 2-3 days
> **Dependency:** Phase 1, `system_settings` table from migration

---

## Task 5.1: Admin Settings Library

**File:** `lib/admin/settings.ts`

Central library for reading/writing `system_settings` and integrating with existing code.

```typescript
import { createAdminClient } from './db';
import { CREDIT_COSTS } from '@/lib/credits/costs';

// ============ Generic Settings ============

export async function getSetting<T>(key: string): Promise<T | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .single();

  if (error || !data) return null;
  return data.value as T;
}

export async function setSetting(key: string, value: any): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('system_settings')
    .upsert({
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: 'admin',
    });

  return !error;
}

// ============ Studio Config ============

interface StudioConfig {
  [studioName: string]: {
    enabled: boolean;
    costs?: Record<string, number>;  // e.g. { "1080p": 1, "2K": 2, "4K": 4 }
  };
}

export async function getStudioConfig(): Promise<StudioConfig> {
  return (await getSetting<StudioConfig>('studio_config')) || {};
}

export function isStudioEnabled(config: StudioConfig, studio: string): boolean {
  if (!config[studio]) return true;  // Default: enabled
  return config[studio].enabled !== false;
}

export function getEffectiveCost(config: StudioConfig, studio: string, resolution?: string): number {
  const override = config[studio]?.costs;
  if (override && resolution && override[resolution] !== undefined) {
    return override[resolution];
  }
  // Fall back to code defaults
  // Map studio → CREDIT_COSTS key
  if (resolution && CREDIT_COSTS.image?.[resolution]) {
    return CREDIT_COSTS.image[resolution];
  }
  return CREDIT_COSTS[studio] || 0;
}

// ============ Model Config ============

interface ModelConfig {
  enabled: string[];       // ["gemini", "gpt", "flux"]
  fallback_order: string[];  // ["gemini", "gpt", "flux"]
}

export async function getModelConfig(): Promise<ModelConfig> {
  return (await getSetting<ModelConfig>('model_config')) || {
    enabled: ['gemini', 'gpt', 'flux'],
    fallback_order: ['gemini', 'gpt', 'flux'],
  };
}

export function getEnabledModels(config: ModelConfig): string[] {
  return config.fallback_order.filter(m => config.enabled.includes(m));
}

// ============ Prompt Overrides ============

export async function getPromptOverrides(): Promise<Record<string, string>> {
  return (await getSetting<Record<string, string>>('prompt_overrides')) || {};
}

export async function getEffectivePrompt(studio: string): Promise<string | null> {
  const overrides = await getPromptOverrides();
  return overrides[studio] || null;  // null = use code default
}

// ============ Feature Flags ============

interface FeatureFlags {
  maintenance_mode: boolean;
  registration_enabled: boolean;
  free_plan_enabled: boolean;
  referral_enabled: boolean;
  daily_bonus_enabled: boolean;
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const defaults: FeatureFlags = {
    maintenance_mode: false,
    registration_enabled: true,
    free_plan_enabled: true,
    referral_enabled: true,
    daily_bonus_enabled: true,
  };
  const flags = await getSetting<Partial<FeatureFlags>>('feature_flags');
  return { ...defaults, ...flags };
}

// ============ Rate Limits ============

interface RateLimits {
  requests_per_minute: number;
  daily_generations: Record<string, number>;
}

export async function getRateLimits(): Promise<RateLimits> {
  const defaults: RateLimits = {
    requests_per_minute: 10,
    daily_generations: { free: 10, starter: 50, pro: 100, business: 200, agency: 500 },
  };
  const limits = await getSetting<Partial<RateLimits>>('rate_limits');
  return { ...defaults, ...limits };
}
```

- [ ] Create `lib/admin/settings.ts`
- [ ] Test all getter functions

---

## Task 5.2: Studios Control API

**File:** `app/api/admin/studios/route.ts`

```typescript
// GET /api/admin/studios — returns studio config + stats

export async function GET(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const supabase = createAdminClient();
  const config = await getStudioConfig();

  // Get generation stats per studio
  const { data: statsData } = await supabase
    .from('generations')
    .select('studio');

  // Count per studio
  const statsByStudio: Record<string, { total: number; today: number }> = {};
  const todayStr = new Date().toISOString().split('T')[0];

  // Also get today's counts
  const { data: todayData } = await supabase
    .from('generations')
    .select('studio')
    .gte('created_at', todayStr + 'T00:00:00Z');

  // Default studio list with their code-default costs
  const studios = [
    { name: 'creator', icon: '🎨', defaultCosts: { '1080p': 1, '2K': 2, '4K': 4 } },
    { name: 'photoshoot', icon: '📸', defaultCosts: { default: 8 } },
    { name: 'campaign', icon: '📋', defaultCosts: { default: 12 } },
    { name: 'plan', icon: '🗺️', defaultCosts: { default: 5 } },
    { name: 'storyboard', icon: '🎬', defaultCosts: { default: 14 } },
    { name: 'analysis', icon: '📊', defaultCosts: { default: 3 } },
    { name: 'voiceover', icon: '🎙️', defaultCosts: { default: 1 } },
    { name: 'edit', icon: '✏️', defaultCosts: { default: 1 } },
    { name: 'prompt-builder', icon: '💡', defaultCosts: { default: 0 } },
  ];

  // Merge config overrides with defaults
  const result = studios.map(s => ({
    ...s,
    enabled: isStudioEnabled(config, s.name),
    costs: config[s.name]?.costs || s.defaultCosts,
    totalGenerations: statsData?.filter(g => g.studio === s.name).length || 0,
    todayGenerations: todayData?.filter(g => g.studio === s.name).length || 0,
  }));

  return NextResponse.json({ success: true, data: result });
}

// PUT /api/admin/studios — update studio config

export async function PUT(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const body = await request.json();
  // body: StudioConfig object

  const success = await setSetting('studio_config', body);
  if (!success) return serverError('Failed to save');

  await logAdminAction('studio_config_update', 'setting', 'studio_config', body, getClientIP(request));

  return NextResponse.json({ success: true });
}
```

- [ ] Create `app/api/admin/studios/route.ts` with GET + PUT
- [ ] GET returns all studios with merged config + stats
- [ ] PUT saves config and logs action

---

## Task 5.3: AI Models API

**File:** `app/api/admin/models/route.ts`

```typescript
// GET /api/admin/models — returns model config + stats

export async function GET(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const supabase = createAdminClient();
  const config = await getModelConfig();

  // Get stats per model (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: genData } = await supabase
    .from('generations')
    .select('model, status, created_at')
    .gte('created_at', sevenDaysAgo);

  const models = ['gemini', 'gpt', 'flux'].map(model => {
    const modelGens = genData?.filter(g => g.model === model) || [];
    const total = modelGens.length;
    const completed = modelGens.filter(g => g.status === 'completed').length;
    const failed = modelGens.filter(g => g.status === 'failed').length;

    return {
      name: model,
      enabled: config.enabled.includes(model),
      fallbackPosition: config.fallback_order.indexOf(model) + 1,
      stats: {
        total,
        completed,
        failed,
        successRate: total > 0 ? ((completed / total) * 100).toFixed(1) : '100.0',
      },
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      models,
      fallbackOrder: config.fallback_order,
    },
  });
}

// PUT /api/admin/models — update model config

export async function PUT(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const body = await request.json();
  // body: { enabled: string[], fallback_order: string[] }

  // Validate: at least one model must be enabled
  if (!body.enabled?.length) {
    return NextResponse.json({ success: false, error: 'At least one model must be enabled' }, { status: 400 });
  }

  const success = await setSetting('model_config', body);
  if (!success) return serverError('Failed to save');

  await logAdminAction('model_config_update', 'setting', 'model_config', body, getClientIP(request));

  return NextResponse.json({ success: true });
}
```

**File:** `app/api/admin/models/test/route.ts`

```typescript
// POST /api/admin/models/test — test a model with sample prompt

export async function POST(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const { model } = await request.json();

  if (!['gemini', 'gpt', 'flux'].includes(model)) {
    return NextResponse.json({ success: false, error: 'Invalid model' }, { status: 400 });
  }

  const testPrompt = 'A professional product photo of a coffee cup on a marble table, studio lighting, 4K quality';
  const startTime = Date.now();

  try {
    const { generateImage } = await import('@/lib/ai/router');
    const result = await generateImage({
      prompt: testPrompt,
      model: model as any,
      resolution: '1080p',
    });

    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        model,
        result: result.url || result.text || 'No output',
        responseTimeMs: elapsed,
        usedFallback: result.usedFallback,
      },
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    return NextResponse.json({
      success: true,
      data: {
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTimeMs: elapsed,
        failed: true,
      },
    });
  }
}
```

- [ ] Create `app/api/admin/models/route.ts` with GET + PUT
- [ ] Create `app/api/admin/models/test/route.ts` with POST
- [ ] Test: GET returns all models with stats
- [ ] Test: PUT saves config
- [ ] Test: model test endpoint works

---

## Task 5.4: System Prompts API

**File:** `app/api/admin/prompts/route.ts`

```typescript
// GET /api/admin/prompts — returns all system prompts with overrides

export async function GET(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const overrides = await getPromptOverrides();

  // Import default prompts from code
  // Each prompt file exports a build function. We need the template/base text.
  // Since we can't easily extract the template string, we'll define a registry:
  const defaultPrompts: Record<string, { template: string; variables: string[] }> = {
    creator: {
      template: 'You are a professional commercial photographer. Create: {user_prompt}\nBrand: {brand_name}. Colors: {brand_colors}.\nSTRICTLY PRESERVE all original branding elements.\nStyle: {selected_style}. Resolution: {resolution}.\nNO EXTRA text or logos not in the original.',
      variables: ['user_prompt', 'brand_name', 'brand_colors', 'selected_style', 'resolution'],
    },
    photoshoot: {
      template: '(Load from lib/ai/prompts/photoshoot.ts)',
      variables: ['product_description', 'environment', 'angles'],
    },
    campaign: {
      template: '(Load from lib/ai/prompts/campaign.ts)',
      variables: ['product_description', 'target_market', 'dialect', 'platform', 'occasion'],
    },
    plan: {
      template: '(Load from lib/ai/prompts/plan.ts)',
      variables: ['business_type', 'goals', 'budget', 'duration'],
    },
    storyboard: {
      template: '(Load from lib/ai/prompts/storyboard.ts)',
      variables: ['video_concept', 'duration', 'style'],
    },
    analysis: {
      template: '(Load from lib/ai/prompts/analysis.ts)',
      variables: ['business_name', 'industry', 'stage', 'target_market'],
    },
    voiceover: {
      template: '(Load from lib/ai/prompts/voiceover.ts)',
      variables: ['script', 'voice', 'dialect', 'tone'],
    },
  };

  // NOTE: In actual implementation, read the real prompt text from the imported modules.
  // The above is a simplified registry. The implementation should import each prompt
  // builder and extract the base template.

  const prompts = Object.entries(defaultPrompts).map(([studio, info]) => ({
    studio,
    defaultPrompt: info.template,
    variables: info.variables,
    override: overrides[studio] || null,
    isOverridden: !!overrides[studio],
  }));

  return NextResponse.json({ success: true, data: prompts });
}

// PUT /api/admin/prompts — save or clear a prompt override

export async function PUT(request: NextRequest) {
  const admin = await verifyAdminSession(request);
  if (!admin) return unauthorized();

  const { studio, prompt } = await request.json();
  // prompt = null → clear override (use default)

  const overrides = await getPromptOverrides();

  if (prompt === null || prompt === '') {
    delete overrides[studio];
  } else {
    overrides[studio] = prompt;
  }

  const success = await setSetting('prompt_overrides', overrides);
  if (!success) return serverError('Failed to save');

  await logAdminAction(
    prompt ? 'prompt_override_set' : 'prompt_override_clear',
    'prompt', studio, { prompt: prompt?.substring(0, 200) }, getClientIP(request)
  );

  return NextResponse.json({ success: true });
}
```

- [ ] Create `app/api/admin/prompts/route.ts` with GET + PUT
- [ ] GET returns all prompts with defaults + overrides
- [ ] PUT saves override or clears it

---

## Task 5.5: Studios Control Page

**File:** `app/admin/studios/page.tsx`

**File:** `components/admin/StudioConfigCard.tsx`

```typescript
interface StudioConfigCardProps {
  name: string;
  icon: string;
  enabled: boolean;
  costs: Record<string, number>;
  totalGenerations: number;
  todayGenerations: number;
  onToggle: (enabled: boolean) => void;
  onCostChange: (costs: Record<string, number>) => void;
}

// UI:
// Card with:
// - Icon + name + enabled toggle (top)
// - Cost inputs (one per resolution or single "default")
// - Stats: total gens, today gens
// - Save button per card (or one global save)
```

Page layout: 3-column grid of StudioConfigCards.
Global "Save All Changes" button at top.

- [ ] Create `app/admin/studios/page.tsx`
- [ ] Create `components/admin/StudioConfigCard.tsx`
- [ ] Toggle enable/disable works
- [ ] Cost editing works
- [ ] Save persists to DB

---

## Task 5.6: AI Models Page

**File:** `app/admin/models/page.tsx`

**File:** `components/admin/ModelConfigCard.tsx`

```typescript
interface ModelConfigCardProps {
  name: string;           // "gemini"
  displayName: string;    // "Google Gemini"
  enabled: boolean;
  fallbackPosition: number;
  stats: { total: number; completed: number; failed: number; successRate: string };
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
  testResult?: { responseTimeMs: number; error?: string; url?: string };
  testing?: boolean;
}

// UI:
// Large card with:
// - Model name + logo/icon + enabled toggle
// - Stats: total, success rate (progress bar), failed count
// - Fallback position: dropdown or number
// - "Test Model" button → shows result + timing
// - Error log section (collapsible)
```

Page also has:
- Fallback order section: show ordered list, drag-to-reorder (or numbered dropdowns)
- "Save Configuration" button

- [ ] Create `app/admin/models/page.tsx`
- [ ] Create `components/admin/ModelConfigCard.tsx`
- [ ] Model toggle works
- [ ] Fallback order can be changed
- [ ] Test model button works
- [ ] Save persists to DB

---

## Task 5.7: System Prompts Page

**File:** `app/admin/prompts/page.tsx`

**File:** `components/admin/PromptEditor.tsx`

```typescript
interface PromptEditorProps {
  studio: string;
  defaultPrompt: string;
  override: string | null;
  variables: string[];
  onSave: (prompt: string | null) => void;
  saving?: boolean;
}

// UI:
// - Studio name + "Using Default" / "Using Override" badge
// - Default prompt display (read-only, monospace, gray bg)
// - "Customize" button → shows editable textarea
// - Variable reference: chips showing available variables
// - "Save Override" button
// - "Reset to Default" button (shows confirm dialog)
```

Page: List of PromptEditors, one per studio. Accordion layout (one open at a time) or full list.

- [ ] Create `app/admin/prompts/page.tsx`
- [ ] Create `components/admin/PromptEditor.tsx`
- [ ] Save override works
- [ ] Reset to default works
- [ ] Variables displayed as reference

---

## Task 5.8: Integration with Existing Code

### 5.8.1 — Update `lib/ai/router.ts`

In the `generateImage()` function, modify the fallback chain to use admin config:

```typescript
// Before:
const fallbackOrder = [preferredModel, ...IMAGE_FALLBACK_ORDER.filter(m => m !== preferredModel)];

// After:
const modelConfig = await getModelConfig();
const enabledModels = getEnabledModels(modelConfig);
const fallbackOrder = [
  preferredModel,
  ...enabledModels.filter(m => m !== preferredModel),
].filter(m => enabledModels.includes(m));

// If preferred model is disabled, use first enabled model
if (!enabledModels.includes(preferredModel) && enabledModels.length > 0) {
  fallbackOrder.unshift(enabledModels[0]);
}
```

**Performance note:** Cache the model config with a TTL (e.g. 60s) so we don't query DB on every generation. Use a simple in-memory cache:

```typescript
let modelConfigCache: { data: ModelConfig; fetchedAt: number } | null = null;
const CACHE_TTL = 60_000; // 60 seconds

async function getCachedModelConfig(): Promise<ModelConfig> {
  if (modelConfigCache && Date.now() - modelConfigCache.fetchedAt < CACHE_TTL) {
    return modelConfigCache.data;
  }
  const config = await getModelConfig();
  modelConfigCache = { data: config, fetchedAt: Date.now() };
  return config;
}
```

### 5.8.2 — Update studio API routes

In each studio's `route.ts`, before generation:

```typescript
// Check if studio is enabled
const studioConfig = await getStudioConfig();
if (!isStudioEnabled(studioConfig, 'creator')) {
  return NextResponse.json({ success: false, error: 'studio_disabled' }, { status: 403 });
}

// Use effective cost
const cost = getEffectiveCost(studioConfig, 'creator', input.resolution);
```

### 5.8.3 — Update prompt builders

In each studio's API route, check for prompt override:

```typescript
const promptOverride = await getEffectivePrompt('creator');
const systemPrompt = promptOverride || buildCreatorPrompt(input);
```

- [ ] Update `lib/ai/router.ts` to check enabled models
- [ ] Add caching for model config reads
- [ ] Update at least 2 studio routes to check studio enabled + effective cost
- [ ] Update at least 2 studio routes to check prompt override
- [ ] Pattern is clear enough for remaining studios (can be done incrementally)

---

## Verification Checklist

- [ ] Studios page shows all 9 studios with correct stats
- [ ] Toggle studio enable/disable → saved to DB
- [ ] Change credit cost → saved to DB
- [ ] Disabled studio returns 403 when user tries to generate
- [ ] Models page shows all 3 models with stats
- [ ] Toggle model → affects fallback chain in router
- [ ] Test model button returns result + timing
- [ ] At least one model must remain enabled (validation)
- [ ] Prompts page shows all prompts with defaults
- [ ] Save override → used in next generation
- [ ] Reset to default → override removed
- [ ] All changes logged to admin_logs
- [ ] `npm run build` passes
