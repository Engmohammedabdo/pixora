'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import NextImage from 'next/image';
import { Copy, Check, Download, Image, AlertTriangle, FileText } from 'lucide-react';
import { Link } from '@/i18n/routing';
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
  error: string | null;
  mock: boolean;
}

export function CampaignPlanDisplay({
  posts,
  isLoading,
  error,
  mock,
}: CampaignPlanDisplayProps): React.ReactElement {
  const t = useTranslations('campaign');
  const tStudio = useTranslations('studio');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = async (text: string, index: number): Promise<void> => {
    await navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyAll = async (): Promise<void> => {
    const allCaptions = posts.map((p, i) => `${i + 1}. ${p.caption}\n${p.hashtags}`).join('\n\n');
    await navigator.clipboard.writeText(allCaptions);
    setCopiedIndex(-1);
    setTimeout(() => setCopiedIndex(null), 2000);
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
        <AlertTriangle className="h-12 w-12 text-[var(--color-error)]" />
        <p className="text-sm text-[var(--color-error)]">{error}</p>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-12 text-[var(--color-text-muted)]">
        <div className="h-48 w-48 rounded-lg border-2 border-dashed border-[var(--color-border)] flex items-center justify-center">
          <span className="text-4xl">📋</span>
        </div>
        <p className="text-sm mt-4">الحملة ستظهر هنا</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Actions */}
      <div className="flex gap-2 flex-wrap">
        {mock && <Badge variant="outline" className="text-xs">Mock Response</Badge>}
        <Button size="sm" variant="outline" onClick={handleCopyAll} className="gap-1">
          {copiedIndex === -1 ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copiedIndex === -1 ? tStudio('copied') : t('copyAll')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => openPdfInNewTab(generateCampaignPdf(posts))} className="gap-1">
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
                  className="flex items-center gap-1 text-xs text-primary-500 hover:underline"
                >
                  <Image className="h-4 w-4" />
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
              <p className="text-xs font-semibold text-primary-600">{post.tov}</p>

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
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild>
                    <a href={post.imageUrl} download>
                      <Download className="h-3 w-3" />
                    </a>
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
