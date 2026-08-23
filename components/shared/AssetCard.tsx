'use client';

import React from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { Download, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { downloadFile } from '@/lib/download';
import { toast } from 'sonner';

interface AssetCardProps {
  id: string;
  url: string;
  type: string;
  /** `assets.format` — absent on rows written before the column was populated. */
  format?: string | null;
  studio?: string;
  createdAt: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const DATA_URL_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  // Not a registered type, but providers emit it and it means the same thing.
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
};

/**
 * Older rows predate `assets.format` being written at all, so the URL is the
 * only evidence left of what the bytes are. A data: URL carries no extension
 * but does carry its mime, and 13 of the 25 live rows are data: URLs — calling
 * all of them png is exactly how JPEG bytes ended up inside .png files before.
 */
function extensionFromUrl(url: string, fallback: string): string {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    const mime = url.slice(5, comma === -1 ? undefined : comma).split(';')[0].trim().toLowerCase();
    return DATA_URL_EXTENSIONS[mime] ?? fallback;
  }
  // A signed storage URL ends in `?token=…`, so the extension stops at the query.
  const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  return match ? match[1] : fallback;
}

/**
 * The name a saved asset lands on disk with — shared by the per-card download
 * and the bulk one on the assets page so the two can never disagree.
 *
 * `formatFromUrl()` in lib/storage/persist-image.ts answers the same question
 * server-side, but that module reaches sharp through the watermark helper and
 * cannot be pulled into a client bundle; hence the rule restated here, once.
 *
 * `assets.format` is customer-writable — migration 040 constrains `assets.url`
 * and nothing constrains `format` — so a directly-PATCHed `../../evil` would
 * otherwise reach the save dialog. Allowlist the characters an extension may
 * contain, the way app/api/assets/export/route.ts does for ZIP entry names.
 */
export function assetFileName(asset: {
  id: string;
  url: string;
  type: string;
  format?: string | null;
}): string {
  const fallback = asset.type === 'audio' ? 'mp3' : 'png';
  const claimed = asset.format || extensionFromUrl(asset.url, fallback);
  const ext = claimed.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toLowerCase() || fallback;
  return `pyrasuite-${asset.id}.${ext}`;
}

const AssetCardInner = function AssetCard({
  id,
  url,
  type,
  // `format` is taken locally by useFormatter() below; alias rather than rename
  // the prop, which mirrors the `assets.format` column it carries.
  format: fileFormat,
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

  // NOT an `<a href={url} download>`: the href is a signed URL on the storage
  // host, and browsers honour `download` only same-origin (or on blob:/data:).
  // Cross-origin they drop the attribute and NAVIGATE — the customer leaves the
  // app instead of saving their file. lib/download.ts exists for exactly this
  // and every other studio already routes through it; the library, the one page
  // whose whole purpose is retrieving finished work, was the last raw anchor.
  const handleDownload = async (e: React.MouseEvent<HTMLButtonElement>): Promise<void> => {
    e.stopPropagation();
    try {
      await downloadFile(url, assetFileName({ id, url, type, format: fileFormat }));
    } catch {
      toast.error(t('downloadFailed'));
    }
  };

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
          <Button
            size="icon"
            variant="secondary"
            aria-label={t('downloadAsset')}
            className="h-9 w-9 lg:h-7 lg:w-7"
            onClick={(e) => { void handleDownload(e); }}
          >
            <Download className="h-3 w-3" />
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
