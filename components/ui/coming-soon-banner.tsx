'use client';

import { Construction } from 'lucide-react';

interface ComingSoonBannerProps {
  featureName: string;
  featureNameAr: string;
  description?: string;
  descriptionAr?: string;
}

export function ComingSoonBanner({ featureName, featureNameAr, description, descriptionAr }: ComingSoonBannerProps): React.ReactElement {
  return (
    <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 dark:bg-amber-900/20 p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-amber-500/20 p-2">
          <Construction className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <h3 className="font-semibold text-amber-600 dark:text-amber-400">
            🚧 {featureNameAr} — قريباً | {featureName} — Coming Soon
          </h3>
          {description && descriptionAr && (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {descriptionAr} | {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
