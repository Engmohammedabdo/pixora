'use client';

import { useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreditCost } from '@/components/shared/CreditCost';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreditsStore } from '@/store/credits';
import { useCredits } from '@/hooks/useCredits';
import { useUser } from '@/hooks/useUser';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { selectedChipClasses, unselectedChipClasses } from '@/components/studios/selectable-chip';
import { cn } from '@/lib/utils';
import { toStudioError, getGatedUpgradeVariant, type StudioError } from '@/lib/studio-errors';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { Link } from '@/i18n/routing';
import { Sparkles, AlertTriangle, Film, Camera, Music, FileText } from 'lucide-react';
import { generateStoryboardPdf, openPdfInNewTab } from '@/lib/export/pdf';
import { ProjectSelector } from '@/components/shared/ProjectSelector';
import { useProjectSelection } from '@/hooks/useProjectSelection';
import { RecentWork } from '@/components/shared/RecentWork';
import { WorkingIdentityBar } from '@/components/studios/WorkingIdentityBar';

/**
 * A stored `generations.input` value, as a string.
 *
 * Restoring a past run used to hand back only `output`, so the form kept whatever
 * the customer had last typed — and this page passes live form state into its PDF
 * export, which meant a restored run was exported under the wrong name.
 */
function inputText(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  return typeof v === 'string' ? v : '';
}


const STYLES = ['cinematic', 'ugc', 'animation', 'documentary'] as const;
const PLATFORMS = ['instagram_reel', 'tiktok', 'youtube', 'tv'] as const;
// Strings, not numbers — same reason as plan/page.tsx: the API validates
// z.enum(['15','30','60']) and Zod v4 does not coerce, so numbers made every
// request fail validation before a storyboard was ever generated.
const DURATIONS = ['15', '30', '60'] as const;
type Duration = (typeof DURATIONS)[number];

// Every field is optional on purpose. The route validates the model's shape now,
// but rows written before that guard existed are still restored here out of
// `generations.output` — and this component's render is the last thing standing
// between a thin field and the segment error boundary eating a paid-for
// storyboard. Optional types force the guard at compile time.
interface Scene {
  scene_number?: number; visual_description?: string; dialogue?: string;
  camera_angle?: string; camera_movement?: string; duration_seconds?: number;
  mood?: string; music_note?: string;
}

/** The ELEMENTS, not just the array. A stored row can hold `[null, 7, {...}]`
 *  under `scenes`, and `scene.scene_number` on a null element throws through
 *  the segment error boundary exactly as the missing array guard used to —
 *  generateStoryboardPdf reads the same array, so it throws there too.
 *  Normalising at the two points scenes enter state covers both. */
const toScenes = (value: unknown): Scene[] =>
  Array.isArray(value) ? value.filter((s): s is Scene => typeof s === 'object' && s !== null) : [];

/** Model output printed as text. `undefined.substring()` is what took the whole
 *  studio down; `String(undefined)` on screen is barely better. */
const text = (value: unknown): string =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';

export default function StoryboardPage(): React.ReactElement {
  const t = useTranslations();
  // The API sits outside app/[locale], so the deliverable's language has to be
  // sent explicitly — an en-locale customer used to pay full price for Arabic.
  const locale = useLocale();
  // Scoped, not an arrow wrapper: `tStudio` takes one
  // argument and silently drops the values a message needs, so an ICU
  // placeholder like {term} rendered as literal text.
  const tStudio = useTranslations('studio');
  const tSb = useTranslations('storyboard');
  const { projectId, onProjectChange } = useProjectSelection();
  // Only what the customer EXPLICITLY chose. `undefined` is the default and it is
  // the point: an absent `brandKitId` means "I did not choose", which the server
  // answers with the project's kit and then the account default
  // (lib/brand-kits/working-identity.ts). This page used to send
  // `projectBrandKitId ?? defaultKit?.id`, and `projectBrandKitId` is a RAW
  // UNVALIDATED id out of localStorage (hooks/useProjectSelection.ts:30) — which
  // ADR-0001 resolves to NO identity rather than falling through, so a stale
  // snapshot silently stripped the business context from a 14-credit run and the
  // project step could never be reached. Sending nothing is strictly safer: the
  // server verifies ownership either way.
  const [chosenKitId, setChosenKitId] = useState<string | undefined>(undefined);
  const [concept, setConcept] = useState('');
  const [duration, setDuration] = useState<Duration>('30');
  const [style, setStyle] = useState('cinematic');
  const [platform, setPlatform] = useState('instagram_reel');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<StudioError | null>(null);
  // Bumped once per successful run so RecentWork refetches and the row that
  // was just produced appears without a reload.
  const [runs, setRuns] = useState(0);
  const setBalance = useCreditsStore((s) => s.setBalance);

  const isValid = concept.length >= 10;
  const { balance, status: creditsStatus } = useCredits();
  const cannotAfford = creditsStatus === 'ready' && CREDIT_COSTS.storyboard > balance;
  const { profile } = useUser();
  const planId = profile?.plan_id ?? 'free';
  const upgradeVariant = getGatedUpgradeVariant(error, creditsStatus);

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!isValid) return;
    setIsLoading(true); setError(null); setScenes([]);
    try {
      const res = await fetch('/api/studios/storyboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept, duration, style, platform, locale, projectId: projectId ?? undefined, brandKitId: chosenKitId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(toStudioError(data.error, tStudio, typeof data.required === 'number' ? data.required : undefined, typeof data.term === 'string' ? data.term : undefined)); return; }
      setScenes(toScenes(data.data?.scenes));
      setRuns((n) => n + 1);
      if (data.data.newBalance !== undefined) setBalance(data.data.newBalance);
    } catch { setError(toStudioError('network', tStudio)); } finally { setIsLoading(false); }
  }, [isValid, concept, duration, style, platform, locale, setBalance, tStudio, projectId, chosenKitId]);

  const styleLabels: Record<string, string> = { cinematic: tSb('styles.cinematic'), ugc: tSb('styles.ugc'), animation: tSb('styles.animation'), documentary: tSb('styles.documentary') };
  const platformLabels: Record<string, string> = { instagram_reel: tSb('platforms.instagram_reel'), tiktok: tSb('platforms.tiktok'), youtube: tSb('platforms.youtube'), tv: tSb('platforms.tv') };

  const handleSubmitKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate();
  };

  const inputPanel = (
    <div className="space-y-4">
      <ProjectSelector value={projectId} onChange={onProjectChange} />
      <div className="space-y-2"><Label htmlFor="storyboard-concept">{tSb('videoConcept')}</Label><textarea id="storyboard-concept" value={concept} onChange={(e) => setConcept(e.target.value)} onKeyDown={handleSubmitKeyDown} placeholder={tSb('conceptPlaceholder')} rows={4} maxLength={1000} className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base sm:text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none" /><p className="text-xs text-end text-[var(--color-text-muted)]">{concept.length}/1000</p></div>
      <div className="space-y-2">
        <Label>{tSb('duration')}</Label>
        <div className="flex gap-2">{DURATIONS.map((d) => (<button key={d} type="button" onClick={() => setDuration(d)} aria-pressed={duration === d} className={cn('flex-1 rounded-lg border px-3 py-2 text-sm transition-colors', duration === d ? selectedChipClasses : unselectedChipClasses)}>{d}s</button>))}</div>
      </div>
      <div className="space-y-2">
        <Label>{tSb('style')}</Label>
        <div className="grid grid-cols-2 gap-2">{STYLES.map((s) => (<button key={s} type="button" onClick={() => setStyle(s)} aria-pressed={style === s} className={cn('rounded-lg border px-3 py-2 text-xs transition-colors', style === s ? selectedChipClasses : unselectedChipClasses)}>{styleLabels[s]}</button>))}</div>
      </div>
      <div className="space-y-2">
        <Label>{tSb('platform')}</Label>
        <div className="grid grid-cols-2 gap-2">{PLATFORMS.map((p) => (<button key={p} type="button" onClick={() => setPlatform(p)} aria-pressed={platform === p} className={cn('rounded-lg border px-3 py-2 text-xs transition-colors', platform === p ? selectedChipClasses : unselectedChipClasses)}>{platformLabels[p]}</button>))}</div>
      </div>
      {/* Above Generate, never after it: the credit is reserved the moment that
          button is pressed, so naming the identity afterwards names it to
          someone who has already paid. The values passed are exactly the ones
          the POST above carries, so the label and the generation cannot
          disagree. */}
      <WorkingIdentityBar
              studio="storyboard"
        projectId={projectId}
        brandKitId={chosenKitId}
        onChange={setChosenKitId}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <CreditCost cost={CREDIT_COSTS.storyboard} />
        <div className="flex items-center gap-2">
          {cannotAfford && (<Button asChild variant="default" size="sm"><Link href="/billing">{t('credits.topUpShort')}</Link></Button>)}
          <Button onClick={handleGenerate} disabled={!isValid || isLoading || cannotAfford} className="gap-2"><Sparkles className="h-4 w-4" />{isLoading ? t('studio.generating') : t('studio.generate')}</Button>
        </div>
      </div>
      {/*
        This studio writes no assets row, so `generations.output` is the only
        place the result exists. Without this list, closing the tab destroys
        work the customer already paid for.
      */}
      {/* A cast is not a check: a row stored before the route validated shape can
          hold anything under `scenes`, including a bare object or a list with
          holes in it. */}
      <RecentWork
        studio="storyboard"
        onRestore={(output, input) => {
          setScenes(toScenes(output.scenes));
          // generateStoryboardPdf() is handed the live `concept`, so restoring
          // only the scenes titled the export with whatever was in the textarea.
          setConcept(inputText(input, 'concept'));
        }}
        refreshKey={runs}
      />
    </div>
  );

  const previewPanel = isLoading ? (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 py-6">{Array.from({ length: 9 }).map((_, i) => (<Skeleton key={i} className="h-40 rounded-lg" />))}</div>
  ) : upgradeVariant ? (
    <UpgradePrompt
      open
      onClose={() => setError(null)}
      variant={upgradeVariant}
      currentPlan={planId}
      requiredCredits={upgradeVariant === 'insufficient_credits' ? error?.required : undefined}
      availableCredits={upgradeVariant === 'insufficient_credits' ? balance : undefined}
    />
  ) : error ? (
    <div className="flex flex-col items-center py-12 gap-4"><AlertTriangle className="h-12 w-12 text-[var(--color-error)]" /><p className="text-sm text-[var(--color-error)]">{error.message}</p></div>
  ) : scenes.length === 0 ? (
    <div className="flex flex-col items-center py-12 text-[var(--color-text-muted)]"><Film className="h-12 w-12" /><p className="text-sm mt-4">{tSb('emptyState')}</p></div>
  ) : (
    <div className="space-y-3">
    <div>
      {/* A blocked popup used to be silent — the button did nothing at all, which
          in an in-app webview (Instagram/WhatsApp) is the common case here. */}
      <Button size="sm" variant="outline" className="gap-1" onClick={() => { if (!openPdfInNewTab(generateStoryboardPdf(scenes, concept))) toast.error(tStudio('popupBlocked')); }}>
        <FileText className="h-3 w-3" /> {tSb('exportPdf')}
      </Button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {scenes.map((scene, i) => (
        // Index, not `scene_number`: a model that omitted it gave every card the
        // same React key.
        <Card key={i} className="overflow-hidden">
          <div className="h-24 bg-surface-2 flex items-center justify-center text-2xl">🎬</div>
          <CardHeader className="pb-1 px-3 pt-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs">{tSb('scene', { number: scene.scene_number ?? i + 1 })}</CardTitle>
              <Badge variant="secondary" className="text-[9px]">{text(scene.duration_seconds)}s</Badge>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 space-y-1.5 text-[11px]">
            {/*
              Was `.substring(0, 80)` with an ellipsis appended UNCONDITIONALLY,
              on the most expensive text deliverable in the product — so a
              14-credit storyboard showed 80 characters of each scene, and even a
              40-character line read as though something had been cut. Clamped in
              CSS instead: the full text stays selectable, copyable, and present
              for the PDF export.
            */}
            <p className="text-[var(--color-text-secondary)] line-clamp-3" dir="ltr">{text(scene.visual_description)}</p>
            <p className="font-medium">{text(scene.dialogue)}</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-[8px] gap-0.5 px-1"><Camera className="h-2 w-2" />{text(scene.camera_angle)}</Badge>
              <Badge variant="outline" className="text-[8px] gap-0.5 px-1"><Music className="h-2 w-2" />{text(scene.mood)}</Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="px-6 py-4 border-b"><h1 className="text-xl font-bold font-cairo">{t('nav.storyboard')}</h1><p className="text-sm text-[var(--color-text-secondary)]">{tSb('description')}</p></div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} isGenerating={isLoading} />
    </div>
  );
}
