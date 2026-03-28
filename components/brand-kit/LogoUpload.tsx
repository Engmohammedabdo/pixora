'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function LogoUpload({ value, onChange }: LogoUploadProps): React.ReactElement {
  const t = useTranslations('brandKit');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File): void => {
    setError('');

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('PNG, JPG, SVG only');
      return;
    }

    if (file.size > MAX_SIZE) {
      setError('Max 10MB');
      return;
    }

    // Create object URL for preview (in production, upload to Supabase Storage)
    const url = URL.createObjectURL(file);
    onChange(url);
  };

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-2">
      <Label>{t('logo')}</Label>
      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Logo" className="h-20 w-20 rounded-lg object-contain border p-2" />
          <button
            onClick={() => onChange(null)}
            className="absolute -top-2 -end-2 rounded-full bg-[var(--color-error)] p-1 text-white"
            aria-label="Remove logo"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors',
            dragging ? 'border-primary-500 bg-primary-50' : 'border-[var(--color-border)] hover:border-primary-300'
          )}
        >
          <Upload className="h-6 w-6 text-[var(--color-text-muted)]" />
          <span className="text-sm text-[var(--color-text-muted)]">{t('uploadLogo')}</span>
          <input
            ref={inputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.svg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="hidden"
          />
        </div>
      )}
      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
    </div>
  );
}
