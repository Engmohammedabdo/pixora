import React from 'react';
import Link from 'next/link';
import { fontVariables } from './fonts';
import './globals.css';

/**
 * The ONLY route whose document has no layout above it that renders one.
 * app/layout.tsx is a pass-through (see the note there), so this file owns
 * <html>/<body> itself — and if it stops, Next serves its `__next_error__`
 * shell here instead of a 404 page, because the dev-only root-layout validator
 * scans the OUTPUT stream and this branch would then contain no <html> at all.
 *
 * Do not "clean up" the './globals.css' import above as a duplicate of the root
 * layout's. With no styled layout in this chain it is the only thing styling
 * this page, and dropping it fails silently with a 200.
 *
 * Reachable in production for any path the middleware matcher excludes that also
 * matches no route — `matcher: ['/((?!_next|.*\\..*).*)']` at middleware.ts:339
 * skips anything containing a dot, i.e. exactly the /wp-login.php and /.env
 * scanner traffic every public host receives — and as the boundary Next falls
 * back to when a layout ABOVE [locale] calls notFound(). Test that arm with a
 * dotted path such as /foo/bar.txt.
 *
 * It is ALSO what every unknown LOCALIZED URL renders, and since c9c785c
 * ("unknown URLs 404 instead of redirecting to login") that is this page's
 * primary traffic. This repo has no [...rest] catch-all under app/[locale], so
 * an unmatched URL never enters that segment: app/[locale]/not-found.tsx is NOT
 * what renders, and editing it to change the site's 404 changes nothing.
 * Measured on a production build (`npx next start`): /ar/nonexistent-xyz,
 * /en/nonexistent-xyz, /ar/blog/x and /foo/bar.txt all serve THIS file — the
 * "Page not found —" / "Go Home" copy below, under <html lang="ar" dir="rtl">,
 * and zero occurrences of the locale file's "Page Not Found" / "Go to
 * Dashboard". Before c9c785c the middleware 307'd unauthenticated non-public
 * paths to /login before routing, which is the only reason localized unknowns
 * did not arrive here; that redirect is now limited to isProtectedPath().
 *
 * lang/dir stay ar/rtl. The copy is Arabic-first with an English line under it,
 * and ar/rtl is what this page has always actually served — it is the one place
 * the old hardcoded root <html> happened to be right.
 *
 * There is no ThemeProvider in this chain and never has been, so the `dark:`
 * variants below have never applied. Owning the document does not change that.
 * An unchanged appearance here is therefore NOT evidence the fix worked — read
 * the <html> tag, not the screenshot. What DOES change is the type: this page
 * carried no font variables before, so it rendered in the UA default serif.
 */
export default function NotFound(): React.ReactElement {
  return (
    <html lang="ar" dir="rtl" className={fontVariables}>
      <body className="min-h-screen antialiased">
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
          <div className="text-center max-w-md mx-auto">
            <h1 className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary-500 to-accent-500 mb-4">
              404
            </h1>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
              الصفحة غير موجودة
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-2">
              الصفحة اللي تدور عليها مش موجودة أو تم نقلها
            </p>
            <p className="text-slate-500 text-sm mb-8">
              Page not found — The page you&apos;re looking for doesn&apos;t exist
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/ar"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium hover:from-primary-600 hover:to-accent-600 transition-all"
              >
                الصفحة الرئيسية
              </Link>
              <Link
                href="/en"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-slate-300 text-slate-700 font-medium hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white transition-all"
              >
                Go Home
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
