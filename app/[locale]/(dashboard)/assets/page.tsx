'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { AssetCard } from '@/components/shared/AssetCard';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Download, Trash2, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface Asset {
  id: string;
  url: string;
  type: string;
  created_at: string;
  generation_id?: string | null;
}

const STUDIOS = ['all', 'creator', 'photoshoot', 'campaign', 'plan', 'storyboard', 'analysis', 'voiceover', 'edit'] as const;
const STUDIO_LABELS: Record<string, string> = {
  all: 'الكل',
  creator: 'منشئ الصور',
  photoshoot: 'تصوير',
  campaign: 'حملات',
  plan: 'خطط',
  storyboard: 'ستوري بورد',
  analysis: 'تحليل',
  voiceover: 'صوت',
  edit: 'تعديل',
};

export default function AssetsPage(): React.ReactElement {
  const t = useTranslations('assets');

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [studioFilter, setStudioFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchAssets = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '48' });
      if (studioFilter !== 'all') params.set('studio', studioFilter);

      const res = await fetch(`/api/assets?${params}`);
      const data = await res.json();

      if (data.success) {
        setAssets(data.data || []);
      } else if (data.error === 'unauthorized') {
        // Not logged in — don't show error toast
      } else {
        // API returned error
        console.error('Assets API error:', data.error);
      }
    } catch {
      toast.error('فشل تحميل الملفات. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [studioFilter]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleSelect = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (): void => {
    if (selectedIds.size === assets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(assets.map((a) => a.id)));
    }
  };

  const handleDeleteSelected = async (): Promise<void> => {
    try {
      const res = await fetch('/api/assets/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`تم حذف ${selectedIds.size} ملف`);
        setSelectedIds(new Set());
        fetchAssets();
      } else {
        toast.error('فشل الحذف');
      }
    } catch {
      toast.error('حدث خطأ في الحذف');
    }
  };

  const handleDownloadSelected = (): void => {
    const selected = assets.filter((a) => selectedIds.has(a.id));
    selected.forEach((asset) => {
      const link = document.createElement('a');
      link.href = asset.url;
      link.download = `pyrasuite-${asset.id}.png`;
      link.click();
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-cairo">{t('title')}</h1>

        {selectedIds.size > 0 && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleDownloadSelected} className="gap-1">
              <Download className="h-3 w-3" />
              {t('downloadSelected')} ({selectedIds.size})
            </Button>
            <Button size="sm" variant="outline" onClick={handleDeleteSelected} className="gap-1 text-[var(--color-error)]">
              <Trash2 className="h-3 w-3" />
              {t('deleteSelected')}
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {STUDIOS.map((s) => (
          <button
            key={s}
            onClick={() => { setStudioFilter(s); setSelectedIds(new Set()); }}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm transition-colors',
              studioFilter === s
                ? 'bg-primary-500 text-white'
                : 'bg-surface-2 text-[var(--color-text-secondary)] hover:bg-surface-2/80'
            )}
          >
            {STUDIO_LABELS[s] || s}
          </button>
        ))}

        {assets.length > 0 && (
          <button
            onClick={handleSelectAll}
            className="ms-auto text-xs text-primary-500 hover:underline"
          >
            {t('selectAll')}
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-[var(--color-text-muted)]">
          <ImageIcon className="h-16 w-16 mb-4" />
          <h3 className="text-lg font-medium mb-1">{t('empty')}</h3>
          <p className="text-sm">{t('emptyDescription')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {assets.map((asset) => (
            <AssetCard
              key={asset.id}
              id={asset.id}
              url={asset.url}
              type={asset.type}
              studio={undefined}
              createdAt={asset.created_at}
              selected={selectedIds.has(asset.id)}
              onSelect={handleSelect}
              onDelete={(id) => {
                fetch(`/api/assets/${id}`, { method: 'DELETE' }).then(() => fetchAssets());
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
