'use client';

import { useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { CampaignForm } from '@/components/studios/campaign/CampaignForm';
import { CampaignPlanDisplay, type CampaignPost } from '@/components/studios/campaign/CampaignPlanDisplay';
import { useCreditsStore } from '@/store/credits';
import { toStudioError, type StudioError } from '@/lib/studio-errors';

interface CampaignInput {
  productDescription: string;
  targetAudience: string;
  dialect: string;
  platform: string;
  occasion?: string;
  brandKitId?: string;
  generateImages: boolean;
  projectId?: string;
}

function CampaignPageContent(): React.ReactElement {
  const t = useTranslations('campaign');
  const tStudio = useTranslations('studio');
  const searchParams = useSearchParams();
  const initialDescription = searchParams.get('prompt') ?? undefined;

  const [posts, setPosts] = useState<CampaignPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<StudioError | null>(null);
  const [mock, setMock] = useState(false);

  const setBalance = useCreditsStore((s) => s.setBalance);

  const handleGenerate = useCallback(async (input: CampaignInput): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setPosts([]);

    try {
      const response = await fetch('/api/studios/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(toStudioError(data.error, tStudio, typeof data.required === 'number' ? data.required : undefined));
        return;
      }

      setPosts(data.data.posts);
      setMock(data.data.mock);

      if (data.data.newBalance !== undefined) {
        setBalance(data.data.newBalance);
      }
    } catch {
      setError(toStudioError('network', tStudio));
    } finally {
      setIsLoading(false);
    }
  }, [setBalance, tStudio]);

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="px-6 py-4 border-b">
        <h1 className="text-xl font-bold font-cairo">{t('title')}</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">{t('description')}</p>
      </div>

      <StudioLayout
        inputPanel={<CampaignForm onSubmit={handleGenerate} isLoading={isLoading} initialDescription={initialDescription} />}
        previewPanel={
          <CampaignPlanDisplay
            posts={posts}
            isLoading={isLoading}
            error={error}
            onDismissError={() => setError(null)}
            mock={mock}
          />
        }
      />
    </div>
  );
}

export default function CampaignPage(): React.ReactElement {
  return (
    <Suspense>
      <CampaignPageContent />
    </Suspense>
  );
}
