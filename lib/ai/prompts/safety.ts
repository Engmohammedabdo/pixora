/**
 * Prompt safety filters — sanitize user input before sending to AI.
 * Blocks NSFW, violence, and competitor brand references.
 */

const BLOCKED_TERMS = [
  // NSFW
  'nude', 'naked', 'explicit', 'sexual', 'porn', 'xxx', 'nsfw',
  'erotic', 'hentai', 'fetish', 'stripper',
  // Violence
  'blood', 'gore', 'violent', 'murder', 'kill', 'weapon', 'gun',
  'knife', 'terrorist', 'bomb', 'suicide',
  // Drugs
  'cocaine', 'heroin', 'meth', 'drugs',
  // Hate
  'racist', 'nazi', 'hatred',
];

export class PromptBlockedError extends Error {
  public readonly blockedTerm: string;

  constructor(term: string) {
    super(`PROMPT_BLOCKED: contains "${term}"`);
    this.name = 'PromptBlockedError';
    this.blockedTerm = term;
  }
}

/**
 * Sanitize a user prompt. Throws PromptBlockedError if blocked content found.
 * Returns trimmed, length-limited prompt.
 */
export function sanitizePrompt(prompt: string, maxLength: number = 2000): string {
  const lower = prompt.toLowerCase();

  const blocked = BLOCKED_TERMS.find((term) => lower.includes(term));
  if (blocked) {
    throw new PromptBlockedError(blocked);
  }

  return prompt.trim().slice(0, maxLength);
}
