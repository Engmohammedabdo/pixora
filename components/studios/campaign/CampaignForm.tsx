'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCost } from '@/components/shared/CreditCost';
import { useBrandKits } from '@/hooks/useBrandKit';
import { cn } from '@/lib/utils';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { Sparkles, Palette } from 'lucide-react';

interface CampaignFormProps {
  onSubmit: (input: {
    productDescription: string;
    targetAudience: string;
    dialect: string;
    platform: string;
    occasion?: string;
    brandKitId?: string;
    generateImages: boolean;
  }) => void;
  isLoading: boolean;
}

const DIALECTS = ['saudi', 'emirati', 'egyptian', 'gulf', 'formal'] as const;
const PLATFORMS = ['instagram', 'tiktok', 'linkedin', 'twitter', 'facebook'] as const;

export function CampaignForm({ onSubmit, isLoading }: CampaignFormProps): React.ReactElement {
  const t = useTranslations('campaign');
  const tStudio = useTranslations('studio');

  const [productDescription, setProductDescription] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [dialect, setDialect] = useState<string>('saudi');
  const [platform, setPlatform] = useState<string>('instagram');
  const [occasion, setOccasion] = useState('');
  const [useBrandKit, setUseBrandKit] = useState(false);
  const [generateImages, setGenerateImages] = useState(true);

  const { brandKits, defaultKit } = useBrandKits();

  const isValid = productDescription.length >= 10 && targetAudience.length >= 5;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!isValid || isLoading) return;
    onSubmit({
      productDescription,
      targetAudience,
      dialect,
      platform,
      occasion: occasion || undefined,
      brandKitId: useBrandKit ? defaultKit?.id : undefined,
      generateImages,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Product Description */}
      <div className="space-y-2">
        <Label>{t('productDescription')}</Label>
        <textarea
          value={productDescription}
          onChange={(e) => setProductDescription(e.target.value)}
          placeholder={t('productDescriptionPlaceholder')}
          rows={3}
          maxLength={2000}
          className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 resize-none"
        />
      </div>

      {/* Target Audience */}
      <div className="space-y-2">
        <Label>{t('targetAudience')}</Label>
        <Input
          value={targetAudience}
          onChange={(e) => setTargetAudience(e.target.value)}
          placeholder={t('targetAudiencePlaceholder')}
          maxLength={500}
        />
      </div>

      {/* Dialect */}
      <div className="space-y-2">
        <Label>{t('dialect')}</Label>
        <div className="grid grid-cols-3 gap-2">
          {DIALECTS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDialect(d)}
              aria-pressed={dialect === d}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs transition-colors',
                dialect === d
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-[var(--color-border)] hover:border-primary-300'
              )}
            >
              {t(`dialects.${d}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Platform */}
      <div className="space-y-2">
        <Label>{t('platform')}</Label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              aria-pressed={platform === p}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs capitalize transition-colors',
                platform === p
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-[var(--color-border)] hover:border-primary-300'
              )}
            >
              {p === 'twitter' ? 'X / Twitter' : p}
            </button>
          ))}
        </div>
      </div>

      {/* Occasion */}
      <div className="space-y-2">
        <Label>{t('occasion')}</Label>
        <Input
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
          placeholder={t('occasionPlaceholder')}
          maxLength={200}
        />
      </div>

      {/* Brand Kit */}
      {brandKits.length > 0 && (
        <button
          type="button"
          onClick={() => setUseBrandKit(!useBrandKit)}
          aria-pressed={useBrandKit}
          className={cn(
            'flex items-center gap-2 w-full rounded-lg border px-4 py-3 text-sm transition-colors',
            useBrandKit
              ? 'border-primary-500 bg-primary-50 text-primary-700'
              : 'border-[var(--color-border)] hover:border-primary-300'
          )}
        >
          <Palette className="h-4 w-4" />
          <span className="flex-1 text-start">{tStudio('brandKitApplied')}</span>
        </button>
      )}

      {/* Generate Images Toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={generateImages}
          onChange={(e) => setGenerateImages(e.target.checked)}
          className="h-4 w-4 rounded border-[var(--color-border)] text-primary-500 focus:ring-primary-500"
        />
        <span className="text-sm">{t('generateAllImages')}</span>
      </label>

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <CreditCost cost={CREDIT_COSTS.campaign} />
        <Button type="submit" disabled={!isValid || isLoading} className="gap-2">
          <Sparkles className="h-4 w-4" />
          {isLoading ? tStudio('generating') : t('generateCampaign')}
        </Button>
      </div>
    </form>
  );
}
