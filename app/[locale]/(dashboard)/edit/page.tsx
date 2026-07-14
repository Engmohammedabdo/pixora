'use client';

import { useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CreditCost } from '@/components/shared/CreditCost';
import { GenerationProgress } from '@/components/shared/GenerationProgress';
import { useCreditsStore } from '@/store/credits';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { selectedChipClasses, unselectedChipClasses } from '@/components/studios/selectable-chip';
import { cn } from '@/lib/utils';
import { mapApiError } from '@/lib/studio-errors';
import { downloadFile } from '@/lib/download';
import Image from 'next/image';
import { Sparkles, Upload, X, Download, AlertTriangle } from 'lucide-react';

const EDIT_TYPES = [
  { id: 'background_replace', key: 'background_replace', emoji: '🖼️' },
  { id: 'object_remove', key: 'object_remove', emoji: '🗑️' },
  { id: 'color_change', key: 'color_change', emoji: '🎨' },
  { id: 'text_add', key: 'text_add', emoji: '✍️' },
  { id: 'style_transfer', key: 'style_transfer', emoji: '🔄' },
] as const;

function EditPageContent(): React.ReactElement {
  const t = useTranslations();
  const tEdit = useTranslations('edit');
  const searchParams = useSearchParams();
  // Preload an image handed off from another studio (e.g. Creator's edit shortcut)
  const initialSrc = searchParams.get('src');
  const [originalImage, setOriginalImage] = useState<string | null>(initialSrc || null);
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState('background_replace');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const setBalance = useCreditsStore((s) => s.setBalance);

  const isValid = !!originalImage && editDescription.length >= 5;

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!isValid) return;
    setIsLoading(true); setError(null); setResultImage(null);
    try {
      const res = await fetch('/api/studios/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: originalImage, editDescription, editType }),
      });
      const data = await res.json();
      if (!res.ok) { setError(mapApiError(data.error, (k) => t(`studio.${k}`))); return; }
      setResultImage(data.data.imageUrl);
      if (data.data.newBalance !== undefined) setBalance(data.data.newBalance);
    } catch { setError(mapApiError('network', (k) => t(`studio.${k}`))); } finally { setIsLoading(false); }
  }, [isValid, originalImage, editDescription, editType, setBalance, t]);

  const handleSubmitKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate();
  };

  const inputPanel = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{tEdit('originalImage')} *</Label>
        {originalImage ? (
          <div className="relative inline-block">
            <Image src={originalImage} alt="" width={400} height={160} className="h-40 w-full rounded-lg object-cover border" unoptimized />
            <button type="button" onClick={() => { setOriginalImage(null); setResultImage(null); }} className="absolute top-2 end-2 rounded-full bg-[var(--color-error)] p-1 text-white"><X className="h-3 w-3" /></button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-2 w-full rounded-lg border-2 border-dashed border-[var(--color-border)] p-8 hover:border-primary-300 transition-colors">
            <Upload className="h-8 w-8 text-[var(--color-text-muted)]" /><span className="text-sm text-[var(--color-text-muted)]">{tEdit('uploadImage')}</span>
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          setOriginalImage(URL.createObjectURL(f));
          try { const fd = new FormData(); fd.append('file', f); fd.append('bucket', 'uploads'); const res = await fetch('/api/upload', { method: 'POST', body: fd }); const d = await res.json(); if (d.success && d.data?.url) setOriginalImage(d.data.url); } catch { /* blob fallback */ }
        }} className="hidden" />
      </div>
      <div className="space-y-2">
        <Label>{tEdit('editType')}</Label>
        <div className="grid grid-cols-2 gap-2">{EDIT_TYPES.map((et) => (
          <button key={et.id} type="button" onClick={() => setEditType(et.id)} aria-pressed={editType === et.id} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors', editType === et.id ? selectedChipClasses : unselectedChipClasses)}>
            <span>{et.emoji}</span>{tEdit(`editTypes.${et.key}`)}
          </button>
        ))}</div>
      </div>
      <div className="space-y-2"><Label htmlFor="edit-description">{tEdit('editDescription')}</Label><textarea id="edit-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} onKeyDown={handleSubmitKeyDown} placeholder={tEdit('editDescriptionPlaceholder')} rows={3} maxLength={500} className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none" /><p className="text-xs text-end text-[var(--color-text-muted)]">{editDescription.length}/500</p></div>
      <div className="flex items-center justify-between pt-2">
        <CreditCost cost={CREDIT_COSTS.edit} />
        <Button onClick={handleGenerate} disabled={!isValid || isLoading} className="gap-2"><Sparkles className="h-4 w-4" />{isLoading ? t('studio.generating') : t('studio.generate')}</Button>
      </div>
    </div>
  );

  const previewPanel = isLoading ? (
    <GenerationProgress isLoading />
  ) : error ? (
    <div className="flex flex-col items-center py-12 gap-4"><AlertTriangle className="h-12 w-12 text-[var(--color-error)]" /><p className="text-sm text-[var(--color-error)]">{error}</p></div>
  ) : !resultImage && !originalImage ? (
    <div className="flex flex-col items-center py-12 text-[var(--color-text-muted)]"><span className="text-5xl">✏️</span><p className="text-sm mt-4">{tEdit('emptyState')}</p></div>
  ) : (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><p className="text-xs font-medium mb-2 text-center">{tEdit('original')}</p>{originalImage && <Image src={originalImage} alt="Original" width={1024} height={1024} className="w-full rounded-lg border" unoptimized />}</div>
        <div><p className="text-xs font-medium mb-2 text-center">{tEdit('afterEdit')}</p>{resultImage ? <Image src={resultImage} alt="Edited" width={1024} height={1024} className="w-full rounded-lg border" unoptimized /> : <div className="w-full aspect-square rounded-lg border-2 border-dashed border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] text-sm">{tEdit('pressGenerate')}</div>}</div>
      </div>
      {resultImage && (<Button onClick={() => void downloadFile(resultImage, 'pyrasuite-edit.png')} className="gap-2"><Download className="h-4 w-4" />{t('studio.download')}</Button>)}
    </div>
  );

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="px-6 py-4 border-b"><h1 className="text-xl font-bold font-cairo">{t('nav.edit')}</h1><p className="text-sm text-[var(--color-text-secondary)]">{tEdit('description')}</p></div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} />
    </div>
  );
}

export default function EditPage(): React.ReactElement {
  return (
    <Suspense>
      <EditPageContent />
    </Suspense>
  );
}
