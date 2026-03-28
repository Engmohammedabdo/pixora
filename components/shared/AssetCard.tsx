'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

export function AssetCard({
  id,
  url,
  type,
  studio,
  createdAt,
  selected,
  onSelect,
  onDelete,
}: AssetCardProps): React.ReactElement {
  const date = new Date(createdAt).toLocaleDateString('ar-SA', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className={cn(
        'group relative rounded-lg border overflow-hidden cursor-pointer transition-all',
        selected && 'ring-2 ring-primary-500'
      )}
      onClick={() => onSelect(id)}
    >
      {/* Image */}
      {type === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-square bg-surface-2 flex items-center justify-center text-2xl">
          {type === 'video' ? '🎥' : '🎙️'}
        </div>
      )}

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors">
        <div className="absolute top-2 end-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <a href={url} download onClick={(e) => e.stopPropagation()}>
            <Button size="icon" variant="secondary" className="h-7 w-7">
              <Download className="h-3 w-3" />
            </Button>
          </a>
          <Button
            size="icon"
            variant="secondary"
            className="h-7 w-7 text-[var(--color-error)]"
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

      {/* Selection checkbox */}
      <div className={cn(
        'absolute top-2 start-2 h-5 w-5 rounded border-2 transition-all flex items-center justify-center',
        selected ? 'bg-primary-500 border-primary-500' : 'border-white/70 group-hover:border-white'
      )}>
        {selected && <span className="text-white text-xs">✓</span>}
      </div>
    </div>
  );
}
