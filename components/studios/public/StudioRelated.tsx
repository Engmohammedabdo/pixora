import { Link } from '@/i18n/routing';

interface StudioRelatedProps {
  title: string;
  items: readonly { slug: string; name: string; tagline: string }[];
}

/**
 * Internal linking is the cheapest SEO there is and these pages start with
 * none: nothing on the site linked to a studio at all before them. The pairs
 * come from lib/studios/catalogue.ts's `related`, so the graph is stated once.
 */
export function StudioRelated({ title, items }: StudioRelatedProps): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-3xl px-6 pb-16">
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
    </section>
  );
}
