import { sanitizePrompt, PromptBlockedError } from '../lib/ai/prompts/safety';
function twice(s: string, max = 2000) {
  let a: string;
  try { a = sanitizePrompt(s, max); } catch (e) { return `first-throw:${(e as PromptBlockedError).blockedTerm}`; }
  try { sanitizePrompt(a, max); return 'both-pass'; } catch (e) { return `SECOND-THROW:${(e as PromptBlockedError).blockedTerm}`; }
}
// cut lands exactly after "kill" of "killer"
const s = 'a'.repeat(1995) + ' killer';
console.log('cut-to-kill:', twice(s), JSON.stringify(sanitizePrompt(s, 2000).slice(-8)));
const t = 'a'.repeat(1996) + ' gunmetal';
console.log('cut-to-gun :', twice(t), JSON.stringify(sanitizePrompt(t, 2000).slice(-8)));
