import type { BrandKit } from '@/lib/supabase/types';
import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';
import { buildBrandContextBlock } from './brand-context';

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
 *
 * ── 2026-08-25: the Arabic ban was lifted ──────────────────────────────────
 * `text_add` originally demanded Latin characters and explicitly forbade Arabic
 * script, with the stated reason "it does not render reliably". That was a
 * considered call at the time, not an oversight — early testing of the image
 * models on Arabic text was bad enough that shipping it risked every customer's
 * first impression of the one studio whose entire job is putting text on their
 * photo. But PyraSuite is an Arabic-first product, and refusing a customer's own
 * language in the one place text matters most is the wrong trade to keep making
 * by default. The founder confirmed the backend models now render Arabic
 * acceptably, so the rule is flipped: script-agnostic and fidelity-bound instead
 * of Latin-only. The `must`/`avoid` entries below now spell out the failure
 * modes that are actually true for Arabic (letter joining, RTL direction,
 * invented diacritics) rather than banning the script outright.
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
      'Set the text exactly as the customer wrote it, in the same script, correctly spelled, with no extra words, no transliteration and no translation',
      'Place it in existing negative space with enough contrast to be legible',
      'Match the perspective and lighting of the surface it sits on',
    ],
    avoid: [
      'Adding any text beyond what was asked for',
      'Covering or crossing the subject',
      'Breaking the Arabic letter joining — every letter must connect in its correct contextual form (initial, medial, final, isolated)',
      'Setting an Arabic run left-to-right — Arabic reads right-to-left',
      'Inventing diacritics (harakat) the customer did not write',
      'Transliterating or translating the customer instruction instead of setting it as given',
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

  // Placed after the task/instruction/brand-colors lines above and before the
  // Must/Avoid technical directives below.
  //
  // DEAD as of 2026-08-25 (review finding F10): `edit`'s InputSchema
  // (app/api/studios/edit/route.ts) has no `brandKitId` field, so the route
  // never fetches a brand kit and never passes `brandKit` into
  // buildEditPrompt — this branch always sees `null` and this call always
  // returns ''. Left as-is rather than removed: it costs nothing to keep and
  // is what makes wiring a `brandKitId` into this studio later a one-line
  // change instead of a rediscovery.
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
