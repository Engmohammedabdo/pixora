import type { BrandKit } from '@/lib/supabase/types';
import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';

export const EDIT_TYPES = [
  'background_replace',
  'object_remove',
  'color_change',
  'text_add',
  'style_transfer',
] as const;
export type EditType = (typeof EDIT_TYPES)[number];

interface EditPromptInput {
  editType: string;
  /**
   * Optional since 2026-08-27. It used to be `z.string().min(5)` — i.e. the
   * customer had to WRITE A PROMPT into a product-photography tool, which is
   * the thing this product exists not to make them do. A preset now carries
   * the direction (see `EDIT_PRESETS`), and the free text is what a customer
   * adds when they want something the presets do not cover.
   *
   * `text_add` is the exception and the route enforces it: there the
   * description is not an instruction, it is the TEXT TO RENDER, so a preset
   * cannot substitute for it.
   */
  editDescription?: string;
  /** An `EDIT_PRESETS` key. A preset belonging to another `editType` is refused by
   *  the route with a 400 and ignored here — see `activePreset` below. */
  editPreset?: string;
  brandKit?: BrandKit | null;
  /**
   * The CLIENT CONTEXT block, already built — and therefore already filtered —
   * by `buildBrandContextBlock()`. Passed IN rather than derived here, exactly
   * as photoshoot does it: one call, one result, used. Deriving it inside this
   * builder is what let the block be built twice from two field lists with
   * nothing checking they agreed.
   */
  brandContextBlock?: string;
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
 * ── 2026-08-25, measured on production: half of it worked ──────────────────
 * A real generation (`mock: false`, 1 credit) put شاورما الشام on a shop sign
 * with every letter correctly joined, running right to left, no invented
 * harakat and no transliteration. The four rules below do the job they were
 * written for. But the SAME image also carried invented, garbled pseudo-Arabic
 * and fake Latin on the sandwich wrapper and the menu board, against a prompt
 * that said "with no extra words". Fidelity was proved; containment was not.
 * `buildTextRule()` below is the containment half, and it is the reason this
 * file no longer relies on `avoid` alone to keep text out of the frame.
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
      // "in existing negative space" was the earlier wording, and on a frame
      // with none it reads as a precondition rather than a preference — the
      // model declined rather than compromised. Stated as an ordering now, so
      // there is always a legal placement.
      'Place it in the clearest space available, preferring empty areas, with enough contrast to be legible',
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

/** The brand kit's palette, already filtered and capped by `buildEditPrompt`.
 *  A preset receives this rather than the raw row: every `brand_kits` colour
 *  column is writable to an arbitrary string over PostgREST (022's column
 *  lockdown covered `profiles`; 042 constrains `logo_url` alone), so a preset
 *  that interpolated `brandKit.primary_color` would be a channel straight into
 *  a paid model. */
export interface EditPresetBrand {
  safePrimary: string;
  safeSecondary: string;
  safeAccent: string;
}

interface EditPreset {
  /** The `editType` this preset belongs to. A preset/type mismatch is a clean
   *  400 at the route and is ignored here, so it can never compose a prompt
   *  that asks for a background swap under a colour-change task. */
  editType: EditType;
  /**
   * The direction that replaces what the customer would otherwise have had to
   * type. Takes the palette so a preset can be about the customer's own brand
   * rather than about a generic look — `brand_color_match` is the whole point
   * of the parameter, and `null` is the honest state to design for: a kit is
   * optional on every studio in this product.
   */
  direction: (brand: EditPresetBrand | null) => string;
  /** Appended to the mode's own `must`/`avoid`, never replacing them: a preset
   *  refines a mode, it does not reinterpret it. */
  must: string[];
  avoid: string[];
  /** `text_add` only: the ONE surface `buildTextRule()` names. Without it the
   *  rule can say "exactly once" but not WHERE, which is the half that was
   *  measured failing on production. */
  textSurface?: string;
  /** A preset whose direction is meaningless with no palette and no free text.
   *  The route turns this into a 400 rather than sending a prompt that asks the
   *  model to match a colour nobody named. */
  requiresBrandColors?: true;
}

/**
 * ── WHY PRESETS EXIST ──────────────────────────────────────────────────────
 * The difference was already sitting in this repo between two studios:
 *
 *     photoshoot:  environment: z.enum([7 presets])   <- the customer PICKS
 *                  notes:       z.string().optional()
 *     edit:        editDescription: z.string().min(5) <- the customer TYPES
 *
 * This is a product photography tool sold to shop owners, not a prompt
 * playground. "Remove the background" typed by a customer and "replace the
 * background with a true RGB 255,255,255 seamless, product at ~85% of frame,
 * no props, no shadow reaching the backdrop" are the same intent and different
 * products — the second is the one Amazon.ae and Noon accept as a main image,
 * and no customer reaches it by typing. Every recipe below is the specification
 * a customer cannot be expected to know, written once.
 *
 * Preset ids are a closed set and the route's `z.enum` is built from
 * `EDIT_PRESET_IDS`, so an id that is not in this table cannot be requested and
 * an entry not in the tuple is a compile error (`Record<EditPresetId, …>`).
 */
export const EDIT_PRESET_IDS = [
  // background_replace
  'marketplace_white',
  'studio_gradient',
  'lifestyle_scene',
  'festive_gifting',
  // object_remove
  'remove_props',
  'remove_reflections',
  'remove_labels',
  // color_change
  'brand_color_match',
  'accurate_color',
  // text_add
  'product_label',
  'promo_badge',
  // style_transfer
  'luxury_editorial',
  'bright_ecommerce',
  'warm_appetite',
] as const;
export type EditPresetId = (typeof EDIT_PRESET_IDS)[number];

export const EDIT_PRESETS: Record<EditPresetId, EditPreset> = {
  // ── background_replace ───────────────────────────────────────────────────
  marketplace_white: {
    editType: 'background_replace',
    // The highest-value preset on the list, and the reason the list exists.
    // Amazon.ae and Noon both reject a main product image that is not a pure
    // white seamless with the product filling most of the frame and carrying no
    // text, badge or logo. That is a written specification, and a customer
    // typing "white background" hits none of it.
    direction: () =>
      'Replace the background with a pure white seamless studio sweep built to the marketplace main-image specification: a true RGB 255,255,255 across the entire background, no gradient, no grey falloff in the corners, no horizon line, no visible backdrop seam and no props of any kind.',
    must: [
      'Scale and centre the product so its longest side spans about 85% of the corresponding frame dimension, with even margins and nothing clipped at the edges',
      'Keep the white a flat, even 255,255,255 everywhere the product is not — measured as a value, not as an impression of brightness',
      'Ground the product with a soft contact shadow directly beneath it only, never a cast shadow reaching out across the backdrop',
      'Preserve the product exactly: identical shape, proportions, colours, materials, logos and every character of its printed text',
      'Cut cleanly around hair, fur, glass, mesh and transparent edges — no halo, no dark fringe, no surviving pixels of the old background',
    ],
    avoid: [
      'Props, surfaces, reflections, gradients, vignettes, borders or coloured tints anywhere in the background',
      'Any added badge, price tag, promotional sticker or watermark — a marketplace main image is rejected outright for these',
      'Cropping any part of the product out of the frame to reach the 85%',
    ],
  },
  studio_gradient: {
    editType: 'background_replace',
    direction: (brand) =>
      brand
        ? `Replace the background with a smooth studio gradient sweep — one soft falloff from a lighter pool behind the product to a deeper tone at the frame edges, no horizon, no props. Build the gradient from the brand palette: ${brand.safePrimary} in the deeper edge tone and ${brand.safeSecondary} in the lighter centre, both desaturated far enough that the product stays the most saturated object in the frame.`
        : 'Replace the background with a smooth neutral-grey studio gradient sweep — one soft falloff from a lighter pool behind the product to a deeper tone at the frame edges, no horizon, no props.',
    must: [
      'Keep the falloff perfectly smooth — no banding, no visible steps, no vignette ring at the corners',
      'Relight the product so its key direction agrees with the lighter pool behind it',
      'Ground the product with a soft elliptical contact shadow that fades before it reaches the frame edge',
    ],
    avoid: [
      'Recolouring the product itself toward the backdrop',
      'Any texture, pattern, object or reflection inside the gradient',
    ],
  },
  lifestyle_scene: {
    editType: 'background_replace',
    direction: () =>
      'Replace the background with a real, plausible setting where this product is actually used or sold — a counter, a table, a shelf, a desk — rendered shallow and soft so it reads as context rather than competing with the product.',
    must: [
      'Take the setting from the CLIENT CONTEXT block above when one is present: the industry decides the room, the city decides the materials and the daylight',
      'Hold the product sharp and the setting at a shallow depth of field — recognisable, never crisp',
      'Relight the product to match the new scene and ground it with a physically correct contact shadow on the surface it now sits on',
    ],
    avoid: [
      'People, faces or hands that were not already in the customer photograph',
      'A second copy of the product, or other merchandise competing for attention',
      'A setting that contradicts the product — an outdoor scene for a refrigerated item, a bathroom for food',
    ],
  },
  festive_gifting: {
    editType: 'background_replace',
    direction: (brand) =>
      brand
        ? `Replace the background with a restrained premium gifting presentation: a deep-toned surface, one soft directional key, and a small amount of tasteful dressing — folded fabric, a ribbon, dried florals or dates — placed behind and beside the product, never touching it. Draw the fabric and ribbon tones from ${brand.safePrimary} and ${brand.safeAccent}, and keep every other element neutral.`
        : 'Replace the background with a restrained premium gifting presentation: a deep-toned surface, one soft directional key, and a small amount of tasteful dressing — folded fabric, a ribbon, dried florals or dates — placed behind and beside the product, never touching it.',
    must: [
      'Keep the product the brightest and sharpest element in the frame',
      'Keep every dressing element behind the product plane and out of its contact shadow',
      'Leave clear negative space on one side of the frame for campaign copy to be added later',
    ],
    avoid: [
      'More than three dressing elements — this is a still life, not a display table',
      'Anything that covers, crops or casts a shadow across the product',
      'Religious, national or holiday symbols of any kind',
    ],
  },

  // ── object_remove ────────────────────────────────────────────────────────
  remove_props: {
    editType: 'object_remove',
    direction: () =>
      'Remove everything in the frame that is not the product itself — props, packaging, other merchandise, cutlery, hands, cables, stands and background clutter — and reconstruct the surface and background that were behind them.',
    must: [
      'Reconstruct each occluded area from the surrounding texture, perspective and lighting so the repair is invisible at 100% zoom',
      'Leave the product itself pixel-identical',
      'Keep the surface the product rests on continuous — same material, same grain direction, same lighting falloff across the repair',
    ],
    avoid: [
      'Blurring or smearing over a removed area instead of reconstructing it',
      'Inventing a replacement object to fill the space',
      "Removing the product's own attached parts — cap, lid, handle, straw, garnish, packaging sleeve",
    ],
  },
  remove_reflections: {
    editType: 'object_remove',
    direction: () =>
      "Remove the photographer, the phone, the room and every other reflection from the product's glass, chrome, screen and glossy surfaces, along with fingerprints, dust and lint, and rebuild a clean specular highlight consistent with the light already in the photograph.",
    must: [
      'Keep every material reading true — glass still refracts, chrome still mirrors a plausible clean environment, a screen still reads as glass rather than paint',
      'Preserve the shape and position of the existing key highlight and replace only what it is reflecting',
      'Leave every printed character on the product exactly as photographed',
    ],
    avoid: [
      'Flattening a reflective surface into matte paint',
      'Removing the highlights along with the reflections, which makes the product read as plastic',
      'Retouching away real product features — a seam, a moulding line, a woven texture — as though they were dirt',
    ],
  },
  remove_labels: {
    editType: 'object_remove',
    direction: () =>
      'Remove the retail furniture stuck onto the product — price tags, promotional stickers, barcode labels, security tags, shop stamps and packaging tape — and rebuild the packaging surface that was underneath.',
    must: [
      'Rebuild the underlying surface with its true material, print, gloss and curvature',
      "Keep the product's OWN branding, label artwork and printed text exactly as photographed",
      'Match the reconstructed area to the surrounding surface in lighting, specularity and grain',
    ],
    avoid: [
      "Removing or redrawing the product's own label",
      'Leaving a flat patch of colour where a sticker was',
      'Inventing new artwork to fill the gap',
    ],
  },

  // ── color_change ─────────────────────────────────────────────────────────
  brand_color_match: {
    editType: 'color_change',
    // The one preset that is USELESS without a palette, hence
    // `requiresBrandColors`. Degrading it to "a colour that suits the brand"
    // would spend a credit on the model's guess and return something the
    // customer did not ask for, which is worse than a 400 telling them to pick
    // a brand kit.
    requiresBrandColors: true,
    direction: (brand) =>
      brand
        ? `Recolour the product's main body panel to exactly ${brand.safePrimary}. Match that hue and saturation rather than approximating it to a nearby stock colour, and leave every other element of the frame as photographed.`
        : "Recolour the product's main body panel to the colour named in the customer instruction above, and leave every other element of the frame as photographed.",
    must: [
      'Preserve shading, texture, reflections, highlights and material response through the colour change — the new colour must sit ON the existing surface, not replace it',
      'Leave labels, logos, printed text, trims, zips and fasteners in their original colours',
      'Keep the background, the surface and the lighting untouched',
    ],
    avoid: [
      'Applying a flat colour fill',
      'Shifting the white balance or grade of the whole image',
      'Recolouring a second object that merely happens to share the original colour',
    ],
  },
  accurate_color: {
    editType: 'color_change',
    direction: () =>
      'Correct the colour of the product so it matches the physical item: neutralise the cast the camera or the room lighting introduced and return a true-to-life rendition.',
    must: [
      'Neutralise the white balance against the whites and greys already present in the frame',
      'Keep the resulting hue, saturation and lightness physically plausible for the real material — this is a correction, not a look',
      'Preserve texture, shading, reflections and highlights exactly',
    ],
    avoid: [
      'Boosting saturation or contrast to make the product look better than it is — a colour that does not match the delivered item is what drives marketplace returns',
      'Applying a creative grade on top of the correction',
      'Changing the product to a different colour altogether',
    ],
  },

  // ── text_add ─────────────────────────────────────────────────────────────
  product_label: {
    editType: 'text_add',
    textSurface: "the product's own front label",
    direction: () =>
      "Set the customer's text onto the product's own front label surface, as though it had been printed there in the same production run as the artwork already on it — same ink, same press, same substrate. If the label carries no clear area large enough to hold the text legibly, place it instead on the largest uninterrupted area of the product's own packaging — still on the product, still matched to its print.",
    must: [
      "Wrap the text to the label's curvature and perspective so it sits ON the surface rather than floating above it",
      "Match the existing print: same finish, same sheen, same slight ink absorption as the label's own type",
      // NOT "never larger than the product name already printed there". Measured
      // on production 2026-08-27: on a wrapper covered edge to edge in small
      // repeated print, that ceiling plus "place it in existing negative space"
      // left the model nowhere to put anything legible, and it declined — the
      // edit came back visually unchanged twice while the route returned 200 and
      // charged for it. Legibility is the point of putting a name on a product;
      // a rule that can drive the type to invisible is the wrong rule.
      'Size it to be clearly legible at a glance, and no larger than it needs to be for that',
      "Keep the text on the product itself, never crossing its silhouette into the background",
    ],
    avoid: [
      'Flat, perfectly rectangular text pasted over a curved surface',
      "Covering, replacing or redrawing the label's existing artwork",
      'A drop shadow, glow or outline that reveals the text as an overlay',
    ],
  },
  promo_badge: {
    editType: 'text_add',
    textSurface: 'a single flat badge in the emptiest area of the background',
    direction: (brand) =>
      brand
        ? `Set the customer's text in one clean flat badge placed in the emptiest area of the background, clear of the product. Fill the badge with ${brand.safePrimary} and set the text in a colour that reads at high contrast against it.`
        : "Set the customer's text in one clean flat badge placed in the emptiest area of the background, clear of the product, filled with a solid colour drawn from the image itself and set at high contrast against it.",
    must: [
      'Keep the badge entirely off the product — it must not touch it, overlap it or cast a shadow onto it',
      'Keep the badge geometry simple: one solid rounded rectangle or circle, flat, no bevel, no gloss, no border',
      'Size the badge so the text is still legible at thumbnail size — roughly one fifth of the frame width',
      'Match the badge to the lighting of the frame so it reads as part of the picture rather than a sticker photographed separately',
    ],
    avoid: [
      'More than one badge',
      'Placing the badge over the product or across its edge',
      'Adding a second line, a price, a currency symbol, an arrow or any decoration the customer did not write',
    ],
  },

  // ── style_transfer ───────────────────────────────────────────────────────
  luxury_editorial: {
    editType: 'style_transfer',
    direction: () =>
      'Regrade and relight the photograph as a luxury print-campaign still: deep controlled shadows, one directional key, restrained highlights and a matte film-like falloff.',
    must: [
      'Keep the product identical in shape, proportions, colours, materials, logos and printed text',
      'Deepen the shadows without crushing them — detail must survive in the darkest areas of the frame',
      'Hold one grade across the whole frame rather than a filter over part of it',
    ],
    avoid: [
      'A heavy tint or split-tone that alters the product\'s own colour',
      'Grain, halation or lens effects heavy enough to soften the product\'s edges',
      'Adding or removing any object in the frame',
    ],
  },
  bright_ecommerce: {
    editType: 'style_transfer',
    direction: () =>
      'Regrade the photograph to the bright, clean, high-key look catalogue and marketplace listings reward: even exposure, neutral white balance, open shadows and crisp product edges.',
    must: [
      'Lift the shadows until every part of the product is readable, without flattening its form',
      'Hold the whites just below clipping so the background stays clean and the product edge stays defined against it',
      "Keep the product's colour accurate — this look brightens the frame, it does not shift the product's hue",
      'Keep micro-contrast high on product edges and surface texture',
    ],
    avoid: [
      "Blowing the highlights out until the product's edge disappears into the background",
      'An HDR, over-sharpened or halo-edged look',
      'Warming or cooling the whole frame into a colour cast',
    ],
  },
  warm_appetite: {
    editType: 'style_transfer',
    direction: () =>
      'Regrade the photograph as appetising editorial food photography: warm golden highlights, rich reds and browns, deepened contact shadows, and high micro-contrast on crust, char, glaze and grain.',
    must: [
      'Keep whites — plates, linen, packaging — neutral, so the warmth reads as light rather than as a filter',
      'Keep herbs and vegetables green and turgid rather than dragged warm with everything else',
      'Raise micro-contrast on texture only: crust, char, grill marks, condensation, glaze',
      'Keep the dish identical in ingredients, portion, assembly and arrangement',
    ],
    avoid: [
      'An orange cast across the whole frame',
      'Anything that reads as stale, dried out, congealed, plastic or CGI',
      'Adding, removing or rearranging any ingredient, garnish or prop',
    ],
  },
};

/** True when `id` is a key of EDIT_PRESETS. The route's `z.enum` already
 *  guarantees it, but the builder is also reachable from tests and from any
 *  future caller, and an unknown key must degrade to "no preset" rather than
 *  reading `undefined.direction`. */
export function isEditPresetId(id: string): id is EditPresetId {
  return Object.prototype.hasOwnProperty.call(EDIT_PRESETS, id);
}

/** The preset/type agreement the route turns into a clean 400. Exported so the
 *  rule is stated ONCE, in the table, rather than restated in a Zod refine that
 *  can drift away from it. */
export function editPresetMatchesType(presetId: string, editType: string): boolean {
  return isEditPresetId(presetId) && EDIT_PRESETS[presetId].editType === editType;
}

/** Whether this preset is meaningless without a palette. See
 *  `brand_color_match`. */
export function editPresetRequiresBrandColors(presetId: string): boolean {
  return isEditPresetId(presetId) && EDIT_PRESETS[presetId].requiresBrandColors === true;
}

/**
 * The containment rule, stated last so it is the last thing the model reads.
 *
 * ── WHY IT IS WORDED LIKE THIS ─────────────────────────────────────────────
 * This is not a guess about how image models behave. On 2026-08-25 the same
 * model (`gemini`), on production, invented garbled pseudo-Arabic and fake
 * Latin across a wrapper and a menu board under a loose prompt, and produced a
 * clean frame under a tight one whose form was:
 *
 *     TEXT RULE — this overrides everything else in this prompt:
 *     - The ONLY text anywhere in the entire image is: <X>
 *     - It appears EXACTLY ONCE, on <the named surface>, and nowhere else.
 *     - Every other surface — menu boards, windows, price cards, packaging,
 *       neighbouring shops, street signs — must be COMPLETELY BLANK. …
 *
 * Three things carried it and all three are preserved below: an override
 * claim, a COUNT plus a NAMED SURFACE, and an ENUMERATION of the surfaces that
 * are otherwise where invented text lands. An `avoid` bullet has none of them,
 * which is why `text_add`'s "Adding any word that is not between those
 * quotation marks" did not hold on its own.
 *
 * ── THE ONE AMENDMENT, AND WHY IT IS NOT OPTIONAL ──────────────────────────
 * The proven wording came from a GENERATE prompt, where the frame starts
 * empty and "the only text in the image" is a complete statement. This is an
 * EDIT studio: the customer's photograph very often already has printed text
 * on the product — that is what a label IS — and telling the model the only
 * text is the new string is an instruction to erase the customer's own
 * packaging. So the count is stated on NEW text, and existing print gets its
 * own line saying it survives untouched. Dropping that line to keep the
 * quoted wording byte-identical would trade one defect for a worse one.
 */
function buildTextRule(editType: string, safeText: string, safeSurface: string): string {
  const header = `\n\nTEXT RULE — this overrides everything else in this prompt:`;
  const survives = `\n- Text already printed on the customer's product in the attached photograph stays exactly as photographed — same characters, same script, same position. Reproduce it; never redraw, translate or move it.`;
  // "ADD NOTHING", not "BE BLANK".
  //
  // The wording proved on production 2026-08-25 was "every other surface must be
  // COMPLETELY BLANK", and it is correct THERE — that was creator, a
  // text-to-image path, where nothing exists yet and blank is the desired end
  // state. Carried into an EDIT it means something entirely different: erase
  // what is in the customer's photograph.
  //
  // It did exactly that. Measured 2026-08-27 across all fourteen presets:
  // `luxury_editorial` wiped a background menu board — which legitimately read
  // شاورما الشام in the source — to a blank card, while `warm_appetite` and
  // `bright_ecommerce` preserved it. The instruction was being obeyed; it was
  // the instruction that was wrong, and it was destroying real content in one
  // preset out of three by luck of interpretation.
  //
  // Stated as a prohibition on ADDING now. The anti-invention intent is intact —
  // that is the defect this line was written for — without ordering the model to
  // delete a sign the customer photographed on purpose.
  const blank = `\n- Do not introduce text onto any surface that does not already carry it. Packaging, labels, menu boards, windows, price cards, neighbouring products and background signage all keep exactly what the photograph shows — no lettering, numbers, logos or decorative script added anywhere, and none removed.`;

  if (editType === 'text_add') {
    // NOT `blank`. Measured on production 2026-08-27: with the shared blank
    // line, `product_label` was a NO-OP — 1.93% of pixels changed and a mean
    // channel delta of 1.43, against 81% / 129 for a background replace on the
    // same image. The customer paid a credit and got their photograph back.
    //
    // The cause was a contradiction inside this one block. `blank` names
    // "packaging, labels" as surfaces that must be COMPLETELY BLANK, and on a
    // product close-up the label IS the target — so the model was told to print
    // on the label, to leave labels blank, to keep existing print exactly, and
    // (from the preset's own avoid list) not to redraw the label's artwork.
    // Faced with that, doing nothing is the only move that violates no rule.
    //
    // Stated as an EXCLUSION of the target instead of a fixed list of nouns. A
    // fixed list cannot know what the preset aimed at, which is precisely how
    // it came to name it.
    return (
      header +
      `\n- The only NEW text anywhere in the entire image is: "${safeText}"` +
      `\n- It appears EXACTLY ONCE, on ${safeSurface}, and nowhere else.` +
      `\n- Add it there even if that surface already carries printed artwork — set the new text into the space around that artwork without redrawing, covering or removing it.` +
      survives +
      `\n- No text of any kind is added to any surface other than ${safeSurface}. Every one of those other surfaces keeps exactly what the photograph shows — nothing added, nothing invented, nothing removed.`
    );
  }

  return (
    header +
    `\n- Do not add, invent, redraw or translate ANY text, lettering, numbers, logos or decorative script anywhere in the image.` +
    survives +
    blank
  );
}

/** Where the one occurrence goes when the customer picked no preset. Named
 *  rather than left to the model, because "somewhere sensible" is exactly the
 *  instruction that produced text on three surfaces. */
const DEFAULT_TEXT_SURFACE = 'one clear area of empty space in the image';

export function buildEditPrompt(input: EditPromptInput): string {
  const { editType, editDescription, editPreset, brandKit, brandContextBlock } = input;
  const safeDescription = editDescription ? sanitizePrompt(editDescription, 1000) : '';
  const mode = EDIT_MODES[editType];

  // A preset from a different editType is refused by the route with a 400. It is
  // dropped here as well rather than trusted: this builder is called by tests and
  // could be called by a future route, and a `marketplace_white` recipe composed
  // under the `color_change` task would ask the model for two different edits at
  // once — a "strange prompt" is precisely what the 400 exists to prevent, so the
  // builder must not be able to produce one either.
  const preset = editPreset && isEditPresetId(editPreset) ? EDIT_PRESETS[editPreset] : undefined;
  const activePreset = preset && preset.editType === editType ? preset : undefined;

  // Every `brand_kits` colour column is customer-writable to an arbitrary string
  // over PostgREST (022's column lockdown covered `profiles`; 042 constrains
  // `logo_url` alone), and these values are handed to preset recipes which
  // interpolate them into the prompt. Filtered and capped HERE, once, so no
  // preset can be the place an unfiltered column reaches the model.
  const brandColors: EditPresetBrand | null = brandKit
    ? {
        safePrimary: sanitizePrompt(String(brandKit.primary_color ?? ''), 40),
        safeSecondary: sanitizePrompt(String(brandKit.secondary_color ?? ''), 40),
        safeAccent: sanitizePrompt(String(brandKit.accent_color ?? ''), 40),
      }
    : null;

  let prompt = `You are a professional retoucher working on the attached image.`;
  prompt += `\n\nThe attached image is the customer's own photograph. It is the subject of this edit and must survive it.`;
  prompt += `\n\nTask: ${mode ? mode.task : `Apply the requested edit: ${sanitizePrompt(editType.replace(/_/g, ' '), 50)}.`}`;

  // The preset's recipe, above the customer's own words: the recipe is the
  // specification and the free text is the amendment to it, so the model should
  // read them in that order.
  if (activePreset) {
    prompt += `\nDirection: ${activePreset.direction(brandColors)}`;
  }

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
  //
  // The route guarantees a description on this mode (a preset cannot stand in
  // for the text itself), so the line is always populated here.
  if (editType === 'text_add') {
    prompt += `\nText to set: "${safeDescription}"`;
  } else if (safeDescription) {
    prompt += `\nCustomer instruction: ${safeDescription}`;
  }

  // Gated on the preset, NOT merely on the kit existing.
  //
  // This repo has already shipped this exact contradiction once, in the sibling
  // studio: "The photoshoot BRAND block asked for colour 'in the set dressing'
  // and was appended to `white_studio`, which specifies 'no props'"
  // (CLAUDE.md, 2026-08-24 round). Handing a model a palette while the same
  // prompt forbids colour is not a neutral extra fact — it is an instruction
  // pulling the other way, and `marketplace_white` is the preset where losing
  // that argument is most expensive: a tinted background is a rejected
  // marketplace listing, not a matter of taste.
  //
  // So the palette is emitted only where a preset actually consumes it, or on
  // the free-text path, where the customer may well be referring to their own
  // colours in words and the model needs the hex to match them.
  const presetUsesBrandColors = preset ? preset.requiresBrandColors === true : true;
  if (brandColors && presetUsesBrandColors) {
    prompt += `\nBrand Colors: Primary ${brandColors.safePrimary}, Secondary ${brandColors.safeSecondary}, Accent ${brandColors.safeAccent}`;
  }

  // Placed after the task/direction/instruction/brand-colors lines above and
  // before the Must/Avoid technical directives below.
  //
  // LIVE as of 2026-08-27. This was documented DEAD for two days (review finding
  // F10): `edit`'s InputSchema had no `brandKitId`, so the route never fetched a
  // kit and this branch always saw `null`. It is now the only studio that
  // resolves the kit in THREE steps — explicit id, then the selected project's
  // kit, then the account default — because a product-photography edit is
  // exactly where "the system already knows my business" has to be true without
  // being asked again. Taken from the caller, not rebuilt here: the caller has
  // already run the filter over it, so this builder cannot be the place a
  // blocked brand-kit column is discovered — see photoshoot for the same rule.
  prompt += brandContextBlock ?? '';

  // A preset REFINES the mode; it never replaces it. `background_replace`'s
  // "keep the subject pixel-identical" holds whether or not the customer picked
  // the marketplace recipe, and a preset that could drop it would be a way to
  // silently opt out of the guarantees this file exists to state.
  const must = [...(mode?.must ?? []), ...(activePreset?.must ?? [])];
  const avoid = [...(mode?.avoid ?? []), ...(activePreset?.avoid ?? [])];
  if (must.length > 0) {
    prompt += `\n\nMust:`;
    for (const line of must) prompt += `\n- ${line}`;
  }
  if (avoid.length > 0) {
    prompt += `\n\nAvoid:`;
    for (const line of avoid) prompt += `\n- ${line}`;
  }

  // Last, and stated as an override, because that is the form that was measured
  // working. See buildTextRule().
  prompt += buildTextRule(editType, safeDescription, activePreset?.textSurface ?? DEFAULT_TEXT_SURFACE);

  prompt += `\n\nReturn the edited image at the same aspect ratio and resolution as the original.`;

  return prompt;
}

export const EDIT_PROMPT_VERSION = getPromptVersion('edit');
