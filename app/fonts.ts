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

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-tajawal',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

/**
 * Apply to the <html> element of every branch that owns a document.
 * `npm run test:root-document` fails the build if one of them does not.
 */
export const fontVariables = `${cairo.variable} ${tajawal.variable} ${inter.variable}`;
