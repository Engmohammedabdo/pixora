import type { CheckResult } from './checks';

/**
 * The measurements the seven non-image studios are judged by.
 *
 * Same rule as checks.ts: every function here answers a question with a NUMBER.
 * "The plan looks reasonable" is not a check; "the calendar has 4 entries and the
 * customer asked for 30 days, which the prompt turns into 4 weeks" is.
 *
 * ── THE TRAP THESE FILES KEEP FALLING INTO ────────────────────────────────
 * A check that contradicts the thing it checks is worse than no check —
 * checks.ts records the sweep flagging a perfect image because it sampled the
 * contact shadow the preset explicitly asks for. The language check below is the
 * same shape of hazard, and is why the expected language is declared PER FIELD
 * by the case rather than per studio here:
 *
 *   - storyboard asks for `dialogue` in the customer's language and states
 *     `visual_description` must be English for image generation
 *     (lib/ai/prompts/storyboard.ts:68). A blanket "an Arabic storyboard must be
 *     Arabic" would fail every correct Arabic storyboard ever produced.
 *   - campaign asks for `caption`/`tov` in the dialect and `scenario`/`theme`
 *     in English, because `scenario` is fed straight to an image model
 *     (lib/ai/prompts/campaign.ts:67-68).
 *   - prompt-builder asks for `prompt` in English and `tip` in Arabic, in the
 *     same object (lib/ai/prompts/prompt-builder.ts:62).
 *
 * So no function here decides what language a field "should" be in. The case
 * says, and the case cites the prompt line it read it from.
 */

/** Arabic letters, excluding Arabic-Indic digits, against Latin letters.
 *  Anything else — Western digits, emoji, hashes — counts for neither, because
 *  a caption of "50% #sale" says nothing about language. */
export interface ScriptMix {
  arabic: number;
  latin: number;
  /** arabic / (arabic + latin), or null when the text carries no letters at all. */
  arabicShare: number | null;
}

export function scriptMix(text: string): ScriptMix {
  let arabic = 0;
  let latin = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x0660 && c <= 0x0669) continue; // Arabic-Indic digits
    if (c >= 0x06f0 && c <= 0x06f9) continue; // Extended Arabic-Indic digits
    if ((c >= 0x0620 && c <= 0x064a) || (c >= 0x0671 && c <= 0x06d3)) arabic++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++;
  }
  const total = arabic + latin;
  return { arabic, latin, arabicShare: total > 0 ? arabic / total : null };
}

/**
 * Is this text in the language the prompt asked this FIELD for?
 *
 * Stated as dominance rather than purity, deliberately. An Arabic marketing plan
 * legitimately names "Instagram", "TikTok" and "KPI" in Latin script, and an
 * English one legitimately quotes an Arabic brand name — demanding a pure script
 * would flag correct deliverables in both directions. Dominance catches the
 * defect that actually shipped: every plan, analysis and storyboard generated in
 * Arabic regardless of locale until 2026-08-24, where the share is not near 0.5,
 * it is near 1.
 *
 * Zero letters is reported as unmeasured, never as a failure.
 */
export function languageCheck(name: string, text: string, expect: 'ar' | 'en'): CheckResult {
  const mix = scriptMix(text);
  if (mix.arabicShare === null) {
    return { name, ok: true, detail: 'no letters to measure — UNMEASURED, not a verdict' };
  }
  const pct = (mix.arabicShare * 100).toFixed(1);
  const ok = expect === 'ar' ? mix.arabicShare > 0.5 : mix.arabicShare < 0.5;
  return {
    name,
    ok,
    detail: `${pct}% of ${mix.arabic + mix.latin} letters are Arabic (asked for ${expect === 'ar' ? 'Arabic' : 'English'}; dominance decides)`,
  };
}

/** Does a value put anything on screen? Numbers are excluded on purpose, the
 *  same rule lib/ai/studio-output-schemas.ts states: a week index is not a
 *  deliverable. */
export function hasText(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasText);
  return false;
}

/**
 * A section the PAGE renders, asserted to carry something.
 *
 * `entries` is what the customer would see listed; `fields` names the values
 * inside one entry that are printed. Both matter: the studios' own parsers
 * catch-default every leaf, so a non-empty array proves nothing —
 * `{"objectives":[{},{}]}` parses into two entries of empty strings, and that
 * exact shape was once sold as a finished plan.
 */
export function sectionCheck(
  name: string,
  entries: unknown[] | undefined,
  fields: (entry: Record<string, unknown>) => unknown[],
): CheckResult {
  const list = Array.isArray(entries) ? entries : [];
  const filled = list.filter((e) => hasText(fields((e ?? {}) as Record<string, unknown>))).length;
  return {
    name,
    ok: filled > 0,
    detail: `${filled} of ${list.length} entries carry printable text`,
  };
}

/** Every entry must carry the named field, not merely some of them. Used where
 *  a blank one is a visible hole — a KPI card with no headline number, a scene
 *  with no dialogue. */
export function everyEntryHas(
  name: string,
  entries: unknown[] | undefined,
  field: string,
): CheckResult {
  const list = Array.isArray(entries) ? entries : [];
  const filled = list.filter((e) => hasText((e as Record<string, unknown>)?.[field])).length;
  return {
    name,
    ok: list.length > 0 && filled === list.length,
    detail: `${filled} of ${list.length} entries have a non-empty ${field}`,
  };
}

/** An exact count the deliverable is SOLD as — 9 scenes for 14 credits, 9 posts
 *  for 12, 3 prompts. Stated as a minimum, because over-delivery is not a defect
 *  and flagging it is noise. */
export function countCheck(name: string, actual: number, atLeast: number): CheckResult {
  return { name, ok: actual >= atLeast, detail: `${actual} delivered, ${atLeast} sold` };
}

/**
 * lib/ai/mock-from-schema.ts marks every synthesised leaf with a `[mock]` prefix
 * so a mock "can never be mistaken for real output in a log, a screenshot or a
 * database row someone is reading later". A live sweep that finds one has proved
 * nothing about the model, and the customer paid for filler — so it is checked
 * on the BYTES of the deliverable, independently of whatever `data.mock` says.
 * Two signals, because the flag is set by the same code path that would be wrong.
 */
export function noMockMarker(name: string, deliverable: unknown): CheckResult {
  const text = JSON.stringify(deliverable ?? null);
  const hits = (text.match(/\[mock\]/g) ?? []).length;
  return { name, ok: hits === 0, detail: hits === 0 ? 'no [mock] leaf in the deliverable' : `${hits} [mock] leaves` };
}

/** `data.mock !== true`, said once so all seven studios report it identically. */
export function realModelCheck(mock: unknown): CheckResult {
  return { name: 'a real model served it', ok: mock !== true, detail: `mock=${String(mock)}` };
}

/**
 * The charge never exceeds what the plan printed before the run started.
 *
 * `<=` rather than `===` on purpose: campaign and photoshoot legitimately refund
 * part of the reservation when the model under-delivers, so equality would flag
 * a route behaving correctly. The direction that matters for a tool that spends
 * the owner's money is the other one — a case that bills more than it declared.
 */
export function declaredCostCheck(declared: number, charged: unknown): CheckResult {
  if (typeof charged !== 'number') {
    return {
      name: 'charged no more than the declared cost',
      ok: true,
      detail: `route reported no figure; declared ${declared} — UNMEASURED`,
    };
  }
  return {
    name: 'charged no more than the declared cost',
    ok: charged <= declared,
    detail: `charged ${charged}, declared ${declared}`,
  };
}

/** Joins the fields a language check should read, so one weak field cannot swing
 *  the verdict for a whole deliverable. */
export function joinText(values: unknown[]): string {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
  };
  values.forEach(walk);
  return out.join(' ');
}
