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

export interface CreatorInput {
  prompt: string;
  model: AIModel;
  resolution: Resolution;
  brandKitId?: string;
  referenceImageUrl?: string;
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
}

export interface GenerationResult {
  id: string;
  studio: Studio;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  output: Record<string, unknown> | null;
  creditsUsed: number;
  createdAt: string;
}
