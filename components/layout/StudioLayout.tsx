'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface StudioLayoutProps {
  inputPanel: React.ReactNode;
  previewPanel: React.ReactNode;
  historyStrip?: React.ReactNode;
  /**
   * True while a generation is in flight. Drives the scroll below — without it
   * the studio silently does nothing on a phone.
   */
  isGenerating?: boolean;
  className?: string;
}

export function StudioLayout({
  inputPanel,
  previewPanel,
  historyStrip,
  isGenerating = false,
  className,
}: StudioLayoutProps): React.ReactElement {
  const previewRef = useRef<HTMLDivElement>(null);
  const wasGenerating = useRef(false);

  /**
   * Bring the preview into view when a generation starts on a stacked layout.
   *
   * Below lg the two panels stack, so the preview sits under the whole input
   * form — off-screen on any phone. Generation takes 15-40 seconds, and the
   * only feedback in that window was the submit button's own label, which the
   * user cannot see either once they have scrolled. The result then rendered
   * somewhere below the fold with nothing pointing at it.
   *
   * From the user's side that is indistinguishable from a button that does
   * nothing, on the one screen where the product has to prove it works — and
   * this audience is overwhelmingly phone-first. The common next move is to
   * press it again, which spends a second credit on a second identical job.
   *
   * Desktop is left alone: both panels are already visible side by side, so
   * scrolling would only yank the page under someone who can see the result.
   */
  useEffect(() => {
    const started = isGenerating && !wasGenerating.current;
    wasGenerating.current = isGenerating;
    if (!started || typeof window === 'undefined') return;

    // lg is 1024px; below it the panels stack.
    if (!window.matchMedia('(max-width: 1023px)').matches) return;

    previewRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  }, [isGenerating]);

  return (
    <div className={cn('flex flex-col flex-1 min-h-0', className)}>
      {/* Mobile: panels stack and the page scrolls as one (no nested scroll traps).
          Desktop (lg+): fixed-height shell, each panel scrolls independently. */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-0">
        {/* Input Panel - 40% */}
        <div className="w-full lg:w-2/5 lg:overflow-y-auto rounded-lg border bg-surface p-4">
          {inputPanel}
        </div>

        {/* Preview Panel - 60%
            aria-live rather than role="status": role="status" implies
            aria-atomic, which would read the entire panel aloud on every
            change. Polite + non-atomic announces what actually changed, and
            aria-busy tells a screen reader the wait is intentional — the same
            information the scroll above gives a sighted user. */}
        <div
          ref={previewRef}
          aria-live="polite"
          aria-busy={isGenerating}
          className="w-full lg:w-3/5 lg:overflow-y-auto rounded-lg border bg-surface p-4 scroll-mt-4"
        >
          {previewPanel}
        </div>
      </div>

      {/* History Strip */}
      {historyStrip && (
        <div className="border-t bg-surface p-3">
          {historyStrip}
        </div>
      )}
    </div>
  );
}
