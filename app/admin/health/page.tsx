'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import MetricCard from '@/components/admin/MetricCard';
import HealthCard from '@/components/admin/HealthCard';
import ErrorTrendChart from '@/components/admin/ErrorTrendChart';
import DataTable, { Column } from '@/components/admin/DataTable';
import StatChart from '@/components/admin/StatChart';
import { Activity, CheckCircle, AlertTriangle, DollarSign, Loader2 } from 'lucide-react';

type Period = '24h' | '7d' | '30d';

interface OverviewData {
  totalGenerations: number;
  completed: number;
  failed: number;
  successRate: number;
  errorRate: number;
  totalCredits: number;
  estimatedApiCost: number;
}

interface StudioMetric {
  studio: string;
  total: number;
  completed: number;
  failed: number;
  successRate: number;
  credits: number;
  topError: { message: string; count: number } | null;
}

interface ModelMetric {
  model: string;
  total: number;
  completed: number;
  failed: number;
  successRate: number;
  estimatedCost: number;
}

interface ErrorTrend {
  date: string;
  errors: number;
  total: number;
  errorRate: number;
}

interface TopError extends Record<string, unknown> {
  message: string;
  count: number;
  studio: string;
  lastSeen: string;
}

const studioIcons: Record<string, string> = {
  creator: '🎨', photoshoot: '📸', campaign: '📋', plan: '🗺️',
  storyboard: '🎬', analysis: '📊', voiceover: '🎙️', edit: '✏️', 'prompt-builder': '💡',
};

const modelIcons: Record<string, string> = { gemini: '💎', gpt: '🧠', flux: '⚡' };

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const topErrorColumns: Column<TopError>[] = [
  {
    key: 'message',
    label: 'Error Message',
    render: (row) => (
      <span className="max-w-[300px] truncate block text-xs text-red-400" title={row.message}>
        {row.message}
      </span>
    ),
  },
  { key: 'count', label: 'Count', sortable: true },
  { key: 'studio', label: 'Studio' },
  {
    key: 'lastSeen',
    label: 'Last Seen',
    render: (row) => timeAgo(row.lastSeen),
  },
];

export default function AdminHealthPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [studios, setStudios] = useState<StudioMetric[]>([]);
  const [models, setModels] = useState<ModelMetric[]>([]);
  const [errorTrend, setErrorTrend] = useState<ErrorTrend[]>([]);
  const [topErrors, setTopErrors] = useState<TopError[]>([]);
  const [errorsByStudio, setErrorsByStudio] = useState<Record<string, unknown>[]>([]);
  const [trendDirection, setTrendDirection] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, errorsRes] = await Promise.all([
        fetch(`/api/admin/health?period=${period}`),
        fetch(`/api/admin/health/errors?days=${period === '24h' ? 1 : period === '7d' ? 7 : 30}`),
      ]);

      const [healthData, errorsData] = await Promise.all([healthRes.json(), errorsRes.json()]);

      if (healthData.success) {
        setOverview(healthData.data.overview);
        setStudios(healthData.data.studios);
        setModels(healthData.data.models);
      }
      if (errorsData.success) {
        setErrorTrend(errorsData.data.dailyTrend);
        setTopErrors(errorsData.data.topErrors);
        setErrorsByStudio(errorsData.data.byStudio);
        setTrendDirection(errorsData.data.trendDirection);
      }
    } catch (err) {
      console.error('Failed to fetch health data:', err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const periodButtons: { key: Period; label: string }[] = [
    { key: '24h', label: '24h' },
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
  ];

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-indigo-400" />
          <h1 className="text-2xl font-bold text-white">System Health</h1>
          {trendDirection && !loading && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
              trendDirection === 'improving' ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' :
              trendDirection === 'worsening' ? 'bg-red-500/10 text-red-400 ring-red-500/20' :
              'bg-slate-500/10 text-slate-400 ring-slate-500/20'
            }`}>
              {trendDirection === 'improving' ? '▲ Improving' : trendDirection === 'worsening' ? '▼ Worsening' : '— Stable'}
            </span>
          )}
        </div>
        <div className="flex rounded-xl bg-white/[0.04] p-1">
          {periodButtons.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                period === p.key
                  ? 'bg-indigo-500/20 text-indigo-400 shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<CheckCircle className="h-4 w-4" />}
          label="Success Rate"
          value={overview ? `${overview.successRate}` : '0'}
          suffix="%"
          loading={loading}
        />
        <MetricCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Total Errors"
          value={overview?.failed ?? 0}
          loading={loading}
        />
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          label="Total Generations"
          value={overview?.totalGenerations ?? 0}
          loading={loading}
        />
        <MetricCard
          icon={<DollarSign className="h-4 w-4" />}
          label="Est. API Cost"
          value={overview?.estimatedApiCost ?? 0}
          prefix="$"
          loading={loading}
        />
      </div>

      {/* Error Trend Chart + Errors by Studio */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ErrorTrendChart data={errorTrend} loading={loading} />
        <StatChart
          title="Errors by Studio"
          type="bar"
          data={errorsByStudio}
          dataKeys={['count']}
          xAxisKey="studio"
          colors={['#f87171']}
          loading={loading}
        />
      </div>

      {/* Studio Health Grid */}
      <div className="mt-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Studio Health</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <HealthCard key={i} name="" total={0} completed={0} failed={0} successRate={100} loading />)
          ) : (
            studios.filter(s => s.total > 0).map(s => (
              <HealthCard
                key={s.studio}
                name={s.studio}
                icon={studioIcons[s.studio]}
                total={s.total}
                completed={s.completed}
                failed={s.failed}
                successRate={s.successRate}
                credits={s.credits}
                topError={s.topError}
              />
            ))
          )}
          {!loading && studios.filter(s => s.total > 0).length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-slate-600">No studio activity in this period</p>
          )}
        </div>
      </div>

      {/* Model Health Grid */}
      <div className="mt-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Model Health</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <HealthCard key={i} name="" total={0} completed={0} failed={0} successRate={100} loading />)
          ) : (
            models.map(m => (
              <HealthCard
                key={m.model}
                name={m.model}
                icon={modelIcons[m.model]}
                total={m.total}
                completed={m.completed}
                failed={m.failed}
                successRate={m.successRate}
                estimatedCost={m.estimatedCost}
              />
            ))
          )}
        </div>
      </div>

      {/* Top Errors Table */}
      <div className="mt-6">
        <DataTable<TopError>
          title="Top Recurring Errors"
          columns={topErrorColumns}
          data={topErrors}
          loading={loading}
          emptyMessage="No errors in this period"
        />
      </div>
    </AdminLayout>
  );
}
