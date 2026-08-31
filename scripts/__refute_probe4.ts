import { readFileSync } from 'fs';
import { stripComments } from './lib/strip-comments';
const raw = readFileSync('lib/ai/prompts/campaign-image.ts', 'utf8');
const s = stripComments(raw);
console.log('has export fn (raw):', /export\s+function\s+buildCampaignImagePrompt\b/.test(raw));
console.log('has export fn (stripped):', /export\s+function\s+buildCampaignImagePrompt\b/.test(s));
console.log('has sanitizePrompt( (stripped):', /\bsanitizePrompt\s*\(/.test(s));
console.log('--- stripped tail ---');
console.log(s.split('\n').slice(74,80).join('\n'));
