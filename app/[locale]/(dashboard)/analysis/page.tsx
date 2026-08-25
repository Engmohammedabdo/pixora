'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { toast } from 'sonner';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreditCost } from '@/components/shared/CreditCost';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreditsStore } from '@/store/credits';
import { useCredits } from '@/hooks/useCredits';
import { useUser } from '@/hooks/useUser';
import { useBrandKits } from '@/hooks/useBrandKit';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { selectedChipClasses, unselectedChipClasses } from '@/components/studios/selectable-chip';
import { cn } from '@/lib/utils';
import { toStudioError, getGatedUpgradeVariant, type StudioError } from '@/lib/studio-errors';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { Link } from '@/i18n/routing';
import { Sparkles, AlertTriangle, TrendingUp, Users, Target, Map, BarChart3, FileText } from 'lucide-react';
import { generateAnalysisPdf, openPdfInNewTab } from '@/lib/export/pdf';
import { ProjectSelector } from '@/components/shared/ProjectSelector';
import { useProjectSelection } from '@/hooks/useProjectSelection';
import { RecentWork } from '@/components/shared/RecentWork';
import { INDUSTRIES, isIndustry } from '@/lib/industries';

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


// The NESTED arrays are optional too, not just the top-level sections. The route
// validates the model's shape now, but rows written before that guard existed
// are still restored here out of `generations.output`, and `swot` being truthy
// says nothing about `swot.strengths` being an array — that dereference is what
// took the whole studio down through the segment error boundary.
interface Analysis {
  swot?: { strengths?: string[]; weaknesses?: string[]; opportunities?: string[]; threats?: string[] };
  personas?: { name?: string; age?: string; role?: string; goals?: string; pain_points?: string; channels?: string }[];
  competitors?: { name?: string; strengths?: string; weaknesses?: string; market_share?: string }[];
  usp?: { statement?: string; positioning?: string; differentiators?: string[] };
  gtm?: { strategy?: string; channels?: string[]; tactics?: string[] };
  pricing?: { recommendation?: string; model?: string; tiers?: string[] };
  roadmap?: { day_30?: string[]; day_60?: string[]; day_90?: string[] };
  kpis?: { metric?: string; target?: string; timeframe?: string }[];
}

/** A list the UI iterates. A missing key must cost one empty quadrant, never the
 *  whole analysis the customer paid 3 credits for. */
const list = <T,>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);

export default function AnalysisPage(): React.ReactElement {
  const t = useTranslations();
  // The API sits outside app/[locale], so the deliverable's language has to be
  // sent explicitly — an en-locale customer used to pay full price for Arabic.
  const locale = useLocale();
  // Scoped, not an arrow wrapper: `tStudio` takes one
  // argument and silently drops the values a message needs, so an ICU
  // placeholder like {term} rendered as literal text.
  const tStudio = useTranslations('studio');
  const tAn = useTranslations('analysis');
  // The one industry label set — see app/[locale]/(dashboard)/plan/page.tsx for
  // why three copies of it existed and how they had already drifted.
  const tIndustries = useTranslations('industries');
  const { projectId, onProjectChange } = useProjectSelection();
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [competitors, setCompetitors] = useState(['', '', '']);
  const [targetMarket, setTargetMarket] = useState('');
  const [painPoints, setPainPoints] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<StudioError | null>(null);
  const [activeTab, setActiveTab] = useState('swot');
  // Bumped once per successful run so RecentWork refetches and the row that
  // was just produced appears without a reload.
  const [runs, setRuns] = useState(0);
  const setBalance = useCreditsStore((s) => s.setBalance);

  // `industry` was checked for truthiness only, while the route requires min(2) —
  // a one-character industry passed the gate and failed the request.
  const isValid = businessName.length >= 2 && industry.length >= 2 && description.length >= 10 && targetMarket.length >= 5;
  const { balance, status: creditsStatus } = useCredits();
  const cannotAfford = creditsStatus === 'ready' && CREDIT_COSTS.analysis > balance;
  const { profile } = useUser();
  const planId = profile?.plan_id ?? 'free';
  const upgradeVariant = getGatedUpgradeVariant(error, creditsStatus);

  const { defaultKit } = useBrandKits();
  // Prefill from the caller's default brand kit — ONCE, and only into BLANKS.
  //
  // Two separate things make that true, and an earlier version of this comment
  // claimed the first did both. The functional updaters below read the CURRENT
  // value at the moment the effect runs rather than one captured when it was
  // scheduled, which is what keeps `businessName`/`description`/`targetMarket`
  // out of the dependency array (they would re-fire on every keystroke). That
  // prevents STALE CLOSURES. It does not prevent the effect RE-RUNNING — see
  // the dependency array below for what does.
  useEffect(() => {
    if (!defaultKit) return;
    if (defaultKit.name) setBusinessName((prev) => prev || defaultKit.name);
    // Only a slug the chip UI below can actually render as selected.
    // `brand_kits.industry` is deliberately NOT constrained to this list
    // (migration 045: "that list is allowed to grow, and a database that
    // refuses a slug the code has already shipped is an outage") and is
    // customer-writable straight over PostgREST, so a raw value here could be
    // any 1-40 char string. Prefilling with one the chips do not recognise
    // would still pass `isValid`'s length check and reach the route as free
    // text on Generate — the exact shape item 4 exists to keep off the wire.
    const kitIndustry = defaultKit.industry;
    if (kitIndustry && isIndustry(kitIndustry)) {
      setIndustry((prev) => prev || kitIndustry);
    }
    const kitDescription = defaultKit.description;
    if (kitDescription) setDescription((prev) => prev || kitDescription);
    const kitTargetAudience = defaultKit.target_audience;
    if (kitTargetAudience) setTargetMarket((prev) => prev || kitTargetAudience);
    // `defaultKit?.id`, NOT `defaultKit`. `useBrandKits` is a React Query
    // hook: `staleTime` is 5 minutes and `refetchOnWindowFocus` defaults to
    // true, so tabbing away and back refetches and hands back a NEW OBJECT for
    // the same row. Depending on object identity re-ran this effect and
    // `prev || defaultKit.name` refilled a field the customer had deliberately
    // cleared. The comment above claimed the functional updaters made a
    // "touched" flag unnecessary — they prevent STALE CLOSURES, not refills;
    // only not re-running does that. `handleGenerate` in this same file
    // already depends on `defaultKit?.id` for the same reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultKit?.id]);

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!isValid) return;
    setIsLoading(true); setError(null); setAnalysis(null);
    try {
      const res = await fetch('/api/studios/analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, industry, description, competitors: competitors.filter(Boolean), targetMarket, painPoints, locale, projectId: projectId ?? undefined, brandKitId: defaultKit?.id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(toStudioError(data.error, tStudio, typeof data.required === 'number' ? data.required : undefined, typeof data.term === 'string' ? data.term : undefined)); return; }
      setAnalysis(data.data.analysis);
      setRuns((n) => n + 1);
      if (data.data.newBalance !== undefined) setBalance(data.data.newBalance);
    } catch { setError(toStudioError('network', tStudio)); } finally { setIsLoading(false); }
  }, [isValid, businessName, industry, description, competitors, targetMarket, painPoints, locale, setBalance, tStudio, projectId, defaultKit?.id]);

  const handleSubmitKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate();
  };

  const inputPanel = (
    <div className="space-y-4">
      <ProjectSelector value={projectId} onChange={onProjectChange} />
      <div className="space-y-2"><Label htmlFor="analysis-business-name">{tAn('businessName')}</Label><Input id="analysis-business-name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} onKeyDown={handleSubmitKeyDown} placeholder={tAn('businessNamePlaceholder')} /></div>
      <div className="space-y-2">
        <Label>{tAn('industry')}</Label>
        <div className="grid grid-cols-2 gap-2">
          {INDUSTRIES.map((ind) => (
            <button key={ind} type="button" onClick={() => setIndustry((prev) => (prev === ind ? '' : ind))} aria-pressed={industry === ind}
              className={cn('rounded-lg border px-3 py-2 text-xs transition-colors', industry === ind ? selectedChipClasses : unselectedChipClasses)}>
              {tIndustries(ind)}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2"><Label htmlFor="analysis-description">{tAn('businessDescription')}</Label><textarea id="analysis-description" value={description} onChange={(e) => setDescription(e.target.value)} onKeyDown={handleSubmitKeyDown} placeholder={tAn('descriptionPlaceholder')} rows={3} maxLength={2000} className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base sm:text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none" /><p className="text-xs text-end text-[var(--color-text-muted)]">{description.length}/2000</p></div>
      <div className="space-y-2"><Label htmlFor="analysis-competitor-1">{tAn('competitors')}</Label>{competitors.map((c, i) => (<Input key={i} id={`analysis-competitor-${i + 1}`} value={c} onChange={(e) => { const n = [...competitors]; n[i] = e.target.value; setCompetitors(n); }} onKeyDown={handleSubmitKeyDown} placeholder={tAn('competitorPlaceholder', { number: i + 1 })} className="mb-1" />))}</div>
      <div className="space-y-2"><Label htmlFor="analysis-target-market">{tAn('targetMarket')}</Label><Input id="analysis-target-market" value={targetMarket} onChange={(e) => setTargetMarket(e.target.value)} onKeyDown={handleSubmitKeyDown} placeholder={tAn('targetMarketPlaceholder')} /></div>
      <div className="space-y-2"><Label htmlFor="analysis-pain-points">{tAn('painPoints')}</Label><Input id="analysis-pain-points" value={painPoints} onChange={(e) => setPainPoints(e.target.value)} onKeyDown={handleSubmitKeyDown} placeholder={tAn('painPointsPlaceholder')} /></div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <CreditCost cost={CREDIT_COSTS.analysis} />
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
      <RecentWork
        studio="analysis"
        onRestore={(output, input) => {
          setAnalysis(output.analysis !== null && typeof output.analysis === 'object' ? (output.analysis as Analysis) : null);
          // Rehydrate the brief too: the PDF export below reads `businessName`
          // from live form state, so restoring only the output exported the
          // restored analysis under whatever happened to be typed. Restoring the
          // rest lets the run be re-run, not just re-read.
          setBusinessName(inputText(input, 'businessName'));
          setIndustry(inputText(input, 'industry'));
          setDescription(inputText(input, 'description'));
          setTargetMarket(inputText(input, 'targetMarket'));
          setPainPoints(inputText(input, 'painPoints'));
        }}
        refreshKey={runs}
      />
    </div>
  );

  const tabs = [
    { id: 'swot', label: tAn('tabSwot'), icon: Target },
    { id: 'personas', label: tAn('tabPersonas'), icon: Users },
    { id: 'competitors', label: tAn('tabCompetitors'), icon: BarChart3 },
    { id: 'roadmap', label: tAn('tabRoadmap'), icon: Map },
    { id: 'kpis', label: tAn('tabKpis'), icon: TrendingUp },
  ];

  /**
   * A section the model did not return.
   *
   * The route's own completeness gate explicitly PERMITS any single section to be
   * missing — it requires one populated section, not all of them — so a blank panel
   * was a state the product was designed to reach and had nothing to say about. The
   * default tab is SWOT, so an analysis without it opened on an empty screen.
   */
  const emptySection = (): React.ReactElement => (
    <div className="flex flex-col items-center justify-center py-12 gap-2 text-[var(--color-text-muted)]">
      <AlertTriangle className="h-8 w-8" />
      <p className="text-sm text-center max-w-xs">{tAn('sectionEmpty')}</p>
    </div>
  );

  const renderSwot = (): React.ReactElement => {
    const s = analysis?.swot;
    if (!s) return emptySection();
    const quadrants = [
      { title: tAn('strengths'), items: list(s.strengths), color: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800' },
      { title: tAn('weaknesses'), items: list(s.weaknesses), color: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800' },
      { title: tAn('opportunities'), items: list(s.opportunities), color: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800' },
      { title: tAn('threats'), items: list(s.threats), color: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800' },
    ];
    return (<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{quadrants.map((q) => (<div key={q.title} className={cn('rounded-lg border p-4', q.color)}><h4 className="font-semibold text-sm mb-2">{q.title}</h4><ul className="space-y-1">{q.items.map((item, i) => (<li key={i} className="text-xs">• {item}</li>))}</ul></div>))}</div>);
  };

  const previewPanel = isLoading ? (
    <div className="space-y-4 py-6">{Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-32 rounded-lg" />))}</div>
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
  ) : !analysis ? (
    <div className="flex flex-col items-center py-12 text-[var(--color-text-muted)]"><BarChart3 className="h-12 w-12" /><p className="text-sm mt-4">{tAn('emptyState')}</p></div>
  ) : (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2">
        <div className="flex gap-1 overflow-x-auto flex-1">{tabs.map((tab) => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors', activeTab === tab.id ? 'bg-primary-500 text-white' : 'bg-surface-2 hover:bg-surface-2/80')}><tab.icon className="h-3 w-3" />{tab.label}</button>))}</div>
        <Button size="sm" variant="outline" className="gap-1 flex-shrink-0" onClick={() => { if (!openPdfInNewTab(generateAnalysisPdf(analysis, businessName))) toast.error(tStudio('popupBlocked')); }}><FileText className="h-3 w-3" />PDF</Button>
      </div>
      {activeTab === 'swot' && renderSwot()}
      {activeTab === 'personas' && (list(analysis.personas).length === 0 ? emptySection() : <div className="space-y-3">{list(analysis.personas).map((p, i) => (<Card key={i}><CardHeader className="pb-2"><CardTitle className="text-sm">{p.name} — {p.age}</CardTitle></CardHeader><CardContent className="text-xs space-y-1"><p><strong>{tAn('role')}:</strong> {p.role}</p><p><strong>{tAn('personaGoals')}:</strong> {p.goals}</p><p><strong>{tAn('challenges')}:</strong> {p.pain_points}</p><p><strong>{tAn('channels')}:</strong> {p.channels}</p></CardContent></Card>))}</div>)}
      {activeTab === 'competitors' && (list(analysis.competitors).length === 0 ? emptySection() : <div className="space-y-3">{list(analysis.competitors).map((c, i) => (<Card key={i}><CardContent className="p-4"><h4 className="font-semibold text-sm mb-2">{c.name} <Badge variant="secondary" className="text-[10px]">{c.market_share}</Badge></h4><div className="grid grid-cols-2 gap-2 text-xs"><div className="bg-green-50 dark:bg-green-900/30 rounded p-2"><strong>{tAn('strength')}:</strong> {c.strengths}</div><div className="bg-red-50 dark:bg-red-900/30 rounded p-2"><strong>{tAn('weakness')}:</strong> {c.weaknesses}</div></div></CardContent></Card>))}</div>)}
      {activeTab === 'roadmap' && (!analysis.roadmap ? emptySection() : <div className="space-y-4">{(['day_30', 'day_60', 'day_90'] as const).map((period) => (<Card key={period}><CardHeader className="pb-2"><CardTitle className="text-sm">{period === 'day_30' ? tAn('day30') : period === 'day_60' ? tAn('day60') : tAn('day90')}</CardTitle></CardHeader><CardContent><ul className="space-y-1">{list(analysis.roadmap?.[period]).map((item, i) => (<li key={i} className="text-xs flex items-start gap-2"><span className="text-primary-500 mt-0.5">●</span>{item}</li>))}</ul></CardContent></Card>))}</div>)}
      {activeTab === 'kpis' && (list(analysis.kpis).length === 0 ? emptySection() : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{list(analysis.kpis).map((kpi, i) => (<Card key={i}><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-[var(--color-brand)]">{kpi.target}</p><p className="text-xs font-medium mt-1">{kpi.metric}</p><p className="text-[10px] text-[var(--color-text-muted)]">{kpi.timeframe}</p></CardContent></Card>))}</div>)}
    </div>
  );

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="px-6 py-4 border-b"><h1 className="text-xl font-bold font-cairo">{t('nav.analysis')}</h1><p className="text-sm text-[var(--color-text-secondary)]">{tAn('description')}</p></div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} isGenerating={isLoading} />
    </div>
  );
}
