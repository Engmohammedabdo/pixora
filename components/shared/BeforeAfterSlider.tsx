'use client';
import { useState, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
}

export function BeforeAfterSlider({ beforeUrl, afterUrl, className }: BeforeAfterSliderProps): React.ReactElement {
  const t = useTranslations('shared.beforeAfter');
  const locale = useLocale();
  const isRtl = locale === 'ar';
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  // position = % distance from the inline-start edge (right in RTL, left in LTR)
  const handleMove = (clientX: number): void => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = isRtl ? rect.right - clientX : clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPosition(pct);
  };

  return (
    <div ref={containerRef} className={cn('relative overflow-hidden rounded-lg border cursor-col-resize select-none', className)}
      onMouseMove={(e) => { if (e.buttons === 1) handleMove(e.clientX); }}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}>
      {/* After (full) */}
      <Image src={afterUrl} alt={t('after')} width={1024} height={1024} className="w-full h-auto" unoptimized />
      {/* Before (clipped, anchored to the inline-start edge in both directions) */}
      <div className="absolute top-0 bottom-0 overflow-hidden" style={{ insetInlineStart: 0, width: `${position}%` }}>
        <Image src={beforeUrl} alt={t('before')} width={1024} height={1024} className="h-auto max-w-none" style={{ width: `${containerRef.current?.offsetWidth || 0}px` }} unoptimized />
      </div>
      {/* Divider (tracks the clip boundary in both directions) */}
      <div className="absolute top-0 bottom-0" style={{ insetInlineStart: `${position}%` }}>
        <div className="w-1 h-full bg-white shadow-lg" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
          <span className="text-xs font-bold">&harr;</span>
        </div>
      </div>
      {/* Labels: the clipped "before" layer sits on the inline-start side */}
      <div className="absolute top-2 start-2"><span className="text-[10px] bg-black/50 text-white px-2 py-0.5 rounded">{t('before')}</span></div>
      <div className="absolute top-2 end-2"><span className="text-[10px] bg-black/50 text-white px-2 py-0.5 rounded">{t('after')}</span></div>
    </div>
  );
}
