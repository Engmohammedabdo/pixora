'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { AIModel } from '@/types/studios';
import { Zap, Sparkles, Palette } from 'lucide-react';

interface ModelSelectorProps {
  value: AIModel;
  onChange: (model: AIModel) => void;
  className?: string;
}

const models: {
  id: AIModel;
  icon: React.ReactNode;
  speed: string;
  quality: string;
}[] = [
  { id: 'gemini', icon: <Zap className="h-4 w-4" />, speed: 'fast', quality: 'high' },
  { id: 'gpt', icon: <Sparkles className="h-4 w-4" />, speed: 'medium', quality: 'highest' },
  { id: 'flux', icon: <Palette className="h-4 w-4" />, speed: 'slow', quality: 'creative' },
];

export function ModelSelector({ value, onChange, className }: ModelSelectorProps): React.ReactElement {
  const t = useTranslations('studio');

  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-sm font-medium">{t('model')}</label>
      <div className="grid grid-cols-3 gap-2">
        {models.map((model) => (
          <button
            key={model.id}
            type="button"
            onClick={() => onChange(model.id)}
            aria-pressed={value === model.id}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs transition-colors',
              value === model.id
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-[var(--color-border)] hover:border-primary-300 hover:bg-surface-2'
            )}
          >
            {model.icon}
            <span className="font-medium capitalize">{model.id === 'gpt' ? 'GPT' : model.id === 'flux' ? 'Flux' : 'Gemini'}</span>
            <div className="flex gap-1 text-[10px] text-[var(--color-text-muted)]">
              <span>{t(`speed.${model.speed}`)}</span>
              <span>·</span>
              <span>{t(`quality.${model.quality}`)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
