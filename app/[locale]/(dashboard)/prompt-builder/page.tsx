'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { CreditCost } from '@/components/shared/CreditCost';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/routing';
import { Sparkles, Copy, Check, ArrowRight, Lightbulb } from 'lucide-react';

const OUTPUT_TYPES = ['image', 'video', 'copy', 'campaign'] as const;

interface PromptResult {
  prompt: string;
  style: string;
  tip: string;
}

export default function PromptBuilderPage(): React.ReactElement {
  const t = useTranslations();
  const [description, setDescription] = useState('');
  const [outputType, setOutputType] = useState<string>('image');
  const [results, setResults] = useState<PromptResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (description.length < 5) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/studios/prompt-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, outputType }),
      });
      const data = await res.json();
      if (data.success) setResults(data.data.prompts);
    } catch { /* */ } finally {
      setIsLoading(false);
    }
  }, [description, outputType]);

  const handleCopy = async (text: string, idx: number): Promise<void> => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const studioMap: Record<string, string> = { image: '/creator', campaign: '/campaign' };

  const inputPanel = (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>وصف ما تريد بالعربية</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="مثال: صورة إعلانية لعطر فاخر على رخام مع إضاءة ناعمة..."
          rows={4}
          maxLength={500}
          className="flex w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none"
        />
        <p className="text-xs text-end text-[var(--color-text-muted)]">{description.length}/500</p>
      </div>

      <div className="space-y-2">
        <Label>نوع المحتوى</Label>
        <div className="grid grid-cols-2 gap-2">
          {OUTPUT_TYPES.map((type) => (
            <button key={type} type="button" onClick={() => setOutputType(type)}
              className={cn('rounded-lg border px-3 py-2 text-sm capitalize transition-colors',
                outputType === type ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-[var(--color-border)] hover:border-primary-300'
              )}>
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <CreditCost cost={0} />
        <Button onClick={handleGenerate} disabled={description.length < 5 || isLoading} className="gap-2">
          <Sparkles className="h-4 w-4" />
          {isLoading ? t('studio.generating') : 'Build Prompt'}
        </Button>
      </div>
    </div>
  );

  const previewPanel = results.length === 0 ? (
    <div className="flex flex-col items-center justify-center h-full gap-2 py-12 text-[var(--color-text-muted)]">
      <Lightbulb className="h-12 w-12" />
      <p className="text-sm mt-4">البرومبتات ستظهر هنا</p>
    </div>
  ) : (
    <div className="space-y-4">
      {results.map((r, i) => (
        <Card key={i}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="secondary">{r.style}</Badge>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => handleCopy(r.prompt, i)}>
                  {copiedIdx === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedIdx === i ? t('studio.copied') : t('studio.copyCaption')}
                </Button>
                {studioMap[outputType] && (
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" asChild>
                    <Link href={`${studioMap[outputType]}?prompt=${encodeURIComponent(r.prompt)}`}>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
            <p className="text-sm leading-relaxed font-mono bg-surface-2 rounded p-3" dir="ltr">{r.prompt}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">{r.tip}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <div className="px-6 py-4 border-b">
        <h1 className="text-xl font-bold font-cairo">{t('nav.promptBuilder')}</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">حوّل وصفك بالعربي لبرومبت احترافي بالإنجليزي — مجاناً</p>
      </div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} />
    </div>
  );
}
