import { Link } from '@/i18n/routing';

interface StudioRelatedProps {
  title: string;
  items: readonly { slug: string; name: string; tagline: string }[];
  /** Label for the link up to /studios. */
  backLabel: string;
}

/**
 * Internal linking is the cheapest SEO there is and these pages start with
 * none: nothing on the site linked to a studio at all before them. The pairs
 * come from lib/studios/catalogue.ts's `related`, so the graph is stated once.
 *
 * The link to /studios is here because without it the graph is one-directional:
 * the index calls itself the hub of the nine, and the nine linked to two
 * siblings each and to nothing above them — so a visitor who landed on one
 * studio from search had no path to the other eight, and a crawler had no edge
 * back to the page that lists them. `backToStudios` was written for exactly
 * this and had zero readers until it was wired.
 *
 * It renders even when `items` is empty — the section's OTHER half is optional,
 * the way up is not. Every studio carries two `related` entries today, so an
 * empty list is the case a future catalogue edit creates, and it is the case
 * where the way out of a dead end matters most.
 */
export function StudioRelated({ title, items, backLabel }: StudioRelatedProps): React.ReactElement {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-16">
      {items.length > 0 ? (
        <>
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">{title}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {items.map((s) => (
              <Link
                key={s.slug}
                href={`/studios/${s.slug}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:bg-[var(--color-bg)]"
              >
                <span className="block font-medium text-[var(--color-text-primary)]">{s.name}</span>
                <span className="mt-1 block text-sm text-[var(--color-text-secondary)]">{s.tagline}</span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
      <div className="mt-6">
        <Link
          href="/studios"
          className="text-sm font-medium text-[var(--color-text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--color-text-primary)]"
        >
          {backLabel}
        </Link>
      </div>
    </section>
  );
}
