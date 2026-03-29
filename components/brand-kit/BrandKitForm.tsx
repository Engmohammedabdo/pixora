'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ColorPicker } from './ColorPicker';
import { LogoUpload } from './LogoUpload';
import type { BrandKit } from '@/lib/supabase/types';

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
  const [primaryColor, setPrimaryColor] = useState(initialData?.primary_color || '#6366F1');
  const [secondaryColor, setSecondaryColor] = useState(initialData?.secondary_color || '#06B6D4');
  const [accentColor, setAccentColor] = useState(initialData?.accent_color || '#F59E0B');
  const [fontPrimary, setFontPrimary] = useState(initialData?.font_primary || 'Cairo');
  const [fontSecondary, setFontSecondary] = useState(initialData?.font_secondary || 'Tajawal');
  const [brandVoice, setBrandVoice] = useState(initialData?.brand_voice || '');

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    await onSubmit({
      name,
      logo_url: logoUrl,
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

      {/* Logo */}
      <LogoUpload value={logoUrl} onChange={setLogoUrl} />

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
          className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        />
      </div>

      {/* Submit */}
      <div className="flex gap-3">
        <Button type="submit" disabled={loading || !name.trim()}>
          {loading ? '...' : initialData ? tCommon('save') : tCommon('create')}
        </Button>
      </div>
    </form>
  );
}
