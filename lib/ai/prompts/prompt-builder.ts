interface PromptBuilderInput {
  description: string;
  outputType: string;
  style?: string;
}

// v1.0
export function buildPromptBuilderPrompt(input: PromptBuilderInput): string {
  return `You are an expert AI prompt engineer. A user described what they want in Arabic.

User description: ${input.description}
Desired output type: ${input.outputType}
${input.style ? `Style preference: ${input.style}` : ''}

Generate exactly 3 different professional English prompts that would produce the best results.
Each prompt should be detailed, specific, and optimized for AI generation.

Return as valid JSON array of objects with:
1. "prompt": The full English prompt
2. "style": Brief style label
3. "tip": One sentence tip in Arabic about this prompt

Return ONLY the JSON array.`;
}

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
