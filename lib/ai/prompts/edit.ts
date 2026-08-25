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
 * by default. So the rule is flipped: script-agnostic and fidelity-bound instead
 * of Latin-only, with the `must`/`avoid` entries spelling out the failure modes
 * that are actually true for Arabic (letter joining, RTL direction, invented
 * diacritics) rather than banning the script outright.
 *
 * **The evidence for the flip is a founder DECISION, not a measurement.** An
 * earlier version of this comment said "the founder confirmed the backend models
 * now render Arabic acceptably", which in a repo whose rule is that a ✅ must
 * name a file:line is not evidence of anything — no rendered image exists. The
 * plan's own definition of done (P1.3) asks for "an Arabic string rendered
 * correctly into a real image by the live model, seen", and that is still
 * outstanding; it needs the branch deployed, because production has the API keys
 * and local does not. Treat the rules below as the best available theory of the
 * failure modes until then.
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
    //
    // The rules below only work because the text has a DELIMITED referent: this
    // mode emits `Text to set: "…"` instead of `Customer instruction: …` (see
    // buildEditPrompt). Without it "set the text exactly as the customer wrote
    // it" had nothing to point at, and a customer who wrote a sentence — which
    // the placeholder used to invite, by showing a background-change example
    // regardless of mode — got the instruction words baked into their image.
    task: 'Add the text the customer specifies to the image.',
    must: [
      // Positive form, deliberately. Image models weight negatives poorly, and
      // all four Arabic rules used to sit in `avoid` as negations while every
      // other mode in this file states its craft positively.
      'Set exactly the characters between the quotation marks on the "Text to set:" line — same script, same spelling, same words, in that order',
      'Render any Arabic as connected cursive script running right-to-left, each glyph in its correct contextual form (initial, medial, final, isolated)',
      'Reproduce only the diacritics (harakat) that appear in the given text — no more, no fewer',
      'Keep the given text in its own language: no transliteration, no translation',
      'Place it in existing negative space with enough contrast to be legible',
      'Match the perspective and lighting of the surface it sits on',
    ],
    avoid: [
      'Adding any word that is not between those quotation marks',
      'Covering or crossing the subject',
      'Isolated, disconnected Arabic letterforms',
      'Setting an Arabic run left-to-right',
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
  // `text_add` is the one mode where the customer's words are the PAYLOAD
  // rather than a description of what to do, and it had no way to say so: the
  // same `Customer instruction:` line carried both, and the rules said "set the
  // text exactly as the customer wrote it" with nothing to point at. A customer
  // who typed "اكتب عرض خاص خصم ٥٠٪ فوق الصورة" — which the old, mode-blind
  // placeholder invited by showing a background-change example — could
  // plausibly get "اكتب" and "فوق الصورة" baked into their paid image, and no
  // amount of letter-joining or RTL direction rules helps with that.
  //
  // The quotation marks are the whole point: they are what the `must` entries
  // above refer to. `safeDescription` has already been through sanitizePrompt,
  // which is where any quote-escaping concern belongs.
  if (editType === 'text_add') {
    prompt += `\nText to set: "${safeDescription}"`;
  } else {
    prompt += `\nCustomer instruction: ${safeDescription}`;
  }

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
