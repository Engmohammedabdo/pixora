'use client';

import { useEffect, useState, useCallback } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import KPICard from '@/components/admin/KPICard';
import StatChart from '@/components/admin/StatChart';
import DataTable, { Column } from '@/components/admin/DataTable';
import {
  Users,
  DollarSign,
  Zap,
  AlertTriangle,
  CreditCard,
  Crown,
  LayoutDashboard,
} from 'lucide-react';

interface OverviewData {
  totalUsers: number;
  newUsersToday: number;
  revenueThisMonth: number;
  generationsToday: number;
  errorRate: number;
  failedToday: number;
  zeroCreditUsers: number;
  activeSubscriptions: Record<string, number>;
}

interface GenerationRow extends Record<string, unknown> {
  id: string;
  studio: string;
  model: string;
  status: string;
  credits_used: number;
  created_at: string;
  profiles: { name: string; email: string } | null;
}

interface ErrorRow extends Record<string, unknown> {
  id: string;
  studio: string;
  model: string;
  error: string;
  created_at: string;
  profiles: { name: string; email: string } | null;
}

interface LowCreditRow extends Record<string, unknown> {
  id: string;
  name: string;
  email: string;
  plan_id: string;
  credits_balance: number;
  purchased_credits: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const statusColors: Record<string, string> = {
  completed: 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20',
  failed: 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20',
  pending: 'bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20',
  processing: 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20',
};

const generationColumns: Column<GenerationRow>[] = [
  {
    key: 'user',
    label: 'User',
    render: (row) => row.profiles?.name || 'Unknown',
  },
  { key: 'studio', label: 'Studio' },
  { key: 'model', label: 'Model' },
  {
    key: 'status',
    label: 'Status',
    render: (row) => (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[row.status] || 'bg-slate-100 text-slate-300'}`}>
        {row.status}
      </span>
    ),
  },
  { key: 'credits_used', label: 'Credits', sortable: true },
  {
    key: 'created_at',
    label: 'Time',
    render: (row) => timeAgo(row.created_at),
  },
];

const errorColumns: Column<ErrorRow>[] = [
  {
    key: 'user',
    label: 'User',
    render: (row) => row.profiles?.name || 'Unknown',
  },
  { key: 'studio', label: 'Studio' },
  { key: 'model', label: 'Model' },
  {
    key: 'error',
    label: 'Error',
    render: (row) => (
      <span className="max-w-[200px] truncate block" title={row.error}>
        {row.error || '—'}
      </span>
    ),
  },
  {
    key: 'created_at',
    label: 'Time',
    render: (row) => timeAgo(row.created_at),
  },
];

const lowCreditColumns: Column<LowCreditRow>[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'email', label: 'Email' },
  {
    key: 'plan_id',
    label: 'Plan',
    render: (row) => (
      <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-400 ring-1 ring-slate-500/20">
        {row.plan_id}
      </span>
    ),
  },
  { key: 'credits_balance', label: 'Balance', sortable: true },
  { key: 'purchased_credits', label: 'Purchased', sortable: true },
];

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [charts, setCharts] = useState<{
    signups: Record<string, unknown>[];
    revenue: Record<string, unknown>[];
    generations: Record<string, unknown>[];
    generationStudios: string[];
    models: Record<string, unknown>[];
  }>({ signups: [], revenue: [], generations: [], generationStudios: [], models: [] });
  const [recent, setRecent] = useState<{
    recentGenerations: GenerationRow[];
    recentErrors: ErrorRow[];
    lowCreditUsers: LowCreditRow[];
  }>({ recentGenerations: [], recentErrors: [], lowCreditUsers: [] });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [overviewRes, signupsRes, revenueRes, gensRes, modelsRes, recentRes] = await Promise.all([
        fetch('/api/admin/stats/overview'),
        fetch('/api/admin/stats/charts?chart=signups'),
        fetch('/api/admin/stats/charts?chart=revenue'),
        fetch('/api/admin/stats/charts?chart=generations'),
        fetch('/api/admin/stats/charts?chart=models'),
        fetch('/api/admin/stats/recent'),
      ]);

      const [overviewData, signupsData, revenueData, gensData, modelsData, recentData] = await Promise.all([
        overviewRes.json(),
        signupsRes.json(),
        revenueRes.json(),
        gensRes.json(),
        modelsRes.json(),
        recentRes.json(),
      ]);

      if (overviewData.success) setOverview(overviewData.data);
      setCharts({
        signups: signupsData.data || [],
        revenue: revenueData.data || [],
        generations: gensData.data || [],
        generationStudios: gensData.studios || [],
        models: modelsData.data || [],
      });
      if (recentData.success) setRecent(recentData.data);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totalSubs = overview
    ? Object.values(overview.activeSubscriptions).reduce((a, b) => a + b, 0)
    : 0;

  const subsBreakdown = overview
    ? Object.entries(overview.activeSubscriptions)
        .map(([plan, count]) => `${plan}: ${count}`)
        .join(', ') || 'None'
    : '';

  return (
    <AdminLayout>
      {/* Page Header */}
      <div className="mb-6 flex items-center gap-3">
        <LayoutDashboard className="h-6 w-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          icon={<Users className="h-5 w-5" />}
          label="Total Users"
          value={overview?.totalUsers ?? 0}
          badge={overview ? `+${overview.newUsersToday} today` : undefined}
          badgeColor="green"
          sparkline={charts.signups.map(d => (d.count as number) || 0)}
          loading={loading}
        />
        <KPICard
          icon={<DollarSign className="h-5 w-5" />}
          label="Revenue (MTD Credits)"
          value={overview?.revenueThisMonth ?? 0}
          badgeColor="blue"
          sparkline={charts.revenue.slice(-7).map(d => (d.total as number) || 0)}
          loading={loading}
        />
        <KPICard
          icon={<Zap className="h-5 w-5" />}
          label="Generations Today"
          value={overview?.generationsToday ?? 0}
          loading={loading}
        />
        <KPICard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Error Rate"
          value={overview ? `${overview.errorRate}%` : '0%'}
          badge={overview ? `${overview.failedToday} failed` : undefined}
          badgeColor={overview && overview.errorRate > 5 ? 'red' : 'green'}
          trend={overview ? { value: overview.errorRate > 5 ? overview.errorRate : -overview.errorRate } : undefined}
          loading={loading}
        />
        <KPICard
          icon={<CreditCard className="h-5 w-5" />}
          label="Zero Credit Users"
          value={overview?.zeroCreditUsers ?? 0}
          badgeColor="yellow"
          loading={loading}
        />
        <KPICard
          icon={<Crown className="h-5 w-5" />}
          label="Active Subscriptions"
          value={totalSubs}
          badge={subsBreakdown || undefined}
          badgeColor="blue"
          loading={loading}
        />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <StatChart
          title="User Signups (7d)"
          type="bar"
          data={charts.signups}
          dataKeys={['count']}
          loading={loading}
        />
        <StatChart
          title="Revenue Trend (30d)"
          type="line"
          data={charts.revenue}
          dataKeys={['total']}
          loading={loading}
        />
        <StatChart
          title="Generations by Studio (7d)"
          type="stacked-bar"
          data={charts.generations}
          dataKeys={charts.generationStudios}
          loading={loading}
        />
        <StatChart
          title="Model Usage"
          type="pie"
          data={charts.models}
          loading={loading}
        />
      </div>

      {/* Tables */}
      <div className="mt-6 space-y-6">
        <DataTable<GenerationRow>
          title="Recent Generations"
          columns={generationColumns}
          data={recent.recentGenerations}
          loading={loading}
          emptyMessage="No generations yet"
        />
        <DataTable<ErrorRow>
          title="Recent Errors"
          columns={errorColumns}
          data={recent.recentErrors}
          loading={loading}
          emptyMessage="No errors — all clear!"
        />
        <DataTable<LowCreditRow>
          title="Low Credit Users (< 5 credits)"
          columns={lowCreditColumns}
          data={recent.lowCreditUsers}
          loading={loading}
          emptyMessage="No low-credit users"
        />
      </div>
    </AdminLayout>
  );
}
