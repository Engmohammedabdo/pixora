import type { BrandKit } from '@/lib/supabase/types';
import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';
import { buildBrandContextBlock } from './brand-context';
import { buildFramingBlock } from './platform-framing';
import { buildImageTextRule } from './image-text-rule';

interface CreatorPromptInput {
  userPrompt: string;
  style: string;
  brandKit?: BrandKit | null;
  /** One of PLATFORM_IDS. Optional, and `general` when absent — see
   *  platform-framing.ts on why the default is a square rather than "whatever
   *  the model picks". */
  platform?: string;
  /** True when the router will actually attach a reference image. Preservation
   *  instructions are only correct when there is something to preserve. */
  hasReferenceImage?: boolean;
}

/**
 * ── WHAT CHANGED HERE ON 2026-08-31, AND WHAT DELIBERATELY DID NOT ─────────
 * This studio was rewritten after the first time anyone looked at its output.
 * It had never been measured: the live harness listed it under
 * `COVERED_ELSEWHERE` as "runs on every sweep as the fixture generator", which
 * recorded that it EXECUTES and was read as meaning it is VERIFIED.
 *
 * The run (`.superpowers/live-runs/2026-08-31T09-35-51-970Z/`) refuted more of
 * the planned redesign than it confirmed, and the refutations are why this file
 * is not much longer than it was:
 *
 *   - The customer's raw colloquial Arabic is a GOOD instruction, not a weak
 *     one. `عايز صورة لساندوتش شاورما تجيب جوع لمطعمي في دبي` produced an
 *     ad-grade frame that resolved both the city (a Dubai skyline) and the
 *     marketing intent (hand-held, close, appetite-forward). A hand-written
 *     English brief for the same picture — lens, aperture, lighting, palette —
 *     came back MORE generic and lost the city entirely. A planned
 *     Arabic-to-English expansion layer was cut on that evidence: it would have
 *     spent a model call to flatten the best signal in the prompt.
 *   - `style` is a bare slug and the model grounds it fine. `bold` returned a
 *     coherent night scene against the same subject that `photographic`
 *     rendered in warm daylight. No style tables were written.
 *
 * So the customer's words are passed through INTACT, and the two things the run
 * actually found are what this file now fixes: no text containment, and no
 * control of its own canvas.
 */
export function buildCreatorPrompt(input: CreatorPromptInput): string {
  const { userPrompt, style, brandKit, platform, hasReferenceImage } = input;

  // EVERY value interpolated below reaches the image model, so every value below
  // meets the filter. Sanitizing only `userPrompt` is how the gap stayed open:
  // app/api/studios/creator/route.ts fixed exactly these fields on the ADMIN-OVERRIDE
  // branch and left the default branch — the one every customer actually hits, since
  // an override is opt-in — untouched.
  //
  // The brand-kit columns are NOT covered by app/api/brand-kits/route.ts's Zod caps.
  // Migration 044 has since locked `name` and `brand_voice` at the column level, but
  // these caps stay: they mirror CreateBrandKitSchema, so the honest path is
  // unchanged, and a builder that depends on a migration having been applied is a
  // builder that breaks silently if one is ever rolled back.
  const safePrompt = sanitizePrompt(userPrompt);
  const safeStyle = sanitizePrompt(style, 100);
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

  let prompt = `You are a world-class commercial photographer and visual designer.`;

  // The customer's own sentence, first and unaltered. Placed under its own
  // heading rather than as one bullet in a spec list so that the TEXT RULE at
  // the bottom — which is phrased against "the SUBJECT above" — has an
  // unambiguous referent. See image-text-rule.ts on why that relation is the
  // weaker form and what would replace it.
  prompt += `\n\nSUBJECT\n${safePrompt}`;

  if (brandKit) {
    prompt += `\n\nBRAND`;
    prompt += `\n- Name: ${safeBrandName}`;
    prompt += `\n- Colours: ${safeBrandColors}`;
    if (safeBrandVoice) prompt += `\n- Voice: ${safeBrandVoice}`;
    // Colour reaches the light and the styling, never the subject itself — the
    // same rule photoshoot.ts:566-571 arrived at after a white-studio shoot came
    // back with a backdrop nobody had asked for.
    prompt += `\n- Let these colours appear in the styling, props and ambient light. Never recolour the subject itself to match them.`;
  }

  // Placed after the subject and brand are established and before the style and
  // technical directives below — NOT inside a bullet list (review finding F7):
  // splicing it between two style directives re-parented them under the CLIENT
  // CONTEXT heading, reading as if they were business facts.
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

  // The canvas, stated in prose. The same shape also goes to the adapter as a
  // request parameter — see platform-framing.ts on why both.
  prompt += buildFramingBlock(platform || 'general');

  prompt += `\n\nSTYLE\n${safeStyle}`;

  prompt += `\n\nMUST`;
  if (hasReferenceImage) {
    // Only meaningful when the router actually attached an image. Emitted
    // unconditionally — as it was before 2026-08-24 — this ordered the model to
    // preserve an original that does not exist on the text-to-image path, and
    // then contradicted itself one line later by asking for a free composition.
    prompt += `\n- A reference image is attached. Treat it as the subject.`;
    prompt += `\n- Preserve its shape, proportions, colours, materials and any printed text exactly`;
    prompt += `\n- Change only the setting, lighting and composition described above`;
  }
  prompt += `\n- Keep the subject the unmistakable focal point and the sharpest element in the frame`;
  prompt += `\n- Light it deliberately, with a physically consistent key, and hold detail in both highlights and shadows`;
  prompt += `\n- Render surfaces with true material response — glass refracts, metal shows specular highlights, matte stays matte`;

  prompt += `\n\nAVOID`;
  prompt += `\n- Watermarks, captions, borders, graphic overlays or UI chrome of any kind`;
  prompt += `\n- A plastic, over-retouched CGI look, or lighting that contradicts the setup above`;
  prompt += `\n- Duplicating the subject or adding a second copy of it anywhere in the frame`;

  // LAST, and that placement is load-bearing rather than tidy: this block opens
  // by claiming to override everything else in the prompt, and edit.ts:602-604
  // records that it is stated last for exactly that reason.
  //
  // ── THE MODE MUST FOLLOW `hasReferenceImage`, AND THAT COST A BLOCKER ─────
  // This emitted `'contained'` unconditionally, which put "every surface is
  // COMPLETELY BLANK — packaging, labels …" into the same prompt as the MUST
  // above that orders the customer's own printed text preserved — with the text
  // rule claiming to override it. A customer uploading a labelled product and
  // asking only for a new setting was licensed to have their label wiped, or
  // got a declined no-op at HTTP 200 with credits charged.
  //
  // With a photograph attached this studio IS an edit, and the generate-path
  // rule means something else entirely there. See preserveTextRule().
  //
  // Fed the customer's sentence because the Arabic-script branch inside it is
  // decided on what the customer actually wrote.
  prompt += buildImageTextRule(hasReferenceImage ? 'preserve' : 'contained', safePrompt);

  return prompt;
}

export const CREATOR_PROMPT_VERSION = getPromptVersion('creator_image');
