import type { Metadata } from 'next';
import './globals.css';

/**
 * PASS-THROUGH root layout. It renders no <html> and no <body>, on purpose.
 *
 * ── WHAT WAS WRONG, AND FOR HOW LONG ───────────────────────────────────────
 * The App Router root layout wraps EVERY nested segment layout. There is no
 * "only when nothing else matched" case. Until 2026-08-24 this file rendered
 * `<html lang="ar" dir="rtl">`, and the comment that stood here claimed that
 * app/[locale]/layout.tsx and app/admin/layout.tsx were "each self-contained
 * with their own <html>/<body> for their branch, so this root layout never
 * double-wraps them", and that it was "effectively only ever reached for the
 * rare genuinely-unmatched top-level path". Both halves were false, and the
 * build artifacts said so: **61 of the 64 prerendered documents carried two
 * <html> start tags** — 23 ar, 23 en, 15 admin. The only three that did not
 * were _not-found.html and the two icon 404s.
 *
 * The second <html> is serialised INSIDE the first one's <body>, which puts the
 * parser in the "in body" insertion mode. Its rule for a stray <html> start tag
 * is to merge only the attributes NOT already present on the existing element.
 * So `lang` and `dir` from this file won and the branch's were discarded, while
 * `class` — which this file did not set — was merged in.
 *
 * Measured consequences, not inferred:
 *   - every English page shipped `lang="ar" dir="rtl"`;
 *   - so did the entire admin panel, which asks for `lang="en" dir="ltr"`;
 *   - `<body>` is a singleton under the same rule, so admin's
 *     `bg-slate-950 text-slate-100` was dropped in favour of the root's
 *     `min-h-screen antialiased` and had never once applied;
 *   - the font `--font-*` variables reached /ar and /en only because `class`
 *     was the one attribute that merged, and reached admin and the 404 not at
 *     all: getComputedStyle on /admin/login returned `"Times New Roman"`.
 *
 * ── WHY NOTHING CAUGHT IT ──────────────────────────────────────────────────
 * React 19 treats <html> and <body> as host singletons, so both copies resolve
 * to document.documentElement / document.body and hydration does not throw.
 * It is NOT silent, though: in development `acquireSingletonInstance()` logs
 * "You are mounting a new %s component when a previous one has not first
 * unmounted" (node_modules/react-dom/cjs/react-dom-client.development.js:22639)
 * and then rewrites every attribute on the element. That console error was
 * available in `npm run dev` the whole time and nobody read it. In production
 * builds it does not fire at all.
 *
 * tsc, eslint, all 15 invariants and a clean production build stayed green for
 * the entire time it was live, which is the actual lesson: nothing in the
 * toolchain models "how many <html> elements does the finished document have".
 *
 * ── THE SHAPE, AND WHY THIS ONE ────────────────────────────────────────────
 * The document belongs to whichever segment actually knows its locale:
 * app/[locale]/layout.tsx and app/admin/layout.tsx for their branches,
 * app/not-found.tsx (which has no other layout in its chain and so now owns its
 * own), and app/global-error.tsx (which replaces this file entirely rather than
 * rendering inside it). This is the shape next-intl's own example app ships at
 * the tag pinning next ^15.5.0, byte-identical at the installed v4.8.3.
 *
 * This file must still EXIST. Every route needs a root layout or `next build`
 * exits 1 with "<page> doesn't have a root layout"
 * (next/dist/build/webpack/loaders/next-app-loader/index.js), and `next dev`
 * silently WRITES one into app/ for you (next/dist/lib/verify-root-layout.js).
 * `metadata` and the globals.css import above are module exports, independent of
 * the returned JSX, so they still title and style the top-level 404.
 *
 * Having the root read the locale itself and keep <html> was considered and
 * rejected: `setRequestLocale()` runs BELOW the root, so next-intl would fall
 * through to `headers()` and force all 129 prerendered pages dynamic — the exact
 * cost app/[locale]/layout.tsx:16-25 records paying to avoid — and it could not
 * distinguish the admin branch at all, since middleware.ts returns before
 * intlMiddleware ever sets a locale header for /admin/*.
 *
 * ── THE GATE ───────────────────────────────────────────────────────────────
 * Nothing in Next.js will tell you if this regresses. The "Missing <html> and
 * <body> tags in the root layout" check is a DEV-ONLY scan of the response
 * stream (`validateRootLayout: dev`) and is satisfied by any layout in the
 * chain, so it fires only when a document has NO html — never when it has two.
 * `npm run test:root-document` is the gate that will, and it is stated on the
 * layout CHAIN rather than on a list of filenames, because a list of filenames
 * is precisely what the false comment above was.
 */
/**
 * Declared HERE rather than in app/[locale]/layout.tsx so that all three
 * branches get them — the locale tree, /admin/*, and the top-level 404.
 *
 * They were missing entirely until 2026-08-24: /favicon.ico and /icon-192.png
 * both returned 404 on production, and public/manifest.json (linked from
 * app/[locale]/layout.tsx:89) pointed at that same missing icon-192.png. The
 * files ship from public/, and the 192/512 pair is named to match what the
 * manifest already referenced, so there is one manifest rather than two.
 */
export const metadata: Metadata = {
  title: 'PyraSuite',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <>{children}</>;
}
