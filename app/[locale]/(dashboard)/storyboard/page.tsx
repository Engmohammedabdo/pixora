'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreditCost } from '@/components/shared/CreditCost';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreditsStore } from '@/store/credits';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { cn } from '@/lib/utils';
import { Sparkles, AlertTriangle, Film, Camera, Music, FileText } from 'lucide-react';
import { generateStoryboardPdf, openPdfInNewTab } from '@/lib/export/pdf';

const STYLES = ['cinematic', 'ugc', 'animation', 'documentary'] as const;
const PLATFORMS = ['instagram_reel', 'tiktok', 'youtube', 'tv'] as const;
const DURATIONS = [15, 30, 60] as const;

interface Scene {
  scene_number: number; visual_description: string; dialogue: string;
  camera_angle: string; camera_movement: string; duration_seconds: number;
  mood: string; music_note: string;
}

export default function StoryboardPage(): React.ReactElement {
  const t = useTranslations();
  const tSb = useTranslations('storyboard');
  const [concept, setConcept] = useState('');
  const [duration, setDuration] = useState<number>(30);
  const [style, setStyle] = useState('cinematic');
  const [platform, setPlatform] = useState('instagram_reel');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setBalance = useCreditsStore((s) => s.setBalance);

  const isValid = concept.length >= 10;

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!isValid) return;
    setIsLoading(true); setError(null); setScenes([]);
    try {
      const res = await fetch('/api/studios/storyboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept, duration, style, platform }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setScenes(data.data.scenes || []);
      if (data.data.newBalance !== undefined) setBalance(data.data.newBalance);
    } catch { setError('Network error'); } finally { setIsLoading(false); }
  }, [isValid, concept, duration, style, platform, setBalance]);

  const styleLabels: Record<string, string> = { cinematic: tSb('styles.cinematic'), ugc: tSb('styles.ugc'), animation: tSb('styles.animation'), documentary: tSb('styles.documentary') };
  const platformLabels: Record<string, string> = { instagram_reel: tSb('platforms.instagram_reel'), tiktok: tSb('platforms.tiktok'), youtube: tSb('platforms.youtube'), tv: tSb('platforms.tv') };

  const inputPanel = (
    <div className="space-y-4">
      <div className="space-y-2"><Label>{tSb('videoConcept')}</Label><textarea value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="وصف فكرة الفيديو التسويقي..." rows={4} maxLength={1000} className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none" /></div>
      <div className="space-y-2">
        <Label>{tSb('duration')}</Label>
        <div className="flex gap-2">{DURATIONS.map((d) => (<button key={d} type="button" onClick={() => setDuration(d)} className={cn('flex-1 rounded-lg border px-3 py-2 text-sm transition-colors', duration === d ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-[var(--color-border)] hover:border-primary-300')}>{d}s</button>))}</div>
      </div>
      <div className="space-y-2">
        <Label>{tSb('style')}</Label>
        <div className="grid grid-cols-2 gap-2">{STYLES.map((s) => (<button key={s} type="button" onClick={() => setStyle(s)} className={cn('rounded-lg border px-3 py-2 text-xs transition-colors', style === s ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-[var(--color-border)] hover:border-primary-300')}>{styleLabels[s]}</button>))}</div>
      </div>
      <div className="space-y-2">
        <Label>{tSb('platform')}</Label>
        <div className="grid grid-cols-2 gap-2">{PLATFORMS.map((p) => (<button key={p} type="button" onClick={() => setPlatform(p)} className={cn('rounded-lg border px-3 py-2 text-xs transition-colors', platform === p ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-[var(--color-border)] hover:border-primary-300')}>{platformLabels[p]}</button>))}</div>
      </div>
      <div className="flex items-center justify-between pt-2">
        <CreditCost cost={CREDIT_COSTS.storyboard} />
        <Button onClick={handleGenerate} disabled={!isValid || isLoading} className="gap-2"><Sparkles className="h-4 w-4" />{isLoading ? t('studio.generating') : t('studio.generate')}</Button>
      </div>
    </div>
  );

  const previewPanel = isLoading ? (
    <div className="grid grid-cols-3 gap-3 py-6">{Array.from({ length: 9 }).map((_, i) => (<Skeleton key={i} className="h-40 rounded-lg" />))}</div>
  ) : error ? (
    <div className="flex flex-col items-center py-12 gap-4"><AlertTriangle className="h-12 w-12 text-[var(--color-error)]" /><p className="text-sm text-[var(--color-error)]">{error}</p></div>
  ) : scenes.length === 0 ? (
    <div className="flex flex-col items-center py-12 text-[var(--color-text-muted)]"><Film className="h-12 w-12" /><p className="text-sm mt-4">{tSb('emptyState')}</p></div>
  ) : (
    <div className="space-y-3">
    <div>
      <Button size="sm" variant="outline" className="gap-1" onClick={() => openPdfInNewTab(generateStoryboardPdf(scenes, concept))}>
        <FileText className="h-3 w-3" /> {tSb('exportPdf')}
      </Button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {scenes.map((scene) => (
        <Card key={scene.scene_number} className="overflow-hidden">
          <div className="h-24 bg-surface-2 flex items-center justify-center text-2xl">🎬</div>
          <CardHeader className="pb-1 px-3 pt-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs">Scene {scene.scene_number}</CardTitle>
              <Badge variant="secondary" className="text-[9px]">{scene.duration_seconds}s</Badge>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1.5 text-[11px]">
            <p className="text-[var(--color-text-secondary)]" dir="ltr">{scene.visual_description.substring(0, 80)}...</p>
            <p className="font-medium">{scene.dialogue}</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-[8px] gap-0.5 px-1"><Camera className="h-2 w-2" />{scene.camera_angle}</Badge>
              <Badge variant="outline" className="text-[8px] gap-0.5 px-1"><Music className="h-2 w-2" />{scene.mood}</Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <div className="px-6 py-4 border-b"><h1 className="text-xl font-bold font-cairo">{t('nav.storyboard')}</h1><p className="text-sm text-[var(--color-text-secondary)]">{tSb('description')}</p></div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} />
    </div>
  );
}
