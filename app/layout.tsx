import type { Metadata } from 'next';
import './globals.css';

/**
 * True ROOT layout — required by Next.js App Router because app/not-found.tsx
 * lives at the top level (outside app/[locale]/), so it has no other layout
 * in its chain to supply the mandatory <html>/<body>. (app/[locale]/layout.tsx
 * and app/admin/layout.tsx are each self-contained with their own <html>/
 * <body> for their branch, so this root layout never double-wraps them —
 * in normal operation middleware.ts sends every real request through a
 * locale prefix, so this is effectively only ever reached for the rare
 * genuinely-unmatched top-level path.)
 */
export const metadata: Metadata = {
  title: 'PyraSuite',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
