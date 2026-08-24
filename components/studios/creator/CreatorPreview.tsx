'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GenerationProgress } from '@/components/shared/GenerationProgress';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { useCredits } from '@/hooks/useCredits';
import { useUser } from '@/hooks/useUser';
import { getGatedUpgradeVariant, type StudioError } from '@/lib/studio-errors';
import { downloadFile, downloadFiles } from '@/lib/download';
import { formatFromUrl } from '@/lib/storage/image-format';
import { Download, RefreshCw, AlertTriangle, Pencil, Info, X } from 'lucide-react';
import { Link } from '@/i18n/routing';

interface CreatorPreviewProps {
  imageUrls: string[];
  isLoading: boolean;
  error: StudioError | null;
  onDismissError: () => void;
  usedFallback: boolean;
  originalModel?: string;
  mock: boolean;
  onRegenerate: () => void;
}

export function CreatorPreview({
  imageUrls,
  isLoading,
  error,
  onDismissError,
  usedFallback,
  originalModel,
  mock,
  onRegenerate,
}: CreatorPreviewProps): React.ReactElement {
  const t = useTranslations('studio');
  const tCreator = useTranslations('creator');
  const tCommon = useTranslations('common');
  const [hasConfettied, setHasConfettied] = useState(false);
  const { balance, status: creditsStatus } = useCredits();
  const { profile } = useUser();
  const planId = profile?.plan_id ?? 'free';
  const upgradeVariant = getGatedUpgradeVariant(error, creditsStatus);

  useEffect(() => {
    if (imageUrls.length > 0 && !hasConfettied) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      setHasConfettied(true);
    }
  }, [imageUrls, hasConfettied]);

  if (isLoading) {
    return <GenerationProgress isLoading />;
  }

  if (upgradeVariant) {
    return (
      <UpgradePrompt
        open
        onClose={onDismissError}
        variant={upgradeVariant}
        currentPlan={planId}
        requiredCredits={upgradeVariant === 'insufficient_credits' ? error?.required : undefined}
        availableCredits={upgradeVariant === 'insufficient_credits' ? balance : undefined}
      />
    );
  }

  // Only when there is nothing to show. This used to return unconditionally, so an
  // error REPLACED images the customer had already paid for — a 4-variation run
  // where one variation failed hid the three that succeeded behind a panel with no
  // dismiss, whose only button spent credits on the identical request again. When
  // there ARE images, the error is rendered alongside them below instead.
  if (error && imageUrls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
        <AlertTriangle className="h-12 w-12 text-[var(--color-error)]" />
        <p className="text-sm text-[var(--color-error)]">{error.message}</p>
        <Button variant="outline" onClick={onRegenerate} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          {t('regenerate')}
        </Button>
      </div>
    );
  }

  if (imageUrls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-12 text-[var(--color-text-muted)]">
        <div className="h-48 w-48 rounded-lg border-2 border-dashed border-[var(--color-border)] flex items-center justify-center">
          <span className="text-4xl">🎨</span>
        </div>
        <p className="text-sm mt-4">{tCreator('emptyState')}</p>
      </div>
    );
  }

  // `.png` regardless of the bytes: on a storage failure the URL is a data: URL
  // carrying the provider's real mime, so JPEG and WebP downloads were named .png
  // and opened wrong. formatFromUrl() is the helper the export ZIP already uses.
  const handleDownload = (url: string, index: number): void => {
    void downloadFile(url, `pyrasuite-${Date.now()}-${index}.${formatFromUrl(url)}`);
  };

  const handleDownloadAll = (): void => {
    const stamp = Date.now();
    void downloadFiles(imageUrls.map((url, i) => ({ url, filename: `pyrasuite-${stamp}-${i}.${formatFromUrl(url)}` })));
  };

  return (
    <div className="space-y-4">
      {/* A partial failure: some variations arrived and some did not. Shown ABOVE
          the images rather than instead of them, with a dismiss, because the images
          below are work the customer has already paid for. */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error.message}</span>
          <button
            type="button"
            onClick={onDismissError}
            aria-label={tCommon('close')}
            className="flex-shrink-0 rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900/50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Notifications */}
      {usedFallback && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          <Info className="h-4 w-4 flex-shrink-0" />
          <span>{t('usedFallback')} 🦊</span>
        </div>
      )}

      {mock && process.env.NODE_ENV !== 'production' && (
        <Badge variant="outline" className="text-xs">Mock Response</Badge>
      )}

      {/* Image(s) */}
      {imageUrls.length === 1 ? (
        <motion.div
          initial={{ filter: 'blur(20px)', opacity: 0 }}
          animate={{ filter: 'blur(0px)', opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <div className="rounded-lg overflow-hidden border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrls[0]}
              alt={tCreator("generatedImageAlt")}
              className="w-full h-auto"
            />
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {imageUrls.map((url, i) => (
            <motion.div
              key={i}
              initial={{ filter: 'blur(20px)', opacity: 0 }}
              animate={{ filter: 'blur(0px)', opacity: 1 }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.1 }}
            >
              <div className="relative group rounded-lg overflow-hidden border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={tCreator("generatedImageAltNumbered", { number: i + 1 })}
                  className="w-full h-auto"
                />
                <button
                  type="button"
                  onClick={() => handleDownload(url, i)}
                  aria-label={t('download')}
                  className="absolute top-2 end-2 rounded-full bg-black/50 p-2.5 text-white opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={handleDownloadAll} className="gap-2">
          <Download className="h-4 w-4" />
          {imageUrls.length > 1 ? t('downloadAll') : t('download')}
        </Button>
        <Button variant="outline" onClick={onRegenerate} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          {t('regenerate')}
        </Button>
        <Button variant="ghost" asChild className="gap-2">
          <Link
            href={`/edit?src=${encodeURIComponent(imageUrls[0])}`}
            aria-label={tCreator('editImage')}
            title={tCreator('editImage')}
          >
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
