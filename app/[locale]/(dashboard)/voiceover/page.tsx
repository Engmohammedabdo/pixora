'use client';

import { useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CreditCost } from '@/components/shared/CreditCost';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useCreditsStore } from '@/store/credits';
import { useUser } from '@/hooks/useUser';
import { cn } from '@/lib/utils';
import { Sparkles, AlertTriangle, Mic, Download, Play, Pause, Lock, Info } from 'lucide-react';
import { calculateVoiceoverCost, getVoiceoverConfig, estimateVoiceoverDuration } from '@/lib/credits/voiceover-costs';

// All voices — some locked per plan
const ALL_VOICES = [
  { id: 'male_pro', nameKey: 'voices.male_pro', provider: 'openai' },
  { id: 'female_pro', nameKey: 'voices.female_pro', provider: 'openai' },
  { id: 'male_youth', nameKey: 'voices.male_youth', provider: 'openai' },
  { id: 'female_youth', nameKey: 'voices.female_youth', provider: 'openai' },
  { id: 'male_formal', nameKey: 'voices.male_formal', provider: 'openai' },
  { id: 'el_arabic_male_1', nameKey: 'voices.el_arabic_male_1', provider: 'elevenlabs' },
  { id: 'el_arabic_female_1', nameKey: 'voices.el_arabic_female_1', provider: 'elevenlabs' },
  { id: 'el_arabic_male_2', nameKey: 'voices.el_arabic_male_2', provider: 'elevenlabs' },
  { id: 'el_arabic_female_2', nameKey: 'voices.el_arabic_female_2', provider: 'elevenlabs' },
  { id: 'el_arabic_formal', nameKey: 'voices.el_arabic_formal', provider: 'elevenlabs' },
] as const;

const ALL_DIALECTS = ['saudi', 'emirati', 'egyptian', 'gulf', 'formal'] as const;
const ALL_SPEEDS = ['0.5', '0.75', '1', '1.25', '1.5'] as const;
const TONES = ['professional', 'friendly', 'energetic', 'calm'] as const;

// Voice name fallbacks for when i18n keys are missing
const VOICE_NAMES: Record<string, string> = {
  male_pro: 'رجل - احترافي',
  female_pro: 'امرأة - احترافية',
  male_youth: 'رجل - شبابي',
  female_youth: 'امرأة - شبابية',
  male_formal: 'رجل - رسمي',
  el_arabic_male_1: 'رجل عربي - احترافي 🌟',
  el_arabic_female_1: 'امرأة عربية - احترافية 🌟',
  el_arabic_male_2: 'رجل عربي - دافئ 🌟',
  el_arabic_female_2: 'امرأة عربية - حماسية 🌟',
  el_arabic_formal: 'راوي - فصحى 🌟',
};

export default function VoiceOverPage(): React.ReactElement {
  const t = useTranslations();
  const tVo = useTranslations('voiceover');
  const { profile } = useUser();
  const planId = profile?.plan_id || 'free';
  const config = getVoiceoverConfig(planId);

  const [script, setScript] = useState('');
  const [voice, setVoice] = useState('male_pro');
  const [dialect, setDialect] = useState('formal');
  const [speed, setSpeed] = useState('1');
  const [tone, setTone] = useState('professional');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [provider, setProvider] = useState<string>('');
  const [enhanced, setEnhanced] = useState(false);
  const setBalance = useCreditsStore((s) => s.setBalance);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const estimatedDuration = estimateVoiceoverDuration(script.length, parseFloat(speed));
  const creditCost = calculateVoiceoverCost(script.length, parseFloat(speed), planId);
  const isValid = script.length >= 1 && estimatedDuration <= config.maxDurationSeconds;

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!isValid) return;
    setIsLoading(true); setError(null); setAudioUrl(null); setIsPlaying(false);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    try {
      const res = await fetch('/api/studios/voiceover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, voice, dialect, speed, tone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error === 'voice_not_available' ? 'هذا الصوت غير متاح في خطتك الحالية' : data.error === 'dialect_not_available' ? 'هذه اللهجة غير متاحة في خطتك الحالية' : data.error === 'duration_exceeded' ? `المدة القصوى لخطتك ${data.maxDuration} ثانية` : data.error); return; }
      setAudioUrl(data.data.audioUrl);
      setAudioDuration(data.data.duration || 0);
      setProvider(data.data.provider || '');
      setEnhanced(data.data.enhanced || false);
      if (data.data.newBalance !== undefined) setBalance(data.data.newBalance);
    } catch { setError('Network error'); } finally { setIsLoading(false); }
  }, [isValid, script, voice, dialect, speed, tone, setBalance]);

  const dialectLabels: Record<string, string> = { saudi: tVo('dialects.saudi'), emirati: tVo('dialects.emirati'), egyptian: tVo('dialects.egyptian'), gulf: tVo('dialects.gulf'), formal: tVo('dialects.formal') };
  const toneLabels: Record<string, string> = { professional: tVo('tones.professional'), friendly: tVo('tones.friendly'), energetic: tVo('tones.energetic'), calm: tVo('tones.calm') };

  const inputPanel = (
    <div className="space-y-4">
      {/* Script */}
      <div className="space-y-2">
        <Label>{tVo('script')}</Label>
        <textarea value={script} onChange={(e) => setScript(e.target.value)} placeholder="اكتب نص التعليق الصوتي هنا..." rows={5} maxLength={2000} className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none" />
        <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
          <span>~{estimatedDuration}s تقريباً {estimatedDuration > config.maxDurationSeconds && <span className="text-[var(--color-error)]">(تجاوز الحد: {config.maxDurationSeconds}s)</span>}</span>
          <span>{script.length}/2000</span>
        </div>
      </div>

      {/* Voices — with locks */}
      <div className="space-y-2">
        <Label>{tVo('voice')}</Label>
        <div className="space-y-1">
          {ALL_VOICES.map((v) => {
            const isAvailable = config.voicesAvailable.includes(v.id);
            const isEL = v.provider === 'elevenlabs';
            return (
              <button key={v.id} type="button"
                onClick={() => isAvailable && setVoice(v.id)}
                disabled={!isAvailable}
                aria-pressed={voice === v.id}
                className={cn(
                  'w-full text-start rounded-lg border px-3 py-2 text-xs transition-colors flex items-center justify-between',
                  !isAvailable && 'opacity-50 cursor-not-allowed',
                  voice === v.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-[var(--color-border)] hover:border-primary-300'
                )}>
                <span>{VOICE_NAMES[v.id] || v.id}</span>
                <div className="flex items-center gap-1">
                  {isEL && <Badge variant="secondary" className="text-[8px] px-1">ElevenLabs</Badge>}
                  {!isAvailable && <Lock className="h-3 w-3 text-[var(--color-text-muted)]" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dialect — with locks */}
      <div className="space-y-2">
        <Label>{tVo('dialect')}</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_DIALECTS.map((d) => {
            const isAvailable = config.dialectsAvailable.includes(d);
            return (
              <button key={d} type="button"
                onClick={() => isAvailable && setDialect(d)}
                disabled={!isAvailable}
                aria-pressed={dialect === d}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs transition-colors flex items-center gap-1',
                  !isAvailable && 'opacity-40 cursor-not-allowed',
                  dialect === d ? 'bg-primary-500 text-white' : 'bg-surface-2'
                )}>
                {dialectLabels[d]}
                {!isAvailable && <Lock className="h-2.5 w-2.5" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Speed — expanded for paid plans */}
      <div className="space-y-2">
        <Label>{tVo('speed')}</Label>
        <div className="flex gap-2">
          {ALL_SPEEDS.map((s) => {
            const isAvailable = planId === 'free' ? ['0.75', '1', '1.25'].includes(s) : true;
            return (
              <button key={s} type="button"
                onClick={() => isAvailable && setSpeed(s)}
                disabled={!isAvailable}
                aria-pressed={speed === s}
                className={cn(
                  'flex-1 rounded-lg border px-2 py-2 text-xs transition-colors',
                  !isAvailable && 'opacity-40 cursor-not-allowed',
                  speed === s ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-[var(--color-border)] hover:border-primary-300'
                )}>
                {s}x
              </button>
            );
          })}
        </div>
      </div>

      {/* Tone — locked for Free/Starter */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>{tVo('tone')}</Label>
          {!config.toneEnabled && <Badge variant="outline" className="text-[8px] gap-0.5"><Lock className="h-2 w-2" /> Pro+</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          {TONES.map((tn) => (
            <button key={tn} type="button"
              onClick={() => config.toneEnabled && setTone(tn)}
              disabled={!config.toneEnabled}
              aria-pressed={tone === tn}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs transition-colors',
                !config.toneEnabled && 'opacity-40 cursor-not-allowed',
                tone === tn ? 'bg-primary-500 text-white' : 'bg-surface-2'
              )}>
              {toneLabels[tn]}
            </button>
          ))}
        </div>
      </div>

      {/* Info badges */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        <Badge variant="outline" className="gap-1">
          {config.provider === 'elevenlabs' ? '🌟 ElevenLabs' : 'OpenAI TTS'}
        </Badge>
        <Badge variant="outline">{config.quality === 'tts-1-hd' ? 'HD' : 'Standard'}</Badge>
        <Badge variant="outline">Max: {config.maxDurationSeconds}s</Badge>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <CreditCost cost={creditCost} />
        <Button onClick={handleGenerate} disabled={!isValid || isLoading} className="gap-2">
          <Sparkles className="h-4 w-4" />
          {isLoading ? t('studio.generating') : t('studio.generate')}
        </Button>
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
      <div className="flex items-center gap-2">
        <Badge variant="outline">{audioDuration}s — التعليق الصوتي</Badge>
        {provider && <Badge variant="secondary" className="text-[9px]">{provider === 'elevenlabs' ? '🌟 ElevenLabs' : 'OpenAI'}</Badge>}
        {enhanced && <Badge variant="secondary" className="text-[9px] gap-0.5"><Info className="h-2.5 w-2.5" /> محسّن</Badge>}
      </div>
      <div className="w-full max-w-sm bg-surface-2 rounded-xl p-6 flex flex-col items-center gap-4">
        <audio
          ref={(el) => { audioRef.current = el; }}
          src={audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <div className="flex gap-0.5">{Array.from({ length: 20 }).map((_, i) => (<div key={i} className={`w-1 rounded-full transition-all ${isPlaying ? 'bg-primary-500 animate-pulse' : 'bg-primary-300'}`} style={{ height: `${12 + Math.random() * 24}px` }} />))}</div>
        </div>
        <Button size="lg" variant="default" className="rounded-full h-14 w-14" onClick={() => {
          if (!audioRef.current) return;
          if (isPlaying) { audioRef.current.pause(); } else { audioRef.current.play(); }
        }}>
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ms-0.5" />}
        </Button>
        <p className="text-xs text-[var(--color-text-muted)]">{audioDuration} {tVo('second')}</p>
      </div>
      <a href={audioUrl} download={`pyrasuite-voiceover-${Date.now()}.mp3`}>
        <Button variant="outline" className="gap-2"><Download className="h-4 w-4" />{tVo('downloadMp3')}</Button>
      </a>
    </div>
  );

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <div className="px-6 py-4 border-b"><h1 className="text-xl font-bold font-cairo">{t('nav.voiceover')}</h1><p className="text-sm text-[var(--color-text-secondary)]">{tVo('description')}</p></div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} />
    </div>
  );
}
