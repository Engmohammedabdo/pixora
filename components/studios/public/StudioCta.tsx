import { Link } from '@/i18n/routing';

interface StudioCtaProps {
  title: string;
  body: string;
  button: string;
  pricing: string;
}

/**
 * The primary button is `bg-primary-500 text-white hover:bg-primary-600` — the
 * fixed indigo every other primary action in the product uses
 * (components/ui/button.tsx:12), NOT `bg-[var(--color-brand)]`.
 *
 * Measured, because the difference is invisible in the default theme:
 * --color-brand is #4F46E5 in :root but #A5B4FC in .dark (app/globals.css:83),
 * and white on #A5B4FC is 1.99:1 — an AA failure on the one button this page
 * exists to get clicked. #6366F1 does not flip, so white on it stays 4.47:1 in
 * both themes. No invariant catches a background token (theme-aware-text-color
 * only inspects text-primary-500/600), which is exactly why it is written down
 * here.
 */
export function StudioCta({ title, body, button, pricing }: StudioCtaProps): React.ReactElement {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-3 text-[var(--color-text-secondary)]">{body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/signup"
          className="rounded-lg bg-primary-500 px-6 py-3 font-medium text-white transition-colors hover:bg-primary-600"
        >
          {button}
        </Link>
        <Link href="/pricing" className="text-[var(--color-link)] underline underline-offset-4">
          {pricing}
        </Link>
      </div>
    </section>
  );
}
