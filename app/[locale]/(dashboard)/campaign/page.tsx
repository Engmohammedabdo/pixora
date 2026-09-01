'use client';

import { useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { CampaignForm } from '@/components/studios/campaign/CampaignForm';
import { CampaignPlanDisplay, type CampaignPost } from '@/components/studios/campaign/CampaignPlanDisplay';
import { RecentWork } from '@/components/shared/RecentWork';
import { useCreditsStore } from '@/store/credits';
import { toStudioError, type StudioError } from '@/lib/studio-errors';

interface CampaignInput {
  productDescription: string;
  targetAudience: string;
  dialect: string;
  platform: string;
  occasion?: string;
  brandKitId?: string;
  /** The Apply-Brand-Kit toggle. Sent explicitly, because an absent
   *  `brandKitId` means "I did not choose" and the server answers that with
   *  the project's kit or the account default — see
   *  lib/brand-kits/working-identity.ts. "Not this time" needs its own word. */
  useBrandKit?: boolean;
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
  const [imageFailure, setImageFailure] = useState<{ failed: number; refunded: number } | null>(null);
  // Bumped once per successful run so RecentWork refetches and the run that just
  // finished appears in the list.
  const [runs, setRuns] = useState(0);

  const setBalance = useCreditsStore((s) => s.setBalance);

  const handleGenerate = useCallback(async (input: CampaignInput): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setPosts([]);
    setImageFailure(null);

    try {
      const response = await fetch('/api/studios/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(toStudioError(data.error, tStudio, typeof data.required === 'number' ? data.required : undefined, typeof data.term === 'string' ? data.term : undefined));
        return;
      }

      setPosts(data.data.posts);
      setMock(data.data.mock);
      // Every image failing is a real outcome with a real refund, not a silent one.
      setImageFailure(
        data.data.imagesRequested && data.data.failedImageCount > 0
          ? { failed: data.data.failedImageCount, refunded: data.data.refunded ?? 0 }
          : null
      );

      setRuns((n) => n + 1);

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
        isGenerating={isLoading}
        inputPanel={
          <div className="space-y-4">
            <CampaignForm onSubmit={handleGenerate} isLoading={isLoading} initialDescription={initialDescription} />
            {/*
              A campaign's nine captions, hooks, hashtag sets and schedules live
              only in `generations.output`. With "Generate All Images" unchecked
              the route writes ZERO asset rows, so before this panel a reload
              destroyed 3 credits of strategy with no warning and no way back —
              the same defect that was fixed for plan, analysis and storyboard.
            */}
            <RecentWork
              studio="campaign"
              onRestore={(output) => {
                setPosts(Array.isArray(output.posts) ? (output.posts as CampaignPost[]) : []);
                setMock(output.mock === true);
                setError(null);
              }}
              refreshKey={runs}
            />
          </div>
        }
        previewPanel={
          <CampaignPlanDisplay
            posts={posts}
            isLoading={isLoading}
            error={error}
            onDismissError={() => setError(null)}
            mock={mock}
            imageFailure={imageFailure}
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
