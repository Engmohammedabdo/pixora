'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CreditCost } from '@/components/shared/CreditCost';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useCreditsStore } from '@/store/credits';
import { cn } from '@/lib/utils';
import { Sparkles, AlertTriangle, Mic, Download, Play, Pause } from 'lucide-react';

const VOICES = ['male_pro', 'female_pro', 'male_youth', 'female_youth', 'male_formal'] as const;

const DIALECTS = ['saudi', 'emirati', 'egyptian', 'gulf', 'formal'] as const;
const SPEEDS = ['0.75', '1', '1.25'] as const;
const TONES = ['professional', 'friendly', 'energetic', 'calm'] as const;

export default function VoiceOverPage(): React.ReactElement {
  const t = useTranslations();
  const tVo = useTranslations('voiceover');
  const [script, setScript] = useState('');
  const [voice, setVoice] = useState('male_pro');
  const [dialect, setDialect] = useState('saudi');
  const [speed, setSpeed] = useState('1');
  const [tone, setTone] = useState('professional');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const setBalance = useCreditsStore((s) => s.setBalance);

  const creditCost = Math.max(1, Math.ceil(script.length / 150));
  const isValid = script.length >= 1;

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!isValid) return;
    setIsLoading(true); setError(null); setAudioUrl(null);
    try {
      const res = await fetch('/api/studios/voiceover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, voice, dialect, speed, tone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setAudioUrl(data.data.audioUrl);
      setAudioDuration(data.data.duration || 0);
      if (data.data.newBalance !== undefined) setBalance(data.data.newBalance);
    } catch { setError('Network error'); } finally { setIsLoading(false); }
  }, [isValid, script, voice, dialect, speed, tone, setBalance]);

  const dialectLabels: Record<string, string> = { saudi: tVo('dialects.saudi'), emirati: tVo('dialects.emirati'), egyptian: tVo('dialects.egyptian'), gulf: tVo('dialects.gulf'), formal: tVo('dialects.formal') };
  const toneLabels: Record<string, string> = { professional: tVo('tones.professional'), friendly: tVo('tones.friendly'), energetic: tVo('tones.energetic'), calm: tVo('tones.calm') };
  const speedLabels: Record<string, string> = { '0.75': tVo('speeds.slow'), '1': tVo('speeds.normal'), '1.25': tVo('speeds.fast') };

  const inputPanel = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{tVo('script')}</Label>
        <textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="اكتب نص التعليق الصوتي هنا..." rows={5} maxLength={500} className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none" />
        <div className="flex justify-between text-xs text-[var(--color-text-muted)]"><span>~{Math.ceil(script.length / 5)}s تقريباً</span><span>{script.length}/500</span></div>
      </div>
      <div className="space-y-2"><Label>{tVo('voice')}</Label><div className="space-y-1">{VOICES.map((v) => (<button key={v} type="button" onClick={() => setVoice(v)} className={cn('w-full text-start rounded-lg border px-3 py-2 text-xs transition-colors', voice === v ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-[var(--color-border)] hover:border-primary-300')}>{tVo(`voices.${v}`)}</button>))}</div></div>
      <div className="space-y-2"><Label>{tVo('dialect')}</Label><div className="flex flex-wrap gap-2">{DIALECTS.map((d) => (<button key={d} type="button" onClick={() => setDialect(d)} className={cn('rounded-full px-3 py-1.5 text-xs transition-colors', dialect === d ? 'bg-primary-500 text-white' : 'bg-surface-2')}>{dialectLabels[d]}</button>))}</div></div>
      <div className="space-y-2"><Label>{tVo('speed')}</Label><div className="flex gap-2">{SPEEDS.map((s) => (<button key={s} type="button" onClick={() => setSpeed(s)} className={cn('flex-1 rounded-lg border px-3 py-2 text-xs transition-colors', speed === s ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-[var(--color-border)] hover:border-primary-300')}>{speedLabels[s]}</button>))}</div></div>
      <div className="space-y-2"><Label>{tVo('tone')}</Label><div className="flex flex-wrap gap-2">{TONES.map((tn) => (<button key={tn} type="button" onClick={() => setTone(tn)} className={cn('rounded-full px-3 py-1.5 text-xs transition-colors', tone === tn ? 'bg-primary-500 text-white' : 'bg-surface-2')}>{toneLabels[tn]}</button>))}</div></div>
      <div className="flex items-center justify-between pt-2">
        <CreditCost cost={creditCost} />
        <Button onClick={handleGenerate} disabled={!isValid || isLoading} className="gap-2"><Sparkles className="h-4 w-4" />{isLoading ? t('studio.generating') : t('studio.generate')}</Button>
      </div>
    </div>
  );

  const previewPanel = isLoading ? (
    <div className="flex flex-col items-center py-12 gap-4"><Skeleton className="h-20 w-full max-w-md rounded-lg" /><Skeleton className="h-8 w-32 rounded" /></div>
  ) : error ? (
    <div className="flex flex-col items-center py-12 gap-4"><AlertTriangle className="h-12 w-12 text-[var(--color-error)]" /><p className="text-sm text-[var(--color-error)]">{error}</p></div>
  ) : !audioUrl ? (
    <div className="flex flex-col items-center py-12 text-[var(--color-text-muted)]"><Mic className="h-12 w-12" /><p className="text-sm mt-4">{tVo('emptyState')}</p></div>
  ) : (
    <div className="flex flex-col items-center py-12 gap-6">
      <Badge variant="outline">Mock Audio — {audioDuration}s</Badge>
      <div className="w-full max-w-sm bg-surface-2 rounded-xl p-6 flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <div className="flex gap-0.5">{Array.from({ length: 20 }).map((_, i) => (<div key={i} className="w-1 bg-primary-300 rounded-full" style={{ height: `${12 + Math.random() * 24}px` }} />))}</div>
        </div>
        <Button size="lg" variant="default" className="rounded-full h-14 w-14" onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ms-0.5" />}
        </Button>
        <p className="text-xs text-[var(--color-text-muted)]">{audioDuration} {tVo('second')}</p>
      </div>
      <Button variant="outline" className="gap-2"><Download className="h-4 w-4" />{tVo('downloadMp3')}</Button>
    </div>
  );

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <div className="px-6 py-4 border-b"><h1 className="text-xl font-bold font-cairo">{t('nav.voiceover')}</h1><p className="text-sm text-[var(--color-text-secondary)]">{tVo('description')}</p></div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} />
    </div>
  );
}
