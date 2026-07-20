'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { StudioLayout } from '@/components/layout/StudioLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CreditCost } from '@/components/shared/CreditCost';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreditsStore } from '@/store/credits';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { selectedChipClasses, unselectedChipClasses } from '@/components/studios/selectable-chip';
import { cn } from '@/lib/utils';
import { mapApiError } from '@/lib/studio-errors';
import { Sparkles, AlertTriangle, TrendingUp, Users, Target, Map, BarChart3, FileText } from 'lucide-react';
import { generateAnalysisPdf, openPdfInNewTab } from '@/lib/export/pdf';
import { ProjectSelector } from '@/components/shared/ProjectSelector';
import { useProjectSelection } from '@/hooks/useProjectSelection';

const INDUSTRIES = ['restaurant', 'clinic', 'retail', 'saas', 'real_estate', 'education', 'other'] as const;

interface Analysis {
  swot?: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  personas?: { name: string; age: string; role: string; goals: string; pain_points: string; channels: string }[];
  competitors?: { name: string; strengths: string; weaknesses: string; market_share: string }[];
  usp?: { statement: string; positioning: string; differentiators: string[] };
  gtm?: { strategy: string; channels: string[]; tactics: string[] };
  pricing?: { recommendation: string; model: string; tiers: string[] };
  roadmap?: { day_30: string[]; day_60: string[]; day_90: string[] };
  kpis?: { metric: string; target: string; timeframe: string }[];
}

export default function AnalysisPage(): React.ReactElement {
  const t = useTranslations();
  const tAn = useTranslations('analysis');
  const { projectId, onProjectChange } = useProjectSelection();
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [competitors, setCompetitors] = useState(['', '', '']);
  const [targetMarket, setTargetMarket] = useState('');
  const [painPoints, setPainPoints] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('swot');
  const setBalance = useCreditsStore((s) => s.setBalance);

  const isValid = businessName.length >= 2 && industry && description.length >= 10 && targetMarket.length >= 5;

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!isValid) return;
    setIsLoading(true); setError(null); setAnalysis(null);
    try {
      const res = await fetch('/api/studios/analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, industry, description, competitors: competitors.filter(Boolean), targetMarket, painPoints, projectId: projectId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(mapApiError(data.error, (k) => t(`studio.${k}`))); return; }
      setAnalysis(data.data.analysis);
      if (data.data.newBalance !== undefined) setBalance(data.data.newBalance);
    } catch { setError(mapApiError('network', (k) => t(`studio.${k}`))); } finally { setIsLoading(false); }
  }, [isValid, businessName, industry, description, competitors, targetMarket, painPoints, setBalance, t, projectId]);

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
            <button key={ind} type="button" onClick={() => setIndustry(ind)} aria-pressed={industry === ind}
              className={cn('rounded-lg border px-3 py-2 text-xs transition-colors', industry === ind ? selectedChipClasses : unselectedChipClasses)}>
              {tAn(`industries.${ind}`)}
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
        <Button onClick={handleGenerate} disabled={!isValid || isLoading} className="gap-2"><Sparkles className="h-4 w-4" />{isLoading ? t('studio.generating') : t('studio.generate')}</Button>
      </div>
    </div>
  );

  const tabs = [
    { id: 'swot', label: tAn('tabSwot'), icon: Target },
    { id: 'personas', label: tAn('tabPersonas'), icon: Users },
    { id: 'competitors', label: tAn('tabCompetitors'), icon: BarChart3 },
    { id: 'roadmap', label: tAn('tabRoadmap'), icon: Map },
    { id: 'kpis', label: tAn('tabKpis'), icon: TrendingUp },
  ];

  const renderSwot = (): React.ReactElement => {
    const s = analysis?.swot;
    if (!s) return <></>;
    const quadrants = [
      { title: tAn('strengths'), items: s.strengths, color: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800' },
      { title: tAn('weaknesses'), items: s.weaknesses, color: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800' },
      { title: tAn('opportunities'), items: s.opportunities, color: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800' },
      { title: tAn('threats'), items: s.threats, color: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800' },
    ];
    return (<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{quadrants.map((q) => (<div key={q.title} className={cn('rounded-lg border p-4', q.color)}><h4 className="font-semibold text-sm mb-2">{q.title}</h4><ul className="space-y-1">{q.items.map((item, i) => (<li key={i} className="text-xs">• {item}</li>))}</ul></div>))}</div>);
  };

  const previewPanel = isLoading ? (
    <div className="space-y-4 py-6">{Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-32 rounded-lg" />))}</div>
  ) : error ? (
    <div className="flex flex-col items-center py-12 gap-4"><AlertTriangle className="h-12 w-12 text-[var(--color-error)]" /><p className="text-sm text-[var(--color-error)]">{error}</p></div>
  ) : !analysis ? (
    <div className="flex flex-col items-center py-12 text-[var(--color-text-muted)]"><BarChart3 className="h-12 w-12" /><p className="text-sm mt-4">{tAn('emptyState')}</p></div>
  ) : (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2">
        <div className="flex gap-1 overflow-x-auto flex-1">{tabs.map((tab) => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors', activeTab === tab.id ? 'bg-primary-500 text-white' : 'bg-surface-2 hover:bg-surface-2/80')}><tab.icon className="h-3 w-3" />{tab.label}</button>))}</div>
        <Button size="sm" variant="outline" className="gap-1 flex-shrink-0" onClick={() => openPdfInNewTab(generateAnalysisPdf(analysis, businessName))}><FileText className="h-3 w-3" />PDF</Button>
      </div>
      {activeTab === 'swot' && renderSwot()}
      {activeTab === 'personas' && (<div className="space-y-3">{analysis.personas?.map((p, i) => (<Card key={i}><CardHeader className="pb-2"><CardTitle className="text-sm">{p.name} — {p.age}</CardTitle></CardHeader><CardContent className="text-xs space-y-1"><p><strong>{tAn('role')}:</strong> {p.role}</p><p><strong>{tAn('personaGoals')}:</strong> {p.goals}</p><p><strong>{tAn('challenges')}:</strong> {p.pain_points}</p><p><strong>{tAn('channels')}:</strong> {p.channels}</p></CardContent></Card>))}</div>)}
      {activeTab === 'competitors' && (<div className="space-y-3">{analysis.competitors?.map((c, i) => (<Card key={i}><CardContent className="p-4"><h4 className="font-semibold text-sm mb-2">{c.name} <Badge variant="secondary" className="text-[10px]">{c.market_share}</Badge></h4><div className="grid grid-cols-2 gap-2 text-xs"><div className="bg-green-50 dark:bg-green-900/30 rounded p-2"><strong>{tAn('strength')}:</strong> {c.strengths}</div><div className="bg-red-50 dark:bg-red-900/30 rounded p-2"><strong>{tAn('weakness')}:</strong> {c.weaknesses}</div></div></CardContent></Card>))}</div>)}
      {activeTab === 'roadmap' && analysis.roadmap && (<div className="space-y-4">{(['day_30', 'day_60', 'day_90'] as const).map((period) => (<Card key={period}><CardHeader className="pb-2"><CardTitle className="text-sm">{period === 'day_30' ? tAn('day30') : period === 'day_60' ? tAn('day60') : tAn('day90')}</CardTitle></CardHeader><CardContent><ul className="space-y-1">{analysis.roadmap?.[period]?.map((item, i) => (<li key={i} className="text-xs flex items-start gap-2"><span className="text-primary-500 mt-0.5">●</span>{item}</li>))}</ul></CardContent></Card>))}</div>)}
      {activeTab === 'kpis' && (<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{analysis.kpis?.map((kpi, i) => (<Card key={i}><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-[var(--color-brand)]">{kpi.target}</p><p className="text-xs font-medium mt-1">{kpi.metric}</p><p className="text-[10px] text-[var(--color-text-muted)]">{kpi.timeframe}</p></CardContent></Card>))}</div>)}
    </div>
  );

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="px-6 py-4 border-b"><h1 className="text-xl font-bold font-cairo">{t('nav.analysis')}</h1><p className="text-sm text-[var(--color-text-secondary)]">{tAn('description')}</p></div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} />
    </div>
  );
}
