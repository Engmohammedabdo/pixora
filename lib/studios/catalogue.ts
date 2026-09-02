import type { StudioCostKey } from '@/lib/credits/costs';

/**
 * The nine studios, as public pages.
 *
 * ONE source of truth: the landing showcase, the nine /studios/[slug] pages and
 * the sitemap all read this. Before it, the landing page held its own array of
 * nine and nothing else knew the list existed — the shape this repo already
 * records misdirecting decisions for months (app/layout.tsx's hardcoded
 * filename list).
 *
 * `video` is deliberately absent. It is in types/studios.ts and CLAUDE.md's
 * "Not built" table says so; a public page for a studio that does not exist is
 * the worst possible organic landing.
 */
export const STUDIO_SLUGS = [
  'creator',
  'photoshoot',
  'edit',
  'campaign',
  'plan',
  'analysis',
  'storyboard',
  'voiceover',
  'prompt-builder',
] as const;

export type StudioSlug = (typeof STUDIO_SLUGS)[number];

export interface StudioEntry {
  slug: StudioSlug;
  /** The key into lib/credits/costs.ts. The page reads the number from there;
   *  it is never written into a translation. */
  costKey: StudioCostKey;
  /** How the cost is expressed: a flat price, a per-resolution range, or a rate. */
  costShape: 'flat' | 'imageRange' | 'shotRange' | 'perDuration' | 'free';
  /** Ids in public/examples/studios/manifest.json. Empty ONLY for a studio whose
   *  deliverable is text, which the page renders instead. */
  examples: readonly string[];
  /** A real deliverable to render, for the text studios. Path under
   *  .superpowers/live-runs is NOT used at runtime — the JSON is copied into
   *  public/examples/studios/ by the same build script. */
  sample?: string;
  /** lucide-react icon name, matching what StudiosShowcase already uses. */
  icon: string;
  /** Two studios a visitor on this page would plausibly want next. Internal
   *  linking is the cheapest SEO there is, and these pages start with none. */
  related: readonly StudioSlug[];
}

export const STUDIO_CATALOGUE: Record<StudioSlug, StudioEntry> = {
  creator: {
    slug: 'creator', costKey: 'image', costShape: 'imageRange', icon: 'Image',
    examples: ['creator-shawarma-square', 'creator-instagram-portrait', 'creator-signage-wide', 'creator-skyline-wide'],
    related: ['photoshoot', 'edit'],
  },
  photoshoot: {
    slug: 'photoshoot', costKey: 'photoshoot', costShape: 'shotRange', icon: 'Camera',
    examples: ['photoshoot-shot-1', 'photoshoot-shot-2', 'photoshoot-shot-3', 'photoshoot-luxury'],
    related: ['edit', 'creator'],
  },
  edit: {
    slug: 'edit', costKey: 'edit', costShape: 'flat', icon: 'Pencil',
    examples: ['edit-before-cafe', 'edit-after-marketplace'],
    related: ['photoshoot', 'creator'],
  },
  campaign: {
    slug: 'campaign', costKey: 'campaign', costShape: 'flat', icon: 'LayoutGrid',
    examples: ['campaign-post-1', 'campaign-post-2'],
    related: ['plan', 'creator'],
  },
  plan: {
    slug: 'plan', costKey: 'plan', costShape: 'flat', icon: 'Map',
    examples: [], sample: 'plan',
    related: ['analysis', 'campaign'],
  },
  analysis: {
    slug: 'analysis', costKey: 'analysis', costShape: 'flat', icon: 'BarChart3',
    examples: [], sample: 'analysis',
    related: ['plan', 'campaign'],
  },
  storyboard: {
    slug: 'storyboard', costKey: 'storyboard', costShape: 'flat', icon: 'Film',
    examples: [], sample: 'storyboard',
    related: ['campaign', 'voiceover'],
  },
  voiceover: {
    slug: 'voiceover', costKey: 'voiceover', costShape: 'perDuration', icon: 'Mic',
    examples: [], sample: 'voiceover',
    related: ['storyboard', 'campaign'],
  },
  'prompt-builder': {
    slug: 'prompt-builder', costKey: 'prompt', costShape: 'free', icon: 'Lightbulb',
    examples: [], sample: 'prompt-builder',
    related: ['creator', 'photoshoot'],
  },
};

export function getStudio(slug: string): StudioEntry | null {
  return (STUDIO_CATALOGUE as Record<string, StudioEntry>)[slug] ?? null;
}
