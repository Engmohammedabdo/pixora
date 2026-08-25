import type { BrandKit } from '@/lib/supabase/types';
import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';
import { buildBrandContextBlock } from './brand-context';

interface CreatorPromptInput {
  userPrompt: string;
  style: string;
  resolution: string;
  brandKit?: BrandKit | null;
  mood?: string;
  platform?: string;
  /** True when the router will actually attach a reference image. Preservation
   *  instructions are only correct when there is something to preserve. */
  hasReferenceImage?: boolean;
}

// v2.0 — matches system-prompts.md creator_image_v1
export function buildCreatorPrompt(input: CreatorPromptInput): string {
  const { userPrompt, style, resolution, brandKit, mood, platform, hasReferenceImage } = input;

  // EVERY value interpolated below reaches the image model, so every value below
  // meets the filter. Sanitizing only `userPrompt` is how the gap stayed open:
  // app/api/studios/creator/route.ts fixed exactly these fields on the ADMIN-OVERRIDE
  // branch and left the default branch — the one every customer actually hits, since
  // an override is opt-in — untouched.
  //
  // The brand-kit columns are NOT covered by app/api/brand-kits/route.ts's Zod caps.
  // `brand_kits` never received a column-level GRANT lockdown (022 covered `profiles`
  // only; 042 constrains `logo_url` alone), so `authenticated` still holds the
  // bootstrap GRANT ALL and a customer can PATCH `name`/`brand_voice` to any string
  // over PostgREST. RLS gates WHICH ROW; only a GRANT gates WHICH COLUMN. These caps
  // mirror CreateBrandKitSchema, so the honest path is unchanged and the PostgREST
  // path is truncated back onto it.
  const safePrompt = sanitizePrompt(userPrompt);
  const safeStyle = sanitizePrompt(style, 100);
  // A closed z.enum at the route today; the builder's own type is `string`, and a
  // future caller is exactly how an unfiltered field gets wired up.
  const safeResolution = sanitizePrompt(resolution, 20);
  const safeMood = sanitizePrompt(mood || 'Professional', 100);
  const safePlatform = sanitizePrompt(platform || 'General', 100);
  const safeBrandName = brandKit ? sanitizePrompt(String(brandKit.name ?? ''), 100) : '';
  const safeBrandColors = brandKit
    ? sanitizePrompt(
        `Primary ${brandKit.primary_color}, Secondary ${brandKit.secondary_color}, Accent ${brandKit.accent_color}`,
        200
      )
    : '';
  const safeBrandVoice = brandKit?.brand_voice
    ? sanitizePrompt(String(brandKit.brand_voice), 500)
    : '';

  let prompt = `You are a world-class commercial photographer and visual designer.\n\nCreate a professional commercial image with these specifications:`;
  prompt += `\n- Subject: ${safePrompt}`;

  if (brandKit) {
    prompt += `\n- Brand: ${safeBrandName}`;
    prompt += `\n- Brand Colors: ${safeBrandColors}`;
    if (safeBrandVoice) prompt += `\n- Brand Voice: ${safeBrandVoice}`;
  }

  prompt += `\n- Visual Style: ${safeStyle}`;
  prompt += `\n- Mood: ${safeMood}`;
  prompt += `\n- Platform: ${safePlatform}`;
  prompt += `\n- Resolution: ${safeResolution}`;

  // Placed after the specifications bullet list closes above and before the
  // Technical Requirements below — NOT inside the list (review finding F7):
  // splicing it between "Brand Colors" and "Visual Style" re-parented four
  // unrelated style directives (Visual Style/Mood/Platform/Resolution) under
  // the CLIENT CONTEXT heading, reading as if they were business facts.
  prompt += buildBrandContextBlock(
    brandKit
      ? {
          name: brandKit.name ?? null,
          industry: brandKit.industry ?? null,
          description: brandKit.description ?? null,
          targetAudience: brandKit.target_audience ?? null,
          city: brandKit.city ?? null,
        }
      : null
  );

  prompt += `\n\nTechnical Requirements:`;
  if (hasReferenceImage) {
    // Only meaningful when the router actually attached an image. Emitted
    // unconditionally — as it was — this ordered the model to preserve an original
    // that does not exist on the text-to-image path, and then contradicted itself
    // one line later by asking for a free composition. Creator is a TEXT-to-image
    // studio by default; `edit` is where preservation is always correct.
    prompt += `\n- A reference image is attached. Treat it as the subject.`;
    prompt += `\n- PRESERVE the subject's shape, proportions, colours, materials and any printed text exactly`;
    prompt += `\n- Change only the setting, lighting and composition described above`;
  }
  prompt += `\n- NO extra text, logos, or watermarks unless specified`;
  prompt += `\n- Professional studio lighting unless otherwise specified`;
  prompt += `\n- High contrast, commercially appealing composition`;
  prompt += `\n- Resolution optimized for ${platform ? safePlatform : 'general use'}`;

  return prompt;
}

export const CREATOR_PROMPT_VERSION = getPromptVersion('creator_image');
