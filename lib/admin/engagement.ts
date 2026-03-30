import { createAdminClient } from './db';

export interface EngagementScore {
  total: number;
  breakdown: {
    generationFrequency: number;  // 0-30
    studioDiversity: number;       // 0-15
    brandKitUsage: number;         // 0-10
    creditPurchasing: number;      // 0-15
    featureAdoption: number;       // 0-15
    recency: number;               // 0-15
  };
  label: 'power' | 'active' | 'moderate' | 'low' | 'inactive';
}

const STUDIOS = ['creator', 'photoshoot', 'campaign', 'plan', 'storyboard', 'analysis', 'voiceover', 'edit', 'prompt-builder'];
const ADVANCED_STUDIOS = ['storyboard', 'voiceover', 'analysis', 'campaign'];

export async function calculateEngagementScore(userId: string): Promise<EngagementScore> {
  const supabase = createAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [
    { data: recentGens },
    { count: brandKitCount },
    { count: purchaseCount },
    { data: lastGen },
  ] = await Promise.all([
    supabase.from('generations').select('studio, created_at').eq('user_id', userId).gte('created_at', thirtyDaysAgo),
    supabase.from('brand_kits').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('credit_transactions').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('type', 'topup'),
    supabase.from('generations').select('created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1),
  ]);

  const gens = recentGens || [];
  const genCount = gens.length;

  // 1. Generation frequency (0-30)
  let generationFrequency = 0;
  if (genCount >= 30) generationFrequency = 30;
  else if (genCount >= 20) generationFrequency = 25;
  else if (genCount >= 10) generationFrequency = 20;
  else if (genCount >= 5) generationFrequency = 15;
  else if (genCount >= 1) generationFrequency = Math.min(genCount * 3, 10);

  // 2. Studio diversity (0-15)
  const uniqueStudios = new Set(gens.map(g => g.studio as string));
  const studioCount = [...uniqueStudios].filter(s => STUDIOS.includes(s)).length;
  const studioDiversity = Math.min(Math.round((studioCount / STUDIOS.length) * 15), 15);

  // 3. Brand kit usage (0-10)
  const kits = brandKitCount || 0;
  const brandKitUsage = kits >= 5 ? 10 : kits >= 3 ? 8 : kits >= 1 ? 5 : 0;

  // 4. Credit purchasing (0-15)
  const purchases = purchaseCount || 0;
  const creditPurchasing = purchases >= 5 ? 15 : purchases >= 3 ? 12 : purchases >= 1 ? 8 : 0;

  // 5. Feature adoption (0-15) — advanced studios usage
  const advancedUsed = [...uniqueStudios].filter(s => ADVANCED_STUDIOS.includes(s)).length;
  const featureAdoption = Math.min(Math.round((advancedUsed / ADVANCED_STUDIOS.length) * 15), 15);

  // 6. Recency (0-15) — how recently they generated
  let recency = 0;
  if (lastGen && lastGen.length > 0) {
    const lastGenDate = new Date(lastGen[0].created_at);
    const daysSince = Math.floor((Date.now() - lastGenDate.getTime()) / 86400000);
    if (daysSince <= 1) recency = 15;
    else if (daysSince <= 3) recency = 12;
    else if (daysSince <= 7) recency = 10;
    else if (daysSince <= 14) recency = 6;
    else if (daysSince <= 30) recency = 3;
  }

  const total = generationFrequency + studioDiversity + brandKitUsage + creditPurchasing + featureAdoption + recency;

  let label: EngagementScore['label'] = 'inactive';
  if (total >= 70) label = 'power';
  else if (total >= 50) label = 'active';
  else if (total >= 30) label = 'moderate';
  else if (total >= 10) label = 'low';

  return {
    total,
    breakdown: { generationFrequency, studioDiversity, brandKitUsage, creditPurchasing, featureAdoption, recency },
    label,
  };
}

export type UserSegment = 'vip' | 'power_user' | 'active' | 'low_activity' | 'dormant' | 'at_risk' | 'new' | 'free_only';

export interface SegmentDefinition {
  key: UserSegment;
  label: string;
  icon: string;
  color: string;
}

export const SEGMENT_DEFINITIONS: SegmentDefinition[] = [
  { key: 'vip', label: 'VIP', icon: '⭐', color: 'from-amber-500/20 to-yellow-500/10 text-amber-400 ring-amber-500/20' },
  { key: 'power_user', label: 'Power Users', icon: '🔥', color: 'from-red-500/20 to-orange-500/10 text-red-400 ring-red-500/20' },
  { key: 'active', label: 'Active', icon: '⚡', color: 'from-emerald-500/20 to-green-500/10 text-emerald-400 ring-emerald-500/20' },
  { key: 'low_activity', label: 'Low Activity', icon: '📉', color: 'from-slate-500/20 to-gray-500/10 text-slate-400 ring-slate-500/20' },
  { key: 'dormant', label: 'Dormant', icon: '💤', color: 'from-zinc-500/20 to-neutral-500/10 text-zinc-400 ring-zinc-500/20' },
  { key: 'at_risk', label: 'At Risk', icon: '⚠️', color: 'from-rose-500/20 to-pink-500/10 text-rose-400 ring-rose-500/20' },
  { key: 'new', label: 'New Users', icon: '🆕', color: 'from-indigo-500/20 to-violet-500/10 text-indigo-400 ring-indigo-500/20' },
  { key: 'free_only', label: 'Free Only', icon: '🆓', color: 'from-cyan-500/20 to-teal-500/10 text-cyan-400 ring-cyan-500/20' },
];
