'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CreditCost } from '@/components/shared/CreditCost';
import { cn } from '@/lib/utils';
import { Upload, X, Camera, Sparkles } from 'lucide-react';

interface PhotoshootFormProps {
  onSubmit: (input: {
    productImageUrl: string;
    environment: string;
    shots: 1 | 3 | 6;
    notes?: string;
  }) => void;
  isLoading: boolean;
}

const ENVIRONMENTS = [
  { id: 'white_studio', emoji: '⬜' },
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

export function PhotoshootForm({ onSubmit, isLoading }: PhotoshootFormProps): React.ReactElement {
  const t = useTranslations('photoshoot');
  const tStudio = useTranslations('studio');

  const [productImage, setProductImage] = useState<string | null>(null);
  const [environment, setEnvironment] = useState<string>('white_studio');
  const [shots, setShots] = useState<1 | 3 | 6>(6);
  const [notes, setNotes] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedShotOption = SHOT_OPTIONS.find((o) => o.count === shots)!;
  const isValid = !!productImage;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      setProductImage(URL.createObjectURL(file));
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
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Product Image */}
      <div className="space-y-2">
        <Label>{t('productImage')} *</Label>
        {productImage ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={productImage} alt="" className="h-32 w-32 rounded-lg object-cover border" />
            <button
              type="button"
              onClick={() => setProductImage(null)}
              className="absolute -top-2 -end-2 rounded-full bg-[var(--color-error)] p-1 text-white"
            >
              <X className="h-3 w-3" />
            </button>
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
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
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
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                environment === env.id
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-[var(--color-border)] hover:border-primary-300'
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
              className={cn(
                'flex-1 flex flex-col items-center gap-1 rounded-lg border px-3 py-3 transition-colors',
                shots === option.count
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-[var(--color-border)] hover:border-primary-300'
              )}
            >
              <span className="text-lg font-bold">{option.count}</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">{option.credits} credits</span>
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>{t('notes')}</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('notesPlaceholder')}
          rows={2}
          maxLength={500}
          className="flex w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 resize-none"
        />
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <CreditCost cost={selectedShotOption.credits} />
        <Button type="submit" disabled={!isValid || isLoading} className="gap-2">
          <Sparkles className="h-4 w-4" />
          {isLoading ? tStudio('generating') : tStudio('generate')}
        </Button>
      </div>
    </form>
  );
}
