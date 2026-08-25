'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CreditCost } from '@/components/shared/CreditCost';
import { selectedChipClasses, unselectedChipClasses } from '@/components/studios/selectable-chip';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { Upload, X, Camera, Sparkles, Loader2 } from 'lucide-react';
import { ProjectSelector } from '@/components/shared/ProjectSelector';
import { useProjectSelection } from '@/hooks/useProjectSelection';
import { useCredits } from '@/hooks/useCredits';

interface PhotoshootFormProps {
  onSubmit: (input: {
    productImageUrl: string;
    environment: string;
    shots: 1 | 3 | 6;
    notes?: string;
    projectId?: string;
    brandKitId?: string;
  }) => void;
  isLoading: boolean;
}

const ENVIRONMENTS = [
  { id: 'white_studio', emoji: '⬜' },
  { id: 'food', emoji: '🍽️' },
  { id: 'lifestyle', emoji: '🏠' },
  { id: 'nature', emoji: '🌿' },
  { id: 'urban', emoji: '🏙️' },
  { id: 'luxury', emoji: '✨' },
  { id: 'festive', emoji: '🎉' },
] as const;

const SHOT_OPTIONS: { count: 1 | 3 | 6; credits: number }[] = [
  { count: 1, credits: 2 },
  { count: 3, credits: 4 },
  { count: 6, credits: 8 },
];

/**
 * What POST /api/upload actually accepts. The picker used to say `image/*`, so
 * every HEIC from a phone, every GIF and every AVIF was offered, rejected with a
 * 400, and the rejection thrown away — the handler only acted on success, and a
 * 400 resolves normally so the `catch` never ran. The blob: preview stayed on
 * screen, `productImage` kept pointing at it, and Generate stayed enabled: the
 * route then reserved credits and died in lib/ai/gemini.ts, which refuses a
 * non-https reference image. The customer paid with a spinner for a file the
 * server had already refused before the shoot began.
 */
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB — the limit /api/upload enforces

export function PhotoshootForm({ onSubmit, isLoading }: PhotoshootFormProps): React.ReactElement {
  const t = useTranslations('photoshoot');
  const tStudio = useTranslations('studio');
  const tCredits = useTranslations('credits');

  const { projectId, projectBrandKitId, onProjectChange } = useProjectSelection();
  const [productImage, setProductImage] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<string>('white_studio');
  const [shots, setShots] = useState<1 | 3 | 6>(6);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  // The object URL lives here and ONLY here, for the seconds the bytes are in
  // flight. It must never become `productImage`: that value is posted to the
  // route as `productImageUrl`, and a blob: string is meaningless to the server.
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedShotOption = SHOT_OPTIONS.find((o) => o.count === shots)!;
  // Not just "an image was picked": an image the SERVER accepted. While an
  // upload is in flight `productImage` is still null, so Generate stays down
  // rather than shipping the previous file under the new preview.
  const isValid = !!productImage && !uploading;
  const { balance, status: creditsStatus } = useCredits();
  const cannotAfford = creditsStatus === 'ready' && selectedShotOption.credits > balance;

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
    // keeps a rejected pick from silently generating against the previous one.
    setProductImage(null);

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
    setPreview(localPreview);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'uploads');
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      // A 400 RESOLVES — it does not throw. Checking only the success branch is
      // what let a refused upload look identical to an accepted one.
      const data = (await res.json()) as { success?: boolean; error?: string; data?: { url?: string } };
      if (!res.ok || !data.success || !data.data?.url) {
        setUploadError(uploadErrorMessage(data.error));
        return;
      }
      setProductImage(data.data.url);
    } catch {
      setUploadError(tStudio('uploadErrors.fallback'));
    } finally {
      setUploading(false);
      releasePreview();
      setPreview(null);
    }
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!isValid || isLoading) return;
    onSubmit({
      productImageUrl: productImage!,
      environment,
      shots,
      notes: notes || undefined,
      projectId: projectId ?? undefined,
      // Without this the chosen client's identity is ignored even though the
      // route accepts brandKitId — one client's look would appear on another's shoot.
      brandKitId: projectBrandKitId ?? undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <ProjectSelector value={projectId} onChange={onProjectChange} />
      {/* Product Image */}
      <div className="space-y-2">
        <Label>{t('productImage')} *</Label>
        {(preview ?? productImage) ? (
          <div className="relative inline-block">
            <Image
              src={(preview ?? productImage)!}
              alt=""
              width={128}
              height={128}
              className={cn('h-32 w-32 rounded-lg object-cover border transition-opacity', uploading && 'opacity-40')}
              unoptimized
            />
            {uploading ? (
              <span className="absolute inset-0 flex items-center justify-center" aria-live="polite">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--color-text-muted)]" />
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setProductImage(null)}
                className="absolute -top-2 -end-2 rounded-full bg-[var(--color-error)] p-1 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2 w-full rounded-lg border-2 border-dashed border-[var(--color-border)] p-8 hover:border-primary-300 transition-colors"
          >
            <Camera className="h-8 w-8 text-[var(--color-text-muted)]" />
            <span className="text-sm text-[var(--color-text-muted)]">{t('uploadProduct')}</span>
          </button>
        )}
        {/* Matches what /api/upload accepts. `image/*` advertised formats the
            server refuses, and the refusal had nowhere to go. */}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={handleFileChange}
          className="hidden"
        />
        {uploadError && <p className="text-xs text-[var(--color-error)]">{uploadError}</p>}
      </div>

      {/* Environment */}
      <div className="space-y-2">
        <Label>{t('environment')}</Label>
        <div className="grid grid-cols-2 gap-2">
          {ENVIRONMENTS.map((env) => (
            <button
              key={env.id}
              type="button"
              onClick={() => setEnvironment(env.id)}
              aria-pressed={environment === env.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                environment === env.id ? selectedChipClasses : unselectedChipClasses
              )}
            >
              <span>{env.emoji}</span>
              <span>{t(`environments.${env.id}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Number of Shots */}
      <div className="space-y-2">
        <Label>{t('shots')}</Label>
        <div className="flex gap-2">
          {SHOT_OPTIONS.map((option) => (
            <button
              key={option.count}
              type="button"
              onClick={() => setShots(option.count)}
              aria-pressed={shots === option.count}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 rounded-lg border px-3 py-3 transition-colors',
                shots === option.count ? selectedChipClasses : unselectedChipClasses
              )}
            >
              <span className="text-lg font-bold">{option.count}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{tCredits('creditsCount', { count: option.credits })}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="photoshoot-notes">{t('notes')}</Label>
        <textarea
          id="photoshoot-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('notesPlaceholder')}
          rows={2}
          maxLength={500}
          className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base sm:text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 resize-none"
        />
        <p className="text-xs text-end text-[var(--color-text-muted)]">{notes.length}/500</p>
      </div>

      {/* Submit */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <CreditCost cost={selectedShotOption.credits} />
        <div className="flex items-center gap-2">
          {cannotAfford && (
            <Button asChild variant="default" size="sm">
              <Link href="/billing">{tCredits('topUpShort')}</Link>
            </Button>
          )}
          <Button type="submit" disabled={!isValid || isLoading || cannotAfford} className="gap-2">
            <Sparkles className="h-4 w-4" />
            {isLoading ? tStudio('generating') : tStudio('generate')}
          </Button>
        </div>
      </div>
    </form>
  );
}
