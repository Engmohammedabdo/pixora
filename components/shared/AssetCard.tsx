'use client';

import React from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { Download, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AssetCardProps {
  id: string;
  url: string;
  type: string;
  studio?: string;
  createdAt: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const AssetCardInner = function AssetCard({
  id,
  url,
  type,
  studio,
  createdAt,
  selected,
  onSelect,
  onDelete,
}: AssetCardProps): React.ReactElement {
  const t = useTranslations('assets');
  const format = useFormatter();
  const date = format.dateTime(new Date(createdAt), {
    month: 'short',
    day: 'numeric',
  });
  const assetLabel = studio ? `${t('assetAlt')} — ${studio} · ${date}` : `${t('assetAlt')} · ${date}`;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={assetLabel}
      className={cn(
        'group relative rounded-lg border overflow-hidden cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
        selected && 'ring-2 ring-primary-500'
      )}
      onClick={() => onSelect(id)}
      onKeyDown={handleKeyDown}
    >
      {/* Image */}
      {type === 'image' ? (
        <div className="relative w-full aspect-square">
          <Image src={url} alt={assetLabel} fill className="object-cover" sizes="(max-width: 768px) 50vw, 33vw" unoptimized />
        </div>
      ) : (
        <div className="w-full aspect-square bg-surface-2 flex items-center justify-center text-2xl">
          {type === 'video' ? '🎥' : '🎙️'}
        </div>
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors">
        {/* Actions: always visible on touch/small screens, hover/focus-revealed on desktop */}
        <div className="absolute top-2 end-2 flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100 transition-opacity">
          <Button asChild size="icon" variant="secondary" className="h-9 w-9 lg:h-7 lg:w-7">
            <a
              href={url}
              download
              aria-label={t('downloadAsset')}
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-3 w-3" />
            </a>
          </Button>
          <Button
            size="icon"
            variant="secondary"
            aria-label={t('deleteAsset')}
            className="h-9 w-9 lg:h-7 lg:w-7 text-[var(--color-error)]"
            onClick={(e) => { e.stopPropagation(); onDelete(id); }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
        <div className="flex items-center justify-between">
          {studio && <Badge variant="secondary" className="text-[9px] px-1.5">{studio}</Badge>}
          <span className="text-[10px] text-white/80">{date}</span>
        </div>
      </div>

      {/* Selection checkbox (visual only — selection state is on the card via aria-pressed) */}
      <div
        aria-hidden="true"
        className={cn(
          'absolute top-2 start-2 h-5 w-5 rounded border-2 transition-all flex items-center justify-center',
          selected ? 'bg-primary-500 border-primary-500' : 'border-white/70 group-hover:border-white'
        )}
      >
        {selected && <span className="text-white text-xs">✓</span>}
      </div>
    </div>
  );
}

export const AssetCard = React.memo(AssetCardInner);
