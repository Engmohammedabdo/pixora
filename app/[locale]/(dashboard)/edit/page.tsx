'use client';

import { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CreditCost } from '@/components/shared/CreditCost';
import { GenerationProgress } from '@/components/shared/GenerationProgress';
import { useCreditsStore } from '@/store/credits';
import { useCredits } from '@/hooks/useCredits';
import { useUser } from '@/hooks/useUser';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { selectedChipClasses, unselectedChipClasses } from '@/components/studios/selectable-chip';
import { cn } from '@/lib/utils';
import { toStudioError, getGatedUpgradeVariant, type StudioError } from '@/lib/studio-errors';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { downloadFile } from '@/lib/download';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { Sparkles, Upload, X, Download, AlertTriangle, Loader2 } from 'lucide-react';
import { ProjectSelector } from '@/components/shared/ProjectSelector';
import { useProjectSelection } from '@/hooks/useProjectSelection';

const EDIT_TYPES = [
  { id: 'background_replace', key: 'background_replace', emoji: '🖼️' },
  { id: 'object_remove', key: 'object_remove', emoji: '🗑️' },
  { id: 'color_change', key: 'color_change', emoji: '🎨' },
  { id: 'text_add', key: 'text_add', emoji: '✍️' },
  { id: 'style_transfer', key: 'style_transfer', emoji: '🔄' },
] as const;

/**
 * What POST /api/upload actually accepts. The picker used to say `image/*`, so
 * every HEIC from a phone, every GIF and every AVIF was offered, refused with a
 * 400, and the refusal thrown away — the handler only acted on success, and a
 * 400 resolves normally so the `catch` never ran. The blob: preview stayed on
 * screen, Generate enabled, and the route reserved a credit before dying in
 * lib/ai/gemini.ts. What dies there is the blob: URL specifically, not every
 * non-https form: fetchReferenceImage() decodes a data: URL inline — that is the
 * one reference shape the model consumes natively, which is why the edit and
 * photoshoot routes accept data:image/ — and sends anything else through
 * new URL() plus an https-and-host-allowlist check that blob: cannot pass.
 */
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB — the limit /api/upload enforces

function EditPageContent(): React.ReactElement {
  const t = useTranslations();
  // Scoped, not an arrow wrapper: `tStudio` takes one
  // argument and silently drops the values a message needs, so an ICU
  // placeholder like {term} rendered as literal text.
  const tStudio = useTranslations('studio');
  const tEdit = useTranslations('edit');
  const searchParams = useSearchParams();
  // Preload an image handed off from another studio (e.g. Creator's edit shortcut)
  const initialSrc = searchParams.get('src');
  const { projectId, onProjectChange } = useProjectSelection();
  const [originalImage, setOriginalImage] = useState<string | null>(initialSrc || null);
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState('background_replace');
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<StudioError | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  // The object URL lives here and ONLY here, for the seconds the bytes are in
  // flight. It must never become `originalImage`: that value is posted to the
  // route as `imageUrl`, and a blob: string is meaningless to the server.
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const setBalance = useCreditsStore((s) => s.setBalance);

  // Not just "an image was picked": an image the SERVER accepted. While an
  // upload is in flight `originalImage` is still null, so Generate stays down
  // rather than shipping the previous file under the new preview.
  const isValid = !!originalImage && !uploading && editDescription.length >= 5;
  const { balance, status: creditsStatus } = useCredits();
  const cannotAfford = creditsStatus === 'ready' && CREDIT_COSTS.edit > balance;
  const { profile } = useUser();
  const planId = profile?.plan_id ?? 'free';
  const upgradeVariant = getGatedUpgradeVariant(error, creditsStatus);

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!isValid) return;
    setIsLoading(true); setError(null); setResultImage(null);
    try {
      const res = await fetch('/api/studios/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: originalImage, editDescription, editType, projectId: projectId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(toStudioError(data.error, tStudio, typeof data.required === 'number' ? data.required : undefined, typeof data.term === 'string' ? data.term : undefined)); return; }
      setResultImage(data.data.imageUrl);
      if (data.data.newBalance !== undefined) setBalance(data.data.newBalance);
    } catch { setError(toStudioError('network', tStudio)); } finally { setIsLoading(false); }
  }, [isValid, originalImage, editDescription, editType, setBalance, tStudio, projectId]);

  const handleSubmitKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate();
  };

  const releasePreview = (): void => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
  };
  useEffect(() => releasePreview, []);

  /** /api/upload answers with a machine code; anything we have no wording for
   *  is still a failure the user must see, never a silent one. */
  const uploadErrorMessage = (code: unknown): string => {
    const known = ['invalid_type', 'file_too_large', 'storage_not_configured', 'unauthorized'];
    return tStudio(`uploadErrors.${typeof code === 'string' && known.includes(code) ? code : 'fallback'}`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // Reset first: picking the same file twice fires no change event otherwise,
    // so a retry after a rejected file would do nothing at all.
    e.target.value = '';
    if (!file) return;

    setUploadError('');
    // The old file is not what the user means any more. Clearing it is what
    // keeps a rejected pick from silently editing the previous one.
    setOriginalImage(null);
    setResultImage(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError(tStudio('uploadErrors.invalid_type'));
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError(tStudio('uploadErrors.file_too_large'));
      return;
    }

    releasePreview();
    const localPreview = URL.createObjectURL(file);
    previewRef.current = localPreview;
    setUploadPreview(localPreview);
    setUploading(true);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bucket', 'uploads');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      // A 400 RESOLVES — it does not throw. Checking only the success branch is
      // what let a refused upload look identical to an accepted one.
      const d = (await res.json()) as { success?: boolean; error?: string; data?: { url?: string } };
      if (!res.ok || !d.success || !d.data?.url) {
        setUploadError(uploadErrorMessage(d.error));
        return;
      }
      setOriginalImage(d.data.url);
    } catch {
      setUploadError(tStudio('uploadErrors.fallback'));
    } finally {
      setUploading(false);
      releasePreview();
      setUploadPreview(null);
    }
  };

  const inputPanel = (
    <div className="space-y-4">
      <ProjectSelector value={projectId} onChange={onProjectChange} />
      <div className="space-y-2">
        <Label>{tEdit('originalImage')} *</Label>
        {(uploadPreview ?? originalImage) ? (
          <div className="relative inline-block w-full">
            <Image src={(uploadPreview ?? originalImage)!} alt="" width={400} height={160} className={cn('h-40 w-full rounded-lg object-cover border transition-opacity', uploading && 'opacity-40')} unoptimized />
            {uploading ? (
              <span className="absolute inset-0 flex items-center justify-center" aria-live="polite"><Loader2 className="h-6 w-6 animate-spin text-[var(--color-text-muted)]" /></span>
            ) : (
              <button type="button" onClick={() => { setOriginalImage(null); setResultImage(null); setUploadError(''); }} className="absolute top-2 end-2 rounded-full bg-[var(--color-error)] p-1 text-white"><X className="h-3 w-3" /></button>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-2 w-full rounded-lg border-2 border-dashed border-[var(--color-border)] p-8 hover:border-primary-300 transition-colors">
            <Upload className="h-8 w-8 text-[var(--color-text-muted)]" /><span className="text-sm text-[var(--color-text-muted)]">{tEdit('uploadImage')}</span>
          </button>
        )}
        {/* Matches what /api/upload accepts. `image/*` advertised formats the
            server refuses, and the refusal had nowhere to go. */}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={handleFileChange} className="hidden" />
        {uploadError && <p className="text-xs text-[var(--color-error)]">{uploadError}</p>}
      </div>
      <div className="space-y-2">
        <Label>{tEdit('editType')}</Label>
        <div className="grid grid-cols-2 gap-2">{EDIT_TYPES.map((et) => (
          <button key={et.id} type="button" onClick={() => setEditType(et.id)} aria-pressed={editType === et.id} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors', editType === et.id ? selectedChipClasses : unselectedChipClasses)}>
            <span>{et.emoji}</span>{tEdit(`editTypes.${et.key}`)}
          </button>
        ))}</div>
      </div>
      <div className="space-y-2"><Label htmlFor="edit-description">{tEdit('editDescription')}</Label><textarea id="edit-description" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} onKeyDown={handleSubmitKeyDown} placeholder={tEdit('editDescriptionPlaceholder')} rows={3} maxLength={500} className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base sm:text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none" /><p className="text-xs text-end text-[var(--color-text-muted)]">{editDescription.length}/500</p></div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <CreditCost cost={CREDIT_COSTS.edit} />
        <div className="flex items-center gap-2">
          {cannotAfford && (<Button asChild variant="default" size="sm"><Link href="/billing">{t('credits.topUpShort')}</Link></Button>)}
          <Button onClick={handleGenerate} disabled={!isValid || isLoading || cannotAfford} className="gap-2"><Sparkles className="h-4 w-4" />{isLoading ? t('studio.generating') : t('studio.generate')}</Button>
        </div>
      </div>
    </div>
  );

  const previewPanel = isLoading ? (
    <GenerationProgress isLoading />
  ) : upgradeVariant ? (
    <UpgradePrompt
      open
      onClose={() => setError(null)}
      variant={upgradeVariant}
      currentPlan={planId}
      requiredCredits={upgradeVariant === 'insufficient_credits' ? error?.required : undefined}
      availableCredits={upgradeVariant === 'insufficient_credits' ? balance : undefined}
    />
  ) : error ? (
    <div className="flex flex-col items-center py-12 gap-4"><AlertTriangle className="h-12 w-12 text-[var(--color-error)]" /><p className="text-sm text-[var(--color-error)]">{error.message}</p></div>
  ) : !resultImage && !originalImage ? (
    <div className="flex flex-col items-center py-12 text-[var(--color-text-muted)]"><span className="text-5xl">✏️</span><p className="text-sm mt-4">{tEdit('emptyState')}</p></div>
  ) : (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><p className="text-xs font-medium mb-2 text-center">{tEdit('original')}</p>{originalImage && <Image src={originalImage} alt="Original" width={1024} height={1024} className="w-full rounded-lg border" unoptimized />}</div>
        <div><p className="text-xs font-medium mb-2 text-center">{tEdit('afterEdit')}</p>{resultImage ? <Image src={resultImage} alt="Edited" width={1024} height={1024} className="w-full rounded-lg border" unoptimized /> : <div className="w-full aspect-square rounded-lg border-2 border-dashed border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)] text-sm">{tEdit('pressGenerate')}</div>}</div>
      </div>
      {resultImage && (<Button onClick={() => void downloadFile(resultImage, 'pyrasuite-edit.png')} className="gap-2"><Download className="h-4 w-4" />{t('studio.download')}</Button>)}
    </div>
  );

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="px-6 py-4 border-b"><h1 className="text-xl font-bold font-cairo">{t('nav.edit')}</h1><p className="text-sm text-[var(--color-text-secondary)]">{tEdit('description')}</p></div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} isGenerating={isLoading} />
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
