export type Studio =
  | 'creator'
  | 'photoshoot'
  | 'campaign'
  | 'plan'
  | 'storyboard'
  | 'analysis'
  | 'voiceover'
  | 'edit'
  | 'prompt-builder'
  | 'video';

export type AIModel = 'gemini' | 'gpt' | 'flux';
export type Resolution = '1080p' | '2K' | '4K';

/**
 * What CreatorForm actually posts. `style`, `variations` and `projectId` were
 * missing here long before `platform` joined them — the form sends the whole
 * object through `JSON.stringify(input)` (creator/page.tsx:52), so the extra
 * fields always reached the API and the type simply did not say so.
 *
 * It matters for the RETRY path: `lastInput` is typed as this, so a field
 * absent here is a field a future edit could drop from a retry without tsc
 * noticing, silently re-generating at a different canvas or style than the run
 * the customer asked to repeat.
 */
export interface CreatorInput {
  prompt: string;
  model: AIModel;
  resolution: Resolution;
  style: string;
  /** One of PLATFORM_IDS in lib/ai/prompts/platform-framing.ts. Left as a
   *  string here so `types/` keeps its no-imports shape. */
  platform: string;
  variations: 1 | 4;
  brandKitId?: string;
  /** The Apply-Brand-Kit toggle. Sent explicitly, because an absent
   *  `brandKitId` means "I did not choose" and the server answers that with
   *  the project's kit or the account default — see
   *  lib/brand-kits/working-identity.ts. "Not this time" needs its own word. */
  useBrandKit?: boolean;
  referenceImageUrl?: string;
  projectId?: string;
}

export interface PhotoshootInput {
  productImageUrl: string;
  environment: string;
  shots: 1 | 3 | 6;
  brandKitId?: string;
}

export interface CampaignInput {
  productDescription: string;
  targetAudience: string;
  dialect: 'saudi' | 'emirati' | 'egyptian' | 'gulf' | 'formal';
  platform: 'instagram' | 'tiktok' | 'linkedin' | 'twitter';
  occasion?: string;
  brandKitId?: string;
  /** The Apply-Brand-Kit toggle. Sent explicitly, because an absent
   *  `brandKitId` means "I did not choose" and the server answers that with
   *  the project's kit or the account default — see
   *  lib/brand-kits/working-identity.ts. "Not this time" needs its own word. */
  useBrandKit?: boolean;
}

export interface GenerationResult {
  id: string;
  studio: Studio;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  output: Record<string, unknown> | null;
  creditsUsed: number;
  createdAt: string;
}
