import NextImage from 'next/image';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { StudioExample } from '@/lib/studios/examples';

interface BeforeAfterProps {
  title: string;
  note: string;
  beforeLabel: string;
  afterLabel: string;
  locale: 'ar' | 'en';
  before: StudioExample;
  after: StudioExample;
}

/**
 * The edit studio's whole argument in one row: the SAME product, from the photo
 * a customer actually has to the one a marketplace accepts. Both frames come
 * from one live run (public/examples/studios/manifest.json's `sourceRun`, both
 * `2026-08-27T21-07-40-884Z`), so the pairing is real rather than assembled.
 *
 * The arrow points with the reading direction, which is why there are two: in
 * Arabic the first figure sits on the RIGHT and the eye travels left, so a
 * physical right-pointing arrow would point back at the frame it came from.
 * This is the one place a physical direction is correct — it is drawing the
 * reading order, not laying anything out. Every box/spacing property here is
 * still logical (`ps/pe/ms/me`).
 *
 * The caption carries BOTH the label and the manifest's own alt sentence. The
 * grid this replaces (StudioExamples) showed the alt as the visible caption, so
 * dropping it here would have quietly deleted the only description a reader
 * gets of what changed between the two frames.
 */
export function BeforeAfter({
  title,
  note,
  beforeLabel,
  afterLabel,
  locale,
  before,
  after,
}: BeforeAfterProps): React.ReactElement {
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  return (
    <section className="mx-auto max-w-5xl px-6 py-12">
      <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{note}</p>
      <div className="mt-6 grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <figure className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <NextImage
            src={before.file}
            alt={before.alt[locale]}
            width={before.width}
            height={before.height}
            sizes="(max-width: 640px) 100vw, 45vw"
            className="h-auto w-full"
          />
          <figcaption className="px-4 py-3">
            <span className="block text-sm font-medium text-[var(--color-text-muted)]">{beforeLabel}</span>
            <span className="mt-1 block text-sm text-[var(--color-text-secondary)]">{before.alt[locale]}</span>
          </figcaption>
        </figure>
        <Arrow className="mx-auto hidden h-8 w-8 text-[var(--color-text-muted)] sm:block" aria-hidden />
        <figure className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <NextImage
            src={after.file}
            alt={after.alt[locale]}
            width={after.width}
            height={after.height}
            sizes="(max-width: 640px) 100vw, 45vw"
            className="h-auto w-full"
          />
          <figcaption className="px-4 py-3">
            <span className="block text-sm font-medium text-[var(--color-text-primary)]">{afterLabel}</span>
            <span className="mt-1 block text-sm text-[var(--color-text-secondary)]">{after.alt[locale]}</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
