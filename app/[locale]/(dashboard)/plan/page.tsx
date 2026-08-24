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
import { useCredits } from '@/hooks/useCredits';
import { useUser } from '@/hooks/useUser';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { selectedChipClasses, unselectedChipClasses } from '@/components/studios/selectable-chip';
import { cn } from '@/lib/utils';
import { toStudioError, getGatedUpgradeVariant, type StudioError } from '@/lib/studio-errors';
import { UpgradePrompt } from '@/components/shared/UpgradePrompt';
import { Link } from '@/i18n/routing';
import { Sparkles, AlertTriangle, Calendar, DollarSign, Target, TrendingUp, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { generatePlanPdf, openPdfInNewTab } from '@/lib/export/pdf';
import { ProjectSelector } from '@/components/shared/ProjectSelector';
import { useProjectSelection } from '@/hooks/useProjectSelection';
import { RecentWork } from '@/components/shared/RecentWork';

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


const GOALS = ['brand_awareness', 'lead_generation', 'sales', 'retention'] as const;
// Strings, not numbers: /api/studios/plan validates `duration` with
// z.enum(['30','60','90']) and Zod v4 does not coerce. Sending numbers made every
// single request fail validation, so this studio never produced a plan at all.
const DURATIONS = ['30', '60', '90'] as const;
type Duration = (typeof DURATIONS)[number];

// The NESTED arrays are optional too, not just the top-level sections. The route
// validates the model's shape now, but rows written before that guard existed
// are still restored here out of `generations.output`, and `plan.budget` being
// truthy says nothing about `plan.budget.breakdown` being an array — that
// dereference is what took the whole studio down through the segment error
// boundary, with the 5 credits already spent.
interface Plan {
  objectives?: { goal?: string; kpi?: string; target?: string }[];
  channels?: { name?: string; budget_pct?: number; strategy?: string }[];
  calendar?: { week?: number; content?: string[]; channel?: string }[];
  budget?: { total?: string; breakdown?: { item?: string; amount?: string; pct?: number }[] };
  kpis?: { metric?: string; target?: string; tracking?: string }[];
}

/** A list the UI iterates. A missing key must cost one empty tab, never the
 *  whole plan the customer paid 5 credits for. */
const list = <T,>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);

export default function PlanPage(): React.ReactElement {
  const t = useTranslations();
  // Scoped, not an arrow wrapper: `tStudio` takes one
  // argument and silently drops the values a message needs, so an ICU
  // placeholder like {term} rendered as literal text.
  const tStudio = useTranslations('studio');
  const tPlan = useTranslations('plan');
  const { projectId, onProjectChange } = useProjectSelection();
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [targetMarket, setTargetMarket] = useState('');
  const [budget, setBudget] = useState('$1,000 - $2,000');
  const [duration, setDuration] = useState<Duration>('30');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<StudioError | null>(null);
  const [activeTab, setActiveTab] = useState('objectives');
  // Bumped once per successful run so RecentWork refetches. Deriving the key
  // from `plan` instead would not change on a second run that returns a
  // structurally similar object, and the new row would not appear.
  const [runs, setRuns] = useState(0);
  const setBalance = useCreditsStore((s) => s.setBalance);

  const { balance, status: creditsStatus } = useCredits();
  const cannotAfford = creditsStatus === 'ready' && CREDIT_COSTS.plan > balance;
  const { profile } = useUser();
  const planId = profile?.plan_id ?? 'free';
  const upgradeVariant = getGatedUpgradeVariant(error, creditsStatus);

  const toggleGoal = (g: string): void => setGoals((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);
  // Must match app/api/studios/plan/route.ts's InputSchema exactly. It requires
  // `industry` (min 2) and `budget` (min 1) and this gate checked neither, so
  // Generate was enabled with an empty industry and the customer got an instant
  // 400 naming no field.
  const isValid =
    businessName.length >= 2 &&
    industry.length >= 2 &&
    goals.length > 0 &&
    targetMarket.length >= 5 &&
    budget.length >= 1;

  const handleGenerate = useCallback(async (): Promise<void> => {
    if (!isValid) return;
    setIsLoading(true); setError(null); setPlan(null);
    try {
      const res = await fetch('/api/studios/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName, industry, goals, targetMarket, budget, duration, projectId: projectId ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(toStudioError(data.error, tStudio, typeof data.required === 'number' ? data.required : undefined, typeof data.term === 'string' ? data.term : undefined)); return; }
      setPlan(data.data.plan);
      setRuns((n) => n + 1);
      if (data.data.newBalance !== undefined) setBalance(data.data.newBalance);
    } catch { setError(toStudioError('network', tStudio)); } finally { setIsLoading(false); }
  }, [isValid, businessName, industry, goals, targetMarket, budget, duration, setBalance, tStudio, projectId]);

  const handleSubmitKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate();
  };

  const inputPanel = (
    <div className="space-y-4">
      <ProjectSelector value={projectId} onChange={onProjectChange} />
      <div className="space-y-2"><Label htmlFor="plan-business-name">{tPlan('businessName')}</Label><Input id="plan-business-name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} onKeyDown={handleSubmitKeyDown} placeholder={tPlan('businessNamePlaceholder')} /></div>
      <div className="space-y-2"><Label htmlFor="plan-industry">{tPlan('industry')}</Label><Input id="plan-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} onKeyDown={handleSubmitKeyDown} placeholder={tPlan('industryPlaceholder')} /></div>
      <div className="space-y-2">
        <Label>{tPlan('goals')}</Label>
        <div className="flex flex-wrap gap-2">{GOALS.map((g) => (
          <button key={g} type="button" onClick={() => toggleGoal(g)} aria-pressed={goals.includes(g)} className={cn('rounded-full px-3 py-1.5 text-xs transition-colors', goals.includes(g) ? 'bg-primary-500 text-white' : 'bg-surface-2 hover:bg-surface-2/80')}>
            {g === 'brand_awareness' ? tPlan('brandAwareness') : g === 'lead_generation' ? tPlan('leadGeneration') : g === 'sales' ? tPlan('sales') : tPlan('retention')}
          </button>
        ))}</div>
      </div>
      <div className="space-y-2"><Label htmlFor="plan-target-market">{tPlan('targetMarket')}</Label><Input id="plan-target-market" value={targetMarket} onChange={(e) => setTargetMarket(e.target.value)} onKeyDown={handleSubmitKeyDown} placeholder={tPlan('targetMarketPlaceholder')} /></div>
      <div className="space-y-2"><Label htmlFor="plan-budget">{tPlan('monthlyBudget')}</Label><Input id="plan-budget" value={budget} onChange={(e) => setBudget(e.target.value)} onKeyDown={handleSubmitKeyDown} placeholder={tPlan('budgetPlaceholder')} dir="ltr" /></div>
      <div className="space-y-2">
        <Label>{tPlan('duration')}</Label>
        <div className="flex gap-2">{DURATIONS.map((d) => (
          <button key={d} type="button" onClick={() => setDuration(d)} aria-pressed={duration === d} className={cn('flex-1 rounded-lg border px-3 py-2 text-sm transition-colors', duration === d ? selectedChipClasses : unselectedChipClasses)}>
            {d} {tPlan('day')}
          </button>
        ))}</div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <CreditCost cost={CREDIT_COSTS.plan} />
        <div className="flex items-center gap-2">
          {cannotAfford && (<Button asChild variant="default" size="sm"><Link href="/billing">{t('credits.topUpShort')}</Link></Button>)}
          <Button onClick={handleGenerate} disabled={!isValid || isLoading || cannotAfford} className="gap-2"><Sparkles className="h-4 w-4" />{isLoading ? t('studio.generating') : t('studio.generate')}</Button>
        </div>
      </div>
      {/*
        A plan lives only in `generations.output` — this studio writes no assets
        row — so this list is the customer's only way back to work they paid for
        after the tab closes. `refreshKey` is the current plan object, so a run
        that just finished appears without a reload.
      */}
      <RecentWork
        studio="plan"
        onRestore={(output, input) => {
          setPlan(output.plan !== null && typeof output.plan === 'object' ? (output.plan as Plan) : null);
          setBusinessName(inputText(input, 'businessName'));
          setIndustry(inputText(input, 'industry'));
          setTargetMarket(inputText(input, 'targetMarket'));
        }}
        refreshKey={runs}
      />
    </div>
  );

  const tabs = [
    { id: 'objectives', label: tPlan('tabObjectives'), icon: Target },
    { id: 'channels', label: tPlan('tabChannels'), icon: TrendingUp },
    { id: 'calendar', label: tPlan('tabCalendar'), icon: Calendar },
    { id: 'budget', label: tPlan('tabBudget'), icon: DollarSign },
  ];

  const previewPanel = isLoading ? (
    <div className="space-y-4 py-6">{Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-24 rounded-lg" />))}</div>
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
  ) : !plan ? (
    <div className="flex flex-col items-center py-12 text-[var(--color-text-muted)]"><Calendar className="h-12 w-12" /><p className="text-sm mt-4">{tPlan('emptyState')}</p></div>
  ) : (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2">
        <div className="flex gap-1 overflow-x-auto flex-1">{tabs.map((tab) => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors', activeTab === tab.id ? 'bg-primary-500 text-white' : 'bg-surface-2')}><tab.icon className="h-3 w-3" />{tab.label}</button>))}</div>
        {/* The plan studio had no export at all: a 5-credit deliverable readable
            on screen and nowhere else, while analysis and storyboard both had one. */}
        <Button size="sm" variant="outline" className="gap-1 flex-shrink-0" onClick={() => { if (!openPdfInNewTab(generatePlanPdf(plan, businessName))) toast.error(tStudio('popupBlocked')); }}><FileText className="h-3 w-3" />PDF</Button>
      </div>
      {activeTab === 'objectives' && (<div className="space-y-3">{list(plan.objectives).map((obj, i) => (<Card key={i}><CardContent className="p-4"><h4 className="font-semibold text-sm">{obj.goal}</h4><div className="flex gap-4 mt-2 text-xs text-[var(--color-text-secondary)]"><span>KPI: {obj.kpi}</span><Badge variant="secondary">{obj.target}</Badge></div></CardContent></Card>))}</div>)}
      {activeTab === 'channels' && (<div className="space-y-3">{list(plan.channels).map((ch, i) => (<Card key={i}><CardContent className="p-4"><div className="flex items-center justify-between mb-2"><h4 className="font-semibold text-sm">{ch.name}</h4><Badge variant="default">{ch.budget_pct}%</Badge></div><p className="text-xs text-[var(--color-text-secondary)]">{ch.strategy}</p></CardContent></Card>))}</div>)}
      {activeTab === 'calendar' && (<div className="space-y-3">{list(plan.calendar).map((week, wi) => (<Card key={wi}><CardHeader className="pb-2"><CardTitle className="text-sm">{tPlan('week')} {week.week} — {week.channel}</CardTitle></CardHeader><CardContent><ul className="space-y-1">{list(week.content).map((c, i) => (<li key={i} className="text-xs flex items-start gap-2"><span className="text-primary-500">●</span>{c}</li>))}</ul></CardContent></Card>))}</div>)}
      {activeTab === 'budget' && plan.budget && (<div className="space-y-3"><Card><CardContent className="p-4 text-center"><p className="text-3xl font-bold text-[var(--color-brand)]">{plan.budget.total}</p><p className="text-xs text-[var(--color-text-muted)] mt-1">{tPlan('totalBudget')}</p></CardContent></Card><div className="space-y-2">{list(plan.budget.breakdown).map((item, i) => (<div key={i} className="flex items-center justify-between text-sm"><span>{item.item}</span><div className="flex items-center gap-2"><span className="font-medium">{item.amount}</span><Badge variant="secondary" className="text-[10px]">{item.pct}%</Badge></div></div>))}</div></div>)}
    </div>
  );

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)]">
      <div className="px-6 py-4 border-b"><h1 className="text-xl font-bold font-cairo">{t('nav.plan')}</h1><p className="text-sm text-[var(--color-text-secondary)]">{tPlan('description')}</p></div>
      <StudioLayout inputPanel={inputPanel} previewPanel={previewPanel} isGenerating={isLoading} />
    </div>
  );
}
