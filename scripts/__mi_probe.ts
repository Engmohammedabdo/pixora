import { buildCreatorPrompt } from '../lib/ai/prompts/creator';
import { buildImageTextRule, arabicScriptRule } from '../lib/ai/prompts/image-text-rule';

const raw = 'عايز صورة لساندوتش شاورما تجيب جوع لمطعمي في دبي';
const p = buildCreatorPrompt({ userPrompt: raw, style: 'photographic', platform: 'instagram' });
console.log('=== FULL PROMPT (creator_ar_raw) ===');
console.log(p);
console.log('=== END ===');
console.log('arabicScriptRule fired:', arabicScriptRule(raw) !== '');
console.log('contains "If the SUBJECT names no words":', p.includes('If the SUBJECT names no words'));
console.log('contains "Any Arabic you render":', p.includes('Any Arabic you render'));
console.log('contains "the words you were given":', p.includes('the words you were given'));
console.log('LEN:', p.length);
