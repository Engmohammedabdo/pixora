'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles } from 'lucide-react';
import type { AIModel } from '@/types/studios';

interface ModelComparisonProps {
  prompt: string;
  onSelect?: (model: AIModel, url: string) => void;
}

const MODELS: { id: AIModel; name: string; description: string }[] = [
  { id: 'gemini', name: 'Gemini', description: 'سريع' },
  { id: 'gpt', name: 'GPT', description: 'عالي الجودة' },
  { id: 'flux', name: 'Flux', description: 'إبداعي' },
];

export function ModelComparison({ prompt, onSelect }: ModelComparisonProps): React.ReactElement {
  const [results, setResults] = useState<Record<string, { url: string; loading: boolean }>>({
    gemini: { url: '', loading: false },
    gpt: { url: '', loading: false },
    flux: { url: '', loading: false },
  });

  const handleCompare = async (): Promise<void> => {
    setResults({ gemini: { url: '', loading: true }, gpt: { url: '', loading: true }, flux: { url: '', loading: true } });

    const promises = MODELS.map(async (model) => {
      try {
        const res = await fetch('/api/studios/creator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, model: model.id, resolution: '1080p', style: 'photographic', variations: 1 }),
        });
        const data = await res.json();
        return { model: model.id, url: data.data?.imageUrls?.[0] || '' };
      } catch {
        return { model: model.id, url: '' };
      }
    });

    const all = await Promise.all(promises);
    const newResults: Record<string, { url: string; loading: boolean }> = {};
    all.forEach(r => { newResults[r.model] = { url: r.url, loading: false }; });
    setResults(newResults);
  };

  return (
    <div className="space-y-4">
      <Button onClick={handleCompare} disabled={!prompt || prompt.length < 10} className="gap-2">
        <Sparkles className="h-4 w-4" />
        قارن الثلاث نماذج
      </Button>
      <div className="grid grid-cols-3 gap-3">
        {MODELS.map((model) => {
          const r = results[model.id];
          return (
            <div key={model.id} className="rounded-xl border overflow-hidden">
              <div className="p-2 flex items-center justify-between bg-[var(--color-surface-2)]">
                <Badge variant="secondary" className="text-xs">{model.name}</Badge>
                <span className="text-[10px] text-[var(--color-text-muted)]">{model.description}</span>
              </div>
              {r?.loading ? (
                <Skeleton className="aspect-square" />
              ) : r?.url ? (
                <button onClick={() => onSelect?.(model.id, r.url)} className="w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.url} alt={model.name} className="w-full aspect-square object-cover" />
                </button>
              ) : (
                <div className="aspect-square bg-[var(--color-surface-2)] flex items-center justify-center text-2xl">
                  <Sparkles className="h-8 w-8 text-[var(--color-text-muted)]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
