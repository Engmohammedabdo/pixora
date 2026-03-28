'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { PhotoshootForm } from '@/components/studios/photoshoot/PhotoshootForm';
import { PhotoshootPreview, type PhotoshootShot } from '@/components/studios/photoshoot/PhotoshootPreview';
import { useCreditsStore } from '@/store/credits';

interface PhotoshootInput {
  productImageUrl: string;
  environment: string;
  shots: 1 | 3 | 6;
  notes?: string;
}

export default function PhotoshootPage(): React.ReactElement {
  const t = useTranslations('photoshoot');

  const [shots, setShots] = useState<PhotoshootShot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expectedCount, setExpectedCount] = useState(6);

  const setBalance = useCreditsStore((s) => s.setBalance);

  const handleGenerate = useCallback(async (input: PhotoshootInput): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setShots([]);
    setExpectedCount(input.shots);

    try {
      const response = await fetch('/api/studios/photoshoot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Generation failed');
        return;
      }

      setShots(data.data.shots);

      if (data.data.newBalance !== undefined) {
        setBalance(data.data.newBalance);
      }
    } catch {
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  }, [setBalance]);

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <div className="px-6 py-4 border-b">
        <h1 className="text-xl font-bold font-cairo">{t('title')}</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">{t('description')}</p>
      </div>

      <StudioLayout
        inputPanel={<PhotoshootForm onSubmit={handleGenerate} isLoading={isLoading} />}
        previewPanel={
          <PhotoshootPreview
            shots={shots}
            isLoading={isLoading}
            error={error}
            expectedCount={expectedCount}
          />
        }
      />
    </div>
  );
}
