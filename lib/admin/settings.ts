import { createAdminClient } from './db';
import { getStudioCost } from '@/lib/credits/costs';

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

export async function setSetting(key: string, value: unknown): Promise<boolean> {
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

export interface StudioConfig {
  [studioName: string]: {
    enabled: boolean;
    costs?: Record<string, number>;
  };
}

export async function getStudioConfig(): Promise<StudioConfig> {
  return (await getSetting<StudioConfig>('studio_config')) || {};
}

export function isStudioEnabled(config: StudioConfig, studio: string): boolean {
  if (!config[studio]) return true; // Default: enabled
  return config[studio].enabled !== false;
}

export function getEffectiveCost(config: StudioConfig, studio: string, resolution?: string): number {
  const override = config[studio]?.costs;
  if (override) {
    if (resolution && override[resolution] !== undefined) return override[resolution];
    if (override['default'] !== undefined) return override['default'];
  }
  // Fall back to code defaults
  return getStudioCost(studio, resolution);
}

// ============ Model Config ============

export interface ModelConfig {
  enabled: string[];
  fallback_order: string[];
}

const DEFAULT_MODEL_CONFIG: ModelConfig = {
  enabled: ['gemini', 'gpt', 'flux'],
  fallback_order: ['gemini', 'gpt', 'flux'],
};

export async function getModelConfig(): Promise<ModelConfig> {
  return (await getSetting<ModelConfig>('model_config')) || DEFAULT_MODEL_CONFIG;
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
  return overrides[studio] || null;
}

// ============ Feature Flags ============

export interface FeatureFlags {
  maintenance_mode: boolean;
  registration_enabled: boolean;
  free_plan_enabled: boolean;
  referral_enabled: boolean;
  daily_bonus_enabled: boolean;
}

const FEATURE_FLAGS_DEFAULTS: FeatureFlags = {
  maintenance_mode: false,
  registration_enabled: true,
  free_plan_enabled: true,
  referral_enabled: true,
  daily_bonus_enabled: true,
};

export async function getFeatureFlags(): Promise<FeatureFlags> {
  const flags = await getSetting<Partial<FeatureFlags>>('feature_flags');
  return { ...FEATURE_FLAGS_DEFAULTS, ...flags };
}

// Cached feature flags (60s TTL) to avoid DB hit on every request
let featureFlagsCache: { data: FeatureFlags; fetchedAt: number } | null = null;
const FLAGS_CACHE_TTL = 60_000;

export async function getCachedFeatureFlags(): Promise<FeatureFlags> {
  if (featureFlagsCache && Date.now() - featureFlagsCache.fetchedAt < FLAGS_CACHE_TTL) {
    return featureFlagsCache.data;
  }
  try {
    const flags = await getFeatureFlags();
    featureFlagsCache = { data: flags, fetchedAt: Date.now() };
    return flags;
  } catch {
    return FEATURE_FLAGS_DEFAULTS;
  }
}

// ============ Rate Limits ============

export interface RateLimits {
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
