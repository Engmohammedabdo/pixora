import { sanitizePrompt, PromptBlockedError } from '../lib/ai/prompts/safety';

// Q: is sanitizePrompt idempotent in the THROW sense? i.e. can a string that
// passed the first call throw on a second call with the same maxLength?
function twice(s: string, max = 2000) {
  let a: string;
  try { a = sanitizePrompt(s, max); } catch (e) { return `first-throw:${(e as PromptBlockedError).blockedTerm}`; }
  try { sanitizePrompt(a, max); return 'both-pass'; } catch (e) { return `SECOND-THROW:${(e as PromptBlockedError).blockedTerm}`; }
}

// 1. ordinary short scenario (what the model actually returns)
console.log('short:', twice('A coffee cup on a marble table, warm morning light'));
// 2. exactly at the cap
console.log('at-cap:', twice('x'.repeat(2000)));
// 3. the ONLY theoretical way a second call differs: truncation splits a word
//    into a blocked stem. Build it deliberately.
const padded = 'a'.repeat(1996) + ' killer deal';
console.log('len', padded.length);
console.log('truncation-split:', twice(padded));
console.log('  first output tail:', JSON.stringify(sanitizePrompt(padded, 2000).slice(-12)));
