'use client';
import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';

interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  className?: string;
}

export function BeforeAfterSlider({ beforeUrl, afterUrl, className }: BeforeAfterSliderProps): React.ReactElement {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number): void => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // RTL: invert direction
    const x = rect.right - clientX;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPosition(pct);
  };

  return (
    <div ref={containerRef} className={cn('relative overflow-hidden rounded-lg border cursor-col-resize select-none', className)}
      onMouseMove={(e) => { if (e.buttons === 1) handleMove(e.clientX); }}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}>
      {/* After (full) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={afterUrl} alt="After" className="w-full h-auto" />
      {/* Before (clipped) */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={beforeUrl} alt="Before" className="w-full h-auto" style={{ width: `${containerRef.current?.offsetWidth || 0}px` }} />
      </div>
      {/* Divider */}
      <div className="absolute top-0 bottom-0" style={{ right: `${position}%` }}>
        <div className="w-1 h-full bg-white shadow-lg" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
          <span className="text-xs font-bold">&harr;</span>
        </div>
      </div>
      {/* Labels */}
      <div className="absolute top-2 start-2"><span className="text-[10px] bg-black/50 text-white px-2 py-0.5 rounded">بعد</span></div>
      <div className="absolute top-2 end-2"><span className="text-[10px] bg-black/50 text-white px-2 py-0.5 rounded">قبل</span></div>
    </div>
  );
}
