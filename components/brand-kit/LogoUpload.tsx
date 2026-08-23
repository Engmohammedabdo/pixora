'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import Image from 'next/image';
import { Upload, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
  /**
   * Reported so the form can refuse to submit mid-upload. Without it the user
   * can pick a logo and hit Save before the bytes land: `onChange` has not run
   * yet, so the kit is written with the OLD logo (usually none) and the file
   * they just chose is silently discarded.
   */
  onUploadingChange?: (uploading: boolean) => void;
}

/**
 * Types POST /api/upload actually accepts. The picker used to advertise SVG,
 * which that route rejects outright — and its MIME→extension map has no entry
 * for it either, so an accepted one would have landed as `.bin`.
 */
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB — the limit /api/upload enforces

export function LogoUpload({ value, onChange, onUploadingChange }: LogoUploadProps): React.ReactElement {
  const t = useTranslations('brandKit');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  // Shown while the bytes are in flight. This is the ONLY place an object URL
  // is allowed to live: the previous version passed it to `onChange`, so it was
  // persisted as `brand_kits.logo_url` and died with the page that made it —
  // every logo in the live database was a pointer to nothing.
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  const setBusy = (busy: boolean): void => {
    setUploading(busy);
    onUploadingChange?.(busy);
  };

  const releasePreview = (): void => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
  };
  useEffect(() => releasePreview, []);

  const handleFile = async (file: File): Promise<void> => {
    setError('');

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t('logoTypeError'));
      return;
    }
    if (file.size > MAX_SIZE) {
      setError(t('logoSizeError'));
      return;
    }

    releasePreview();
    const localPreview = URL.createObjectURL(file);
    previewRef.current = localPreview;
    setPreview(localPreview);
    setBusy(true);

    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body });
      const json = (await res.json()) as { success: boolean; data?: { url: string } };

      if (!res.ok || !json.success || !json.data?.url) {
        setError(t('logoUploadError'));
        return;
      }
      onChange(json.data.url);
    } catch {
      setError(t('logoUploadError'));
    } finally {
      setBusy(false);
      releasePreview();
      setPreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    setDragging(false);
    if (uploading) return;
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const shown = preview ?? value;

  return (
    <div className="space-y-2">
      <Label>{t('logo')}</Label>
      {shown ? (
        <div className="relative inline-block">
          <Image
            src={shown}
            alt={t('logo')}
            width={80}
            height={80}
            className={cn(
              'h-20 w-20 rounded-lg object-contain border p-2 transition-opacity',
              uploading && 'opacity-40'
            )}
            unoptimized
          />
          {uploading ? (
            <span className="absolute inset-0 flex items-center justify-center" aria-live="polite">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-text-muted)]" />
              <span className="sr-only">{t('logoUploading')}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="absolute -top-2 -end-2 rounded-full bg-[var(--color-error)] p-1 text-white"
              aria-label={t('logoRemove')}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => { if (!uploading) inputRef.current?.click(); }}
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
            accept=".png,.jpg,.jpeg,.webp"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset first: picking the same file twice fires no change event
              // otherwise, so a retry after a failed upload would do nothing.
              e.target.value = '';
              if (file) void handleFile(file);
            }}
            className="hidden"
          />
        </div>
      )}
      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
    </div>
  );
}
