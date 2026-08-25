'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ColorPicker } from './ColorPicker';
import { LogoUpload } from './LogoUpload';
import type { BrandKit } from '@/lib/supabase/types';
import { INDUSTRIES } from '@/lib/industries';
import { selectedChipClasses, unselectedChipClasses } from '@/components/studios/selectable-chip';
import { cn } from '@/lib/utils';

interface BrandKitFormProps {
  initialData?: BrandKit;
  onSubmit: (data: Partial<BrandKit>) => Promise<void>;
  loading: boolean;
}

export function BrandKitForm({ initialData, onSubmit, loading }: BrandKitFormProps): React.ReactElement {
  const t = useTranslations('brandKit');
  const tCommon = useTranslations('common');

  const [name, setName] = useState(initialData?.name || '');
  const [logoUrl, setLogoUrl] = useState<string | null>(initialData?.logo_url || null);
  // Migration 045's business columns. Nullable on the wire, empty string in
  // form state — the same pattern brandVoice already used below.
  const [industry, setIndustry] = useState(initialData?.industry || '');
  const [websiteUrl, setWebsiteUrl] = useState(initialData?.website_url || '');
  const [city, setCity] = useState(initialData?.city || '');
  const [targetAudience, setTargetAudience] = useState(initialData?.target_audience || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [primaryColor, setPrimaryColor] = useState(initialData?.primary_color || '#6366F1');
  const [secondaryColor, setSecondaryColor] = useState(initialData?.secondary_color || '#06B6D4');
  const [accentColor, setAccentColor] = useState(initialData?.accent_color || '#F59E0B');
  const [fontPrimary, setFontPrimary] = useState(initialData?.font_primary || 'Cairo');
  const [fontSecondary, setFontSecondary] = useState(initialData?.font_secondary || 'Tajawal');
  const [brandVoice, setBrandVoice] = useState(initialData?.brand_voice || '');
  // Saving mid-upload would persist the previous logo and throw away the file
  // the user just picked, with no indication that anything was lost.
  const [logoUploading, setLogoUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (logoUploading) return;
    await onSubmit({
      name,
      logo_url: logoUrl,
      industry: industry || null,
      website_url: websiteUrl.trim() || null,
      city: city.trim() || null,
      target_audience: targetAudience.trim() || null,
      description: description.trim() || null,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      accent_color: accentColor,
      font_primary: fontPrimary,
      font_secondary: fontSecondary,
      brand_voice: brandVoice || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="brand-name">{t('name')}</Label>
        <Input
          id="brand-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          required
        />
      </div>

      {/* Business info — migration 045's columns. Nothing else in the product
          collected these before; the plan and analysis studios asked for the
          same facts from scratch every session and stored the answers nowhere. */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">{t('businessInfo')}</h3>

        <div className="space-y-2">
          <Label>{t('industry')}</Label>
          <div className="grid grid-cols-2 gap-2">
            {INDUSTRIES.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => setIndustry(ind)}
                aria-pressed={industry === ind}
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs transition-colors',
                  industry === ind ? selectedChipClasses : unselectedChipClasses
                )}
              >
                {t(`industries.${ind}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand-website">{t('websiteUrl')}</Label>
          <Input
            id="brand-website"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder={t('websiteUrlPlaceholder')}
            maxLength={500}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="brand-city">{t('city')}</Label>
            <Input
              id="brand-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t('cityPlaceholder')}
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-target-audience">{t('targetAudience')}</Label>
            <Input
              id="brand-target-audience"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder={t('targetAudiencePlaceholder')}
              maxLength={500}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand-description">{t('description')}</Label>
          <textarea
            id="brand-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('descriptionPlaceholder')}
            rows={3}
            maxLength={2000}
            className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base sm:text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 resize-none"
          />
          <p className="text-xs text-end text-[var(--color-text-muted)]">{description.length}/2000</p>
        </div>
      </div>

      {/* Logo */}
      <LogoUpload value={logoUrl} onChange={setLogoUrl} onUploadingChange={setLogoUploading} />

      {/* Colors */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">{t('colors')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ColorPicker label={t('primaryColor')} value={primaryColor} onChange={setPrimaryColor} />
          <ColorPicker label={t('secondaryColor')} value={secondaryColor} onChange={setSecondaryColor} />
          <ColorPicker label={t('accentColor')} value={accentColor} onChange={setAccentColor} />
        </div>
      </div>

      {/* Fonts */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">{t('fonts')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('primaryFont')}</Label>
            <Input value={fontPrimary} onChange={(e) => setFontPrimary(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('secondaryFont')}</Label>
            <Input value={fontSecondary} onChange={(e) => setFontSecondary(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Brand Voice */}
      <div className="space-y-2">
        <Label htmlFor="brand-voice">{t('brandVoice')}</Label>
        <textarea
          id="brand-voice"
          value={brandVoice}
          onChange={(e) => setBrandVoice(e.target.value)}
          placeholder={t('brandVoicePlaceholder')}
          rows={3}
          maxLength={500}
          className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base sm:text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        />
      </div>

      {/* Submit */}
      <div className="flex gap-3">
        <Button type="submit" disabled={loading || logoUploading || !name.trim()}>
          {loading ? '...' : initialData ? tCommon('save') : tCommon('create')}
        </Button>
      </div>
    </form>
  );
}
