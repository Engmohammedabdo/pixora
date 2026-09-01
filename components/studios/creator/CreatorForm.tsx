'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ModelSelector } from '@/components/shared/ModelSelector';
import { ResolutionSelector } from '@/components/shared/ResolutionSelector';
import { CreditCost } from '@/components/shared/CreditCost';
import { useBrandKits } from '@/hooks/useBrandKit';
import { ProjectSelector } from '@/components/shared/ProjectSelector';
import { useProjectSelection } from '@/hooks/useProjectSelection';
import { useCredits } from '@/hooks/useCredits';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { selectedChipClasses, unselectedChipClasses } from '@/components/studios/selectable-chip';
import { WorkingIdentityBar } from '@/components/studios/WorkingIdentityBar';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { Upload, X, Sparkles, Palette, Shuffle, Loader2 } from 'lucide-react';
import type { AIModel, Resolution } from '@/types/studios';
import { PLATFORM_FRAMING, PLATFORM_IDS, type PlatformId } from '@/lib/ai/prompts/platform-framing';

interface CreatorFormProps {
  onSubmit: (input: {
    prompt: string;
    model: AIModel;
    resolution: Resolution;
    style: string;
    platform: PlatformId;
    variations: 1 | 4;
    brandKitId?: string;
    /** The Apply-Brand-Kit toggle. Sent explicitly, because an absent
     *  `brandKitId` means "I did not choose" and the server answers that with
     *  the project's kit or the account default — see
     *  lib/brand-kits/working-identity.ts. "Not this time" needs its own word. */
    useBrandKit?: boolean;
    referenceImageUrl?: string;
    projectId?: string;
  }) => void;
  isLoading: boolean;
  /** Prefill for the prompt textarea (e.g. from a ?prompt= cross-studio handoff) */
  initialPrompt?: string;
}

const RANDOM_PROMPTS = [
  'Professional product photo of luxury perfume on marble surface, dramatic lighting',
  'Minimalist social media post for coffee brand, warm tones, flat lay',
  'Bold fashion advertisement with neon colors and urban background',
  'Elegant restaurant interior photography with soft ambient lighting',
  'Modern tech product floating on gradient background, clean composition',
  'Lifestyle photo of skincare products in bathroom setting, natural light',
];

const STYLES = ['photographic', 'illustrative', 'minimalist', 'bold'] as const;

/**
 * The output canvas. Offered because without it the route's new `platform` field
 * would default to `general` forever and nothing would ever set it — the
 * "collected and read by nothing" shape CLAUDE.md already catalogues, in
 * reverse.
 *
 * Read from PLATFORM_IDS rather than restated, so a platform added to the
 * framing table appears here rather than being silently unreachable.
 */
const PLATFORM_CHOICES = PLATFORM_IDS;

/**
 * What POST /api/upload actually accepts. The picker used to say `image/*`, so
 * every HEIC from a phone, every GIF and every AVIF was offered, refused with a
 * 400, and the refusal thrown away — the handler only acted on success, and a
 * 400 resolves normally so the `catch` never ran. The blob: preview stayed on
 * screen and was submitted as `referenceImageUrl`, which lib/ai/gemini.ts
 * refuses (non-https) AFTER the route has already reserved the credits.
 */
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB — the limit /api/upload enforces

export function CreatorForm({ onSubmit, isLoading, initialPrompt }: CreatorFormProps): React.ReactElement {
  const t = useTranslations('creator');
  const tStudio = useTranslations('studio');
  const tCredits = useTranslations('credits');

  const [prompt, setPrompt] = useState(initialPrompt ?? '');
  const [model, setModel] = useState<AIModel>('gemini');
  const [resolution, setResolution] = useState<Resolution>('1080p');
  const [style, setStyle] = useState<string>('photographic');
  // `general` is a square, which is what the API defaults to. Measured
  // 2026-08-31: with no ratio sent at all, four identical requests came back in
  // three different shapes — so "no choice" now means a predictable square
  // rather than whatever the model felt like.
  const [platform, setPlatform] = useState<PlatformId>('general');
  const [variations, setVariations] = useState<1 | 4>(1);
  // ON by default, in BOTH studios. It was `useState(false)` in each, with a
  // four-line effect in creator only that flipped it on once the customer's kits
  // arrived — so the identical-looking chip meant opt-IN in campaign and opt-OUT
  // in creator, and a 12-credit campaign came back generic by default. The state
  // now says the same thing in both files, with no effect to keep in sync.
  const [useBrandKit, setUseBrandKit] = useState(true);
  /**
   * ONLY what the customer explicitly picked, in WorkingIdentityBar. `undefined`
   * is the default and it is the point: an absent `brandKitId` means "I did not
   * choose", which the server answers with the project's kit and then the account
   * default (lib/brand-kits/working-identity.ts:30-41). This form used to send
   * `projectKit?.id ?? (useBrandKit ? defaultKit?.id : undefined)` — the server's
   * own ladder restated in the browser, and a rule stated twice drifts. The same
   * derivation in analysis/page.tsx made the project step STRUCTURALLY
   * unreachable: a kit id arrived on every request, so step 1 always answered and
   * picking a client in the ProjectSelector could never change the identity.
   */
  const [chosenKitId, setChosenKitId] = useState<string | undefined>(undefined);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  // A rejected pick is not just a message, it is a state the form must not
  // generate from. The reference image is optional, so `isValid` never looked at
  // it — after a refused HEIC the button stayed live and one press charged full
  // price (up to 4 variations at 4K) for an image made from the prompt alone,
  // silently ignoring the file the customer had just chosen.
  const [pickRejected, setPickRejected] = useState(false);
  // The object URL lives here and ONLY here, for the seconds the bytes are in
  // flight. It must never become `referenceImage`: that value is posted to the
  // route as `referenceImageUrl`, and a blob: string is meaningless to the server.
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const { projectId, projectBrandKitId, onProjectChange } = useProjectSelection();

  const { brandKits } = useBrandKits();

  // The auto-enable effect that used to sit here is gone: the initial state
  // now says what it did, in both studios, and an effect that silently
  // re-enables a control the customer just turned off is worse than the
  // default it was compensating for.

  // Read for ONE thing now: whether to offer the Apply-Brand-Kit toggle, since a
  // project that dictates its own kit is not a choice that toggle can override.
  // It no longer decides which kit is sent — the server does.
  const projectKit = projectBrandKitId ? brandKits.find((k) => k.id === projectBrandKitId) : undefined;

  const creditCost = CREDIT_COSTS.image[resolution] * variations;
  // The reference image is optional, but neither an upload still in flight nor
  // a pick we refused is: submitting either would silently generate WITHOUT the
  // image the user just picked, and charge full price for it. A refusal is
  // cleared by choosing a supported file or by dismissing it below — both are
  // the customer saying what they want, which one line of red text is not.
  const isValid = prompt.length >= 10 && !uploading && !pickRejected;
  const { balance, status: creditsStatus } = useCredits();
  const cannotAfford = creditsStatus === 'ready' && creditCost > balance;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!isValid || isLoading) return;
    onSubmit({
      prompt,
      model,
      resolution,
      style,
      platform,
      variations,
      brandKitId: chosenKitId,
      useBrandKit,
      referenceImageUrl: referenceImage || undefined,
      projectId: projectId ?? undefined,
    });
  };

  const releasePreview = (): void => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
  };
  useEffect(() => releasePreview, []);

  /** The field is empty again: no file, no refusal, nothing holding Generate down. */
  const clearReferenceImage = (): void => {
    setReferenceImage(null);
    setUploadError('');
    setPickRejected(false);
  };

  /** /api/upload answers with a machine code; anything we have no wording for
   *  is still a failure the user must see, never a silent one. */
  const uploadErrorMessage = (code: unknown): string => {
    const known = ['invalid_type', 'file_too_large', 'storage_not_configured', 'unauthorized'];
    return tStudio(`uploadErrors.${typeof code === 'string' && known.includes(code) ? code : 'fallback'}`);
  };

  const handleRefImageUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    // Reset first: picking the same file twice fires no change event otherwise,
    // so a retry after a rejected file would do nothing at all.
    e.target.value = '';
    if (!file) return;

    setUploadError('');
    // A new pick supersedes the previous verdict, good or bad.
    setPickRejected(false);
    // The old file is not what the user means any more. Clearing it is what
    // keeps a rejected pick from silently generating against the previous one.
    setReferenceImage(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError(tStudio('uploadErrors.invalid_type'));
      setPickRejected(true);
      return;
    }
    if (file.size > MAX_SIZE) {
      setUploadError(tStudio('uploadErrors.file_too_large'));
      setPickRejected(true);
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
        setPickRejected(true);
        return;
      }
      setReferenceImage(data.data.url);
    } catch {
      setUploadError(tStudio('uploadErrors.fallback'));
      setPickRejected(true);
    } finally {
      setUploading(false);
      releasePreview();
      setPreview(null);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Prompt */}
      <div className="space-y-2">
        <Label htmlFor="prompt">{t('prompt')}</Label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('promptPlaceholder')}
          rows={4}
          maxLength={1000}
          className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base sm:text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 resize-none"
        />
        <p className="text-xs text-[var(--color-text-muted)] text-end">{prompt.length}/1000</p>
      </div>

      {/* Reference Image */}
      <div className="space-y-2">
        <Label>{t('referenceImage')}</Label>
        {(preview ?? referenceImage) ? (
          <div className="relative inline-block">
            <Image
              src={(preview ?? referenceImage)!}
              alt=""
              width={96}
              height={96}
              className={cn('h-24 w-24 rounded-lg object-cover border transition-opacity', uploading && 'opacity-40')}
              unoptimized
            />
            {uploading ? (
              <span className="absolute inset-0 flex items-center justify-center" aria-live="polite">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--color-text-muted)]" />
              </span>
            ) : (
              <button
                type="button"
                onClick={clearReferenceImage}
                className="absolute -top-2 -end-2 rounded-full bg-[var(--color-error)] p-1 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <label className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] p-3 cursor-pointer hover:border-primary-300 transition-colors">
            <Upload className="h-4 w-4 text-[var(--color-text-muted)]" />
            <span className="text-sm text-[var(--color-text-muted)]">{t('referenceImage')}</span>
            {/* Matches what /api/upload accepts. `image/*` advertised formats the
                server refuses, and the refusal had nowhere to go. */}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={handleRefImageUpload} className="hidden" />
          </label>
        )}
        {uploadError && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-xs text-[var(--color-error)]">{uploadError}</p>
            {/* Generate stays down while a pick is refused, and the field shows
                the picker again rather than an X — so without this the customer
                who simply wants to generate from the prompt has no way forward.
                Dismissing is them saying so, not us assuming it. */}
            {pickRejected && (
              <button
                type="button"
                onClick={clearReferenceImage}
                className="text-xs underline text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                {tStudio('continueWithoutImage')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Style */}
      <div className="space-y-2">
        <Label>{t('style')}</Label>
        <div className="grid grid-cols-2 gap-2">
          {STYLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStyle(s)}
              aria-pressed={style === s}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm transition-colors',
                style === s ? selectedChipClasses : unselectedChipClasses
              )}
            >
              {t(`styles.${s}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Output canvas */}
      <div className="space-y-2">
        <Label>{t('platform')}</Label>
        <div className="grid grid-cols-3 gap-2">
          {PLATFORM_CHOICES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              aria-pressed={platform === p}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm transition-colors',
                platform === p ? selectedChipClasses : unselectedChipClasses
              )}
            >
              <span className="block">{t(`platforms.${p}`)}</span>
              {/* The ratio is the thing the customer is actually choosing, and
                  it is the one property they cannot repair after the fact. */}
              <span className="block text-xs opacity-70" dir="ltr">
                {PLATFORM_FRAMING[p].aspectRatio}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Variations */}
      <div className="space-y-2">
        <Label>{t('variations')}</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setVariations(1)}
            aria-pressed={variations === 1}
            className={cn(
              'rounded-lg border px-3 py-2 text-sm transition-colors',
              variations === 1 ? selectedChipClasses : unselectedChipClasses
            )}
          >
            {t('singleImage')}
          </button>
          <button
            type="button"
            onClick={() => setVariations(4)}
            aria-pressed={variations === 4}
            className={cn(
              'rounded-lg border px-3 py-2 text-sm transition-colors',
              variations === 4 ? selectedChipClasses : unselectedChipClasses
            )}
          >
            {t('fourVariations')}
          </button>
        </div>
      </div>

      {/* Model */}
      <ModelSelector value={model} onChange={setModel} />

      {/* Resolution */}
      <ResolutionSelector value={resolution} onChange={setResolution} />

      {/* Client workspace — also decides which brand kit is applied */}
      <ProjectSelector
        value={projectId}
        onChange={onProjectChange}
      />

      {/* Brand Kit Toggle — hidden when a project already dictates the identity */}
      {brandKits.length > 0 && !projectKit && (
        <button
          type="button"
          onClick={() => setUseBrandKit(!useBrandKit)}
          aria-pressed={useBrandKit}
          className={cn(
            'flex items-center gap-2 w-full rounded-lg border px-4 py-3 text-sm transition-colors',
            useBrandKit ? selectedChipClasses : unselectedChipClasses
          )}
        >
          <Palette className="h-4 w-4" />
          {/* The kit's NAME used to sit here, and it is gone: naming the identity
              is WorkingIdentityBar's job now, and this line could only ever name
              the account default — it was hidden the moment a project dictated a
              different kit, i.e. exactly when the two would have disagreed. */}
          <span className="flex-1 text-start">{t('useBrandKit')}</span>
        </button>
      )}

      {/* Whose business this image is for, said BEFORE Generate — the credits are
          reserved the moment it is pressed, so saying it afterwards is saying it
          after they paid. Fed the exact values handleSubmit is about to POST, so
          the label and the generation cannot disagree. */}
      <WorkingIdentityBar
              studio="creator"
        projectId={projectId}
        brandKitId={chosenKitId}
        useBrandKit={useBrandKit}
        onChange={setChosenKitId}
      />

      {/* Submit */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <CreditCost cost={creditCost} />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              const randomPrompt = RANDOM_PROMPTS[Math.floor(Math.random() * RANDOM_PROMPTS.length)];
              setPrompt(randomPrompt);
            }}
            title={t('surpriseMe')}
            aria-label={t('surpriseMe')}
          >
            <Shuffle className="h-4 w-4" />
          </Button>
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
