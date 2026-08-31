/**
 * The output canvas, decided by the product rather than by the model.
 *
 * ── WHY THIS EXISTS: MEASURED, NOT ASSUMED ─────────────────────────────────
 * Four `creator` requests on 2026-08-31, identical `resolution: '2K'`, identical
 * model, identical account, came back as:
 *
 *     creator_ar_raw       2752x1536   ratio 1.79
 *     creator_en_brief     2752x1536   ratio 1.79
 *     creator_ar_bold      1696x2528   ratio 0.67   <- portrait
 *     creator_ar_signage   2848x1504   ratio 1.89
 *
 * Three shapes across four requests. `lib/ai/gemini.ts:200` sends `aspectRatio`
 * only when the caller supplies one, and no text-to-image caller ever did — so
 * the model picked the shape from prompt content. A customer producing a set of
 * posts cannot know what they will get, and two runs of the same request do not
 * agree with each other.
 *
 * The campaign path fails the other way and it is not a shape the model chose:
 * both kept images came back 1024x1024 for a request carrying
 * `platform: 'instagram'`. Square is a legal Instagram feed post; 4:5 is the one
 * the platform actually gives the most height to, and it is what the customer
 * asked for by naming the platform at all.
 *
 * ── WHY THE RATIO IS STATED TWICE ──────────────────────────────────────────
 * `aspectRatio` goes to the adapter as a request parameter and `framing` goes
 * into the prompt as prose. Both, deliberately: the parameter sets the canvas,
 * and without the prose the model composes a centred landscape subject and lets
 * the crop cut it. `edit.ts:837-841` already does exactly this for the
 * marketplace presets and states the same reason.
 */

/**
 * `campaign`'s InputSchema already closes the platform set to five
 * (`app/api/studios/campaign/route.ts:29`), and that public contract does not
 * change here. `creator` gains the same five plus `general`, so its new field is
 * optional and every existing client keeps working.
 */
export const PLATFORM_IDS = [
  'general',
  'instagram',
  'tiktok',
  'linkedin',
  'twitter',
  'facebook',
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

/** The five `campaign` accepts — `general` is creator's default and is not a
 *  campaign platform. Exported so campaign's own enum can be checked against
 *  this table rather than restated. */
export const CAMPAIGN_PLATFORM_IDS = PLATFORM_IDS.filter((p) => p !== 'general');

interface PlatformFraming {
  /** Passed to the adapter. A string, because that is what every provider takes
   *  and because turning it into a number here would lose which of 4:5 and 5:4
   *  was meant. */
  aspectRatio: string;
  /** The same shape, told to the model. */
  framing: string;
}

export const PLATFORM_FRAMING: Record<PlatformId, PlatformFraming> = {
  // The default for a creator request that names no platform.
  //
  // This IS a behaviour change and it is deliberate: creator returns whatever
  // shape the model picks today, and two of the four baseline frames were 1.79
  // landscape. The alternative — keep "let the model decide" as the default —
  // preserves a behaviour that does not reproduce between two identical
  // requests, which is not worth preserving in a tool sold for producing sets.
  general: {
    aspectRatio: '1:1',
    framing:
      'Compose for a SQUARE 1:1 frame. Place the subject centrally with even ' +
      'margins on all four sides, and keep everything essential well inside the edges.',
  },
  instagram: {
    aspectRatio: '4:5',
    framing:
      'Compose for a VERTICAL 4:5 Instagram feed frame. Build the composition ' +
      'upright rather than wide, and keep the subject clear of the top and bottom ' +
      'eighth of the frame, where the interface overlays it.',
  },
  tiktok: {
    aspectRatio: '9:16',
    framing:
      'Compose for a FULL-HEIGHT 9:16 vertical frame. Fill the height rather ' +
      'than centring a wide subject in the middle, and keep the subject out of ' +
      'the top and bottom fifth, where captions and controls sit.',
  },
  linkedin: {
    aspectRatio: '1:1',
    framing:
      'Compose for a SQUARE 1:1 frame. Keep the composition calm and uncluttered, ' +
      'with the subject centred and generous even margins.',
  },
  twitter: {
    aspectRatio: '16:9',
    framing:
      'Compose for a WIDE 16:9 landscape frame. Use the horizontal space ' +
      'deliberately, and keep the subject clear of the extreme left and right edges, ' +
      'which are cropped in a timeline preview.',
  },
  facebook: {
    aspectRatio: '1:1',
    framing:
      'Compose for a SQUARE 1:1 frame. Place the subject centrally with even ' +
      'margins on all four sides.',
  },
};

/** The framing prose, as a prompt block. Returns `''` for an unknown id rather
 *  than defaulting to `general`, so a caller that has drifted out of the enum
 *  emits nothing instead of silently composing for the wrong canvas — the
 *  adapter still receives no ratio in that case, which is today's behaviour. */
export function buildFramingBlock(platform: string): string {
  const entry = PLATFORM_FRAMING[platform as PlatformId];
  return entry ? `\n\nFRAME\n${entry.framing}` : '';
}

/** The ratio for the adapter, or `undefined` when the id is unknown. `undefined`
 *  rather than a fallback for the same reason as above: guessing a canvas is
 *  worse than the current behaviour of letting the provider decide. */
export function aspectRatioFor(platform: string): string | undefined {
  return PLATFORM_FRAMING[platform as PlatformId]?.aspectRatio;
}
