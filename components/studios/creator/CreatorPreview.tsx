'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, RefreshCw, AlertTriangle, Pencil, Info } from 'lucide-react';
import { Link } from '@/i18n/routing';

interface CreatorPreviewProps {
  imageUrl: string | null;
  isLoading: boolean;
  error: string | null;
  usedFallback: boolean;
  originalModel?: string;
  mock: boolean;
  onRegenerate: () => void;
}

export function CreatorPreview({
  imageUrl,
  isLoading,
  error,
  usedFallback,
  originalModel,
  mock,
  onRegenerate,
}: CreatorPreviewProps): React.ReactElement {
  const t = useTranslations('studio');

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
        <Skeleton className="h-64 w-64 rounded-lg" />
        <p className="text-sm text-[var(--color-text-muted)] animate-pulse">
          {t('generating')}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
        <AlertTriangle className="h-12 w-12 text-[var(--color-error)]" />
        <p className="text-sm text-[var(--color-error)]">{error}</p>
        <Button variant="outline" onClick={onRegenerate} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          {t('regenerate')}
        </Button>
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-12 text-[var(--color-text-muted)]">
        <div className="h-48 w-48 rounded-lg border-2 border-dashed border-[var(--color-border)] flex items-center justify-center">
          <span className="text-4xl">🎨</span>
        </div>
        <p className="text-sm mt-4">النتيجة ستظهر هنا</p>
      </div>
    );
  }

  const handleDownload = (): void => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `pixora-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="space-y-4">
      {/* Notifications */}
      {usedFallback && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>{t('usedFallback')} ({originalModel} → fallback)</span>
        </div>
      )}

      {mock && (
        <Badge variant="outline" className="text-xs">Mock Response</Badge>
      )}

      {/* Image */}
      <div className="rounded-lg overflow-hidden border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Generated image"
          className="w-full h-auto"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={handleDownload} className="gap-2">
          <Download className="h-4 w-4" />
          {t('download')}
        </Button>
        <Button variant="outline" onClick={onRegenerate} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          {t('regenerate')}
        </Button>
        <Button variant="ghost" asChild className="gap-2">
          <Link href="/edit">
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
