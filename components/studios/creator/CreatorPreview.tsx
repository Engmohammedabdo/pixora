'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GenerationProgress } from '@/components/shared/GenerationProgress';
import { downloadFile, downloadFiles } from '@/lib/download';
import { Download, RefreshCw, AlertTriangle, Pencil, Info } from 'lucide-react';
import { Link } from '@/i18n/routing';

interface CreatorPreviewProps {
  imageUrls: string[];
  isLoading: boolean;
  error: string | null;
  usedFallback: boolean;
  originalModel?: string;
  mock: boolean;
  onRegenerate: () => void;
}

export function CreatorPreview({
  imageUrls,
  isLoading,
  error,
  usedFallback,
  originalModel,
  mock,
  onRegenerate,
}: CreatorPreviewProps): React.ReactElement {
  const t = useTranslations('studio');
  const tCreator = useTranslations('creator');
  const [hasConfettied, setHasConfettied] = useState(false);

  useEffect(() => {
    if (imageUrls.length > 0 && !hasConfettied) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      setHasConfettied(true);
    }
  }, [imageUrls, hasConfettied]);

  if (isLoading) {
    return <GenerationProgress isLoading />;
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

  const handleDownload = (url: string, index: number): void => {
    void downloadFile(url, `pyrasuite-${Date.now()}-${index}.png`);
  };

  const handleDownloadAll = (): void => {
    const stamp = Date.now();
    void downloadFiles(imageUrls.map((url, i) => ({ url, filename: `pyrasuite-${stamp}-${i}.png` })));
  };

  return (
    <div className="space-y-4">
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
              alt="Generated image"
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
                  alt={`Generated image ${i + 1}`}
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
      <div className="flex gap-2">
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
