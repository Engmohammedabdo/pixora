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
 *
 * ── THE `sizes` VALUE IS THE SLOT, IN PIXELS, AND IT WAS MEASURED ──────────
 * `sizes` tells the browser how wide this image will RENDER, and it is the
 * only input to which srcset candidate it downloads. It shipped as
 * `(max-width: 640px) 100vw, 50vw`, which asks for 960 px at a 1920 viewport
 * while the slot is 478 — so a DPR-1 Chrome fetched the w=1080 candidate for a
 * 478 px box: 2.01x linear, 4.04x the pixels, measured at 252,889 B on
 * /ar/studios/creator against 139,133 B for the right one.
 *
 * The slot is fixed above 1024 px, so above 1024 px the value must be a
 * PIXEL number, not a viewport fraction — a fraction keeps growing while the
 * box does not. Derivation, and it matches the browser exactly:
 *
 *     max-w-5xl 1024  −  px-6 (24 x 2) 48  −  gap-4 16  =  960 / 2 = 480 column
 *     −  the figure's 1px border on each side              =  478 image box
 *
 * Measured in a real Chrome at 1920x1080, DPR 1, on the live page:
 * `img.getBoundingClientRect().width` = 478 for all four figures. Between 640
 * and 1024 the container is still growing, so 50vw is right there (it
 * overshoots the true column by at most 7%, which is the safe direction).
 *
 * The landing page has had this right since it was written —
 * components/landing/InteractiveDemo.tsx ends its `sizes` in `480px` — so this
 * is a value that already had a correct precedent in the same codebase.
 * `npm run test:studio-pages` now fails if either public studio image
 * component ends its `sizes` in a bare `vw`.
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
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 478px"
              className="h-auto w-full"
            />
            <figcaption className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">{ex.alt[locale]}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
