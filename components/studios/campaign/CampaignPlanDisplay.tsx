'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { useCredits } from '@/hooks/useCredits';
import { useUser } from '@/hooks/useUser';
import { getGatedUpgradeVariant, type StudioError } from '@/lib/studio-errors';
import NextImage from 'next/image';
import { Copy, Check, Download, Image as ImageIcon, AlertTriangle, FileText } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { downloadFile } from '@/lib/download';
import { generateCampaignPdf, openPdfInNewTab } from '@/lib/export/pdf';

export interface CampaignPost {
  scenario: string;
  caption: string;
  tov: string;
  schedule: string;
  hashtags: string;
  imageUrl?: string | null;
}

interface CampaignPlanDisplayProps {
  posts: CampaignPost[];
  isLoading: boolean;
  error: StudioError | null;
  onDismissError: () => void;
  mock: boolean;
  /** Set when images were requested and some did not arrive. The credits for them
   *  have already been returned; the customer was never told either fact. */
  imageFailure: { failed: number; refunded: number } | null;
}

export function CampaignPlanDisplay({
  posts,
  isLoading,
  error,
  onDismissError,
  mock,
  imageFailure,
}: CampaignPlanDisplayProps): React.ReactElement {
  const t = useTranslations('campaign');
  const tStudio = useTranslations('studio');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { balance, status: creditsStatus } = useCredits();
  const { profile } = useUser();
  const planId = profile?.plan_id ?? 'free';
  const upgradeVariant = getGatedUpgradeVariant(error, creditsStatus);

  // navigator.clipboard.writeText REJECTS on an insecure context, a denied
  // permission, or a backgrounded tab. Both handlers ignored the rejection, so Copy
  // did nothing and said nothing — in the studio whose entire deliverable is text
  // meant to be copied out.
  const handleCopy = async (text: string, index: number): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      toast.error(tStudio('copyFailed'));
    }
  };

  const handleCopyAll = async (): Promise<void> => {
    const allCaptions = posts.map((p, i) => `${i + 1}. ${p.caption}\n${p.hashtags}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(allCaptions);
      setCopiedIndex(-1);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      toast.error(tStudio('copyFailed'));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      </div>
    );
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

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-12 text-[var(--color-text-muted)]">
        <div className="h-48 w-48 rounded-lg border-2 border-dashed border-[var(--color-border)] flex items-center justify-center">
          <span className="text-4xl">📋</span>
        </div>
        <p className="text-sm mt-4">{t('emptyState')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Images were asked for and some did not arrive. Without this the screen
          showed empty tiles offering to "generate an image elsewhere" — no message,
          and no notice of the refund that HAD already happened. */}
      {imageFailure && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            {t('imagesFailed', { count: imageFailure.failed })}
            {imageFailure.refunded > 0 ? ` ${tStudio('creditsReturned', { credits: imageFailure.refunded })}` : ''}
          </span>
        </div>
      )}

      {/* Top Actions */}
      <div className="flex gap-2 flex-wrap">
        {mock && process.env.NODE_ENV !== 'production' && (
          <Badge variant="outline" className="text-xs">Mock Response</Badge>
        )}
        <Button size="sm" variant="outline" onClick={handleCopyAll} className="gap-1">
          {copiedIndex === -1 ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copiedIndex === -1 ? tStudio('copied') : t('copyAll')}
        </Button>
        {/* A blocked popup used to be silent on the 12-credit studio — the
            button did nothing at all, which in an in-app webview
            (Instagram/WhatsApp) is the common case here, not the exotic one. */}
        <Button size="sm" variant="outline" onClick={() => { if (!openPdfInNewTab(generateCampaignPdf(posts))) toast.error(tStudio('popupBlocked')); }} className="gap-1">
          <FileText className="h-3 w-3" />
          {t('exportPdf')}
        </Button>
      </div>

      {/* Posts Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.map((post, index) => (
          <Card key={index} className="overflow-hidden">
            {/* Image */}
            {post.imageUrl ? (
              <div className="relative w-full h-32">
                <NextImage src={post.imageUrl} alt="" fill className="object-cover" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" unoptimized />
              </div>
            ) : (
              <div className="w-full h-32 bg-surface-2 flex items-center justify-center">
                <Link
                  href={`/creator?prompt=${encodeURIComponent(post.scenario)}`}
                  className="flex items-center gap-1 text-xs text-[var(--color-link)] hover:underline"
                >
                  <ImageIcon className="h-4 w-4" />
                  {t('generateImage')}
                </Link>
              </div>
            )}

            <CardHeader className="pb-2 px-4 pt-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  {t('post')} {index + 1}
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {post.schedule}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="px-4 pb-4 space-y-2">
              {/* Hook */}
              <p className="text-xs font-semibold text-[var(--color-brand)]">{post.tov}</p>

              {/* Caption */}
              <p className="text-xs leading-relaxed">{post.caption}</p>

              {/* Hashtags */}
              <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
                {post.hashtags}
              </p>

              {/* Actions */}
              <div className="flex gap-1 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => handleCopy(`${post.caption}\n\n${post.hashtags}`, index)}
                >
                  {copiedIndex === index ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedIndex === index ? tStudio('copied') : tStudio('copyCaption')}
                </Button>
                {post.imageUrl && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    aria-label={t('downloadImage')}
                    onClick={() => void downloadFile(post.imageUrl as string, `pyrasuite-campaign-post-${index + 1}.png`)}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
