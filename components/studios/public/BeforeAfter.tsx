import NextImage from 'next/image';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { StudioExample } from '@/lib/studios/examples';

interface BeforeAfterProps {
  title: string;
  note: string;
  /** Where the two frames came from, stated on the page rather than left to the
   *  reader. `note` (studios.shared.examplesNote) says every image here is
   *  product output on a paid account and that is true of both frames — but it
   *  is the note every image studio shows, and this is the one page whose first
   *  frame is an INPUT. A reader who is not told otherwise reads an input frame
   *  as a customer's own photograph. */
  provenance: string;
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
 *
 * ── WHY THE 'BEFORE' FRAME CARRIES ITS OWN PROVENANCE LINE ─────────────────
 * The labels used to read «قبل — الصورة اللي عندك» / "Before — the photo you
 * have", and the alt sentence said the jar was «مصوّر» / "photographed" inside a
 * café. Neither was true of the artifact: `edit-before-cafe`'s `sourceFile` is
 * `fixture-retail_scene.png`, a scene the harness GENERATED through the creator
 * studio seconds earlier (scripts/live/cases.ts defines it as a prompt string;
 * scripts/live/run.ts posts it to /api/studios/creator) so the edit run would
 * have an input. The pair is a real demonstration of a real edit and stays —
 * what changed is that the page now DESCRIBES the frame instead of asserting
 * who took it, and says out loud that both frames are product output from one
 * run. Adjacent contradiction is not disclosure.
 *
 * The `sizes` values are the measured slot in PIXELS above 1024px, for the
 * reason components/studios/public/StudioExamples.tsx states at length: this
 * row shipped as `45vw`, which asks a 1920 viewport for 864px while the image
 * box is 454, so a DPR-1 Chrome took the w=1080 candidate for it. Derivation,
 * and it matches the browser exactly:
 *
 *     max-w-5xl 1024 - px-6 48 - two gap-4 32 - the 32px arrow column
 *       = 912 / 2 = 456 column, - the figure's 1px border each side = 454
 *
 * Measured in a real Chrome at 1920x1080, DPR 1, on the live /ar/studios/edit:
 * `img.getBoundingClientRect().width` = 454 for both frames.
 */
export function BeforeAfter({
  title,
  note,
  provenance,
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
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{provenance}</p>
      <div className="mt-6 grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <figure className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          <NextImage
            src={before.file}
            alt={before.alt[locale]}
            width={before.width}
            height={before.height}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 45vw, 454px"
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
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 45vw, 454px"
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
