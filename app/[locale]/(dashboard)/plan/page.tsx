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
import { Sparkles, AlertTriangle, Calendar, DollarSign, Target, TrendingUp } from 'lucide-react';

const GOALS = ['brand_awareness', 'lead_generation', 'sales', 'retention'] as const;
const DURATIONS = [30, 60, 90] as const;

interface Plan {
  objectives?: { goal: string; kpi: string; target: string }[];
  channels?: { name: string; budget_pct: number; strategy: string }[];
  calendar?: { week: number; content: string[]; channel: string }[];
  budget?: { total: string; breakdown: { item: string; amount: string; pct: number }[] };
  kpis?: { metric: string; target: string; tracking: string }[];
}

export default function PlanPage(): React.ReactElement {
  const t = useTranslations();
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [targetMarket, setTargetMarket] = useState('');
  const [budget, setBudget] = useState('$1,000 - $2,000');
  const [duration, setDuration] = useState<number>(30);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('objectives');
  const setBalance = useCreditsStore((s) => s.setBalance);

  const toggleGoal = (g: string): void => setGoals((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  const isValid = businessName.length >= 2 && goals.length > 0 && targetMarket.length >= 5;

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!isValid) return;
    setIsLoading(true); setError(null); setPlan(null);
    try {
      const res = await fetch('/api/studios/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, industry, goals, targetMarket, budget, duration }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setPlan(data.data.plan);
      if (data.data.newBalance !== undefined) setBalance(data.data.newBalance);
    } catch { setError('Network error'); } finally { setIsLoading(false); }
  }, [isValid, businessName, industry, goals, targetMarket, budget, duration, setBalance]);

  const inputPanel = (
    <div className="space-y-4">
      <div className="space-y-2"><Label>اسم العمل</Label><Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="اسم شركتك أو مشروعك" /></div>
      <div className="space-y-2"><Label>القطاع</Label><Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="مثال: مطاعم، عيادات، SaaS..." /></div>
      <div className="space-y-2">
        <Label>الأهداف</Label>
        <div className="flex flex-wrap gap-2">{GOALS.map((g) => (
          <button key={g} type="button" onClick={() => toggleGoal(g)} className={cn('rounded-full px-3 py-1.5 text-xs transition-colors', goals.includes(g) ? 'bg-primary-500 text-white' : 'bg-surface-2 hover:bg-surface-2/80')}>
            {g === 'brand_awareness' ? 'وعي العلامة' : g === 'lead_generation' ? 'توليد عملاء' : g === 'sales' ? 'مبيعات' : 'الاحتفاظ بالعملاء'}
          </button>
        ))}</div>
      </div>
      <div className="space-y-2"><Label>السوق المستهدف</Label><Input value={targetMarket} onChange={(e) => setTargetMarket(e.target.value)} placeholder="مثال: رواد أعمال في السعودية" /></div>
      <div className="space-y-2"><Label>الميزانية الشهرية</Label><Input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="$1,000 - $5,000" dir="ltr" /></div>
      <div className="space-y-2">
        <Label>المدة</Label>
        <div className="flex gap-2">{DURATIONS.map((d) => (
          <button key={d} type="button" onClick={() => setDuration(d)} className={cn('flex-1 rounded-lg border px-3 py-2 text-sm transition-colors', duration === d ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-[var(--color-border)] hover:border-primary-300')}>
            {d} يوم
          </button>
        ))}</div>
      </div>
      <div className="flex items-center justify-between pt-2">
        <CreditCost cost={CREDIT_COSTS.plan} />
        <Button onClick={handleGenerate} disabled={!isValid || isLoading} className="gap-2"><Sparkles className="h-4 w-4" />{isLoading ? t('studio.generating') : t('studio.generate')}</Button>
      </div>
    </div>
  );

  const tabs = [
    { id: 'objectives', label: 'الأهداف', icon: Target },
    { id: 'channels', label: 'القنوات', icon: TrendingUp },
    { id: 'calendar', label: 'التقويم', icon: Calendar },
    { id: 'budget', label: 'الميزانية', icon: DollarSign },
  ];

  const previewPanel = isLoading ? (
    <div className="space-y-4 py-6">{Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-24 rounded-lg" />))}</div>
  ) : error ? (
    <div className="flex flex-col items-center py-12 gap-4"><AlertTriangle className="h-12 w-12 text-[var(--color-error)]" /><p className="text-sm text-[var(--color-error)]">{error}</p></div>
  ) : !plan ? (
    <div className="flex flex-col items-center py-12 text-[var(--color-text-muted)]"><Calendar className="h-12 w-12" /><p className="text-sm mt-4">الخطة ستظهر هنا</p></div>
  ) : (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto pb-2">{tabs.map((tab) => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors', activeTab === tab.id ? 'bg-primary-500 text-white' : 'bg-surface-2')}><tab.icon className="h-3 w-3" />{tab.label}</button>))}</div>
      {activeTab === 'objectives' && (<div className="space-y-3">{plan.objectives?.map((obj, i) => (<Card key={i}><CardContent className="p-4"><h4 className="font-semibold text-sm">{obj.goal}</h4><div className="flex gap-4 mt-2 text-xs text-[var(--color-text-secondary)]"><span>KPI: {obj.kpi}</span><Badge variant="secondary">{obj.target}</Badge></div></CardContent></Card>))}</div>)}
      {activeTab === 'channels' && (<div className="space-y-3">{plan.channels?.map((ch, i) => (<Card key={i}><CardContent className="p-4"><div className="flex items-center justify-between mb-2"><h4 className="font-semibold text-sm">{ch.name}</h4><Badge variant="default">{ch.budget_pct}%</Badge></div><p className="text-xs text-[var(--color-text-secondary)]">{ch.strategy}</p></CardContent></Card>))}</div>)}
      {activeTab === 'calendar' && (<div className="space-y-3">{plan.calendar?.map((week) => (<Card key={week.week}><CardHeader className="pb-2"><CardTitle className="text-sm">الأسبوع {week.week} — {week.channel}</CardTitle></CardHeader><CardContent><ul className="space-y-1">{week.content.map((c, i) => (<li key={i} className="text-xs flex items-start gap-2"><span className="text-primary-500">●</span>{c}</li>))}</ul></CardContent></Card>))}</div>)}
      {activeTab === 'budget' && plan.budget && (<div className="space-y-3"><Card><CardContent className="p-4 text-center"><p className="text-3xl font-bold text-primary-600">{plan.budget.total}</p><p className="text-xs text-[var(--color-text-muted)] mt-1">الميزانية الإجمالية</p></CardContent></Card><div className="space-y-2">{plan.budget.breakdown.map((item, i) => (<div key={i} className="flex items-center justify-between text-sm"><span>{item.item}</span><div className="flex items-center gap-2"><span className="font-medium">{item.amount}</span><Badge variant="secondary" className="text-[10px]">{item.pct}%</Badge></div></div>))}</div></div>)}
    </div>
  );

  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <div className="px-6 py-4 border-b"><h1 className="text-xl font-bold font-cairo">{t('nav.plan')}</h1><p className="text-sm text-[var(--color-text-secondary)]">خطة تسويقية شهرية مفصلة</p></div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} />
    </div>
  );
}
