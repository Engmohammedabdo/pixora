'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ModelSelector } from '@/components/shared/ModelSelector';
import { ResolutionSelector } from '@/components/shared/ResolutionSelector';
import { CreditCost } from '@/components/shared/CreditCost';
import { useBrandKits } from '@/hooks/useBrandKit';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { cn } from '@/lib/utils';
import { Upload, X, Sparkles, Palette } from 'lucide-react';
import type { AIModel, Resolution } from '@/types/studios';

interface CreatorFormProps {
  onSubmit: (input: {
    prompt: string;
    model: AIModel;
    resolution: Resolution;
    style: string;
    variations: 1 | 4;
    brandKitId?: string;
    referenceImageUrl?: string;
  }) => void;
  isLoading: boolean;
}

const STYLES = ['photographic', 'illustrative', 'minimalist', 'bold'] as const;

export function CreatorForm({ onSubmit, isLoading }: CreatorFormProps): React.ReactElement {
  const t = useTranslations('creator');
  const tStudio = useTranslations('studio');

  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<AIModel>('gemini');
  const [resolution, setResolution] = useState<Resolution>('1080p');
  const [style, setStyle] = useState<string>('photographic');
  const [variations, setVariations] = useState<1 | 4>(1);
  const [useBrandKit, setUseBrandKit] = useState(false);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);

  const { brandKits, defaultKit } = useBrandKits();
  const selectedKit = useBrandKit ? defaultKit : undefined;

  const creditCost = CREDIT_COSTS.image[resolution] * variations;
  const isValid = prompt.length >= 10;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!isValid || isLoading) return;
    onSubmit({
      prompt,
      model,
      resolution,
      style,
      variations,
      brandKitId: selectedKit?.id,
      referenceImageUrl: referenceImage || undefined,
    });
  };

  const handleRefImageUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show local preview immediately
    setReferenceImage(URL.createObjectURL(file));

    // Upload to server to get a real URL the API can access
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'uploads');
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success && data.data?.url) {
        setReferenceImage(data.data.url);
      }
    } catch {
      // Keep blob URL as fallback for preview
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
          className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 resize-none"
        />
        <p className="text-xs text-[var(--color-text-muted)] text-end">{prompt.length}/1000</p>
      </div>

      {/* Reference Image */}
      <div className="space-y-2">
        <Label>{t('referenceImage')}</Label>
        {referenceImage ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={referenceImage} alt="" className="h-24 w-24 rounded-lg object-cover border" />
            <button
              type="button"
              onClick={() => setReferenceImage(null)}
              className="absolute -top-2 -end-2 rounded-full bg-[var(--color-error)] p-1 text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <label className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] p-3 cursor-pointer hover:border-primary-300 transition-colors">
            <Upload className="h-4 w-4 text-[var(--color-text-muted)]" />
            <span className="text-sm text-[var(--color-text-muted)]">{t('referenceImage')}</span>
            <input type="file" accept="image/*" onChange={handleRefImageUpload} className="hidden" />
          </label>
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
              className={cn(
                'rounded-lg border px-3 py-2 text-sm transition-colors',
                style === s
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-[var(--color-border)] hover:border-primary-300'
              )}
            >
              {t(`styles.${s}`)}
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
            className={cn(
              'rounded-lg border px-3 py-2 text-sm transition-colors',
              variations === 1
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-[var(--color-border)] hover:border-primary-300'
            )}
          >
            {t('singleImage')}
          </button>
          <button
            type="button"
            onClick={() => setVariations(4)}
            className={cn(
              'rounded-lg border px-3 py-2 text-sm transition-colors',
              variations === 4
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-[var(--color-border)] hover:border-primary-300'
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

      {/* Brand Kit Toggle */}
      {brandKits.length > 0 && (
        <button
          type="button"
          onClick={() => setUseBrandKit(!useBrandKit)}
          className={cn(
            'flex items-center gap-2 w-full rounded-lg border px-4 py-3 text-sm transition-colors',
            useBrandKit
              ? 'border-primary-500 bg-primary-50 text-primary-700'
              : 'border-[var(--color-border)] hover:border-primary-300'
          )}
        >
          <Palette className="h-4 w-4" />
          <span className="flex-1 text-start">{t('useBrandKit')}</span>
          {useBrandKit && defaultKit && (
            <span className="text-xs text-[var(--color-text-muted)]">{defaultKit.name}</span>
          )}
        </button>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <CreditCost cost={creditCost} />
        <Button type="submit" disabled={!isValid || isLoading} className="gap-2">
          <Sparkles className="h-4 w-4" />
          {isLoading ? tStudio('generating') : tStudio('generate')}
        </Button>
      </div>
    </form>
  );
}
