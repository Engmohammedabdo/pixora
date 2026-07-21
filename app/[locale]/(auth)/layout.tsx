/**
 * Auth pages are per-visitor by nature — they read `useSearchParams()` (invite
 * codes, post-checkout redirects, error flags) and must never be served from a
 * prerendered HTML file. Declaring that here keeps them out of the static export
 * that `generateStaticParams()` in the parent [locale] layout now enables for the
 * public marketing pages. Without this, the build fails prerendering /en/signup.
 */
export const dynamic = 'force-dynamic';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-md">
        {children}
      </div>
    </main>
  );
}
