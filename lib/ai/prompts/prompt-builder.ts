import { sanitizePrompt } from './safety';
import { getPromptVersion } from './versions';

interface PromptBuilderInput {
  description: string;
  outputType: string;
  style?: string;
}

/**
 * What each output type is actually FOR.
 *
 * The prompt used to pass `outputType` through as a bare slug and leave the model
 * to guess what it meant, so a prompt built for a voiceover script came back
 * shaped like one built for a still image. Naming the medium and its constraints
 * is the whole difference between a generic prompt and a usable one.
 *
 * Keys must stay in step with the output types
 * app/[locale]/(dashboard)/prompt-builder/page.tsx offers.
 */
const OUTPUT_GUIDANCE: Record<string, string> = {
  image:
    'a single still image. Describe subject, composition, lens and framing, lighting, colour palette, mood and surface detail. Never ask for text inside the image.',
  video:
    'a short video or reel. Describe the shot sequence, camera movement, pacing, and what changes between the opening and closing frames.',
  copy:
    'written marketing copy. Describe the audience, the promise, the tone of voice, the length, and the single action the reader should take.',
  campaign:
    'a multi-post social campaign. Describe the through-line, how the posts differ from one another, the platform, and the cadence.',
};

// v3.0
export function buildPromptBuilderPrompt(input: PromptBuilderInput): string {
  const { description, outputType, style } = input;

  // Every value interpolated below reaches the model, so every value below meets
  // the filter — the same rule the other builders now hold.
  const safeDescription = sanitizePrompt(description, 2000);
  const safeOutputType = sanitizePrompt(outputType, 50);
  const safeStyle = style ? sanitizePrompt(style, 100) : '';
  const guidance = OUTPUT_GUIDANCE[outputType] ?? `a ${safeOutputType}.`;

  let prompt = `You are an expert AI prompt engineer working for an Arabic-first marketing product.`;
  prompt += `\nThe customer describes what they want in Arabic; you return English prompts a generative model can act on.`;

  prompt += `\n\nCustomer description: ${safeDescription}`;
  prompt += `\nThe prompts must target ${guidance}`;
  if (safeStyle) prompt += `\nStyle preference: ${safeStyle}`;

  prompt += `\n\nWrite exactly 3 DIFFERENT prompts. They must differ in approach, not merely in wording —`;
  prompt += `\nthree rephrasings of the same idea give the customer one option, not three.`;

  prompt += `\n\nEach prompt must:`;
  prompt += `\n- be in English, and specific enough that two different models would produce a similar result`;
  prompt += `\n- name concrete visual or structural choices rather than adjectives ("shot on a 50mm at f/1.8" beats "beautiful")`;
  prompt += `\n- stand alone, with no reference to the other two`;

  // The exact shape app/api/studios/prompt-builder/route.ts parses. Stating it here
  // as well as in the responseSchema means a model that ignores the schema still
  // has the contract in front of it.
  prompt += `\n\nReturn a valid JSON array of exactly 3 objects with these keys:`;
  prompt += `\n[{ "prompt": "the full English prompt", "style": "a two-or-three word style label", "tip": "one sentence in Arabic saying when to use this one" }]`;
  prompt += `\n\nReturn ONLY the JSON array.`;

  return prompt;
}

export const PROMPT_BUILDER_PROMPT_VERSION = getPromptVersion('prompt_builder');

export function getMockPromptResults(): { prompt: string; style: string; tip: string }[] {
  return [
    {
      prompt: 'Professional commercial photography of the product on a clean white marble surface, soft natural lighting from the left, shallow depth of field, brand colors as subtle accents, high-end advertising quality, 4K resolution',
      style: 'Professional',
      tip: 'هذا البرومبت مناسب للصور الاحترافية والإعلانات',
    },
    {
      prompt: 'Creative flat lay composition featuring the product surrounded by lifestyle elements, warm golden hour lighting, Instagram-worthy aesthetic, clean and modern style, professional food/product photography',
      style: 'Lifestyle',
      tip: 'مثالي لمنشورات السوشال ميديا وانستغرام',
    },
    {
      prompt: 'Minimalist product showcase with gradient background matching brand colors, dramatic studio lighting with rim light, floating product effect, ultra-clean composition, luxury brand aesthetic',
      style: 'Minimalist',
      tip: 'يناسب المنتجات الفاخرة والعلامات التجارية الراقية',
    },
  ];
}
