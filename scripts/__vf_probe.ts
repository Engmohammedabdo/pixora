import { z } from 'zod/v4';
import { PLATFORM_IDS, aspectRatioFor } from '../lib/ai/prompts/platform-framing';
import { editPresetAspectRatio } from '../lib/ai/prompts/edit';

const S = z.object({
  prompt: z.string().min(1).max(2000),
  model: z.enum(['gemini','gpt','flux']).default('gemini'),
  resolution: z.string().default('1080p'),
  style: z.string().max(100).default('photographic'),
  platform: z.enum(PLATFORM_IDS).default('general'),
  variations: z.union([z.literal(1), z.literal(4)]).default(1),
});
const parsed = S.parse({ prompt: 'x', model: 'gemini', resolution: '1080p', style: 'photographic', variations: 1 });
console.log('harness body -> platform =', parsed.platform, '| aspectRatio =', aspectRatioFor(parsed.platform));
console.log('marketplace_white preset aspect =', editPresetAspectRatio('marketplace_white'));
console.log('noon_white       preset aspect =', editPresetAspectRatio('noon_white'));
