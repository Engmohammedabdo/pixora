import { Cairo, Tajawal, Inter } from 'next/font/google';

/**
 * The three brand faces, defined ONCE so every <html> element in the app can
 * carry them.
 *
 * They lived in app/[locale]/layout.tsx alone until 2026-08-24, and that was
 * survivable only because of a bug. app/layout.tsx rendered an <html> too; the
 * parser merged the two into one element, and the locale layout's `class` — the
 * half carrying these variables — happened to survive the merge because the
 * root's <html> had no class of its own. So the variables reached
 * document.documentElement on /ar and /en by accident, and reached NOTHING on
 * /admin/* or on the top-level 404.
 *
 * That cost more than "no brand font". app/globals.css:86-99 states
 *
 *     [lang='ar'] { font-family: var(--font-tajawal), sans-serif; }
 *     [lang='en'] { font-family: var(--font-inter),   sans-serif; }
 *
 * and the trailing `sans-serif` does NOT rescue it. A `var()` whose custom
 * property is undefined and which carries no fallback INSIDE the parentheses
 * makes the whole declaration invalid at computed-value time — the rest of the
 * font stack goes down with it rather than being used. font-family is inherited
 * and <html> has no parent, so it lands on the property's initial value: the UA
 * default.
 *
 * MEASURED, not reasoned: getComputedStyle(document.documentElement).fontFamily
 * on /admin/login returned `"Times New Roman"`, with --font-tajawal and
 * --font-inter both undefined. The admin panel and the top-level 404 have been
 * rendering in Times.
 *
 * next/font keys each loader call by module + call site, so importing this file
 * from three layouts downloads one set of font files, not three, and emits one
 * set of `__variable_*` classes. (The emitted hashes were measured before and
 * after this extraction and are unchanged — but nothing asserts a literal hash,
 * because that is an implementation detail of the loader, not a contract.)
 *
 * Self-hosted: fetched and served from our own origin at build time, so there is
 * no runtime request to the Google Fonts CDN, and next/font auto-generates a
 * size-adjusted fallback so there is no layout shift when the real face swaps
 * in. Weights are byte-identical to what app/[locale]/layout.tsx declared, so no
 * typography regresses.
 */
const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-cairo',
});

/**
 * ── `subsets` IS THE PRELOAD LIST, NOT THE FACE LIST ───────────────────────
 * This is the single fact the rest of this block turns on, and it is measured
 * rather than reasoned about. next/font/google self-hosts EVERY subset Google
 * publishes for the family and emits an `@font-face` for each, scoped by
 * `unicode-range`; `subsets` decides only which of them get a
 * `<link rel="preload">`. Proof in the bytes we already ship: Cairo is declared
 * `['arabic','latin']` below, and the production stylesheet
 * (/_next/static/css/6d0373892779de0b.css) carries a THIRD Cairo face for
 * `latin-ext` — 5ec84f17416dda4d, full unicode-range, four weights — which
 * appears in no preload tag on any page. So removing a subset here removes a
 * download from the critical path. It does not remove a glyph from the page.
 *
 * WHAT WAS WRONG. Every document on the origin preloaded 8 woff2 files,
 * 121,264 bytes, byte-identically on /ar, /en and /admin — measured by curl on
 * /ar/studios/plan and /en/studios/plan, which return the same 8 tags. That is
 * 2.93x the gzipped HTML of the page carrying it, on a deployment with no CDN.
 * Meanwhile Inter, the face every English word on /en renders in, was the ONE
 * family opted out. The rule had been stated on a single family NAME.
 *
 * THE RULE NOW, stated once for all three: preload the faces the DEFAULT
 * locale renders as its dominant text, and let everything else arrive from the
 * stylesheet behind next/font's metric-matched fallback.
 *
 *   Cairo   arabic + latin, preloaded. Arabic is every /ar h1–h4
 *           (globals.css:89-94); latin is the `.font-cairo` wordmark on /ar and
 *           every /en heading. Display text, above the fold, in both locales.
 *   Tajawal arabic ONLY. Tajawal is applied by exactly one selector,
 *           `[lang='ar']` (globals.css:86) — so on /en its three latin faces
 *           (e97026df 10,228 + f15f45d1 9,868 + ce401bab 9,988 = 30,084 B)
 *           could never match a character: the only lang="ar" elements on an
 *           English page are the two locale-switcher anchors, and their text is
 *           العربية. On /ar they render digits and the stray Latin word inside
 *           Arabic body copy — real, but short runs at body size, and the
 *           arabic faces they sit beside ARE preloaded.
 *   Inter   not preloaded, unchanged.
 *
 * WHAT THIS COSTS, said plainly rather than buried: on /ar a digit or a Latin
 * word inside a paragraph now paints in the fallback first and swaps. There is
 * no layout shift by construction — the generated `Tajawal Fallback` face is
 * `size-adjust: 94.66%` with ascent/descent/line-gap overridden — and it is the
 * identical trade this file already accepted for Inter three lines down, which
 * is a whole locale's body text rather than its numerals. Measured saving:
 * 121,264 -> 91,180 bytes of preload on every page of the site, first visit
 * (fonts are `max-age=31536000, immutable`).
 *
 * `npm run test:config-hygiene` now asserts an explicit `subsets`/`preload`
 * decision for EVERY next/font/google call in this file, because the gate that
 * existed named `Inter(` and structurally could not see the other two.
 */
const tajawal = Tajawal({
  subsets: ['arabic'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-tajawal',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  // Latin body face; unused on /ar, the default locale. Loaded on demand.
  preload: false,
  variable: '--font-inter',
});

/**
 * Apply to the <html> element of every branch that owns a document.
 * `npm run test:root-document` fails the build if one of them does not.
 */
export const fontVariables = `${cairo.variable} ${tajawal.variable} ${inter.variable}`;
