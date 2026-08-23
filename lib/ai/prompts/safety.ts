/**
 * Prompt safety filters — sanitize user input before sending to AI.
 *
 * ── WHY THIS IS NOT A SUBSTRING SCAN ───────────────────────────────────────
 * It used to be `lower.includes(term)` over a list of short English words, and
 * that rejected ordinary Gulf businesses without ever saying which word:
 *
 *     خاتم amethyst فاخر        -> blocked on "meth"
 *     Bombay Grill مطعم          -> blocked on "bomb"
 *     دورة skill development     -> blocked on "kill"
 *     Shotgun Coffee Roasters    -> blocked on "gun"
 *
 * A safety filter that refuses a jeweller, an Indian restaurant, a training
 * company and a coffee roaster is not conservative, it is broken — and from the
 * customer's side it is a wall with no door, because the response never named
 * the term.
 *
 * ── AND WHY IT IS NOT A WHOLE-WORD REGEX EITHER ────────────────────────────
 * The first attempt at fixing that used `(?<!\p{L})term(?!\p{L})`. Measured, it
 * was barely better for Arabic than doing nothing:
 *
 *     قتل  -> blocked          القتل    -> PASSED
 *     سلاح -> blocked          بالسلاح  -> PASSED
 *
 * Arabic writes its clitics joined to the word. `ال` alone is the single most
 * common prefix in the language, so a strict letter boundary means the filter
 * only fires on a bare, unprefixed, unsuffixed form that real prompts rarely
 * contain. It also let any invisible character split a word: `bo​mb`
 * passed.
 *
 * So matching is done on STEMS. The prompt is normalised, split into words, and
 * each word has its known Arabic prefixes and suffixes peeled off; every
 * candidate stem is then compared for EQUALITY against the blocklist. That is
 * both stricter than the regex (affixed forms are caught) and safer than the
 * substring scan (a stem must match a whole word, so مقتنيات, السلاحف, الدماغ
 * and الذبيحة all pass), and it is a Set lookup rather than ~60 regex tests.
 */

/**
 * ── WHAT IS DELIBERATELY *NOT* HERE ────────────────────────────────────────
 * This is a first-line filter in front of providers that run their own safety
 * models. A false positive costs a paying customer their generation; a false
 * negative is still caught downstream. So terms whose ordinary business meaning
 * dominates are left out on purpose, because whole-word matching does not save
 * them — every one of these was blocked and should not have been:
 *
 *   blood    blood orange juice · blood donation drive
 *   drugs    over-the-counter drugs, a pharmacy
 *   knife    a premium chef knife set
 *   suicide  a suicide prevention hotline campaign
 *   gore     Gore-Tex
 *   hatred   anti-hate-speech awareness campaigns
 *   ذبح      ذبح حلال — halal slaughter, an everyday category in this market
 *   دماء     حملة التبرع بالدماء — a blood donation drive
 *   جنسي     جنسية = nationality; "خدمات الجنسية والإقامة" is a top Gulf SMB category
 *   بندقيه   البندقية = Venice
 *   حشيش     also simply "grass"
 *   شبو      شبوة, a Yemeni governorate
 *   عاري     جدار عاري = a bare wall
 *   عريان    a common surname (العريان)
 */
const BLOCKED_TERMS_LATIN = [
  // NSFW
  'nude', 'naked', 'explicit', 'sexual', 'porn', 'xxx', 'nsfw',
  'erotic', 'hentai', 'fetish', 'stripper',
  // Violence
  'violent', 'murder', 'kill', 'weapon', 'gun', 'terrorist', 'bomb',
  // Drugs
  'cocaine', 'heroin', 'meth',
  // Hate
  'racist', 'nazi',
];

/**
 * Arabic terms, written in the normalised form produced by `normalize()`.
 * Affixed forms do not need listing — القتل and بالسلاح reduce to قتل and سلاح.
 */
const BLOCKED_TERMS_ARABIC = [
  // NSFW
  'اباحي', 'اباحيه', 'خلاعه', 'دعاره',
  // Violence
  'قتل', 'اقتل', 'يقتل', 'مقتل', 'جثه', 'جثث', 'تعذيب',
  'سلاح', 'اسلحه', 'مسدس', 'قنبله', 'قنابل', 'متفجرات',
  'ارهابي', 'ارهاب', 'انتحار',
  // Drugs
  'مخدرات', 'كوكايين', 'هيروين',
  // Hate
  'عنصري', 'عنصريه', 'نازي',
];

const BLOCKED = new Map<string, string>();
for (const t of [...BLOCKED_TERMS_LATIN, ...BLOCKED_TERMS_ARABIC]) {
  BLOCKED.set(t, t);
}

/**
 * Arabic clitics that attach directly to a word. Longest first, so `وال` is
 * peeled before `و`.
 */
const AR_PREFIXES = ['وبال', 'فبال', 'وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];
const AR_SUFFIXES = ['هما', 'هم', 'هن', 'كم', 'كن', 'ها', 'نا', 'ات', 'ين', 'ون', 'ان', 'ه', 'ك', 'ي'];

/**
 * Minimum stem length after peeling.
 *
 * Prefixes may peel to 3 (القتل -> قتل must still be caught), but suffixes need
 * 4: peeling a single letter off a four-letter word turns ordinary vocabulary
 * into blocklist entries — شبوة (a Yemeni governorate) became شبو, and البندقية
 * (Venice) became بندقيه.
 */
const MIN_PREFIX_STEM = 3;
const MIN_SUFFIX_STEM = 4;

export class PromptBlockedError extends Error {
  public readonly blockedTerm: string;

  constructor(term: string) {
    super(`PROMPT_BLOCKED: contains "${term}"`);
    this.name = 'PromptBlockedError';
    this.blockedTerm = term;
  }
}

/**
 * Collapse the spellings that vary in ordinary typing so the blocklist does not
 * have to enumerate them, and remove characters that exist only to break a word
 * up: zero-width joiners, the BOM, and the soft hyphen all let `bo<zwsp>mb`
 * slip past any matcher that trusts the raw string.
 *
 * Latin text is unaffected except for the invisible-character strip.
 */
function normalize(text: string): string {
  return text
    .replace(/[​-‏⁠﻿­]/g, '') // zero-width + soft hyphen
    .replace(/[ً-ْٰ]/g, '')             // harakat + dagger alef
    .replace(/ـ/g, '')                            // tatweel
    .replace(/[آأإٱ]/g, 'ا')  // آ أ إ ٱ -> ا
    .replace(/[ؤئ]/g, 'ء')              // ؤ ئ -> ء
    .replace(/ى/g, 'ي')                      // ى -> ي
    .replace(/ة/g, 'ه')                      // ة -> ه
    .toLowerCase();
}

/**
 * Every form of `word` worth testing: itself, minus one prefix, minus one
 * suffix, and minus both. Deliberately at most one affix from each end —
 * peeling greedily would erode ordinary words down to a blocked stem.
 */
function stems(word: string): string[] {
  const out = [word];

  const withoutPrefix: string[] = [];
  for (const p of AR_PREFIXES) {
    if (word.startsWith(p) && word.length - p.length >= MIN_PREFIX_STEM) {
      withoutPrefix.push(word.slice(p.length));
      break; // longest match only
    }
  }
  out.push(...withoutPrefix);

  for (const base of [word, ...withoutPrefix]) {
    for (const s of AR_SUFFIXES) {
      if (base.endsWith(s) && base.length - s.length >= MIN_SUFFIX_STEM) {
        out.push(base.slice(0, base.length - s.length));
        break; // longest match only
      }
    }
  }

  return out;
}

/**
 * Sanitize a user prompt. Throws PromptBlockedError if blocked content found.
 * Returns trimmed, length-limited prompt.
 *
 * The error carries the term that matched so the caller can tell the user which
 * word to change — every studio route already echoes it back as `term`.
 */
export function sanitizePrompt(prompt: string, maxLength: number = 2000): string {
  // Split on anything that is not a LETTER. Including digits in a word — as an
  // earlier version did — meant `bomb1` and `قتل1` were single unknown words
  // and matched nothing, which defeated the filter completely for the price of
  // one keystroke.
  const words = normalize(prompt).split(/\P{L}+/u).filter(Boolean);

  for (const word of words) {
    for (const stem of stems(word)) {
      const hit = BLOCKED.get(stem);
      if (hit) throw new PromptBlockedError(hit);
    }
  }

  return prompt.trim().slice(0, maxLength);
}
