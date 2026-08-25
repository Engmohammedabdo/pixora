'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ColorPicker } from './ColorPicker';
import { LogoUpload } from './LogoUpload';
import type { BrandKit } from '@/lib/supabase/types';
import { INDUSTRIES, isIndustry } from '@/lib/industries';
import { normalizeWebsiteUrl, WEBSITE_URL_MAX_LENGTH } from '@/lib/brand-kits/website-url';
import { selectedChipClasses, unselectedChipClasses } from '@/components/studios/selectable-chip';
import { cn } from '@/lib/utils';

interface BrandKitFormProps {
  /**
   * `Partial<BrandKit>` (not `BrandKit`) so the onboarding step (P3.3) can seed
   * this form from an extraction draft, which has no `id`/`user_id`/
   * `created_at`/`is_default` — only the fields a customer can actually see and
   * edit. Every existing caller (the brand-kit page) passes a full `BrandKit`,
   * which already satisfies this looser type, so this is not a behaviour
   * change for them.
   */
  initialData?: Partial<BrandKit>;
  onSubmit: (data: Partial<BrandKit>) => Promise<void>;
  loading: boolean;
  /**
   * Field names (`brand_kits` column names) the caller could not determine —
   * currently only ever populated by the onboarding step, from
   * `expandMissingFields()` (lib/brand-kits/extract-draft.ts). Renders a small
   * "couldn't determine this" badge next to the field so an extraction guess
   * doesn't read as a confirmed fact. Absent (the brand-kit page's own
   * create/edit dialogs) renders nothing — zero behaviour change there.
   */
  missing?: string[];
  /**
   * Overrides the submit button's default create/save label. The default
   * picks on `initialData?.id` (only a row that has actually been saved has
   * one) rather than `!!initialData`, because the onboarding step always
   * passes a truthy draft object that was never saved — with the old
   * `!!initialData` check every onboarding save would have read "Save"
   * instead of "Create".
   */
  submitLabel?: string;
}

export function BrandKitForm({
  initialData,
  onSubmit,
  loading,
  missing = [],
  submitLabel,
}: BrandKitFormProps): React.ReactElement {
  const t = useTranslations('brandKit');
  const tCommon = useTranslations('common');
  // The one industry label set — see app/[locale]/(dashboard)/plan/page.tsx for
  // why three copies of it existed and how they had already drifted.
  const tIndustries = useTranslations('industries');

  const [name, setName] = useState(initialData?.name || '');
  const [logoUrl, setLogoUrl] = useState<string | null>(initialData?.logo_url || null);
  // Migration 045's business columns. Nullable on the wire, empty string in
  // form state — the same pattern brandVoice already used below.
  // Only a slug the chip grid below can render as selected. `brand_kits.industry`
  // is deliberately NOT enum-constrained (migration 045: "that list is allowed to
  // grow, and a database that refuses a slug the code has already shipped is an
  // outage"), it is customer-writable straight over PostgREST, and an extraction
  // draft carries whatever the n8n workflow returned. Seeded raw, an unrecognised
  // value rendered NO selected chip and no "we couldn't find this" badge, and was
  // then written straight back to the column on Save — where `industryName()`
  // returns '' for it forever, silently omitting the industry line from every
  // studio prompt. `plan/page.tsx` and `analysis/page.tsx` already guard their
  // prefill this way; the component that WRITES the column did not.
  const [industry, setIndustry] = useState(
    isIndustry(initialData?.industry ?? '') ? (initialData?.industry ?? '') : ''
  );
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
    // `normalizeWebsiteUrl`, not `.trim()`. The raw value was sent straight to
    // a schema requiring a lowercase `http(s)://` prefix, so `mysite.ae`,
    // `www.mysite.ae` and the `Https://…` an iOS keyboard produces were all a
    // 400 on an OPTIONAL field, reported as "try again" — advice that could
    // never work. lib/brand-kits/website-url.ts carries the rule and the
    // reasoning; this must stay the only place this form states it.
    await onSubmit({
      name,
      logo_url: logoUrl,
      industry: industry || null,
      website_url: normalizeWebsiteUrl(websiteUrl),
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
        <div className="flex items-center gap-2">
          <Label htmlFor="brand-name">{t('name')}</Label>
          {missing.includes('name') && (
            <Badge variant="warning" className="text-[10px] font-normal">{t('extractionMissing')}</Badge>
          )}
        </div>
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
          <div className="flex items-center gap-2">
            <Label>{t('industry')}</Label>
            {missing.includes('industry') && (
              <Badge variant="warning" className="text-[10px] font-normal">{t('extractionMissing')}</Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {INDUSTRIES.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => setIndustry((prev) => (prev === ind ? '' : ind))}
                aria-pressed={industry === ind}
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs transition-colors',
                  industry === ind ? selectedChipClasses : unselectedChipClasses
                )}
              >
                {tIndustries(ind)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand-website">{t('websiteUrl')}</Label>
          {/* See components/onboarding/WebsiteStep.tsx's twin for the full
              reasoning on `dir="ltr"` (bidi-neutral `//` in an RTL paragraph)
              and on why this is NOT `type="url"` (native validation refuses
              `mysite.ae` and would block the submit handler that normalises
              it — C1, one layer up). */}
          <Input
            id="brand-website"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder={t('websiteUrlPlaceholder')}
            maxLength={WEBSITE_URL_MAX_LENGTH}
            dir="ltr"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="brand-city">{t('city')}</Label>
              {missing.includes('city') && (
                <Badge variant="warning" className="text-[10px] font-normal">{t('extractionMissing')}</Badge>
              )}
            </div>
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
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{t('colors')}</h3>
          {(missing.includes('primary_color') || missing.includes('secondary_color') || missing.includes('accent_color')) && (
            <Badge variant="warning" className="text-[10px] font-normal">{t('extractionMissing')}</Badge>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ColorPicker label={t('primaryColor')} value={primaryColor} onChange={setPrimaryColor} />
          <ColorPicker label={t('secondaryColor')} value={secondaryColor} onChange={setSecondaryColor} />
          <ColorPicker label={t('accentColor')} value={accentColor} onChange={setAccentColor} />
        </div>
      </div>

      {/* Fonts */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{t('fonts')}</h3>
          {(missing.includes('font_primary') || missing.includes('font_secondary')) && (
            <Badge variant="warning" className="text-[10px] font-normal">{t('extractionMissing')}</Badge>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* `maxLength` matches `brandKitSharedFields.font_*`'s 50. These were
              the only two Inputs in this form without one, and they are exactly
              the two fields the extraction workflow does NOT clip — its font
              source regex returns `var(--wp--preset--font-family--…)` on any
              WordPress/Elementor site, well past 50. `maxLength` does not
              truncate a programmatically-set value, so the route's own cap
              (upstreamText(50)) is what protects the seeded case; this one
              protects what the customer types. */}
          <div className="space-y-2">
            <Label>{t('primaryFont')}</Label>
            <Input value={fontPrimary} onChange={(e) => setFontPrimary(e.target.value)} maxLength={50} />
          </div>
          <div className="space-y-2">
            <Label>{t('secondaryFont')}</Label>
            <Input value={fontSecondary} onChange={(e) => setFontSecondary(e.target.value)} maxLength={50} />
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

      {/* Submit.
          The button is disabled without a name, and used to say nothing about
          why — worst on the onboarding SUCCESS arm, where the crawl filled
          everything else and the one blocker was unmarked. Two halves: the
          Name field carries the "we couldn't find this" badge above (via
          `missing`), and the button states its own reason here, which also
          covers the brand-kit page's dialogs where `missing` is never passed. */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <Button type="submit" disabled={loading || logoUploading || !name.trim()}>
            {loading ? '...' : submitLabel ?? (initialData?.id ? tCommon('save') : tCommon('create'))}
          </Button>
        </div>
        {!name.trim() && (
          <p className="text-xs text-[var(--color-text-muted)]">{t('nameRequiredHint')}</p>
        )}
      </div>
    </form>
  );
}
