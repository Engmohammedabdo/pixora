'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import { Download, AlertTriangle } from 'lucide-react';

export interface PhotoshootShot {
  index: number;
  url: string | null;
  model: string;
  mock: boolean;
}

interface PhotoshootPreviewProps {
  shots: PhotoshootShot[];
  isLoading: boolean;
  error: string | null;
  expectedCount: number;
}

export function PhotoshootPreview({
  shots,
  isLoading,
  error,
  expectedCount,
}: PhotoshootPreviewProps): React.ReactElement {
  const t = useTranslations('studio');

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 py-6">
        {Array.from({ length: expectedCount }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
        <AlertTriangle className="h-12 w-12 text-[var(--color-error)]" />
        <p className="text-sm text-[var(--color-error)]">{error}</p>
      </div>
    );
  }

  if (shots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-12 text-[var(--color-text-muted)]">
        <div className="h-48 w-48 rounded-lg border-2 border-dashed border-[var(--color-border)] flex items-center justify-center">
          <span className="text-4xl">📸</span>
        </div>
        <p className="text-sm mt-4">الصور ستظهر هنا</p>
      </div>
    );
  }

  const handleDownloadAll = (): void => {
    shots.forEach((shot, i) => {
      if (shot.url) {
        const link = document.createElement('a');
        link.href = shot.url;
        link.download = `pyrasuite-photoshoot-${i + 1}.png`;
        link.click();
      }
    });
  };

  return (
    <div className="space-y-4">
      {shots.some((s) => s.mock) && (
        <Badge variant="outline" className="text-xs">Mock Response</Badge>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button size="sm" onClick={handleDownloadAll} className="gap-1">
          <Download className="h-3 w-3" />
          {t('downloadAll')}
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {shots.map((shot) => (
          <div key={shot.index} className="relative group rounded-lg overflow-hidden border">
            {shot.url ? (
              <>
                <div className="relative w-full aspect-square">
                  <Image src={shot.url} alt={`Shot ${shot.index + 1}`} fill className="object-cover" sizes="(max-width: 768px) 50vw, 33vw" unoptimized />
                </div>
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <a
                    href={shot.url}
                    download={`photoshoot-${shot.index + 1}.png`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Button size="sm" variant="secondary" className="gap-1">
                      <Download className="h-3 w-3" />
                    </Button>
                  </a>
                </div>
              </>
            ) : (
              <div className="w-full aspect-square bg-surface-2 flex items-center justify-center text-sm text-[var(--color-text-muted)]">
                Failed
              </div>
            )}
            <Badge variant="secondary" className="absolute top-2 start-2 text-[10px]">
              #{shot.index + 1}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
