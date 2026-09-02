import NextImage from 'next/image';
import type { StudioExample } from '@/lib/studios/examples';

interface StudioExamplesProps {
  title: string;
  note: string;
  locale: 'ar' | 'en';
  examples: readonly StudioExample[];
}

/**
 * Real product output, read through lib/studios/examples.ts so an id naming no
 * file is a build failure rather than a broken image.
 *
 * `alt` is the manifest's, per locale, and is repeated as the visible caption:
 * a crawler reads the alt, a reader reads the caption, and there is one string
 * behind both so they cannot describe two different pictures.
 */
export function StudioExamples({ title, note, locale, examples }: StudioExamplesProps): React.ReactElement | null {
  if (examples.length === 0) return null;
  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{note}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {examples.map((ex) => (
          <figure key={ex.id} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
            <NextImage
              src={ex.file}
              alt={ex.alt[locale]}
              width={ex.width}
              height={ex.height}
              sizes="(max-width: 640px) 100vw, 50vw"
              className="h-auto w-full"
            />
            <figcaption className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">{ex.alt[locale]}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
