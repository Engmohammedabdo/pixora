'use client';

import { useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { CreatorForm } from '@/components/studios/creator/CreatorForm';
import { CreatorPreview } from '@/components/studios/creator/CreatorPreview';
import { GenerationHistory, type HistoryItem } from '@/components/shared/GenerationHistory';
import { useCreditsStore } from '@/store/credits';
import { toStudioError, type StudioError } from '@/lib/studio-errors';
import type { AIModel, Resolution } from '@/types/studios';

interface CreatorInput {
  prompt: string;
  model: AIModel;
  resolution: Resolution;
  style: string;
  variations: 1 | 4;
  brandKitId?: string;
  projectId?: string;
  referenceImageUrl?: string;
}

function CreatorPageContent(): React.ReactElement {
  const t = useTranslations('creator');
  const tStudio = useTranslations('studio');
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get('prompt') ?? undefined;

  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<StudioError | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const [originalModel, setOriginalModel] = useState<string | undefined>();
  const [mock, setMock] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [lastInput, setLastInput] = useState<CreatorInput | null>(null);

  const setBalance = useCreditsStore((s) => s.setBalance);

  const handleGenerate = useCallback(async (input: CreatorInput): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setUsedFallback(false);
    setLastInput(input);

    try {
      const response = await fetch('/api/studios/creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(toStudioError(data.error, tStudio, typeof data.required === 'number' ? data.required : undefined));
        return;
      }

      const urls: string[] = data.data.imageUrls;
      setImageUrls(urls);
      setMock(data.data.mock);
      setUsedFallback(data.data.usedFallback);
      setOriginalModel(data.data.originalModel);

      if (data.data.newBalance !== undefined) {
        setBalance(data.data.newBalance);
      }

      // Add to history
      setHistory((prev) => [
        {
          id: data.data.generationId,
          imageUrl: urls[0] || '',
          studio: 'creator',
          createdAt: new Date().toISOString(),
          creditsUsed: data.data.creditsUsed,
        },
        ...prev,
      ].slice(0, 5));
    } catch {
      setError(toStudioError('network', tStudio));
    } finally {
      setIsLoading(false);
    }
  }, [setBalance, tStudio]);

  const handleRegenerate = (): void => {
    if (lastInput) {
      handleGenerate(lastInput);
    }
  };

  const handleHistorySelect = (item: HistoryItem): void => {
    if (item.imageUrl) {
      setImageUrls([item.imageUrl]);
    }
  };

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="px-6 py-4 border-b">
        <h1 className="text-xl font-bold font-cairo">{t('title')}</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">{t('description')}</p>
      </div>

      <StudioLayout
        inputPanel={<CreatorForm onSubmit={handleGenerate} isLoading={isLoading} initialPrompt={initialPrompt} />}
        previewPanel={
          <CreatorPreview
            imageUrls={imageUrls}
            isLoading={isLoading}
            error={error}
            onDismissError={() => setError(null)}
            usedFallback={usedFallback}
            originalModel={originalModel}
            mock={mock}
            onRegenerate={handleRegenerate}
          />
        }
        historyStrip={
          <GenerationHistory items={history} onSelect={handleHistorySelect} />
        }
      />
    </div>
  );
}

export default function CreatorPage(): React.ReactElement {
  return (
    <Suspense>
      <CreatorPageContent />
    </Suspense>
  );
}
