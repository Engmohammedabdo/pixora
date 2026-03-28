'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { CreatorForm } from '@/components/studios/creator/CreatorForm';
import { CreatorPreview } from '@/components/studios/creator/CreatorPreview';
import { GenerationHistory, type HistoryItem } from '@/components/shared/GenerationHistory';
import { useCreditsStore } from '@/store/credits';
import type { AIModel, Resolution } from '@/types/studios';

interface CreatorInput {
  prompt: string;
  model: AIModel;
  resolution: Resolution;
  style: string;
  brandKitId?: string;
  referenceImageUrl?: string;
}

export default function CreatorPage(): React.ReactElement {
  const t = useTranslations('creator');

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        setError(data.error || 'Generation failed');
        return;
      }

      setImageUrl(data.data.imageUrl);
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
          imageUrl: data.data.imageUrl,
          studio: 'creator',
          createdAt: new Date().toISOString(),
          creditsUsed: data.data.creditsUsed,
        },
        ...prev,
      ].slice(0, 5));
    } catch {
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  }, [setBalance]);

  const handleRegenerate = (): void => {
    if (lastInput) {
      handleGenerate(lastInput);
    }
  };

  const handleHistorySelect = (item: HistoryItem): void => {
    if (item.imageUrl) {
      setImageUrl(item.imageUrl);
    }
  };

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <div className="px-6 py-4 border-b">
        <h1 className="text-xl font-bold font-cairo">{t('title')}</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">{t('description')}</p>
      </div>

      <StudioLayout
        inputPanel={<CreatorForm onSubmit={handleGenerate} isLoading={isLoading} />}
        previewPanel={
          <CreatorPreview
            imageUrl={imageUrl}
            isLoading={isLoading}
            error={error}
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
