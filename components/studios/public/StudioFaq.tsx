import { ChevronDown } from 'lucide-react';

interface StudioFaqProps {
  title: string;
  items: readonly { q: string; a: string }[];
}

/**
 * <details>, not a controlled accordion, and that is the whole point of the
 * component: every answer is in the server HTML whether or not it is open.
 * The landing page's FaqSection mounts its answers only while expanded, so a
 * crawler that does not click reaches zero of them — the 2026-09-01 audit
 * measured exactly that. A native <details> also needs no JavaScript, which
 * keeps these pages at zero client bundle.
 */
export function StudioFaq({ title, items }: StudioFaqProps): React.ReactElement {
  return (
    <section className="mx-auto max-w-3xl px-6 py-12">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <details key={item.q} className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <summary className="flex cursor-pointer list-none items-center justify-between p-5 text-start font-medium text-[var(--color-text-primary)]">
              {item.q}
              <ChevronDown className="ms-4 h-5 w-5 shrink-0 text-[var(--color-text-muted)] transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <p className="px-5 pb-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
