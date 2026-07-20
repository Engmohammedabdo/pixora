'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreditCost } from '@/components/shared/CreditCost';
import { useBrandKits } from '@/hooks/useBrandKit';
import { selectedChipClasses, unselectedChipClasses } from '@/components/studios/selectable-chip';
import { cn } from '@/lib/utils';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { Link } from '@/i18n/routing';
import { Sparkles, Palette } from 'lucide-react';
import { ProjectSelector } from '@/components/shared/ProjectSelector';
import { useProjectSelection } from '@/hooks/useProjectSelection';
import { useCredits } from '@/hooks/useCredits';

interface CampaignFormProps {
  onSubmit: (input: {
    productDescription: string;
    targetAudience: string;
    dialect: string;
    platform: string;
    occasion?: string;
    brandKitId?: string;
    generateImages: boolean;
    projectId?: string;
  }) => void;
  isLoading: boolean;
  /** Prefill for the product description (e.g. from a ?prompt= cross-studio handoff) */
  initialDescription?: string;
}

const DIALECTS = ['saudi', 'emirati', 'egyptian', 'gulf', 'formal'] as const;
const PLATFORMS = ['instagram', 'tiktok', 'linkedin', 'twitter', 'facebook'] as const;

export function CampaignForm({ onSubmit, isLoading, initialDescription }: CampaignFormProps): React.ReactElement {
  const t = useTranslations('campaign');
  const tStudio = useTranslations('studio');
  const tCredits = useTranslations('credits');

  const { projectId, projectBrandKitId, onProjectChange } = useProjectSelection();
  const [productDescription, setProductDescription] = useState(initialDescription ?? '');
  const [targetAudience, setTargetAudience] = useState('');
  const [dialect, setDialect] = useState<string>('saudi');
  const [platform, setPlatform] = useState<string>('instagram');
  const [occasion, setOccasion] = useState('');
  const [useBrandKit, setUseBrandKit] = useState(false);
  const [generateImages, setGenerateImages] = useState(true);

  const { brandKits, defaultKit } = useBrandKits();
  // A project's own brand kit wins over the account default, so switching client
  // switches the visual identity with it.
  const projectKit = projectBrandKitId ? brandKits.find((k) => k.id === projectBrandKitId) : undefined;

  const isValid = productDescription.length >= 10 && targetAudience.length >= 5;
  const { balance, status: creditsStatus } = useCredits();
  const cannotAfford = creditsStatus === 'ready' && CREDIT_COSTS.campaign > balance;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!isValid || isLoading) return;
    onSubmit({
      productDescription,
      targetAudience,
      dialect,
      platform,
      occasion: occasion || undefined,
      brandKitId: projectKit?.id ?? (useBrandKit ? defaultKit?.id : undefined),
      generateImages,
      projectId: projectId ?? undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <ProjectSelector value={projectId} onChange={onProjectChange} />
      {/* Product Description */}
      <div className="space-y-2">
        <Label htmlFor="campaign-product-description">{t('productDescription')}</Label>
        <textarea
          id="campaign-product-description"
          value={productDescription}
          onChange={(e) => setProductDescription(e.target.value)}
          placeholder={t('productDescriptionPlaceholder')}
          rows={3}
          maxLength={2000}
          className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base sm:text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 resize-none"
        />
        <p className="text-xs text-end text-[var(--color-text-muted)]">{productDescription.length}/2000</p>
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
                dialect === d ? selectedChipClasses : unselectedChipClasses
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
                platform === p ? selectedChipClasses : unselectedChipClasses
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
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <CreditCost cost={CREDIT_COSTS.campaign} />
        <div className="flex items-center gap-2">
          {cannotAfford && (
            <Button asChild variant="default" size="sm">
              <Link href="/billing">{tCredits('topUpShort')}</Link>
            </Button>
          )}
          <Button type="submit" disabled={!isValid || isLoading || cannotAfford} className="gap-2">
            <Sparkles className="h-4 w-4" />
            {isLoading ? tStudio('generating') : t('generateCampaign')}
          </Button>
        </div>
      </div>
    </form>
  );
}
