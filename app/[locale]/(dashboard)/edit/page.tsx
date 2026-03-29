'use client';

import { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CreditCost } from '@/components/shared/CreditCost';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreditsStore } from '@/store/credits';
import { cn } from '@/lib/utils';
import { Sparkles, Upload, X, Download, AlertTriangle } from 'lucide-react';

const EDIT_TYPES = [
  { id: 'background_replace', key: 'background_replace', emoji: '🖼️' },
  { id: 'object_remove', key: 'object_remove', emoji: '🗑️' },
  { id: 'color_change', key: 'color_change', emoji: '🎨' },
  { id: 'text_add', key: 'text_add', emoji: '✍️' },
  { id: 'style_transfer', key: 'style_transfer', emoji: '🔄' },
] as const;

export default function EditPage(): React.ReactElement {
  const t = useTranslations();
  const tEdit = useTranslations('edit');
  const [originalImage, setOriginalImage] = useState<string | null>(null);
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
      if (!res.ok) { setError(data.error); return; }
      setResultImage(data.data.imageUrl);
      if (data.data.newBalance !== undefined) setBalance(data.data.newBalance);
    } catch { setError('Network error'); } finally { setIsLoading(false); }
  }, [isValid, originalImage, editDescription, editType, setBalance]);

  const inputPanel = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{tEdit('originalImage')} *</Label>
        {originalImage ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={originalImage} alt="" className="h-40 w-full rounded-lg object-cover border" />
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
          <button key={et.id} type="button" onClick={() => setEditType(et.id)} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors', editType === et.id ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-[var(--color-border)] hover:border-primary-300')}>
            <span>{et.emoji}</span>{tEdit(`editTypes.${et.key}`)}
          </button>
        ))}</div>
      </div>
      <div className="space-y-2"><Label>{tEdit('editDescription')}</Label><textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="مثال: غيّر الخلفية لمكتب حديث مع إضاءة طبيعية..." rows={3} maxLength={500} className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none" /></div>
      <div className="flex items-center justify-between pt-2">
        <CreditCost cost={1} />
        <Button onClick={handleGenerate} disabled={!isValid || isLoading} className="gap-2"><Sparkles className="h-4 w-4" />{isLoading ? t('studio.generating') : t('studio.generate')}</Button>
      </div>
    </div>
  );

  const previewPanel = isLoading ? (
    <div className="flex gap-4 py-6"><Skeleton className="flex-1 h-64 rounded-lg" /><Skeleton className="flex-1 h-64 rounded-lg" /></div>
  ) : error ? (
    <div className="flex flex-col items-center py-12 gap-4"><AlertTriangle className="h-12 w-12 text-[var(--color-error)]" /><p className="text-sm text-[var(--color-error)]">{error}</p></div>
  ) : !resultImage && !originalImage ? (
    <div className="flex flex-col items-center py-12 text-[var(--color-text-muted)]"><span className="text-5xl">✏️</span><p className="text-sm mt-4">{tEdit('emptyState')}</p></div>
  ) : (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><p className="text-xs font-medium mb-2 text-center">{tEdit('original')}</p>{originalImage && /* eslint-disable-next-line @next/next/no-img-element */ <img src={originalImage} alt="Original" className="w-full rounded-lg border" />}</div>
        <div><p className="text-xs font-medium mb-2 text-center">{tEdit('afterEdit')}</p>{resultImage ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={resultImage} alt="Edited" className="w-full rounded-lg border" /> : <div className="w-full aspect-square rounded-lg border-2 border-dashed border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] text-sm">{tEdit('pressGenerate')}</div>}</div>
      </div>
      {resultImage && (<Button onClick={() => { const a = document.createElement('a'); a.href = resultImage; a.download = 'pyrasuite-edit.png'; a.click(); }} className="gap-2"><Download className="h-4 w-4" />{t('studio.download')}</Button>)}
    </div>
  );

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <div className="px-6 py-4 border-b"><h1 className="text-xl font-bold font-cairo">{t('nav.edit')}</h1><p className="text-sm text-[var(--color-text-secondary)]">{tEdit('description')}</p></div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} />
    </div>
  );
}
