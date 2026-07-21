import type { BrandKit } from '@/lib/supabase/types';
import { getPromptVersion } from './versions';

interface PhotoshootPromptInput {
  environment: string;
  shotIndex: number;
  totalShots: number;
  notes?: string;
  brandKit?: BrandKit | null;
  /**
   * Varies the shoot between runs. Pass a value that is stable within one
   * generation but different across generations — the route passes the
   * generation id. Omitting it falls back to a fixed shoot, which is what v2.0
   * always did: identical input produced a byte-identical prompt, so asking for
   * the same product twice returned the same six pictures.
   */
  seed?: string;
}

/**
 * One shot in a set. Every field is a lever image models actually respond to:
 * focal length and aperture control perspective compression and depth of field,
 * composition controls framing, staging controls what shares the frame.
 * "45-degree three-quarter view" on its own leaves all of that to chance.
 */
interface ShotRecipe {
  name: string;
  camera: string;
  composition: string;
  staging: string;
}

interface EnvironmentPreset {
  environment: string;
  background: string;
  style: string;
  /** One is chosen per run. Keeps the set coherent while varying between runs. */
  lighting: string[];
  grade: string[];
  /**
   * Shot recipes are per-environment rather than one global list. A top-down
   * flat lay is the right third shot for a white studio and the wrong one for a
   * luxury set whose whole character is a low heroic angle — v2.0 applied the
   * same six angles to all six environments and they contradicted each other.
   */
  shots: ShotRecipe[];
}

const ENVIRONMENT_PRESETS: Record<string, EnvironmentPreset> = {
  white_studio: {
    environment: 'Professional photo studio, infinity cove',
    background: 'Pure white seamless backdrop, no visible horizon line, no props',
    style: 'Clean, minimal, catalogue-ready e-commerce photography',
    lighting: [
      'Two large softboxes at 45° left and right, 1:1 ratio, broad even wrap, white bounce card filling the front',
      'Large overhead octabox as key with a white floor bounce, plus two strip boxes raking the edges for separation',
      'High-key setup: key softbox front-left, fill at 2:1, two background lights blowing the backdrop to clean paper white',
    ],
    grade: [
      'Neutral true-to-life color, accurate white balance, no color cast, pure whites at 250 RGB',
      'Crisp clean grade, slightly lifted exposure, high micro-contrast on product edges, neutral greys',
    ],
    shots: [
      {
        name: 'Front hero',
        camera: '85mm lens at f/8, camera at product mid-height, perfectly square to the front face',
        composition: 'Product centred, occupying about 70% of frame height, even margins, generous headroom',
        staging: 'Product resting on the seamless with a soft natural contact shadow directly beneath it',
      },
      {
        name: 'Three-quarter',
        camera: '85mm lens at f/7.1, camera raised 30° above product, subject rotated 45°',
        composition: 'Placed on a third, front face and side face both clearly readable, depth implied by the turn',
        staging: 'Clean white acrylic riser, subtle reflection under the base',
      },
      {
        name: 'Overhead flat lay',
        camera: '50mm lens at f/9, sensor perfectly parallel to the surface, shot straight down',
        composition: 'Dead centre, symmetrical margins on all four sides, no perspective distortion',
        staging: 'Product alone on a clean white plane, one soft directional shadow to give it weight',
      },
      {
        name: 'Macro detail',
        camera: '100mm macro lens at f/4, close focus on the label, seam, texture or material finish',
        composition: 'Detail fills the frame, focus falling off gently toward the corners',
        staging: 'No props at all — only the product surface and the light on it',
      },
      {
        name: 'Side profile',
        camera: '85mm lens at f/8, exact side profile, camera at product mid-height',
        composition: 'Silhouette clearly readable, product centred, strong edge separation from the white',
        staging: 'Thin rim light along the back edge so the outline does not merge into the backdrop',
      },
      {
        name: 'Elevated dynamic',
        camera: '65mm lens at f/6.3, camera raised 20°, product tilted slightly toward the lens',
        composition: 'Diagonal placement, product weighted to one side, deliberate empty space for copy',
        staging: 'Invisible acrylic support so the product appears to lean unaided',
      },
    ],
  },

  lifestyle: {
    environment: 'A real lived-in interior appropriate to how the product is actually used',
    background: 'Authentic domestic space with genuine clutter kept soft and out of focus',
    style: 'Authentic, aspirational, editorial lifestyle — social-media ready, never staged-looking',
    lighting: [
      'Large north-facing window as the only key, soft directional falloff, deep natural shadows, no artificial fill',
      'Late golden-hour sun raking through a window, long warm shadows, visible light shafts and dust in the air',
      'Overcast diffused daylight, very soft shadow edges, calm even ambience',
    ],
    grade: [
      'Warm natural grade, gently lifted blacks, soft filmic roll-off in the highlights, true skin tones',
      'Muted earthy palette, desaturated greens, warm midtones, matte shadows',
    ],
    shots: [
      {
        name: 'In use, candid',
        camera: '35mm lens at f/2, chest height, handheld feel',
        composition: 'Product in the near third and sharp, the human moment softly blurred behind it',
        staging: 'Caught mid-use, nothing arranged, natural imperfection in the scene',
      },
      {
        name: 'On a real surface',
        camera: '50mm lens at f/2.8, low three-quarter, lens close to the tabletop plane',
        composition: 'Foreground objects blurred across the bottom edge, product sharp behind them',
        staging: 'Worn wooden table, a used cup, an open book — signs of an actual life',
      },
      {
        name: 'Overhead scene',
        camera: '35mm lens at f/4, shot straight down over the table',
        composition: 'Product off-centre in a loose arrangement, breathing room around it',
        staging: 'Linen cloth, ceramics, a folded newspaper, a hand entering from the frame edge',
      },
      {
        name: 'Window light close-up',
        camera: '85mm lens at f/2.2, eye level, product close to the glass',
        composition: 'Tight crop, window frame shadow falling across the wall behind',
        staging: 'A sheer curtain diffusing part of the light, a plant just out of focus',
      },
      {
        name: 'Held in hand',
        camera: '50mm lens at f/2.5, held toward the lens at chest height',
        composition: 'Hands and product only, natural grip, wrist and forearm entering the frame',
        staging: 'Natural unretouched skin, no jewellery competing with the product',
      },
      {
        name: 'Wide environmental',
        camera: '28mm lens at f/4, standing height, whole room readable',
        composition: 'Product small but unmistakable, placed at a strong point in the room',
        staging: 'The full space in context — furniture, floor, wall, daylight from one side',
      },
    ],
  },

  nature: {
    environment: 'Outdoor natural setting chosen to complement the product',
    background: 'Landscape rendered in soft bokeh — foliage, stone, water or open sky',
    style: 'Fresh, organic, sustainable-brand photography',
    lighting: [
      'Golden-hour sun low and behind the subject, warm rim light, long soft shadows toward the camera',
      'Open shade under a canopy, cool soft ambient light, dappled highlights breaking through leaves',
      'Bright overcast sky as a giant softbox, even shadowless light, rich saturated greens',
    ],
    grade: [
      'Natural grade, rich greens, warm highlights, deep organic shadows, no artificial saturation',
      'Airy light grade, soft contrast, pale sky, gentle pastel tones throughout',
    ],
    shots: [
      {
        name: 'Resting on stone',
        camera: '50mm lens at f/4, camera low and close to the ground',
        composition: 'Product on a third, rock texture leading the eye in from the frame edge',
        staging: 'Weathered stone, moss, a scatter of fallen leaves — nothing arranged by hand',
      },
      {
        name: 'Backlit through foliage',
        camera: '85mm lens at f/2, sun directly behind the product',
        composition: 'Glowing rim around the product, leaf shapes flaring across one corner',
        staging: 'Branches framing the top of the frame, warm lens flare permitted',
      },
      {
        name: 'Water macro',
        camera: '100mm macro lens at f/3.5, close on the product surface',
        composition: 'Droplets and condensation sharp, background dissolving to pure colour',
        staging: 'Fresh dew or fine water spray beading on the surface',
      },
      {
        name: 'Wide landscape',
        camera: '35mm lens at f/5.6, low, deep focus front to back',
        composition: 'Product large in the foreground, valley or shoreline receding behind it',
        staging: 'Open natural vista, horizon placed on the upper third',
      },
      {
        name: 'Ground level',
        camera: '24mm lens at f/4, lens resting almost on the ground',
        composition: 'Grass blurred across the bottom of the frame, product rising against the sky',
        staging: 'Wild grass, small wildflowers, natural uneven terrain',
      },
      {
        name: 'Raised against sky',
        camera: '50mm lens at f/4, camera below, aimed slightly upward',
        composition: 'Product isolated against open sky, high-key and uncluttered',
        staging: 'Nothing but sky and cloud behind the product',
      },
    ],
  },

  urban: {
    environment: 'Modern city setting with strong architectural geometry',
    background: 'Raw concrete, glass facades, painted steel, street signage and asphalt',
    style: 'Edgy, contemporary, metropolitan streetwear photography',
    lighting: [
      'Hard directional afternoon sun between buildings, crisp defined shadows, bright specular highlights',
      'Blue-hour ambient with warm practical lights, cool shadows against warm windows',
      'Overcast urban light with a large bounce from a nearby glass facade, soft but directional',
    ],
    grade: [
      'Cool cinematic grade, teal shadows, desaturated concrete greys, punchy contrast',
      'High-contrast neutral grade, deep crushed blacks, clean whites, slightly cool midtones',
    ],
    shots: [
      {
        name: 'Concrete ledge',
        camera: '50mm lens at f/4, camera at product height, square to the wall',
        composition: 'Product centred against a flat concrete plane, hard shadow cast to one side',
        staging: 'Raw board-formed concrete, visible texture and imperfection',
      },
      {
        name: 'Café table, street bokeh',
        camera: '85mm lens at f/2, seated eye level',
        composition: 'Product sharp in the near third, street traffic melting into round bokeh behind',
        staging: 'Small metal café table, passing pedestrians and car lights out of focus',
      },
      {
        name: 'Low angle architecture',
        camera: '24mm lens at f/5.6, camera near ground level aimed upward',
        composition: 'Product looming large, building lines converging dramatically above it',
        staging: 'Glass tower or stairwell geometry filling the upper frame',
      },
      {
        name: 'Night neon',
        camera: '50mm lens at f/1.8, low, close to wet ground',
        composition: 'Product sharp, neon signage reflected and smeared across wet asphalt behind',
        staging: 'Rain-slicked street, magenta and cyan signage, puddle reflections',
      },
      {
        name: 'Motion street',
        camera: '35mm lens at f/4, slow shutter, camera locked off',
        composition: 'Product perfectly sharp while pedestrians and traffic blur past it',
        staging: 'Busy pavement, motion streaks reading as movement not as blur error',
      },
      {
        name: 'Rooftop skyline',
        camera: '35mm lens at f/5.6, camera at ledge height',
        composition: 'Product on a rooftop edge, skyline receding into haze behind',
        staging: 'Concrete parapet, distant towers, sky occupying the upper half',
      },
    ],
  },

  luxury: {
    environment: 'High-end styled set — marble, velvet, brushed brass, polished stone',
    background: 'Deep rich surfaces falling into darkness, tactile and expensive',
    style: 'Premium editorial still life, gallery-grade advertising photography',
    lighting: [
      'Single hard key from camera-left with a black flag opposite, dramatic falloff into near-black shadow',
      'Narrow gridded spot from above, tight pool of light on the product, everything else dissolving to black',
      'Raking low side light with a large silver bounce for a thin controlled fill, strong sculptural modelling',
    ],
    grade: [
      'Rich dark grade, deep true blacks, warm golden highlights, luxurious contrast',
      'Cool editorial grade, cold marble whites, gunmetal shadows, restrained saturation',
    ],
    shots: [
      {
        name: 'Low hero on stone',
        camera: '50mm lens at f/8, camera slightly below the product, aimed marginally upward',
        composition: 'Product dominant and monumental, deliberate dark space above it',
        staging: 'Black or Calacatta marble slab, nothing else in the frame',
      },
      {
        name: 'Chiaroscuro',
        camera: '85mm lens at f/5.6, camera at product height',
        composition: 'Half the product in bright key, half falling into deep shadow, edge just readable',
        staging: 'Empty dark set, no props, light doing all the work',
      },
      {
        name: 'Mirror reflection',
        camera: '85mm lens at f/8, camera very low, near the surface plane',
        composition: 'Product above its own clean reflection, symmetry split across the horizontal',
        staging: 'Polished black glass or a still dark water surface',
      },
      {
        name: 'Material macro',
        camera: '100mm macro lens at f/4, extreme close focus',
        composition: 'Surface texture, grain, stitching or engraving filling the frame',
        staging: 'Raking light across the material so every micro-detail catches',
      },
      {
        name: 'Styled still life',
        camera: '65mm lens at f/6.3, camera slightly above, three-quarter view',
        composition: 'Tight considered cluster, product clearly dominant over the props',
        staging: 'Draped silk, a brass object, a single stem — each chosen, nothing accidental',
      },
      {
        name: 'Spotlight on velvet',
        camera: '85mm lens at f/4, camera at product height',
        composition: 'Product centred in a tight circle of light, heavy natural vignette',
        staging: 'Deep jewel-toned velvet, visible pile texture, folds falling away into black',
      },
    ],
  },

  festive: {
    environment: 'Celebration setting dressed with seasonal decoration',
    background: 'Warm festive depth — garlands, string lights, wrapped gifts, all softly defocused',
    style: 'Joyful, warm, seasonal-campaign photography',
    lighting: [
      'Warm practical string lights as ambience with a soft warm key from camera-left, cosy and enveloping',
      'Candlelight as the key, flickering warmth, deep amber shadows, very shallow pools of light',
      'Warm window light plus festive practicals behind, bright and cheerful rather than moody',
    ],
    grade: [
      'Warm golden grade, amber highlights, rich reds and greens, cosy lifted shadows',
      'Bright festive grade, clean whites, saturated accent colours, cheerful high-key feel',
    ],
    shots: [
      {
        name: 'Bokeh lights',
        camera: '85mm lens at f/1.8, camera at product height',
        composition: 'Product sharp and centred, string lights dissolving into large round bokeh behind',
        staging: 'Layers of warm fairy lights receding into darkness',
      },
      {
        name: 'Gifting context',
        camera: '50mm lens at f/4, camera slightly above, three-quarter view',
        composition: 'Product among the wrapping, clearly the hero of the arrangement',
        staging: 'Ribbon mid-tie, kraft paper, scissors and offcuts at the frame edge',
      },
      {
        name: 'Overhead table',
        camera: '35mm lens at f/5.6, shot straight down over a dressed table',
        composition: 'Product centred, seasonal props ringed loosely around it, space between elements',
        staging: 'Pine sprigs, spices, small ornaments, a linen runner',
      },
      {
        name: 'Candlelight',
        camera: '85mm lens at f/2, camera at table height',
        composition: 'Tight intimate crop, warm falloff into darkness at the frame edges',
        staging: 'Live candle flame just in frame, warm reflections on the product surface',
      },
      {
        name: 'Sparkle in motion',
        camera: '50mm lens at f/4, fast shutter freezing the moment',
        composition: 'Product sharp with confetti or glitter suspended mid-air around it',
        staging: 'Particles caught in the light, frozen crisply rather than smeared',
      },
      {
        name: 'Warm hero',
        camera: '85mm lens at f/5.6, camera square to the product at its mid-height',
        composition: 'Product centred and dominant, decoration framing softly from the corners',
        staging: 'Garland arcing across the top of the frame, well out of focus',
      },
    ],
  },
};

/**
 * FNV-1a. Small, dependency-free, and stable across runs — the point is a
 * reproducible spread, not cryptographic quality. The same generation id must
 * always rebuild the same prompt so a report of "this shot came out wrong" can
 * be reproduced exactly.
 */
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The first three recipes of every environment are the ones that stand alone as
 * the single image a customer would put on a product page. The rest are support
 * shots — a macro of a label or a side profile is a fine second frame and a poor
 * only frame.
 */
const HERO_POOL = 3;

/**
 * Order the recipes for one run: a hero-capable shot first, the rest rotated.
 *
 * Rotating the whole list uniformly would have been simpler, but the studio
 * sells packs of 1, 3 and 6 shots — and a plain rotation lets a 1-shot pack come
 * back as an extreme macro, or a 3-shot pack contain no hero at all. Pinning the
 * lead frame keeps every pack usable while the seed still varies which hero it
 * is, and a 6-shot pack continues to cover all six recipes.
 */
function buildShotOrder(shots: ShotRecipe[], h: number): ShotRecipe[] {
  const heroIndex = h % Math.min(HERO_POOL, shots.length);
  const rest = shots.filter((_, i) => i !== heroIndex);
  if (rest.length === 0) return [shots[heroIndex]];
  const offset = (h >>> 16) % rest.length;
  return [shots[heroIndex], ...rest.map((_, i) => rest[(i + offset) % rest.length])];
}

// v3.0 — per-environment shot recipes, seeded variation, explicit optical direction
export function buildPhotoshootPrompt(input: PhotoshootPromptInput): string {
  const { environment, shotIndex, totalShots, notes, brandKit, seed } = input;
  const preset = ENVIRONMENT_PRESETS[environment] || ENVIRONMENT_PRESETS.white_studio;
  const h = seed ? hashSeed(seed) : 0;

  // Lighting and grade are picked once per run, not per shot: a set whose six
  // frames each had a different grade would not read as one photoshoot.
  const lighting = preset.lighting[h % preset.lighting.length];
  const grade = preset.grade[(h >>> 8) % preset.grade.length];

  // Seeded ordering, so a repeat run of the same product does not retrace the
  // same six frames the way v2.0's fixed `shotIndex % SHOT_ANGLES.length` did.
  const order = buildShotOrder(preset.shots, h);
  const shot = order[shotIndex % order.length];

  let prompt = `Professional commercial product photography, photorealistic, shot on a full-frame camera.`;

  prompt += `\n\nSUBJECT`;
  prompt += `\nThe exact product shown in the reference image, reproduced identically.`;

  prompt += `\n\nSHOT ${shotIndex + 1} OF ${totalShots} — ${shot.name}`;
  prompt += `\nCamera: ${shot.camera}`;
  prompt += `\nComposition: ${shot.composition}`;
  prompt += `\nStaging: ${shot.staging}`;

  prompt += `\n\nSET`;
  prompt += `\nEnvironment: ${preset.environment}`;
  prompt += `\nBackground: ${preset.background}`;
  prompt += `\nLighting: ${lighting}`;
  prompt += `\nColour grade: ${grade}`;
  prompt += `\nStyle: ${preset.style}`;

  prompt += `\n\nMUST`;
  prompt += `\n- Preserve the product exactly: identical shape, proportions, colours, materials, logos and every character of its printed text`;
  prompt += `\n- Keep the product the unmistakable focal point and the sharpest element in the frame`;
  prompt += `\n- Render surfaces with true material response — glass refracts, metal shows specular highlights, matte plastic stays matte`;
  prompt += `\n- Ground the product with a physically correct contact shadow consistent with the lighting described above`;
  prompt += `\n- Hold detail in both highlights and shadows; nothing important clipped to pure white or crushed to black`;

  prompt += `\n\nAVOID`;
  prompt += `\n- Redrawing, translating or inventing any text, logo or label on the product`;
  prompt += `\n- Duplicating the product or adding a second copy of it anywhere in the frame`;
  prompt += `\n- Added watermarks, captions, price tags, borders or graphic overlays`;
  prompt += `\n- Shadows or props that cover, crop or obscure the product`;
  prompt += `\n- A plastic over-retouched CGI look, or lighting that contradicts the setup above`;

  if (brandKit) {
    prompt += `\n\nBRAND`;
    prompt += `\nLet ${brandKit.primary_color} and ${brandKit.secondary_color} appear as accents in the set dressing and ambient light only — never recolour the product itself.`;
  }
  if (notes) {
    prompt += `\n\nCLIENT DIRECTION`;
    prompt += `\n${notes}`;
  }

  return prompt;
}

export const PHOTOSHOOT_PROMPT_VERSION = getPromptVersion('photoshoot');
