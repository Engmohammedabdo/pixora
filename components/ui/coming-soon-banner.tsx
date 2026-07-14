'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Construction } from 'lucide-react';

interface ComingSoonBannerProps {
  featureName: string;
  featureNameAr: string;
  description?: string;
  descriptionAr?: string;
}

export function ComingSoonBanner({ featureName, featureNameAr, description, descriptionAr }: ComingSoonBannerProps): React.ReactElement {
  const locale = useLocale();
  const t = useTranslations('shared.comingSoon');
  const isAr = locale === 'ar';
  const name = isAr ? featureNameAr : featureName;
  const desc = isAr ? descriptionAr : description;

  return (
    <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 dark:bg-amber-900/20 p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-amber-500/20 p-2">
          <Construction className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <h3 className="font-semibold text-amber-600 dark:text-amber-400">
            🚧 {name} — {t('soon')}
          </h3>
          {desc && (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {desc}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
