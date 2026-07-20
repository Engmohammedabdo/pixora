'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GenerationProgress } from '@/components/shared/GenerationProgress';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { useCredits } from '@/hooks/useCredits';
import { useUser } from '@/hooks/useUser';
import { getGatedUpgradeVariant, type StudioError } from '@/lib/studio-errors';
import { downloadFile, downloadFiles } from '@/lib/download';
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
  error: StudioError | null;
  onDismissError: () => void;
  expectedCount: number;
}

export function PhotoshootPreview({
  shots,
  isLoading,
  error,
  onDismissError,
}: PhotoshootPreviewProps): React.ReactElement {
  const t = useTranslations('studio');
  const tShoot = useTranslations('photoshoot');
  const { balance, status: creditsStatus } = useCredits();
  const { profile } = useUser();
  const planId = profile?.plan_id ?? 'free';
  const upgradeVariant = getGatedUpgradeVariant(error, creditsStatus);

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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
        <AlertTriangle className="h-12 w-12 text-[var(--color-error)]" />
        <p className="text-sm text-[var(--color-error)]">{error.message}</p>
      </div>
    );
  }

  if (shots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-12 text-[var(--color-text-muted)]">
        <div className="h-48 w-48 rounded-lg border-2 border-dashed border-[var(--color-border)] flex items-center justify-center">
          <span className="text-4xl">📸</span>
        </div>
        <p className="text-sm mt-4">{tShoot('emptyState')}</p>
      </div>
    );
  }

  const handleDownloadAll = (): void => {
    void downloadFiles(
      shots
        .filter((shot) => shot.url)
        .map((shot, i) => ({ url: shot.url as string, filename: `pyrasuite-photoshoot-${i + 1}.png` }))
    );
  };

  return (
    <div className="space-y-4">
      {shots.some((s) => s.mock) && process.env.NODE_ENV !== 'production' && (
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
                <div className="absolute inset-0 bg-black/0 lg:group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    aria-label={tShoot('downloadShot', { number: shot.index + 1 })}
                    onClick={() => void downloadFile(shot.url as string, `photoshoot-${shot.index + 1}.png`)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="w-full aspect-square bg-surface-2 flex items-center justify-center text-sm text-[var(--color-text-muted)]">
                {t('failed')}
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
