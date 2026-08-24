import type { Metadata } from 'next';
import { fontVariables } from '@/app/fonts';
import '@/app/globals.css';

/**
 * The admin panel's own document. app/layout.tsx is a pass-through (see the note
 * there), so this <html> is now the only one on /admin/*.
 *
 * Until 2026-08-24 it was the SECOND one, and it lost. The parser merges only
 * the attributes not already present on the existing element, so the root's
 * `lang="ar" dir="rtl"` won and this English LTR panel was served right-to-left
 * with lang="ar" — on all 15 prerendered admin pages, measured on the running
 * build at /admin/login. Only `class="dark"` survived, because the root <html>
 * had no class of its own, and that is the sole reason admin's dark styling
 * worked at all.
 *
 * The inherited RTL genuinely mirrored the UI. components/admin/AdminLayout.tsx
 * builds its sidebar as `fixed inset-y-0 start-0` (logical) and closes it with a
 * PHYSICAL `-translate-x-full` (AdminLayout.tsx:48-50) — under RTL `start-0`
 * resolves to the right edge while the transform still moves left, so the closed
 * mobile sidebar translated INTO the viewport instead of off-canvas.
 *
 * The <body> class was dropped by the same merge rule, because the outer <body>
 * already carried one. `bg-slate-950 text-slate-100` had therefore never applied;
 * globals.css's own `body` rule under the merged `dark` class painted something
 * close enough that nobody looked. It applies now, so expect a small, correct
 * visual diff on every admin page rather than a no-op. `min-h-screen` is carried
 * over from what the root <body> used to supply, so nothing loses its full-height
 * box.
 *
 * The font variables are new here. Without them `[lang='ar']{font-family:
 * var(--font-tajawal),sans-serif}` in globals.css was invalid at computed-value
 * time and <html> fell back to the UA default — getComputedStyle on /admin/login
 * returned `"Times New Roman"`. See app/fonts.ts.
 *
 * Admin deliberately has NO next-intl, no ThemeProvider and no QueryProvider.
 * `dark` here is a static class, not one next-themes mutates before hydration,
 * which is why there is no suppressHydrationWarning — do not copy that prop over
 * from app/[locale]/layout.tsx. And do not "deduplicate" by hoisting the locale
 * tree's providers into a shared layout: messages/*.json has no admin namespace,
 * so every admin page would start calling useTranslations() against keys that do
 * not exist.
 */
export const metadata: Metadata = {
  title: 'PyraSuite Admin',
  robots: 'noindex, nofollow',
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" className={`dark ${fontVariables}`}>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
