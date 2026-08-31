/**
 * The text-containment rule for the TEXT-TO-IMAGE studios.
 *
 * ── THIS WORDING IS NOT NEW, AND IT WAS PROVED HERE FIRST ──────────────────
 * `lib/ai/prompts/edit.ts:602-631` records the exact form that held on
 * production 2026-08-25, and records — in its own words — that it came from
 * "a GENERATE prompt, where the frame starts empty". That generate path is
 * `creator`. The rule was then adapted for `edit`, where the shared
 * "every other surface must be COMPLETELY BLANK" line had to become a
 * prohibition on ADDING, because in an edit that instruction erases text the
 * customer photographed on purpose.
 *
 * So the wording proved on creator was carried into edit, hardened there over
 * three more production runs, and creator itself was never given it. It has had
 * one line this whole time (`creator.ts:95`):
 *
 *     - NO extra text, logos, or watermarks unless specified
 *
 * ── WHAT THAT ONE LINE ACTUALLY DOES, MEASURED 2026-08-31 ──────────────────
 * `creator_ar_signage` asked for a Dubai shawarma shopfront whose sign reads
 * شاورما الشام. The requested text came back perfect — correctly joined,
 * right-to-left, clean neon. And the model invented garbled pseudo-Arabic and
 * fake Latin across every OTHER surface in the frame: the menu board, and an
 * entire street of background shop signs ("BAWJIN", "SHAAM", nonsense phone
 * numbers). Artifacts:
 * `.superpowers/live-runs/2026-08-31T09-35-51-970Z/creator-creator_ar_signage.png`.
 *
 * Fidelity was never the problem. CONTAINMENT is, and an `avoid`-style bullet
 * does not provide it. `edit.ts:617-621` names the three ingredients that do,
 * and all three are preserved below:
 *
 *   1. an OVERRIDE CLAIM — "this overrides everything else in this prompt"
 *   2. a COUNT plus a NAMED SURFACE — "EXACTLY ONCE, on …"
 *   3. an ENUMERATION of the surfaces where invented text actually lands
 *
 * Ingredient 3 is the one the signage run makes concrete: the invented text
 * landed on a menu board and on neighbouring shopfronts, which is exactly what
 * the enumeration names.
 *
 * ── ONE PLACE, TWO CALLERS ─────────────────────────────────────────────────
 * `creator` and the campaign image path are both text-to-image and both need
 * this. Nine copies of one preamble diverging one route at a time is the drift
 * this repo has already paid for once (CLAUDE.md, "Nine-studio hardening"), so
 * there is one copy and `test:prompts` pins its wording.
 */
import { sanitizePrompt } from './safety';

/** The surfaces invented text lands on. Named rather than left to "anywhere
 *  else", because `creator_ar_signage` put it on precisely these and a model
 *  reading a generic prohibition put it there anyway. */
const SURFACES =
  'menu boards, signage, shopfronts, windows, price cards, packaging, labels, ' +
  'posters, banners, vehicles, screens, clothing and any surface in the background';

/**
 * The strong form: the frame is to contain no text at all.
 *
 * A CONCRETE claim, and the right one for the majority of requests. `edit.ts`'s
 * `buildDiacriticsRule` exists because of the same distinction — a rule phrased
 * as a relation asks the model to inspect the input and infer something, while
 * a flat statement of fact is checkable in one step.
 *
 * Used by the campaign image path, whose captions are delivered as text beside
 * the image and never inside it.
 */
export function noTextRule(): string {
  return (
    `\n\nTEXT RULE — this overrides everything else in this prompt:` +
    `\n- There is NO text anywhere in this image. Not one word, letter, number, logo, monogram or decorative script.` +
    // SURFACES is interpolated VERBATIM here and in containedTextRule below.
    // An earlier version capitalised it for prose, which made the two modes
    // carry textually different enumerations of the same list — so a `test:prompts`
    // check that the enumeration reaches both had to be written twice and
    // matched loosely. One string, one form, asserted literally.
    `\n- Every surface is COMPLETELY BLANK — ${SURFACES} — plain, unmarked, and carrying no lettering of any kind.` +
    `\n- Do not invent shop names, brand marks, prices, phone numbers or menu items to fill them.` +
    `\n- A surface that would normally carry text in real life is rendered blank here.`
  );
}

/**
 * The conditional form: whatever text the subject description asks for, once,
 * where it asks — and nothing anywhere else.
 *
 * ── WHY THIS IS A RELATION, AND WHAT THAT COSTS ────────────────────────────
 * `edit` can state the concrete version — `The only NEW text anywhere in the
 * entire image is: "شاورما الشام"` — because it has an `editDescription` field
 * holding exactly that string. `creator` has no such field: the request is one
 * free-form Arabic sentence and the words to render, if any, are inside it.
 *
 * So clause 1 below is phrased against "the subject description above", which
 * `edit.ts:637-651` explicitly records as the WEAKER form. That is accepted
 * deliberately rather than papered over, and it is the first thing to
 * re-measure: `creator_ar_signage` is in the live harness and re-running it
 * costs 2 credits. If the relation does not hold, the upgrade is an optional
 * `imageText` field on creator, which turns clause 1 back into edit's concrete
 * claim. That field is not built on speculation — this whole round exists
 * because a premise was built on before it was tested.
 *
 * Clauses 2 and 3 do NOT depend on the relation. They are flat prohibitions,
 * and they are the half that addresses the measured defect: the street of
 * invented signage appeared on surfaces the customer never mentioned at all.
 *
 * ── WHY THE BLANK CLAUSE IS AN EXCLUSION AND NOT A NOUN LIST ───────────────
 * The first version of this function stated containment the way `noTextRule`
 * does — "Every other surface in the frame is COMPLETELY BLANK: menu boards,
 * signage, shopfronts, …" — and it was WRONG here for a reason `edit.ts`
 * already paid to learn. Printing the assembled prompt for the measured
 * signage request showed it plainly:
 *
 *     SUBJECT: … عليها لافتة مضيئة مكتوب عليها شاورما الشام   (a lit SIGN)
 *     - place them ONCE on the single surface it names          -> the sign
 *     - Every other surface is COMPLETELY BLANK: … signage, shopfronts …
 *
 * The customer's target surface was IN the blank list. The model was told to
 * print on the sign and to leave signage blank, in the same block. That is
 * byte-for-byte the contradiction `edit.ts:679-700` records making
 * `product_label` a NO-OP: the customer paid a credit and got their photograph
 * back, at HTTP 200, because doing nothing was the only move that violated no
 * rule.
 *
 * `edit.ts`'s own conclusion is quoted there: "Stated as an EXCLUSION of the
 * target instead of a fixed list of nouns. A fixed list cannot know what the
 * preset aimed at, which is precisely how it came to name it."
 *
 * So the rule now leads with the exclusion — nothing but the surface the
 * SUBJECT named — and the nouns follow as examples of what "everything else"
 * covers. The target is excluded by construction rather than by hoping it is
 * absent from a list. `noTextRule` keeps the absolute list, correctly: there is
 * no target there for the list to collide with.
 */
export function containedTextRule(): string {
  return (
    `\n\nTEXT RULE — this overrides everything else in this prompt:` +
    `\n- If the SUBJECT above names specific words to appear in the picture, render exactly those words, exactly as written, ONCE, on the one surface the SUBJECT names — even if that surface is a sign, a label or a package.` +
    `\n- If the SUBJECT names no words, the image contains NO text anywhere at all.` +
    `\n- No text appears on ANY surface other than the one the SUBJECT named. Every other surface is COMPLETELY BLANK — ${SURFACES} — with no lettering, numbers, logos or decorative script on any of them.` +
    `\n- Do not invent shop names, brand marks, prices, phone numbers, menu items or street signage to fill the background. A surface that would normally carry text in real life is rendered blank here.` +
    `\n- Never transliterate, translate or re-spell the words you were given, and never repeat them on a second surface.`
  );
}

/**
 * The form for a request that CARRIES A REFERENCE PHOTOGRAPH.
 *
 * ── WHY THIS MODE EXISTS: A BLOCKER THIS ROUND INTRODUCED ──────────────────
 * `creator` emitted `containedTextRule()` unconditionally, including on its
 * reference-image path. Printed from the real builder, that path read:
 *
 *     MUST
 *     - Preserve its shape, proportions, colours, materials and any printed text exactly
 *     TEXT RULE — this overrides everything else in this prompt:
 *     - If the SUBJECT names no words, the image contains NO text anywhere at all.
 *     - … Every other surface is COMPLETELY BLANK — … packaging, labels, …
 *
 * A customer uploads a photo of their own labelled product and asks only for a
 * new setting. The prompt tells the model to preserve the label AND to blank
 * every label — and the TEXT RULE declares itself the winner. Both outcomes are
 * paid failures at HTTP 200: the model wipes the customer's own packaging, or
 * it declines and hands back the source essentially unchanged.
 *
 * This module's own header already said why: the "COMPLETELY BLANK" line is
 * correct for a frame that starts EMPTY and means "erase the customer's
 * photograph" when one is attached. `edit.ts:658-676` records that exact
 * instruction measured erasing a real background menu board in one preset out
 * of three, by luck of interpretation. creator's reference path IS an edit by
 * construction, and it was given the generate-path rule.
 *
 * So the prohibition is on ADDING, never on blankness, and existing print gets
 * its own surviving clause — `edit.ts`'s two-part fix, ported rather than
 * re-derived.
 */
export function preserveTextRule(): string {
  return (
    `\n\nTEXT RULE — this overrides everything else in this prompt:` +
    `\n- Text already printed in the attached photograph stays exactly as photographed — same characters, same script, same position. Reproduce it; never redraw, translate, move or remove it.` +
    `\n- If the SUBJECT above names specific words to appear in the picture, render exactly those words, exactly as written, ONCE, on the one surface the SUBJECT names.` +
    // "ADD NOTHING", not "BE BLANK" — the distinction edit.ts:658-676 paid for.
    `\n- Do not introduce text onto any surface that does not already carry it. Packaging, labels, menu boards, windows, price cards, neighbouring products and background signage all keep exactly what the photograph shows — nothing added, nothing invented, nothing removed.` +
    `\n- Never transliterate, translate or re-spell any text in the image, and never repeat it on a second surface.`
  );
}

/**
 * Arabic combining marks — the same class `edit.ts:635` guards, restated here
 * because a text-to-image caller has the same failure and no reference image to
 * fall back on.
 *
 * On production 2026-08-27 the model was given `شاورما الشام`, which carries no
 * harakat, and printed `شَاوُرمَا الشَّام` — four invented marks, visible only at
 * zoom. Every measured check passed.
 */
const ARABIC_HARAKAT = /[ً-ْٰۖ-ۭ]/;
/** Arabic letters proper, so the rule is emitted only when there is Arabic to
 *  be wrong about. A Latin-only request does not need a harakat instruction and
 *  spending the model's attention on one is not free. */
const ARABIC_LETTERS = /[ؠ-يٱ-ۓ]/;

/**
 * Emitted only when the request actually contains Arabic.
 *
 * Stated on the CUSTOMER'S OWN TEXT rather than in general, for the reason
 * `edit.ts:643-651` gives: a customer who supplies vowelled text gets the
 * opposite instruction and keeps their marks, instead of a blanket rule that
 * would strip them.
 *
 * Note this reads the whole request, not an isolated string, because in creator
 * the words to render are not separable from the sentence asking for them. That
 * makes it a weaker signal than edit's — a description that mentions harakat
 * anywhere flips the branch — and it is the same limitation as
 * `containedTextRule`, with the same fix.
 */
export function arabicScriptRule(requestText: string): string {
  if (!ARABIC_LETTERS.test(requestText)) return '';
  const header = `\n- Any Arabic you render must be correctly joined, shaped in its contextual forms, and read right to left. Never render Arabic as disconnected letter shapes or as Latin transliteration.`;
  return ARABIC_HARAKAT.test(requestText)
    ? `${header}\n- The requested Arabic carries harakat exactly where shown. Reproduce those and add no others.`
    : `${header}\n- The requested Arabic carries NO harakat. Do not add fatha, damma, kasra, shadda, sukun or any other diacritic — set the letters bare, exactly as given.`;
}

/**
 * The whole block, in the order the model should read it.
 *
 * `mode` is the caller's declaration of whether text is possible at all, not a
 * guess made here. Deciding it inside this module would mean inspecting the
 * customer's prose for intent, which is a classifier nobody has measured.
 *
 * `requestText` is filtered before use even though every caller filters its own
 * input: this function only ever reads it to CHOOSE A BRANCH, but a future
 * caller passing something unfiltered is exactly how an unfiltered value
 * reaches a prompt, and `prompt-builder-sanitized` requires the `safe*`
 * identifier here regardless.
 */
export function buildImageTextRule(
  mode: 'none' | 'contained' | 'preserve',
  requestText: string
): string {
  // The Arabic shaping rule is emitted ONLY where text may actually be
  // rendered, and that is not a tidiness choice. Under `none` the block has
  // already said "there is NO text anywhere in this image"; appending "any
  // Arabic you render must be correctly joined" tells the model there is Arabic
  // to render after all. That is a self-contradiction inside one block, which is
  // the exact failure `edit.ts` documents at :679-700 — `product_label` came
  // back a NO-OP because its rules could not all be satisfied, and doing nothing
  // was the only move that violated none of them.
  if (mode === 'none') return noTextRule();
  const safeRequestText = sanitizePrompt(requestText, 2000);
  // `preserve` DOES get it: a reference photograph can carry Arabic the model
  // must reproduce, and the harakat clause is what stops it decorating the
  // customer's own label with marks that were never on it (measured 2026-08-27).
  const body = mode === 'preserve' ? preserveTextRule() : containedTextRule();
  return body + arabicScriptRule(safeRequestText);
}
