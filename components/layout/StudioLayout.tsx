'use client';

import { cn } from '@/lib/utils';

interface StudioLayoutProps {
  inputPanel: React.ReactNode;
  previewPanel: React.ReactNode;
  historyStrip?: React.ReactNode;
  className?: string;
}

export function StudioLayout({
  inputPanel,
  previewPanel,
  historyStrip,
  className,
}: StudioLayoutProps): React.ReactElement {
  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-0">
        {/* Input Panel - 40% */}
        <div className="w-full lg:w-2/5 overflow-y-auto rounded-lg border bg-surface p-4">
          {inputPanel}
        </div>

        {/* Preview Panel - 60% */}
        <div className="w-full lg:w-3/5 overflow-y-auto rounded-lg border bg-surface p-4">
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
