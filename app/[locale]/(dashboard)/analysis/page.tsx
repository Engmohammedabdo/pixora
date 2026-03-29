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
import { cn } from '@/lib/utils';
import { Sparkles, AlertTriangle, TrendingUp, Users, Target, Map, BarChart3, FileText } from 'lucide-react';
import { generateAnalysisPdf, openPdfInNewTab } from '@/lib/export/pdf';

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
        body: JSON.stringify({ businessName, industry, description, competitors: competitors.filter(Boolean), targetMarket, painPoints }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setAnalysis(data.data.analysis);
      if (data.data.newBalance !== undefined) setBalance(data.data.newBalance);
    } catch { setError('Network error'); } finally { setIsLoading(false); }
  }, [isValid, businessName, industry, description, competitors, targetMarket, painPoints, setBalance]);

  const inputPanel = (
    <div className="space-y-4">
      <div className="space-y-2"><Label>اسم العمل</Label><Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="مثال: Pixora" /></div>
      <div className="space-y-2">
        <Label>القطاع</Label>
        <div className="grid grid-cols-2 gap-2">
          {INDUSTRIES.map((ind) => (
            <button key={ind} type="button" onClick={() => setIndustry(ind)}
              className={cn('rounded-lg border px-3 py-2 text-xs transition-colors capitalize', industry === ind ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-[var(--color-border)] hover:border-primary-300')}>
              {ind.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2"><Label>وصف العمل</Label><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف مفصل عن عملك..." rows={3} maxLength={2000} className="flex w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm placeholder:text-[var(--color-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 resize-none" /></div>
      <div className="space-y-2"><Label>المنافسون</Label>{competitors.map((c, i) => (<Input key={i} value={c} onChange={(e) => { const n = [...competitors]; n[i] = e.target.value; setCompetitors(n); }} placeholder={`منافس ${i + 1}`} className="mb-1" />))}</div>
      <div className="space-y-2"><Label>السوق المستهدف</Label><Input value={targetMarket} onChange={(e) => setTargetMarket(e.target.value)} placeholder="مثال: شركات صغيرة ومتوسطة في السعودية" /></div>
      <div className="space-y-2"><Label>نقاط الألم</Label><Input value={painPoints} onChange={(e) => setPainPoints(e.target.value)} placeholder="أبرز التحديات الحالية..." /></div>
      <div className="flex items-center justify-between pt-2">
        <CreditCost cost={CREDIT_COSTS.analysis} />
        <Button onClick={handleGenerate} disabled={!isValid || isLoading} className="gap-2"><Sparkles className="h-4 w-4" />{isLoading ? t('studio.generating') : t('studio.generate')}</Button>
      </div>
    </div>
  );

  const tabs = [
    { id: 'swot', label: 'SWOT', icon: Target },
    { id: 'personas', label: 'Personas', icon: Users },
    { id: 'competitors', label: 'المنافسون', icon: BarChart3 },
    { id: 'roadmap', label: 'خارطة الطريق', icon: Map },
    { id: 'kpis', label: 'KPIs', icon: TrendingUp },
  ];

  const renderSwot = (): React.ReactElement => {
    const s = analysis?.swot;
    if (!s) return <></>;
    const quadrants = [
      { title: 'نقاط القوة', items: s.strengths, color: 'bg-green-50 border-green-200' },
      { title: 'نقاط الضعف', items: s.weaknesses, color: 'bg-red-50 border-red-200' },
      { title: 'الفرص', items: s.opportunities, color: 'bg-blue-50 border-blue-200' },
      { title: 'التهديدات', items: s.threats, color: 'bg-amber-50 border-amber-200' },
    ];
    return (<div className="grid grid-cols-2 gap-3">{quadrants.map((q) => (<div key={q.title} className={cn('rounded-lg border p-4', q.color)}><h4 className="font-semibold text-sm mb-2">{q.title}</h4><ul className="space-y-1">{q.items.map((item, i) => (<li key={i} className="text-xs">• {item}</li>))}</ul></div>))}</div>);
  };

  const previewPanel = isLoading ? (
    <div className="space-y-4 py-6">{Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-32 rounded-lg" />))}</div>
  ) : error ? (
    <div className="flex flex-col items-center py-12 gap-4"><AlertTriangle className="h-12 w-12 text-[var(--color-error)]" /><p className="text-sm text-[var(--color-error)]">{error}</p></div>
  ) : !analysis ? (
    <div className="flex flex-col items-center py-12 text-[var(--color-text-muted)]"><BarChart3 className="h-12 w-12" /><p className="text-sm mt-4">التحليل سيظهر هنا</p></div>
  ) : (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2">
        <div className="flex gap-1 overflow-x-auto flex-1">{tabs.map((tab) => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors', activeTab === tab.id ? 'bg-primary-500 text-white' : 'bg-surface-2 hover:bg-surface-2/80')}><tab.icon className="h-3 w-3" />{tab.label}</button>))}</div>
        <Button size="sm" variant="outline" className="gap-1 flex-shrink-0" onClick={() => openPdfInNewTab(generateAnalysisPdf(analysis, businessName))}><FileText className="h-3 w-3" />PDF</Button>
      </div>
      {activeTab === 'swot' && renderSwot()}
      {activeTab === 'personas' && (<div className="space-y-3">{analysis.personas?.map((p, i) => (<Card key={i}><CardHeader className="pb-2"><CardTitle className="text-sm">{p.name} — {p.age}</CardTitle></CardHeader><CardContent className="text-xs space-y-1"><p><strong>الدور:</strong> {p.role}</p><p><strong>الأهداف:</strong> {p.goals}</p><p><strong>التحديات:</strong> {p.pain_points}</p><p><strong>القنوات:</strong> {p.channels}</p></CardContent></Card>))}</div>)}
      {activeTab === 'competitors' && (<div className="space-y-3">{analysis.competitors?.map((c, i) => (<Card key={i}><CardContent className="p-4"><h4 className="font-semibold text-sm mb-2">{c.name} <Badge variant="secondary" className="text-[10px]">{c.market_share}</Badge></h4><div className="grid grid-cols-2 gap-2 text-xs"><div className="bg-green-50 rounded p-2"><strong>القوة:</strong> {c.strengths}</div><div className="bg-red-50 rounded p-2"><strong>الضعف:</strong> {c.weaknesses}</div></div></CardContent></Card>))}</div>)}
      {activeTab === 'roadmap' && analysis.roadmap && (<div className="space-y-4">{(['day_30', 'day_60', 'day_90'] as const).map((period) => (<Card key={period}><CardHeader className="pb-2"><CardTitle className="text-sm">{period === 'day_30' ? '30 يوم' : period === 'day_60' ? '60 يوم' : '90 يوم'}</CardTitle></CardHeader><CardContent><ul className="space-y-1">{analysis.roadmap?.[period]?.map((item, i) => (<li key={i} className="text-xs flex items-start gap-2"><span className="text-primary-500 mt-0.5">●</span>{item}</li>))}</ul></CardContent></Card>))}</div>)}
      {activeTab === 'kpis' && (<div className="grid grid-cols-2 gap-3">{analysis.kpis?.map((kpi, i) => (<Card key={i}><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-primary-600">{kpi.target}</p><p className="text-xs font-medium mt-1">{kpi.metric}</p><p className="text-[10px] text-[var(--color-text-muted)]">{kpi.timeframe}</p></CardContent></Card>))}</div>)}
    </div>
  );

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <div className="px-6 py-4 border-b"><h1 className="text-xl font-bold font-cairo">{t('nav.analysis')}</h1><p className="text-sm text-[var(--color-text-secondary)]">تحليل تسويقي شامل CMO-level</p></div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} />
    </div>
  );
}
