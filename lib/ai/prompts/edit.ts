import type { BrandKit } from '@/lib/supabase/types';
import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';

interface EditPromptInput {
  editType: string;
  editDescription: string;
  brandKit?: BrandKit | null;
}

/**
 * Per-edit-type direction.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * The whole prompt used to be:
 *
 *     `Image editing - ${editType.replace(/_/g, ' ')}: ${safeDescription}`
 *
 * i.e. a slug turned into two English words. `edit` was the only studio in the
 * product with no prompt file at all. A reference image IS attached (lib/ai/gemini.ts
 * forwards it on the gemini branch) and nothing told the model it existed, what it
 * was, or that the customer's own photograph had to survive the edit — on the one
 * studio where that instruction is unconditionally correct.
 *
 * `text_add` deliberately inverts the no-text rule every other prompt in this repo
 * carries: adding text is the entire point of that mode.
 */
const EDIT_MODES: Record<string, { task: string; must: string[]; avoid: string[] }> = {
  background_replace: {
    task: 'Replace ONLY the background behind the subject.',
    must: [
      'Keep the subject pixel-identical in shape, proportions, colours, materials and any printed text',
      'Cut cleanly around hair, fur, glass and transparent edges — no halo, no fringing',
      'Relight the subject to match the new background and ground it with a physically correct contact shadow',
    ],
    avoid: ['Altering, moving, cropping or restyling the subject itself'],
  },
  object_remove: {
    task: 'Remove the element the customer names and reconstruct what was behind it.',
    must: [
      'Reconstruct the occluded area from surrounding texture, perspective and lighting',
      'Leave every other element of the frame untouched',
    ],
    avoid: [
      'Blurring or smearing over the removed area instead of reconstructing it',
      'Inventing a replacement object',
    ],
  },
  color_change: {
    task: 'Change only the colour the customer names, on the surface they name.',
    must: [
      'Preserve shading, texture, reflections, highlights and material response through the colour change',
      'Leave every other colour in the frame exactly as it is',
    ],
    avoid: ['Applying a flat colour fill', 'Shifting the white balance or grade of the whole image'],
  },
  text_add: {
    // The one mode where text is wanted. Every other prompt in this repo forbids it.
    task: 'Add the text the customer specifies to the image.',
    must: [
      'Set the text in clean, correctly spelled Latin characters exactly as written, with no extra words',
      'Place it in existing negative space with enough contrast to be legible',
      'Match the perspective and lighting of the surface it sits on',
    ],
    avoid: [
      'Adding any text beyond what was asked for',
      'Covering or crossing the subject',
      'Arabic script — it does not render reliably and the caption is delivered as text alongside the image',
    ],
  },
  style_transfer: {
    task: 'Restyle the image in the look the customer describes.',
    must: [
      'Keep the subject recognisable: same identity, same pose, same composition',
      'Apply the style consistently across the whole frame rather than as a filter on part of it',
    ],
    avoid: ['Changing what the subject IS', 'Adding or removing objects'],
  },
};

export function buildEditPrompt(input: EditPromptInput): string {
  const { editType, editDescription, brandKit } = input;
  const safeDescription = sanitizePrompt(editDescription, 1000);
  const mode = EDIT_MODES[editType];

  let prompt = `You are a professional retoucher working on the attached image.`;
  prompt += `\n\nThe attached image is the customer's own photograph. It is the subject of this edit and must survive it.`;
  prompt += `\n\nTask: ${mode ? mode.task : `Apply the requested edit: ${sanitizePrompt(editType.replace(/_/g, ' '), 50)}.`}`;
  prompt += `\nCustomer instruction: ${safeDescription}`;

  if (brandKit) {
    // Same caps as CreateBrandKitSchema: `brand_kits` is customer-writable over
    // PostgREST, so the builder holds the limit rather than trusting the caller.
    const safeColors = sanitizePrompt(
      `Primary ${brandKit.primary_color}, Secondary ${brandKit.secondary_color}, Accent ${brandKit.accent_color}`,
      200
    );
    prompt += `\nBrand Colors: ${safeColors}`;
  }

  if (mode) {
    prompt += `\n\nMust:`;
    for (const line of mode.must) prompt += `\n- ${line}`;
    prompt += `\n\nAvoid:`;
    for (const line of mode.avoid) prompt += `\n- ${line}`;
  }

  prompt += `\n\nReturn the edited image at the same aspect ratio and resolution as the original.`;

  return prompt;
}

export const EDIT_PROMPT_VERSION = getPromptVersion('edit');
