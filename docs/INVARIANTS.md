# Invariants

Automated checks for correctness/quality rules established during remediation
work, so a regression fails a command instead of silently shipping. Run them
with:

```bash
npm run check:invariants
# or, for fast iteration on one rule:
npx tsx scripts/check-invariants.ts --only=contrast-tokens
npx tsx scripts/check-invariants.ts --skip=no-arabic-literals-in-tsx
```

The script exits `0` if every invariant passes, `1` if any fails. Output is
colour/emoji-free and greppable (`file:line: text` per violation) so it works
the same in a terminal or a CI log. Implementation: `scripts/check-invariants.ts`.

Each rule below was verified BY HAND at least once during a remediation
session. That manual verification does not survive the next contributor —
this file (and the script) is what replaces it.

---

## msg-parity

**Rule:** `messages/ar.json` and `messages/en.json` must have identical
flattened key sets (objects recursed into; arrays counted as one leaf, e.g.
`landing.pricing.features.free` is a single translatable unit, not N keys).

**Why:** next-intl looks up a key in the *active* locale's file only. A key
present in one locale and missing in the other renders the raw dotted key (or
throws) for every user of that locale — and it looks completely fine in the
other locale, so nothing in manual QA catches it unless someone happens to
switch languages on that exact screen.

**Status at time of writing:** 774/774 keys match.

---

## msg-no-empty

**Rule:** no string value anywhere in either messages file — including
individual array elements — may be empty or whitespace-only.

**Why:** an empty placeholder string ships silently: it's valid JSON, it
diffs cleanly, and it only becomes visible as a blank button label or empty
toast when a real user's flow hits that exact string.

---

## refund-captured

**Rule:** every `await refundCredits(...)` call inside
`app/api/studios/*/route.ts` must be assigned to a variable
(`const result = await refundCredits(...)`), never called bare.

**Why:** `refundCredits()` returns a result the caller is required to check —
it reports whether the refund actually succeeded. A discarded, bare call
throws that signal away: if the underlying RPC fails, the user keeps the
credit deduction and never gets it back, with nothing in the response or logs
pointing at it. This was the subject of the last two remediation commits
(`fix(credits): surface refund failures to users in 4 studio routes` and the
handoff doc that finished the remaining ones) — this check is what stops it
from quietly regressing in route #19.

**How it's checked:** finds every `await refundCredits(` and walks backward
to the previous statement boundary (`;`, `{`, `}`) looking for an assignment
operator, so it correctly ignores an unrelated `=` from a prior statement.

---

## no-hardcoded-date-locale

**Rule:** no `.toLocaleDateString(...)`, `.toLocaleString(...)`, or
`.toLocaleTimeString(...)` call with a literal `'ar...'` or `'en...'` locale
string, in `app/` or `components/`, excluding `app/admin/` and
`components/admin/` (deliberately English-only admin surfaces).

**Why:** `new Date().toLocaleDateString('ar-SA')` renders Arabic-Indic digits
(٢٠٢٦-٠٧-٢١) regardless of which locale the page is actually showing — the
literal locale always wins. It shipped once as a copy-pasted formatter.
`next-intl`'s `useFormatter()` resolves the *active* locale instead, so a
call with no locale argument at all (`value.toLocaleString()`) is fine and
not flagged — the bug is specifically a frozen, literal locale string.

---

## no-raw-zindex

**Rule:** no `z-<number>` or `z-[...]` Tailwind class in `app/` or
`components/`, excluding admin. Only the named scale from
`tailwind.config.ts` (`z-header` / `z-nav` / `z-scrim` / `z-drawer` /
`z-modal` / `z-popover`) is allowed.

**Why:** Radix portals dialogs, dropdowns and tooltips to `document.body`, so
their paint order is decided purely by z-index value, not DOM nesting order.
An ad-hoc `z-50` picked because "it needed to be on top" collided with the
bottom nav's z-index and painted above a modal scrim. The named scale is the
single place stacking order is decided; named tokens (`z-header`, etc.) never
match a numeric or bracket pattern, so they pass through this check
untouched without needing an explicit allowlist.

**Status at time of writing:** 0 violations outside `admin/`.

---

## theme-aware-text-color

**Rule:** no `text-primary-500` / `text-primary-600` on an element that
renders *text* (as opposed to tinting an icon), in `app/` or `components/`,
excluding admin.

**Why:** both are fixed Tailwind hexes that do not flip with `.dark` —
`text-primary-600` measured 2.33:1 against dark surface, an AA failure.
`--color-brand` (see `app/globals.css`) is the CSS-variable token that *is*
solved for both themes and should be used instead for any text a user reads.
Icons tinted via `currentColor` are a different concern (glyph fill, not
text contrast) and are intentionally left on the raw Tailwind scale.

**Heuristic — read before deciding this rule is wrong about something:**
"Renders text" isn't decidable by regex without a real JSX/DOM parser (a
`<span>` might hold a text node, an icon, or nothing). For every literal
`text-primary-500`/`600` match, the checker finds the enclosing JSX opening
tag ("Zone A") and, if the tag isn't self-closing, its actual children up to
its own matching closing tag ("Zone B"). The match is **exempt** (not a
violation) if any of:

1. Zone A contains `<svg`, or the substring `icon` case-insensitively — this
   covers an icon-named tag itself (`<Icon>`, `<persona.icon>`,
   `<currentStep.icon>`) and self-describing attributes on an icon-only
   button (`size="icon"`). A loose substring match is safe here because Zone
   A is *only* this element's own opening tag, not any surrounding code.
2. Zone A's tag name is exactly `input` — a native `<input>` never renders a
   text child; colouring it themes the checkbox/radio mark, not readable
   text.
3. Zone A's tag name is itself imported from `'lucide-react'` in that file
   (parsed from the file's own `import { X, Y } from 'lucide-react'`,
   not a hardcoded list of every lucide icon).
4. Zone B contains `<svg`, or an actual **child JSX tag** (`<Name`, not a
   bare identifier) whose name matches `icon` or a lucide import.

Zone B deliberately requires an actual tag, not a loose substring match,
because a loose match produces a real false negative:
`components/layout/Sidebar.tsx` renders `{item.icon}` as a *sibling* of the
nav label inside the same `<Link>`; a bare `icon` substring search over Zone
B would wrongly exempt the `<Link>`'s own hardcoded `text-primary-600` on
the label text. Requiring a JSX tag match closes that hole.

This was cross-checked by hand against every match found in the repo (icon
buttons, checkboxes, decorative bullets, nav links, pricing badges) and the
classification matched manual judgment every time, so its output is reported
as normal violations, not downgraded to warnings.

**Status at time of writing:** 6 genuine violations (decorative bullet
glyphs and a blinking cursor character colored with a non-flipping hex, plus
three real text elements — a pricing-badge paragraph, an active nav-link
label, and a prompt-suggestion button — using `text-primary-600` instead of
`--color-brand`). See the script's own output for exact file:line.

---

## rtl-logical-properties

**Rule:** no `pl-`, `pr-`, `ml-`, `mr-`, `text-left`, `text-right`,
`border-l-`, `border-r-`, `rounded-l-`, `rounded-r-` in `app/` or
`components/`, excluding admin.

**Why:** PyraSuite is Arabic-first and RTL by default. Physical-direction
utilities don't mirror when the page flips to RTL — `pl-4` stays on the left
even once "left" is the trailing edge, not the leading one. The logical
equivalents (`ps-`/`pe-`/`ms-`/`me-`/`text-start`/`text-end`/`rounded-s-`/
`rounded-e-`) flip automatically with `dir`.

**Exemptions, and why they're correct, not loopholes:**

- A class whose own variant chain includes `rtl:` or `ltr:` (e.g.
  `rtl:placeholder-shown:text-right` in the login/signup email and phone
  inputs) is direction-*conditional* by construction — it's a hand-rolled
  mirror, applied only when the page actually is RTL, which is the opposite
  of the bug this rule exists to catch. The checker recovers the *whole*
  class token (walking back to the previous whitespace/quote) before
  deciding this, so it's judging the complete variant chain, not just the
  trailing utility name.
- `components/ui/dialog.tsx`'s `left-[50%] translate-x-[-50%]` is symmetric
  centering, not a direction bug, and needs no special-casing: neither
  `left-[50%]` nor `translate-x-[-50%]` matches any of the eight patterns
  above (none of them are `left-` or `translate-x-`), so it was never a risk
  of a false positive in the first place.

**Status at time of writing:** 0 violations outside `admin/`.

---

## mobile-16px-inputs

**Rule:** no `<input`, `<textarea`, `<select` element carrying a *bare*
(unprefixed) `text-sm` or `text-xs` class, in `app/` or `components/`,
excluding admin.

**Why:** iOS Safari auto-zooms the viewport when a focused form field
computes to under 16px font-size. A bare `text-sm`/`text-xs` on a form field
*is* its mobile font-size (mobile-first, no breakpoint override), so it
always triggers the zoom. The fix pattern is mobile-first
`text-base sm:text-sm` — 16px by default, shrunk only at `sm:`+ where iOS
zoom no longer applies — and that pattern never produces a *bare*
`text-sm`/`text-xs` token, only a breakpoint-prefixed one (`sm:text-sm`,
`dark:text-sm`, etc., which this rule does not flag).

**Multi-line elements:** attributes are frequently split across several
lines. The checker scans by character index across the whole file (not
line-by-line), so it finds an element's full opening tag — and thus every
class token in it — regardless of how many lines it spans.

**Status at time of writing:** 1 genuine violation —
`app/[locale]/(dashboard)/settings/page.tsx:109`, the avatar
`<input type="file">`, carries a bare `text-sm` (the `file:text-sm` later in
the same class list is fine — it's a `file:` variant, not a bare token).

---

## no-vh-dialog-override

**Rule:** no `max-h-[<n>vh]` anywhere in `app/` or `components/` — **no
admin exclusion**; this is a device-viewport bug, not a branding/RTL rule.

**Why:** `vh` resolves against the *large* viewport on mobile Safari (as if
the address bar were permanently collapsed), not the actually-visible area.
`DialogContent`'s base class already uses `max-h-[85dvh]` — the dynamic
viewport unit, which does track the real visible height — specifically to
fix this. A local `max-h-[Nvh]` override on a specific dialog wins through
`twMerge`'s conflict resolution (last matching utility for the same CSS
property wins) and silently reintroduces the exact overflow-behind-the-
address-bar bug `dvh` was adopted to fix.

**Status at time of writing:** 1 genuine violation —
`components/admin/AdminCommandPalette.tsx:143` (`max-h-[60vh]`). Real and in
scope: this rule intentionally covers admin too, since a native mobile
Safari viewport bug doesn't care whether the surface is customer-facing or
internal.

---

## no-arabic-literals-in-tsx

**Rule:** no Arabic characters (Unicode range U+0600–U+06FF) inside `.tsx`
files under `app/` or `components/`, excluding admin, outside of comments.

**Why:** a hardcoded Arabic string renders unconditionally regardless of the
active locale — it shows up even when a user is on the English site, and it
cannot be updated by a translator without a code change and a redeploy.
Arabic copy belongs in `messages/ar.json`, resolved through next-intl, where
`msg-parity` and `msg-no-empty` above then also apply to it.

**Comment-stripping and its limits:** the checker runs a single-pass state
machine over the raw source that tracks single-line `//` comments, block
`/* ... */` comments, and string/template-literal state (so `//` or `/*`
inside a string — a URL, for instance — isn't mistaken for a comment start).
This is *not* a full TypeScript tokenizer: it does not understand regex
literals (a `/pattern/` containing `//` could in theory confuse it) and
treats backtick template literals as an opaque span without parsing `${...}`
interpolation. Neither situation occurs in this codebase's `.tsx` files
today, and the stripper was verified against a real case found during
development (`app/[locale]/layout.tsx`'s `// Was "نماذج AI متعددة"...`
comment, correctly excluded). Given that residual risk, matches are still
reported at normal (error) severity rather than downgraded to warnings,
because every match surfaced during development was spot-checked by hand
and is a genuine hardcoded string, not a comment-stripping artifact.

**Status at time of writing: 130 genuine violations.** This is a real,
pre-existing gap, not a heuristic artifact — it spans entire un-localized
pages (`terms/page.tsx`, `privacy/page.tsx` are 100% hardcoded Arabic with
no English variant at all), `isAr ? '...' : '...'` ternaries scattered
through shared components instead of `t()` calls (`PlanCard.tsx`,
`not-found.tsx`, the error boundaries), and components with no i18n applied
whatsoever (`TopupCard.tsx`, `WeeklyChallenge.tsx`, `DailyBonus.tsx`,
`ModelSelector.tsx`, `PersonaSelector.tsx`, `PromptSuggestions.tsx`,
`ShareMenu.tsx`, `PromptTemplateLibrary.tsx`, `AutoTopup.tsx`,
`community/page.tsx`, `team/page.tsx`, `portfolio/page.tsx`). See
`.superpowers/sdd/invariants-report.md` or the script's own output for the
full file:line list — it is too long to duplicate here.

---

## contrast-tokens

**Rule:** every text-tier CSS variable
(`--color-text-primary`/`secondary`/`muted`, `--color-success`/`warning`/
`error`, `--color-link`, `--color-brand`) meets WCAG AA (4.5:1) against
*every* background variable (`--color-surface`, `--color-bg`,
`--color-surface-2`), in both the `:root` and `.dark` blocks of
`app/globals.css`.

**Why:** this is the single check that would have caught the original
defect — dark-mode `--color-text-secondary` and `--color-text-muted` were
the *same hex*, so the two-tier text hierarchy did not actually exist, and
both measured 4.04:1 against dark `surface-2`, an AA failure. That bug is
invisible in the default (light) theme and invisible to a human skimming hex
codes — it only shows up as a computed contrast ratio, which is why this
check does the real math rather than approximating it.

**Implementation:** genuine sRGB relative-luminance math per the WCAG
formula (gamma-correct each channel, weight by `0.2126/0.7152/0.0722`, then
`(L_lighter + 0.05) / (L_darker + 0.05)`) — not a shortcut. `:root` and
`.dark` blocks are extracted from `globals.css` by brace-depth matching (so
nested rules don't confuse the block boundary), and each `--custom-property:
#hex;` declaration inside is parsed with its own source line for accurate
`file:line` reporting on failure.

**Status at time of writing:** 0 violations — every tier clears 4.5:1
against every surface in both themes; worst cases are `--color-text-muted`
at 4.95:1 (light) and 4.60:1 (dark), both against `--color-surface-2`.
